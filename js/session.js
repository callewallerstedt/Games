// Session API games use — hides local vs online and carries players, settings, message bus.

export function onlineSession(transport, opts) {
  const {
    isHost,
    myIndex = 0,
    roster = [],
    settings = {},
    joinUrl = null,
    resolveFrom = (msg) => msg.from,
  } = opts;

  const handlers = {};
  const statusHandlers = [];

  const stopData = transport.onData((msg) => {
    if (!msg?.t) return;
    const enriched = { ...msg, from: resolveFrom(msg) ?? msg.from };
    if (handlers[msg.t]) handlers[msg.t].forEach((fn) => fn(enriched));
  });
  const stopStatus = transport.onStatus((s) => statusHandlers.forEach((fn) => fn(s)));

  const players = roster.map((p) => p.name);
  const playerColors = roster.map((p) => p.color);
  const other = roster.find((_, i) => i !== myIndex);

  return {
    mode: "online",
    isHost,
    myIndex,
    myName: roster[myIndex]?.name || "You",
    partnerName: other?.name || "Partner",
    joinUrl,
    roster,
    settings,
    players,
    playerColors,
    playerCount: roster.length,
    send: (t, payload = {}) => {
      const msg = { t, from: myIndex, ...payload };
      transport._lastSent = msg;
      if (isHost) transport.broadcast(msg);
      else transport.send(msg);
    },
    sendPrivate: (t, payload = {}) => {
      const msg = { t, from: myIndex, ...payload };
      if (isHost) transport.broadcast(msg);
      else transport.send(msg);
    },
    sendTo: (playerIndex, t, payload = {}) => {
      const msg = { t, from: myIndex, ...payload };
      if (!isHost) {
        if (playerIndex === 0) transport.send(msg);
        return;
      }
      if (playerIndex === 0) {
        transport._lastPrivate ||= {};
        transport._lastPrivate[playerIndex] = msg;
        if (handlers[t]) handlers[t].forEach((fn) => fn(msg));
        return;
      }
      const peerId = roster[playerIndex]?.peerId;
      if (peerId) {
        transport._lastPrivate ||= {};
        transport._lastPrivate[playerIndex] = msg;
        transport.send(msg, peerId);
      }
    },
    on: (t, fn) => { (handlers[t] ||= []).push(fn); },
    onStatus: (fn) => statusHandlers.push(fn),
    destroy: () => {
      stopData?.();
      stopStatus?.();
      Object.keys(handlers).forEach((key) => { handlers[key].length = 0; });
      statusHandlers.length = 0;
    },
    transport,
  };
}

export function localSession(players, playerColors = [], settings = {}) {
  return {
    mode: "local",
    isHost: true,
    myIndex: 0,
    myName: players[0] || "Player 1",
    partnerName: players[1] || "Player 2",
    players,
    playerColors,
    roster: players.map((name, i) => ({ name, color: playerColors[i] })),
    settings,
    playerCount: players.length,
    send() {},
    sendPrivate() {},
    sendTo() {},
    on() {},
    onStatus() {},
  };
}
