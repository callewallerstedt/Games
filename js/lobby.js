// Unified multiplayer lobby for all games: one device OR host a room with QR/link.
import { el, render, topbar, button, connectionPill, toast, rulesModal, modal, PLAYER_COLORS, normalizePlayerColor, setPlayerColors } from "./ui.js";
import { hostRoom, joinRoom } from "./net.js";
import { onlineSession } from "./session.js";
import { qrFor } from "./qr.js";
import {
  askName, saveName, saveColor, localSetup,
  defaultLobbySettings, renderLobbySettings, renderPlayerRoster,
} from "./player-setup.js";

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
    navigator.clipboard.writeText(text).then(() => toast("Link copied! 📋")).catch(() => toast("Copy failed"));
  } else {
    const ta = el("textarea", {}, text);
    document.body.append(ta);
    ta.select();
    try { document.execCommand("copy"); toast("Link copied! 📋"); } catch { toast("Copy failed"); }
    ta.remove();
  }
}

/** Per-game lobby: one device or host/join a room. */
export function gameLobby(g, { home, onLocal, onHost }) {
  let settings = defaultLobbySettings(g);

  const rerender = () => render(el("div", { class: "screen game-lobby-screen" }, [
    topbar({ onBack: home, right: el("button", { class: "iconbtn", onClick: () => rulesModal(g) }, "?") }),
    el("div", { class: "game-stage" }, [
      el("div", { class: "card", style: "text-align:center" }, [
        el("div", { style: "font-size:3rem" }, g.emoji),
        el("h1", {}, g.title),
        el("p", { class: "muted" }, g.blurb),
        el("button", { class: "btn ghost", onClick: () => rulesModal(g) }, "How to play"),
      ]),
      (g.lobbySettings?.length)
        ? renderLobbySettings(g, settings, {
            editable: true,
            showMaxPlayers: false,
            onChange: (key, val) => { settings = { ...settings, [key]: val }; rerender(); },
          })
        : null,
      el("div", { class: "stack", style: "margin-top:18px" }, [
        g.modes.includes("local")
          ? button(["📱  ", g.localLabel || "One device"], { variant: "secondary", big: true, onClick: () => onLocal(settings) })
          : null,
        g.modes.includes("online")
          ? button(["📱📱  ", "Host a room — others join"], { variant: "accent", big: true, onClick: onHost })
          : null,
      ]),
      g.modes.includes("online")
        ? el("p", { class: "muted center", style: "margin-top:12px; font-size:.85rem" },
            "Host a room to get a QR code & link. Friends join from their phones.")
        : null,
    ]),
  ]));

  rerender();
}

function roomScreen({ game, joinUrl, roster, settings, isHost, started, onStart, onBack, statusNode, onSettingChange }) {
  const joined = roster.filter(Boolean).length;
  const canStart = isHost && !started && joined >= game.minPlayers;

  return [
    topbar({ onBack, right: statusNode }),
    el("div", { class: "game-stage" }, [
      el("div", { class: "card center" }, [
        el("h2", {}, `${game.emoji} ${game.title}`),
        isHost && !started
          ? el("p", { class: "muted" }, "Share the link or QR so others can join.")
          : el("p", { class: "muted" }, started ? "Game in progress…" : "Waiting for the host to start…"),
      ]),
      isHost && !started && joinUrl
        ? el("div", { class: "card center" }, [
            qrFor(joinUrl),
            el("div", { class: "divider" }, "or copy link"),
            el("div", { class: "code-chip" }, joinUrl),
            button("📋 Copy link", { variant: "secondary", onClick: () => copy(joinUrl) }),
          ])
        : null,
      renderPlayerRoster(roster, { maxPlayers: settings.maxPlayers }),
      renderLobbySettings(game, settings, { editable: isHost && !started, onChange: onSettingChange }),
      isHost
        ? el("div", { class: "footer-actions" },
            button(canStart ? `Start game (${joined} players) →` : `Need ${game.minPlayers}+ players…`, {
              big: true,
              disabled: !canStart,
              onClick: onStart,
            }))
        : el("div", { class: "waiting card center" }, [
            el("div", { class: "spinner" }),
            started ? "Reconnecting to game…" : "Waiting for the host to start…",
          ]),
    ]),
  ];
}

