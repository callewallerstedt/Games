// Persistent multiplayer room: players join once, then the host can switch games.
import {
  el, render, topbar, button, connectionPill, toast, rulesModal, modal,
  PLAYER_COLORS, normalizePlayerColor, setPlayerColors,
} from "./ui.js";
import { hostRoom, joinRoom } from "./net.js";
import { onlineSession } from "./session.js";
import { qrFor } from "./qr.js";
import { GAMES, getGame } from "./games/registry.js";
import {
  playerColorControl, rememberedName, rememberedColor, saveName, saveColor,
  localSetup, defaultLobbySettings, renderLobbySettings, renderPlayerRoster,
} from "./player-setup.js";

const ROOM_CAPACITY = 10;
let active = null;

export function cleanupLobby() {
  if (active?.destroy) { try { active.destroy(); } catch {} }
  active = null;
}

export function buildJoinUrl(gameId, peerId) {
  return `${location.href.split("#")[0]}#/join/${gameId}/${peerId}`;
}

function copy(text) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(() => toast("Invite link copied")).catch(() => toast("Copy failed"));
  } else {
    const ta = el("textarea", {}, text);
    document.body.append(ta);
    ta.select();
    try { document.execCommand("copy"); toast("Invite link copied"); } catch { toast("Copy failed"); }
    ta.remove();
  }
}

function profileEditor(profile, onChange) {
  let name = profile.name;
  let color = profile.color;
  const input = el("input", {
    class: "field",
    value: name,
    maxlength: "16",
    "aria-label": "Your name",
    oninput: (event) => {
      name = event.target.value;
    },
    onkeydown: (event) => {
      if (event.key !== "Enter") return;
      name = event.currentTarget.value.trim() || "Player";
      event.currentTarget.value = name;
      onChange({ name, color });
      event.currentTarget.blur();
    },
    onchange: (event) => {
      name = event.target.value.trim() || "Player";
      event.target.value = name;
      onChange({ name, color });
    },
  });
  const colorControl = playerColorControl(() => name || "Player", color, (next) => {
    color = next;
    onChange({ name: name.trim() || "Player", color });
  });
  return el("div", { class: "profile-editor" }, [
    el("div", { class: "profile-editor-label" }, "Your player"),
    el("div", { class: "name-row" }, [colorControl, input]),
  ]);
}

function gamePicker(game, editable, onChange) {
  if (!editable) {
    return el("div", { class: "room-game-summary" }, [
      el("div", { class: "room-game-mark" }, game.title.slice(0, 2).toUpperCase()),
      el("div", {}, [el("strong", {}, game.title), el("div", { class: "muted tiny" }, game.blurb)]),
    ]);
  }
  return el("label", { class: "room-game-picker" }, [
    el("span", {}, "Game"),
    el("select", { class: "field", value: game.id, onchange: (event) => onChange(event.target.value) },
      GAMES.map((item) => el("option", { value: item.id, selected: item.id === game.id }, item.title))),
  ]);
}

/** Entry screen for a game. Hosting opens a persistent room. */
export function gameLobby(game, { home, onLocal, onHost }) {
  let settings = defaultLobbySettings(game);
  const draw = () => render(el("div", { class: "screen game-lobby-screen" }, [
    topbar({ onBack: home, right: el("button", { class: "iconbtn", "aria-label": "Rules", onClick: () => rulesModal(game) }, "?") }),
    el("div", { class: "game-stage" }, [
      el("div", { class: "game-intro" }, [
        el("div", { class: "room-game-mark large" }, game.title.slice(0, 2).toUpperCase()),
        el("h1", {}, game.title),
        el("p", { class: "muted" }, game.blurb),
        el("button", { class: "btn ghost", onClick: () => rulesModal(game) }, "How to play"),
      ]),
      game.lobbySettings?.length
        ? renderLobbySettings(game, settings, {
            editable: true,
            showMaxPlayers: false,
            onChange: (key, value) => { settings = { ...settings, [key]: value }; draw(); },
          })
        : null,
      el("div", { class: "stack play-mode-actions" }, [
        button("Host an online room", { variant: "accent", big: true, onClick: onHost }),
        button(game.localLabel || "Play on one device", { variant: "secondary", big: true, onClick: () => onLocal(settings) }),
      ]),
      el("p", { class: "muted center tiny" }, "Online rooms support invite links and QR codes. The room stays together between games."),
    ]),
  ]));
  draw();
}

