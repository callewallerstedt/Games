// A "session" is what a game talks to. It hides whether players are on one phone
// (local) or two phones (online P2P), and carries player names + a typed message bus.

export function onlineSession(transport, { isHost, myName, partnerName, myColor, partnerColor, joinUrl }) {
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
    joinUrl: joinUrl || null, // so we can re-show the rejoin code mid-game
    // players[0] is always the host, players[1] the guest — a stable shared order.
    players: isHost ? [myName, partnerName] : [partnerName, myName],
    playerColors: isHost ? [myColor, partnerColor] : [partnerColor, myColor],
    // Remember the last message we sent so the host can replay the current
    // screen to a guest who reconnects (generic resync).
    send: (t, payload = {}) => { const msg = { t, ...payload }; transport._lastSent = msg; transport.send(msg); },
    on: (t, fn) => { (handlers[t] ||= []).push(fn); },
    onStatus: (fn) => statusHandlers.push(fn),
    transport,
  };
}

export function localSession(players, playerColors = []) {
  return {
    mode: "local",
    isHost: true,
    players,
    playerColors,
    send() {},
    on() {},
    onStatus() {},
  };
}