/** Host: name → room → settings → start. */
export function hostFlow(g, { home, startOnline, onLocalFallback }) {
  askName(g, "Host this game", (myName, myColor) => {
    saveName(myName);
    saveColor(myColor);
    const cap = (g.onlineMaxPlayers ?? g.maxPlayers) - 1;
    const transport = hostRoom({ maxGuests: cap });
    active = transport;

    let settings = defaultLobbySettings(g);
    let roster = [{ peerId: "host", name: myName, color: myColor }];
    let peerToSlot = new Map();
    let started = false;
    let joinUrl = null;

    const status = connectionPill();
    status.set("waiting");
    transport.onStatus(status.set);

    const syncLobby = (peerId = null) => {
      const msg = { t: "lobby_sync", roster, settings };
      if (peerId) transport.send(msg, peerId);
      else transport.broadcast(msg);
    };

    const renderRoom = () => render(roomScreen({
      game: g,
      joinUrl,
      roster: padRoster(roster, settings.maxPlayers),
      settings,
      isHost: true,
      started,
      onBack: home,
      statusNode: status.node,
      onSettingChange: (key, val) => {
        if (started) return;
        settings = { ...settings, [key]: val };
        if (key === "maxPlayers" && roster.length > val) return;
        syncLobby();
        renderRoom();
      },
      onStart: () => {
        if (roster.length < g.minPlayers) return;
        started = true;
        const finalRoster = roster.slice(0, settings.maxPlayers);
        const startMsg = { t: "start", roster: finalRoster, settings };
        transport.broadcast(startMsg);
        transport._gameRoster = finalRoster;
        transport._gameSettings = settings;
        setTimeout(() => startOnline(g, transport, {
          isHost: true,
          myIndex: 0,
          roster: finalRoster,
          settings,
          joinUrl,
        }), 200);
      },
    }));

    transport.onData((msg) => {
      if (!msg) return;
      if (msg.t === "hello" && msg._from) {
        if (started) {
          transport.send({ t: "start", roster: transport._gameRoster, settings: transport._gameSettings }, msg._from);
          if (transport._lastSent) transport.send(transport._lastSent, msg._from);
          toast(`${msg.name || "Player"} reconnected ✓`);
          return;
        }
        if (roster.length >= settings.maxPlayers) {
          transport.send({ t: "lobby_full" }, msg._from);
          return;
        }
        const slot = roster.length;
        peerToSlot.set(msg._from, slot);
        roster.push({ peerId: msg._from, name: msg.name || `Player ${slot + 1}`, color: normalizePlayerColor(msg.color, PLAYER_COLORS[slot % PLAYER_COLORS.length]) });
        transport.send({ t: "welcome", slot, roster, settings }, msg._from);
        syncLobby();
        renderRoom();
      }
    });

    transport.onPeerLeave((peerId) => {
      if (started) return;
      const slot = peerToSlot.get(peerId);
      if (slot == null) return;
      roster.splice(slot, 1);
      peerToSlot.clear();
      roster.slice(1).forEach((p, i) => peerToSlot.set(p.peerId, i + 1));
      syncLobby();
      renderRoom();
    });

    render([topbar({ onBack: home, right: status.node }), el("div", { class: "card center" }, [el("div", { class: "spinner" }), el("p", { class: "muted" }, "Opening room…")])]);
    transport.ready
      .then((id) => { joinUrl = buildJoinUrl(g.id, id); renderRoom(); })
      .catch(() => {
        render([
          topbar({ onBack: home }),
          el("div", { class: "card center" }, [
            el("h2", {}, "Couldn't open a room"),
            el("p", { class: "muted" }, "Try one device, or check your connection."),
            button("One device", { big: true, onClick: onLocalFallback }),
            button("Back", { variant: "ghost", onClick: home }),
          ]),
        ]);
      });
  }, { onBack: home });
}