function roomScreen({ game, joinUrl, roster, settings, profile, isHost, started, onStart, onBack, statusNode, onSettingChange, onGameChange, onProfileChange }) {
  const joined = roster.length;
  const gameLimit = game.onlineMaxPlayers ?? game.maxPlayers;
  const playerCountValid = joined >= game.minPlayers && joined <= gameLimit;
  const canStart = isHost && !started && playerCountValid && game.modes.includes("online");
  const startLabel = joined < game.minPlayers
    ? `Need ${game.minPlayers - joined} more player${game.minPlayers - joined === 1 ? "" : "s"}`
    : joined > gameLimit
      ? `${game.title} supports up to ${gameLimit}`
      : `Start ${game.title}`;

  return [
    topbar({ onBack, right: statusNode }),
    el("div", { class: "room-heading" }, [
      el("div", {}, [el("h1", {}, "Game room"), el("p", { class: "muted" }, isHost ? "Choose a game and invite friends." : "The host chooses the game.")]),
      el("span", { class: "room-code" }, `${joined}/${ROOM_CAPACITY}`),
    ]),
    profileEditor(profile, onProfileChange),
    el("div", { class: "room-panel" }, [
      gamePicker(game, isHost && !started, onGameChange),
      renderLobbySettings(game, settings, { editable: isHost && !started, showMaxPlayers: false, onChange: onSettingChange }),
    ]),
    isHost && joinUrl
      ? el("details", { class: "invite-panel", open: joined < 2 }, [
          el("summary", {}, "Invite players"),
          el("div", { class: "invite-content" }, [
            qrFor(joinUrl),
            el("p", { class: "muted tiny center" }, "Scan with a phone camera to join"),
            el("div", { class: "code-chip" }, joinUrl),
            button("Copy invite link", { variant: "secondary", onClick: () => copy(joinUrl) }),
          ]),
        ])
      : null,
    renderPlayerRoster(roster, { maxPlayers: Math.max(joined, 2) }),
    isHost
      ? el("div", { class: "footer-actions" }, button(startLabel, { big: true, disabled: !canStart, onClick: onStart }))
      : el("div", { class: "waiting compact-wait" }, [el("div", { class: "spinner" }), started ? "Returning to room..." : "Waiting for the host to start"]),
  ];
}

function initialProfile() {
  return { name: rememberedName().trim() || "Player", color: rememberedColor() };
}

function settingsFor(game) {
  return defaultLobbySettings(game);
}

