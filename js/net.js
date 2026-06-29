// Peer-to-peer transport built on the vendored PeerJS (window.Peer).
// No app server: PeerJS's public broker is used only for the initial handshake;
// gameplay data then flows phone-to-phone over a WebRTC data channel.
//
// Both host and guest expose the same tiny surface:
//   { id, send(obj), onData(fn), onStatus(fn), onClose(fn), destroy() }
// status is one of: "waiting" | "connected" | "reconnecting" | "closed"

function makeBus() {
  const handlers = { data: [], status: [], close: [] };
  return {
    on: (type, fn) => { handlers[type].push(fn); },
    emit: (type, ...args) => { handlers[type].forEach((fn) => fn(...args)); },
  };
}

// --- Host: create a room and wait for one guest to connect. ---
export function hostRoom() {
  const bus = makeBus();
  const peer = new window.Peer(undefined, { debug: 1 });
  let conn = null;
  let status = "waiting";

  const setStatus = (s) => { status = s; bus.emit("status", s); };

  const api = {
    id: null,
    isHost: true,
    send: (obj) => { if (conn && conn.open) conn.send(obj); },
    onData: (fn) => bus.on("data", fn),
    onStatus: (fn) => bus.on("status", fn),
    onClose: (fn) => bus.on("close", fn),
    ready: null, // promise resolving to room id
    destroy: () => { try { conn && conn.close(); } catch {} try { peer.destroy(); } catch {} },
  };

  api.ready = new Promise((resolve, reject) => {
    peer.on("open", (id) => { api.id = id; resolve(id); });
    peer.on("error", (err) => { if (!api.id) reject(err); });
  });

  peer.on("connection", (c) => {
    // Only accept the first guest; ignore extras.
    if (conn && conn.open) { c.close(); return; }
    conn = c;
    c.on("open", () => setStatus("connected"));
    c.on("data", (d) => bus.emit("data", d));
    c.on("close", () => { setStatus("reconnecting"); });
  });

  peer.on("disconnected", () => { if (status !== "closed") { setStatus("reconnecting"); try { peer.reconnect(); } catch {} } });
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
    // peer-unavailable means the host id is gone.
    if (err && err.type === "peer-unavailable") retry();
  });

  return {
    id: null,
    isHost: false,
    send: (obj) => { if (conn && conn.open) conn.send(obj); },
    onData: (fn) => bus.on("data", fn),
    onStatus: (fn) => bus.on("status", fn),
    onClose: (fn) => bus.on("close", fn),
    destroy: () => { status = "closed"; try { conn && conn.close(); } catch {} try { peer.destroy(); } catch {} },
  };
}