/** Guest join via link/QR. */
export function joinFlow(gameId, peerId, { home, getGame, startOnline }) {
  const g = getGame(gameId);
  if (!g) return home();
  askName(g, `Join ${g.title}`, (myName, myColor) => {
    saveName(myName);
    saveColor(myColor);
    const transport = joinRoom(peerId);
    active = transport;

    let roster = [];
    let settings = defaultLobbySettings(g);
    let mySlot = null;
    let started = false;

    const status = connectionPill();
    status.set("reconnecting");
    transport.onStatus((s) => {
      status.set(s);
      if (s === "connected") transport.send({ t: "hello", name: myName, color: myColor });
      if (s === "closed") {
        render([
          topbar({ onBack: home }),
          el("div", { class: "card center" }, [
            el("h2", {}, "Couldn't reach the host"),
            el("p", { class: "muted" }, "The room may have closed. Ask for a fresh link."),
            button("Back to games", { big: true, onClick: home }),
          ]),
        ]);
      }
    });

    const renderRoom = () => render(roomScreen({
      game: g,
      joinUrl: null,
      roster: padRoster(roster, settings.maxPlayers),
      settings,
      isHost: false,
      started,
      onBack: home,
      statusNode: status.node,
      onSettingChange: () => {},
      onStart: () => {},
    }));

    transport.onData((msg) => {
      if (!msg) return;
      if (msg.t === "lobby_full") {
        toast("Room is full");
        return;
      }
      if (msg.t === "welcome") {
        mySlot = msg.slot;
        roster = msg.roster || [];
        settings = msg.settings || settings;
        renderRoom();
        return;
      }
      if (msg.t === "lobby_sync") {
        roster = msg.roster || roster;
        settings = msg.settings || settings;
        if (!started) renderRoom();
        return;
      }
      if (msg.t === "start" && !started) {
        started = true;
        roster = msg.roster || roster;
        settings = msg.settings || settings;
        startOnline(g, transport, {
          isHost: false,
          myIndex: mySlot ?? roster.findIndex((p) => p.name === myName),
          roster,
          settings,
          joinUrl: location.href,
        });
      }
    });

    render([
      topbar({ onBack: home, right: status.node }),
      el("div", { class: "card center" }, [el("div", { class: "spinner" }), el("p", { class: "muted" }, "Connecting…")]),
    ]);
  }, { onBack: home });
}

function padRoster(roster, max) {
  const out = roster.slice();
  while (out.length < max) out.push(null);
  return out.slice(0, max);
}

export function startOnline(g, transport, opts) {
  const peerToSlot = new Map();
  if (opts.isHost) {
    opts.roster.slice(1).forEach((p, i) => { if (p.peerId) peerToSlot.set(p.peerId, i + 1); });
  }

  const session = onlineSession(transport, {
    ...opts,
    resolveFrom: (msg) => (msg._from ? peerToSlot.get(msg._from) : msg.from),
  });
  setPlayerColors(session.players, session.playerColors);

  g.mount({
    mode: "online",
    isHost: opts.isHost,
    myIndex: opts.myIndex,
    session,
    players: session.players,
    playerColors: session.playerColors,
    settings: session.settings,
    exit: opts.exit || (() => {}),
    reconnectInfo: () => reconnectSheet(session),
  });
}

export function reconnectSheet(session) {
  const body = [];
  if (session.joinUrl) {
    body.push(el("p", { class: "muted center" }, "Scan again or reopen the link to rejoin."));
    body.push(el("div", { class: "center" }, qrFor(session.joinUrl)));
    body.push(el("div", { class: "code-chip", style: "margin-top:10px" }, session.joinUrl));
    body.push(button("📋 Copy link", { variant: "secondary", onClick: () => copy(session.joinUrl) }));
  } else {
    body.push(el("div", { class: "waiting" }, [el("div", { class: "spinner" }), "Trying to reconnect…"]));
  }
  modal("🔗 Connection", el("div", { class: "stack" }, body));
}

export function startLocal(g, home, { onBack, settings: initialSettings } = {}) {
  localSetup(g, {
    onBack: onBack || (() => { location.hash = `#/g/${g.id}`; }),
    rulesModal,
    settings: initialSettings,
    onStart: ({ session, players, playerColors, settings }) => {
      g.mount({ mode: "local", isHost: true, session, players, playerColors, settings, exit: home });
    },
  });
}
