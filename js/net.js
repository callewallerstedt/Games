// Peer-to-peer transport built on the vendored PeerJS (window.Peer).
// Host accepts multiple guests (star topology); each guest connects only to host.
//
// Surface:
//   { id, isHost, send(obj), broadcast(obj), onData(fn), onStatus(fn), peerCount, destroy() }

function makeBus() {
  const handlers = { data: [], status: [], close: [], join: [], leave: [] };
  return {
    on: (type, fn) => {
      handlers[type].push(fn);
      return () => {
        const index = handlers[type].indexOf(fn);
        if (index >= 0) handlers[type].splice(index, 1);
      };
    },
    emit: (type, ...args) => { handlers[type].forEach((fn) => fn(...args)); },
  };
}

// --- Host: create a room; accept up to maxGuests connections. ---
export function hostRoom({ maxGuests = 9 } = {}) {
  const bus = makeBus();
  const peer = new window.Peer(undefined, { debug: 1 });
  const peers = new Map(); // peerId -> conn
  let status = "waiting";

  const setStatus = (s) => { status = s; bus.emit("status", s); };
  const updateStatus = () => setStatus(peers.size > 0 ? "connected" : "waiting");

  const api = {
    id: null,
    isHost: true,
    peerCount: () => peers.size,
    send: (obj, peerId = null) => {
      if (peerId) {
        const c = peers.get(peerId);
        if (c?.open) c.send(obj);
        return;
      }
      peers.forEach((c) => { if (c.open) c.send(obj); });
    },
    broadcast: (obj) => api.send(obj),
    onData: (fn) => bus.on("data", fn),
    onPeerJoin: (fn) => bus.on("join", fn),
    onPeerLeave: (fn) => bus.on("leave", fn),
    onStatus: (fn) => bus.on("status", fn),
    onClose: (fn) => bus.on("close", fn),
    ready: null,
    destroy: () => {
      peers.forEach((c) => { try { c.close(); } catch {} });
      peers.clear();
      try { peer.destroy(); } catch {}
    },
  };

  api.ready = new Promise((resolve, reject) => {
    peer.on("open", (id) => { api.id = id; resolve(id); });
    peer.on("error", (err) => { if (!api.id) reject(err); });
  });

  peer.on("connection", (c) => {
    if (peers.size >= maxGuests) { try { c.close(); } catch {} return; }
    const peerId = c.peer;
    peers.set(peerId, c);
    c.on("open", () => { updateStatus(); bus.emit("join", peerId); });
    c.on("data", (d) => bus.emit("data", { ...d, _from: peerId }));
    c.on("close", () => {
      peers.delete(peerId);
      updateStatus();
      bus.emit("leave", peerId);
    });
  });

  peer.on("disconnected", () => {
    if (status !== "closed") { setStatus("reconnecting"); try { peer.reconnect(); } catch {} }
  });
  peer.on("close", () => { setStatus("closed"); bus.emit("close"); });

  return api;
}

// --- Guest: join a host by id. ---
export function joinRoom(hostId) {
  const bus = makeBus();
  const peer = new window.Peer(undefined, { debug: 1 });
  let conn = null;
  let status = "reconnecting";
  let tries = 0;

  const setStatus = (s) => { status = s; bus.emit("status", s); };

  function connect() {
    conn = peer.connect(hostId, { reliable: true });
    conn.on("open", () => { tries = 0; setStatus("connected"); });
    conn.on("data", (d) => bus.emit("data", d));
    conn.on("close", () => { if (status !== "closed") retry(); });
    conn.on("error", () => {});
  }

  function retry() {
    if (status === "closed") return;
    setStatus("reconnecting");
    if (tries++ > 8) { setStatus("closed"); bus.emit("close"); return; }
    setTimeout(() => { try { connect(); } catch {} }, Math.min(500 * tries, 3000));
  }

  peer.on("open", () => connect());
  peer.on("disconnected", () => { if (status !== "closed") { try { peer.reconnect(); } catch {} } });
  peer.on("error", (err) => {
    if (err && err.type === "peer-unavailable") retry();
  });

  return {
    id: null,
    isHost: false,
    peerCount: () => (conn?.open ? 1 : 0),
    send: (obj) => { if (conn?.open) conn.send(obj); },
    broadcast: (obj) => { if (conn?.open) conn.send(obj); },
    onData: (fn) => bus.on("data", fn),
    onPeerJoin: () => {},
    onPeerLeave: () => {},
    onStatus: (fn) => bus.on("status", fn),
    onClose: (fn) => bus.on("close", fn),
    destroy: () => {
      status = "closed";
      try { conn?.close(); } catch {}
      try { peer.destroy(); } catch {}
    },
  };
}
