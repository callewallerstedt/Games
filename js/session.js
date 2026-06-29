// A "session" is what a game talks to. It hides whether players are on one phone
// (local) or two phones (online P2P), and carries player names + a typed message bus.

export function onlineSession(transport, { isHost, myName, partnerName }) {
  const handlers = {};
  const statusHandlers = [];
  transport.onData((msg) => {
    if (msg && msg.t && handlers[msg.t]) handlers[msg.t].forEach((fn) => fn(msg));
  });
  transport.onStatus((s) => statusHandlers.forEach((fn) => fn(s)));

  return {
    mode: "online",
    isHost,
    myName,
    partnerName,
    // players[0] is always the host, players[1] the guest — a stable shared order.
    players: isHost ? [myName, partnerName] : [partnerName, myName],
    send: (t, payload = {}) => transport.send({ t, ...payload }),
    on: (t, fn) => { (handlers[t] ||= []).push(fn); },
    onStatus: (fn) => statusHandlers.push(fn),
    transport,
  };
}

export function localSession(players) {
  return {
    mode: "local",
    isHost: true,
    players,
    send() {},
    on() {},
    onStatus() {},
  };
}
