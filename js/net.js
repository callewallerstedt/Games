// Peer-to-peer transport built on the vendored PeerJS (window.Peer).
// Host accepts multiple guests (star topology); each guest connects only to host.
//
// Reconnection is the priority here: peers reuse a *stable* id (so invite links
// survive a reload and a guest keeps the same slot), they never give up retrying,
// and they re-dial whenever the network comes back, the tab is refocused, or the
// page is restored from the back/forward cache. A lightweight ping/pong heartbeat
// notices a silently-dead data channel (common after a Wi-Fi↔cellular switch) and
// forces a fresh dial well before the browser bothers to fire a "close" event.
//
// Surface:
//   { id, isHost, ready, send, broadcast, onData, onStatus, onClose,
//     onPeerJoin, onPeerLeave, onIdChange, peerCount, destroy }

const HEARTBEAT_MS = 4000;       // how often a guest pings the host
const HOST_SILENCE_MS = 11000;   // no pong for this long => assume dead, re-dial

function makeBus() {
  const handlers = { data: [], status: [], close: [], join: [], leave: [], idchange: [] };
  return {
    on: (type, fn) => {
      (handlers[type] ||= []).push(fn);
      return () => {
        const index = handlers[type].indexOf(fn);
        if (index >= 0) handlers[type].splice(index, 1);
      };
    },
    emit: (type, ...args) => { (handlers[type] || []).forEach((fn) => fn(...args)); },
  };
}

// Fire `fn` whenever connectivity is likely to have changed (network back,
// tab refocused, page restored from bfcache). Returns an unsubscribe fn.
function onConnectivityResume(fn) {
  const online = () => fn("online");
  const visible = () => { if (!document.hidden) fn("visible"); };
  const shown = (e) => { if (e.persisted) fn("pageshow"); };
  window.addEventListener("online", online);
  document.addEventListener("visibilitychange", visible);
  window.addEventListener("pageshow", shown);
  return () => {
    window.removeEventListener("online", online);
    document.removeEventListener("visibilitychange", visible);
    window.removeEventListener("pageshow", shown);
  };
}

// --- Host: create a room; accept up to maxGuests connections. ---
export function hostRoom({ maxGuests = 9, id = null } = {}) {
  const bus = makeBus();
  const peers = new Map(); // peerId -> conn
  let peer = null;
  let status = "waiting";
  let destroyed = false;
  let resolveReady = null;
  let rejectReady = null;

  const setStatus = (s) => { if (status === s) return; status = s; bus.emit("status", s); };
  const updateStatus = () => setStatus(peers.size > 0 ? "connected" : "waiting");

  const api = {
    id: null,
    isHost: true,
    peerCount: () => peers.size,
    send: (obj, peerId = null) => {
      if (peerId) { const c = peers.get(peerId); if (c?.open) { try { c.send(obj); } catch {} } return; }
      peers.forEach((c) => { if (c.open) { try { c.send(obj); } catch {} } });
    },
    broadcast: (obj) => api.send(obj),
    onData: (fn) => bus.on("data", fn),
    onPeerJoin: (fn) => bus.on("join", fn),
    onPeerLeave: (fn) => bus.on("leave", fn),
    onStatus: (fn) => bus.on("status", fn),
    onClose: (fn) => bus.on("close", fn),
    onIdChange: (fn) => bus.on("idchange", fn),
    ready: null,
    destroy: () => {
      destroyed = true;
      stopResume();
      peers.forEach((c) => { try { c.close(); } catch {} });
      peers.clear();
      try { peer?.destroy(); } catch {}
    },
  };

  const onConnection = (c) => {
    if (peers.size >= maxGuests && !peers.has(c.peer)) { try { c.close(); } catch {} return; }
    const peerId = c.peer;
    // A reconnecting guest dials in fresh; drop any stale connection for the id.
    const previous = peers.get(peerId);
    if (previous && previous !== c) { try { previous.close(); } catch {} }
    peers.set(peerId, c);
    c.on("open", () => { updateStatus(); bus.emit("join", peerId); });
    c.on("data", (d) => {
      if (d && d.t === "__ping") { if (c.open) { try { c.send({ t: "__pong" }); } catch {} } return; }
      bus.emit("data", { ...d, _from: peerId });
    });
    c.on("close", () => {
      // Only forget the peer if this is still the live connection for it
      // (a reconnect may already have replaced it).
      if (peers.get(peerId) === c) { peers.delete(peerId); updateStatus(); bus.emit("leave", peerId); }
    });
    c.on("error", () => {});
  };

  function buildPeer(useId) {
    peer = new window.Peer(useId || undefined, { debug: 1 });
    peer.on("open", (openId) => {
      const changed = api.id && api.id !== openId;
      api.id = openId;
      if (resolveReady) { resolveReady(openId); resolveReady = null; rejectReady = null; }
      if (changed) bus.emit("idchange", openId);
      updateStatus();
    });
    peer.on("connection", onConnection);
    peer.on("disconnected", () => { if (!destroyed) { setStatus("reconnecting"); try { peer.reconnect(); } catch {} } });
    peer.on("close", () => { if (!destroyed) setStatus("reconnecting"); });
    peer.on("error", (err) => {
      const type = err?.type;
      if (type === "unavailable-id") {
        // The stored id is still held by a lingering session — take a fresh one.
        try { peer.destroy(); } catch {}
        if (!destroyed) buildPeer(null);
      } else if (!api.id && type && rejectReady) {
        rejectReady(err); rejectReady = null; resolveReady = null;
      }
      // Other errors (network/server) self-heal via PeerJS's own reconnect.
    });
  }

  const stopResume = onConnectivityResume(() => {
    if (destroyed || !peer) return;
    if (peer.destroyed) { buildPeer(api.id || id); return; }
    if (peer.disconnected) { try { peer.reconnect(); } catch {} }
  });

  api.ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  buildPeer(id);
  return api;
}