/** Host a persistent room. */
export function hostFlow(initialGame, { home, startOnline: mountOnline, onLocalFallback }) {
  const transport = hostRoom({ maxGuests: ROOM_CAPACITY - 1 });
  active = transport;
  let game = initialGame;
  let settings = settingsFor(game);
  let profile = initialProfile();
  let roster = [{ peerId: "host", ...profile }];
  let started = false;
  let joinUrl = null;
  let currentSession = null;

  const status = connectionPill();
  status.set("waiting");
  transport.onStatus(status.set);

  const peerToIndex = () => new Map(roster.slice(1).map((player, i) => [player.peerId, i + 1]));
  const syncLobby = (peerId = null) => {
    const message = { t: "lobby_sync", gameId: game.id, roster, settings };
    if (peerId) transport.send(message, peerId); else transport.broadcast(message);
  };
  const saveProfile = (next) => {
    profile = { name: next.name.trim() || "Player", color: normalizePlayerColor(next.color) };
    roster[0] = { ...roster[0], ...profile };
    saveName(profile.name);
    saveColor(profile.color);
    const hostRow = document.querySelector(".lobby-player.joined");
    if (hostRow) {
      hostRow.style.setProperty("--player-color", profile.color);
      const label = hostRow.querySelector(".lobby-player-name");
      if (label) label.textContent = `${profile.name} (host)`;
    }
    syncLobby();
  };

  function renderRoom() {
    currentSession?.destroy?.();
    currentSession = null;
    started = false;
    render(roomScreen({
      game, joinUrl, roster, settings, profile, isHost: true, started,
      onBack: home,
      statusNode: status.node,
      onProfileChange: saveProfile,
      onGameChange: (gameId) => {
        const next = getGame(gameId);
        if (!next) return;
        game = next;
        settings = settingsFor(game);
        syncLobby();
        renderRoom();
      },
      onSettingChange: (key, value) => {
        settings = { ...settings, [key]: value };
        syncLobby();
        renderRoom();
      },
      onStart: startGame,
    }));
  }

  function startGame() {
    const limit = game.onlineMaxPlayers ?? game.maxPlayers;
    if (roster.length < game.minPlayers || roster.length > limit || !game.modes.includes("online")) return;
    started = true;
    transport._lastSent = null;
    transport._lastPrivate = {};
    const startMessage = { t: "start", gameId: game.id, roster, settings };
    transport._gameStart = startMessage;
    transport.broadcast(startMessage);
    setTimeout(() => {
      currentSession = startOnline(game, transport, {
        isHost: true, myIndex: 0, roster, settings, joinUrl,
        exit: returnEveryoneToRoom,
      });
    }, 120);
  }

  function returnEveryoneToRoom() {
    currentSession?.destroy?.();
    currentSession = null;
    started = false;
    transport.broadcast({ t: "room_return", gameId: game.id, roster, settings });
    renderRoom();
  }

  transport.onData((message) => {
    if (!message) return;
    if (message.t === "room_return_request" && started) {
      returnEveryoneToRoom();
      return;
    }
    if (message.t === "profile_update" && message._from) {
      const index = peerToIndex().get(message._from);
      if (index == null) return;
      roster[index] = {
        ...roster[index],
        name: (message.name || "Player").trim().slice(0, 16) || "Player",
        color: normalizePlayerColor(message.color, PLAYER_COLORS[index % PLAYER_COLORS.length]),
      };
      syncLobby();
      if (!started) renderRoom();
      return;
    }
    if (message.t !== "hello" || !message._from) return;
    let index = peerToIndex().get(message._from);
    if (index == null) {
      if (roster.length >= ROOM_CAPACITY) {
        transport.send({ t: "lobby_full" }, message._from);
        return;
      }
      index = roster.length;
      roster.push({
        peerId: message._from,
        name: (message.name || `Player ${index + 1}`).slice(0, 16),
        color: normalizePlayerColor(message.color, PLAYER_COLORS[index % PLAYER_COLORS.length]),
      });
    }
    transport.send({ t: "welcome", slot: index, gameId: game.id, roster, settings }, message._from);
    if (started && transport._gameStart) {
      transport.send(transport._gameStart, message._from);
      if (transport._lastPrivate?.[index]) transport.send(transport._lastPrivate[index], message._from);
      if (transport._lastSent) transport.send(transport._lastSent, message._from);
    }
    else { syncLobby(); renderRoom(); }
  });

  transport.onPeerLeave((peerId) => {
    if (started) return;
    const index = peerToIndex().get(peerId);
    if (index == null) return;
    roster.splice(index, 1);
    syncLobby();
    renderRoom();
  });

  render([topbar({ onBack: home, right: status.node }), profileEditor(profile, saveProfile), el("div", { class: "waiting" }, [el("div", { class: "spinner" }), "Opening room"])]);
  transport.ready
    .then((id) => { joinUrl = buildJoinUrl(initialGame.id, id); renderRoom(); })
    .catch(() => render([topbar({ onBack: home }), el("div", { class: "card center" }, [
      el("h2", {}, "Could not open a room"),
      el("p", { class: "muted" }, "Check the connection or play on one device."),
      button("Play on one device", { big: true, onClick: onLocalFallback }),
    ])]));
}

