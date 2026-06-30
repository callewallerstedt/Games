// Reusable online lobby: mode picker, host room (QR + link), guest join, reconnect sheet.
// Any game with modes: ["online"] gets the two-phone flow automatically.
import { el, render, topbar, button, connectionPill, toast, rulesModal, modal, PLAYER_COLORS, normalizePlayerColor, setPlayerColors } from "./ui.js";
import { hostRoom, joinRoom } from "./net.js";
import { onlineSession } from "./session.js";
import { qrFor } from "./qr.js";
import { askName, saveName, saveColor, localSetup } from "./player-setup.js";

let active = null;

export function cleanupLobby() {
  if (active?.destroy) { try { active.destroy(); } catch {} }
  active = null;
}

export function buildJoinUrl(gameId, peerId) {
  const base = location.href.split("#")[0];
  return `${base}#/join/${gameId}/${peerId}`;
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

/** Waiting room UI: QR code, copy link, partner-joined state. */
export function waitingRoom({ game, joinUrl, partnerName, onStart, onBack, statusNode }) {
  return [
    topbar({ onBack, right: statusNode }),
    el("div", { class: "card center" }, [
      el("h2", {}, `${game.emoji} ${game.title}`),
      partnerName
        ? el("div", {}, [
            el("div", { class: "verdict match" }, `✅ ${partnerName} joined!`),
            el("p", { class: "muted" }, "You're both in. Start when ready."),
          ])
        : el("div", {}, [
            el("p", { class: "muted" }, "Have your partner scan this with their camera:"),
            joinUrl ? qrFor(joinUrl) : el("div", { class: "spinner" }),
            el("div", { class: "divider" }, "or send the link"),
            el("div", { class: "code-chip" }, joinUrl || "…"),
            joinUrl ? el("button", { class: "btn secondary", style: "margin-top:10px", onClick: () => copy(joinUrl) }, "📋 Copy link") : null,
          ]),
    ]),
    el("div", { class: "footer-actions" },
      button(partnerName ? "Start game →" : "Waiting for partner…", {
        big: true,
        disabled: !partnerName,
        onClick: onStart,
      })),
  ];
}

/** Per-game lobby: choose two phones (online) or one phone (local). */
export function gameLobby(g, { home, onHost, onLocal }) {
  render(el("div", { class: "screen game-lobby-screen" }, [
    topbar({ onBack: home, right: el("button", { class: "iconbtn", onClick: () => rulesModal(g) }, "?") }),
    el("div", { class: "game-stage" }, [
      el("div", { class: "card", style: "text-align:center" }, [
        el("div", { style: "font-size:3rem" }, g.emoji),
        el("h1", {}, g.title),
        el("p", { class: "muted" }, g.blurb),
        el("button", { class: "btn ghost", onClick: () => rulesModal(g) }, "How to play"),
      ]),
      el("div", { class: "stack", style: "margin-top:18px" }, [
        g.modes.includes("online")
          ? button(["📱📱  ", "Two phones"], { variant: "accent", big: true, onClick: onHost })
          : null,
        g.modes.includes("local")
          ? button(["📱  ", g.localLabel || "One phone (pass it)"], { variant: "secondary", big: true, onClick: onLocal })
          : null,
      ]),
      g.modes.includes("online")
        ? el("p", { class: "muted center", style: "margin-top:12px; font-size:.85rem" },
            "Two phones: your partner scans a QR or opens a link to join.")
        : null,
    ]),
  ]));
}

/** Host flow: name → create P2P room → QR/link waiting room → start game. */
export function hostFlow(g, { home, startOnline, onLocalFallback }) {
  askName(g, "What's your name?", (myName, myColor) => {
    saveName(myName);
    saveColor(myColor);
    const transport = hostRoom();
    active = transport;
    let partnerName = null;
    let partnerColor = PLAYER_COLORS[1];
    let started = false;
    let joinUrl = null;

    const status = connectionPill();
    status.set("waiting");
    transport.onStatus(status.set);

    transport.onData((msg) => {
      if (!msg || msg.t !== "hello") return;
      partnerName = msg.name || "Partner";
      partnerColor = normalizePlayerColor(msg.color, PLAYER_COLORS[1]);
      transport.send({ t: "welcome", name: myName, color: myColor });
      if (!started) { renderWaiting(); return; }
      transport.send({ t: "start" });
      if (transport._lastSent) transport.send(transport._lastSent);
      toast(`${partnerName} reconnected ✓`);
    });

    const renderConnecting = () =>
      render([
        topbar({ onBack: home, right: status.node }),
        el("div", { class: "card center" }, [el("div", { class: "spinner" }), el("p", { class: "muted" }, "Opening a room…")]),
      ]);

    function renderWaiting() {
      render(waitingRoom({
        game: g,
        joinUrl,
        partnerName,
        onBack: home,
        statusNode: status.node,
        onStart: () => {
          started = true;
          transport.send({ t: "start" });
          setTimeout(() => startOnline(g, transport, { isHost: true, myName, partnerName, myColor, partnerColor, joinUrl }), 250);
        },
      }));
    }

    renderConnecting();
    transport.ready
      .then((id) => { joinUrl = buildJoinUrl(g.id, id); renderWaiting(); })
      .catch(() => {
        render([
          topbar({ onBack: home }),
          el("div", { class: "card center" }, [
            el("h2", {}, "Couldn't open a room"),
            el("p", { class: "muted" }, "The connection service may be unavailable. You can still play on one phone."),
            button("Play on one phone", { big: true, onClick: onLocalFallback }),
            button("Back", { variant: "ghost", onClick: home }),
          ]),
        ]);
      });
  }, { onBack: home });
}

/** Guest flow: name → connect to host peer → wait for start. */
export function joinFlow(gameId, peerId, { home, getGame, startOnline }) {
  const g = getGame(gameId);
  if (!g) return home();
  askName(g, `Join ${g.title}`, (myName, myColor) => {
    saveName(myName);
    saveColor(myColor);
    const transport = joinRoom(peerId);
    active = transport;
    let partnerName = null;
    let partnerColor = PLAYER_COLORS[0];
    let started = false;
    const status = connectionPill();
    status.set("reconnecting");

    const showStatus = (extra) =>
      render([
        topbar({ onBack: home, right: status.node }),
        el("div", { class: "card center" }, [el("div", { class: "spinner" }), el("p", { class: "muted" }, extra)]),
      ]);

    transport.onStatus((s) => {
      status.set(s);
      if (s === "connected") transport.send({ t: "hello", name: myName, color: myColor });
      if (s === "closed") {
        render([
          topbar({ onBack: home }),
          el("div", { class: "card center" }, [
            el("h2", {}, "Couldn't reach the host"),
            el("p", { class: "muted" }, "The room may have closed. Ask them to share a fresh link."),
            button("Back to games", { big: true, onClick: home }),
          ]),
        ]);
      }
    });

    transport.onData((msg) => {
      if (!msg || started) return;
      if (msg.t === "welcome") {
        partnerName = msg.name || "Host";
        partnerColor = normalizePlayerColor(msg.color, PLAYER_COLORS[0]);
        showStatus(`Connected to ${partnerName}. Waiting for them to start…`);
      }
      if (msg.t === "start") {
        started = true;
        startOnline(g, transport, { isHost: false, myName, partnerName: partnerName || "Host", myColor, partnerColor, joinUrl: location.href });
      }
    });

    showStatus("Connecting to the host…");
  }, { onBack: home });
}

/** Mount a game in online mode with a uniform session context. */
export function startOnline(g, transport, opts) {
  const session = onlineSession(transport, opts);
  setPlayerColors(session.players, session.playerColors);
  const reconnectInfo = () => reconnectSheet(session);
  g.mount({
    mode: "online",
    isHost: opts.isHost,
    session,
    players: session.players,
    playerColors: session.playerColors,
    exit: opts.exit || (() => {}),
    reconnectInfo,
  });
}

/** Tap the connection pill mid-game to re-show the rejoin QR / link. */
export function reconnectSheet(session) {
  const body = [];
  if (session.joinUrl) {
    body.push(el("p", { class: "muted center" }, "Dropped connection? Scan this again or reopen the link to rejoin — your game is still here."));
    body.push(el("div", { class: "center" }, qrFor(session.joinUrl)));
    body.push(el("div", { class: "code-chip", style: "margin-top:10px" }, session.joinUrl));
    body.push(button("📋 Copy link", { variant: "secondary", onClick: () => copy(session.joinUrl) }));
  } else {
    body.push(el("div", { class: "waiting" }, [el("div", { class: "spinner" }), "Trying to reconnect…"]));
  }
  modal("🔗 Connection", el("div", { class: "stack" }, body));
}

/** Convenience: local setup wired to mount a game. */
export function startLocal(g, home, { onBack } = {}) {
  localSetup(g, {
    onBack: onBack || (() => { location.hash = `#/g/${g.id}`; }),
    rulesModal,
    onStart: ({ session, players, playerColors }) => {
      g.mount({ mode: "local", isHost: true, session, players, playerColors, exit: home });
    },
  });
}