// --- Guest: join a host by id. ---
export function joinRoom(hostId, { myId = null } = {}) {
  const bus = makeBus();
  let peer = null;
  let conn = null;
  let status = "reconnecting";
  let destroyed = false;
  let tries = 0;
  let reconnectTimer = null;
  let heartbeat = null;
  let lastPong = 0;
  let chosenId = myId;

  const setStatus = (s) => { if (status === s) return; status = s; bus.emit("status", s); };

  function stopHeartbeat() { if (heartbeat) clearInterval(heartbeat); heartbeat = null; }
  function startHeartbeat() {
    stopHeartbeat();
    lastPong = Date.now();
    heartbeat = setInterval(() => {
      if (destroyed) return;
      if (conn?.open) {
        try { conn.send({ t: "__ping" }); } catch {}
        if (Date.now() - lastPong > HOST_SILENCE_MS) { try { conn.close(); } catch {} scheduleReconnect(true); }
      } else {
        scheduleReconnect();
      }
    }, HEARTBEAT_MS);
  }

  function connect() {
    if (destroyed || !peer || peer.destroyed) return;
    try { conn?.close(); } catch {}
    conn = peer.connect(hostId, { reliable: true });
    conn.on("open", () => { tries = 0; setStatus("connected"); startHeartbeat(); });
    conn.on("data", (d) => {
      if (d && d.t === "__pong") { lastPong = Date.now(); return; }
      if (d && d.t === "__ping") { if (conn.open) { try { conn.send({ t: "__pong" }); } catch {} } return; }
      bus.emit("data", d);
    });
    conn.on("close", () => { stopHeartbeat(); if (!destroyed) scheduleReconnect(); });
    conn.on("error", () => {});
  }

  // Re-dial with exponential backoff. We never permanently give up — a phone
  // that's been off the network for minutes should still slot right back in.
  function scheduleReconnect(immediate = false) {
    if (destroyed) return;
    setStatus("reconnecting");
    stopHeartbeat();
    clearTimeout(reconnectTimer);
    const delay = immediate ? 0 : Math.min(400 * Math.pow(1.6, Math.min(tries, 6)), 4000);
    tries++;
    reconnectTimer = setTimeout(() => {
      if (destroyed) return;
      if (!peer || peer.destroyed) { buildPeer(chosenId); return; }
      if (peer.disconnected) { try { peer.reconnect(); } catch {} return; }
      connect();
    }, delay);
  }

  function buildPeer(useId) {
    peer = new window.Peer(useId || undefined, { debug: 1 });
    peer.on("open", () => { tries = 0; connect(); });
    peer.on("disconnected", () => { if (!destroyed) { try { peer.reconnect(); } catch {} } });
    peer.on("error", (err) => {
      const type = err?.type;
      if (type === "unavailable-id") {
        // Our preferred id is momentarily taken (e.g. the old tab lingering) —
        // fall back to a random one so we can still reconnect right now.
        chosenId = null;
        try { peer.destroy(); } catch {}
        if (!destroyed) buildPeer(null);
      } else if (type === "peer-unavailable" || type === "network" || type === "server-error" || type === "socket-error") {
        scheduleReconnect();
      }
    });
  }

  // Network back / tab refocused / restored from bfcache → reconnect now.
  const stopResume = onConnectivityResume(() => {
    if (destroyed) return;
    if (status === "connected" && conn?.open) return;
    tries = 0;
    scheduleReconnect(true);
  });

  buildPeer(chosenId);

  return {
    id: null,
    isHost: false,
    peerCount: () => (conn?.open ? 1 : 0),
    send: (obj) => { if (conn?.open) { try { conn.send(obj); } catch {} } },
    broadcast: (obj) => { if (conn?.open) { try { conn.send(obj); } catch {} } },
    onData: (fn) => bus.on("data", fn),
    onPeerJoin: () => {},
    onPeerLeave: () => {},
    onStatus: (fn) => bus.on("status", fn),
    onClose: (fn) => bus.on("close", fn),
    onIdChange: () => {},
    destroy: () => {
      destroyed = true;
      status = "closed";
      stopResume();
      stopHeartbeat();
      clearTimeout(reconnectTimer);
      try { conn?.close(); } catch {}
      try { peer?.destroy(); } catch {}
    },
  };
}