/** Join a persistent room from a link or QR code. */
export function joinFlow(gameId, peerId, { home, startOnline: mountOnline }) {
  let game = getGame(gameId);
  if (!game) return home();
  const transport = joinRoom(peerId);
  active = transport;
  let settings = settingsFor(game);
  let profile = initialProfile();
  let roster = [];
  let myIndex = null;
  let started = false;
  let currentSession = null;

  const status = connectionPill();
  status.set("reconnecting");
  const sendProfile = () => {
    saveName(profile.name);
    saveColor(profile.color);
    transport.send({ t: myIndex == null ? "hello" : "profile_update", ...profile });
  };
  const updateProfile = (next) => {
    profile = { name: next.name.trim() || "Player", color: normalizePlayerColor(next.color) };
    if (myIndex != null && roster[myIndex]) roster[myIndex] = { ...roster[myIndex], ...profile };
    sendProfile();
  };

  function renderRoom() {
    currentSession?.destroy?.();
    currentSession = null;
    started = false;
    render(roomScreen({
      game, joinUrl: null, roster, settings, profile, isHost: false, started,
      onBack: home, statusNode: status.node,
      onProfileChange: updateProfile,
      onGameChange: () => {}, onSettingChange: () => {}, onStart: () => {},
    }));
  }

  function enterGame(message) {
    const nextGame = getGame(message.gameId);
    if (!nextGame || started) return;
    game = nextGame;
    roster = message.roster || roster;
    settings = message.settings || settings;
    started = true;
    currentSession = startOnline(game, transport, {
      isHost: false,
      myIndex: myIndex ?? roster.findIndex((player) => player.peerId === transport.id || player.name === profile.name),
      roster,
      settings,
      joinUrl: location.href,
      exit: () => transport.send({ t: "room_return_request" }),
    });
  }

  transport.onStatus((state) => {
    status.set(state);
    if (state === "connected") sendProfile();
    if (state === "closed") render([topbar({ onBack: home }), el("div", { class: "card center" }, [
      el("h2", {}, "Room disconnected"),
      el("p", { class: "muted" }, "Ask the host for a fresh invite link."),
      button("Back to games", { big: true, onClick: home }),
    ])]);
  });

  transport.onData((message) => {
    if (!message) return;
    if (message.t === "lobby_full") { toast("This room is full"); return; }
    if (message.t === "welcome") {
      myIndex = message.slot;
      game = getGame(message.gameId) || game;
      roster = message.roster || roster;
      settings = message.settings || settings;
      renderRoom();
      return;
    }
    if (message.t === "lobby_sync" && !started) {
      game = getGame(message.gameId) || game;
      roster = message.roster || roster;
      settings = message.settings || settings;
      renderRoom();
      return;
    }
    if (message.t === "start") { enterGame(message); return; }
    if (message.t === "room_return") {
      currentSession?.destroy?.();
      currentSession = null;
      game = getGame(message.gameId) || game;
      roster = message.roster || roster;
      settings = message.settings || settings;
      renderRoom();
    }
  });

  render([topbar({ onBack: home, right: status.node }), profileEditor(profile, updateProfile), el("div", { class: "waiting" }, [el("div", { class: "spinner" }), "Joining room"])]);
}

export function startOnline(game, transport, opts) {
  const peerToSlot = new Map();
  if (opts.isHost) opts.roster.slice(1).forEach((player, i) => { if (player.peerId) peerToSlot.set(player.peerId, i + 1); });
  const session = onlineSession(transport, {
    ...opts,
    resolveFrom: (message) => (message._from ? peerToSlot.get(message._from) : message.from),
  });
  setPlayerColors(session.players, session.playerColors);
  game.mount({
    mode: "online", isHost: opts.isHost, myIndex: opts.myIndex, session,
    players: session.players, playerColors: session.playerColors, settings: session.settings,
    exit: opts.exit, reconnectInfo: () => reconnectSheet(session),
  });
  return session;
}

export function reconnectSheet(session) {
  const body = [];
  if (session.joinUrl) {
    body.push(el("p", { class: "muted center" }, "Reopen this link to reconnect to the room."));
    body.push(el("div", { class: "stack center" }, [
      qrFor(session.joinUrl),
      el("p", { class: "muted tiny" }, "Scan with a phone camera to join"),
    ]));
    body.push(el("div", { class: "code-chip" }, session.joinUrl));
    body.push(button("Copy invite link", { variant: "secondary", onClick: () => copy(session.joinUrl) }));
  } else {
    body.push(el("div", { class: "waiting" }, [el("div", { class: "spinner" }), "Trying to reconnect"]));
  }
  modal("Connection", el("div", { class: "stack" }, body));
}

export function startLocal(game, home, { onBack, settings: initialSettings } = {}) {
  localSetup(game, {
    onBack: onBack || (() => { location.hash = `#/g/${game.id}`; }),
    rulesModal,
    settings: initialSettings,
    onStart: ({ session, players, playerColors, settings }) => {
      game.mount({ mode: "local", isHost: true, session, players, playerColors, settings, exit: home });
    },
  });
}
