// Router + home hub + lobby (mode choice, P2P host/guest handshake, local setup).
import { el, render, topbar, button, connectionPill, toast, rulesModal, registerSW, iosInstallTip, applyTheme, themePicker, modal, PLAYER_COLORS, normalizePlayerColor, setPlayerColors } from "./ui.js";
import { GAMES, getGame } from "./games/registry.js";
import { hostRoom, joinRoom } from "./net.js";
import { onlineSession, localSession } from "./session.js";
import { qrFor } from "./qr.js";
import { openScanner } from "./scan.js";

let active = null; // current transport to tear down on navigation

const go = (hash) => { if (location.hash === hash) router(); else location.hash = hash; };
const home = () => go("#/");
const rememberedName = () => localStorage.getItem("together_name") || "";
const saveName = (n) => { try { localStorage.setItem("together_name", n); } catch {} };
const rememberedColor = () => normalizePlayerColor(localStorage.getItem("together_color"), PLAYER_COLORS[0]);
const saveColor = (color) => { try { localStorage.setItem("together_color", normalizePlayerColor(color)); } catch {} };

function playerColorControl(label, initial, onChange) {
  let value = normalizePlayerColor(initial);
  const trigger = el("button", {
    class: "player-color-btn",
    type: "button",
    style: `--player-color:${value}`,
    "aria-label": `Choose color for ${label()}`,
  }, el("span", { "aria-hidden": "true" }));

  const apply = (next) => {
    value = normalizePlayerColor(next, value);
    trigger.style.setProperty("--player-color", value);
    trigger.setAttribute("aria-label", `Choose color for ${label()}`);
    onChange(value);
  };

  trigger.addEventListener("click", () => {
    let close;
    const custom = el("input", {
      class: "custom-color-input",
      type: "color",
      value,
      "aria-label": "Custom player color",
      oninput: (event) => apply(event.target.value),
    });
    const swatches = el("div", { class: "player-color-grid" }, PLAYER_COLORS.map((color, i) =>
      el("button", {
        class: "player-color-swatch",
        type: "button",
        style: `--player-color:${color}`,
        "aria-label": `Color option ${i + 1}`,
        onClick: () => { apply(color); close(); },
      })));
    close = modal(`Player color · ${label()}`, el("div", { class: "stack" }, [
      el("p", { class: "muted" }, "Pick a preset or choose any custom color."),
      swatches,
      el("label", { class: "custom-color-row" }, [el("span", {}, "Custom color"), custom]),
      button("Done", { onClick: () => close() }),
    ]));
  });
  return trigger;
}

function cleanup() {
  if (active && active.destroy) { try { active.destroy(); } catch {} }
  active = null;
  document.querySelectorAll(".pass, .modal-bg, .toast").forEach((n) => n.remove());
}

function buildJoinUrl(gameId, peerId) {
  const base = location.href.split("#")[0];
  return `${base}#/join/${gameId}/${peerId}`;
}

/* ---------------- Router ---------------- */
function router() {
  cleanup();
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[0] === "g" && getGame(parts[1])) return gameLobby(getGame(parts[1]));
  if (parts[0] === "join" && parts[1] && parts[2]) return joinFlow(parts[1], parts[2]);
  return hub();
}
window.addEventListener("hashchange", router);
window.addEventListener("DOMContentLoaded", router);
if (document.readyState !== "loading") router();
applyTheme();
registerSW();

/* ---------------- Home hub ---------------- */
function hub() {
  let myColor = rememberedColor();
  const nameInput = el("input", {
    class: "field",
    placeholder: "Your name",
    value: rememberedName(),
    maxlength: "16",
    enterkeyhint: "done",
    style: "text-align:left",
    oninput: (e) => saveName(e.target.value.trim()),
    onchange: (e) => saveName(e.target.value.trim()),
  });
  const colorControl = playerColorControl(() => nameInput.value.trim() || "you", myColor, (color) => {
    myColor = color;
    saveColor(color);
  });

  const scanBtn = el("button", {
    class: "iconbtn",
    "aria-label": "Scan QR to join",
    title: "Scan to join",
    onClick: () => openScanner((gameId, peerId) => go(`#/join/${gameId}/${peerId}`)),
  }, "📷");

  const themeBtn = el("button", { class: "iconbtn theme-fab", "aria-label": "Theme", onClick: () => themePicker(() => hub()) }, "🎨");

  const cards = GAMES.map((g, i) =>
    el("button", { class: "game-card", style: `animation-delay:${i * 0.04}s`, onClick: () => go(`#/g/${g.id}`) }, [
      el("div", { class: "emoji", style: g.color ? `background:${g.color}` : "" }, g.emoji),
      el("div", { class: "body" }, [
        el("div", { class: "title" }, g.title),
        el("div", { class: "blurb" }, g.blurb),
        el("div", { class: "meta" }, [
          el("span", {}, `👥 ${g.minPlayers === g.maxPlayers ? g.minPlayers : `${g.minPlayers}–${g.maxPlayers}`}`),
          el("span", {}, `⏱ ~${g.estMinutes} min`),
        ]),
      ]),
      el("div", { class: "chev" }, "›"),
    ]),
  );
  render([
    topbar({ right: el("div", { style: "display:flex; gap:8px" }, [scanBtn, themeBtn]) }),
    el("div", { class: "hero" }, [
      el("h1", {}, "Play together"),
      el("div", { class: "tag" }, "Fun little games for two — on one phone, or join from across the room. 💜"),
    ]),
    el("div", { class: "card stack", style: "margin-bottom:14px" }, [
      el("p", { class: "muted", style: "margin:0 0 8px; font-size:.9rem" }, "Your name (saved on this device)"),
      el("div", { class: "name-row" }, [colorControl, nameInput]),
      el("p", { class: "muted color-hint" }, "Tap the color circle to make it yours."),
    ]),
    el("div", { class: "game-grid" }, cards),
    iosInstallTip(),
    el("p", { class: "muted center", style: "margin-top:22px; font-size:.82rem" },
      `${GAMES.length} games · v${GAMES.length}-pack`),
  ]);
}

/* ---------------- Game lobby (choose how to play) ---------------- */
function gameLobby(g) {
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
          ? button(["📱📱  ", "Two phones"], { variant: "accent", big: true, onClick: () => hostFlow(g) })
          : null,
        g.modes.includes("local")
          ? button(["📱  ", g.localLabel || "One phone (pass it)"], { variant: "secondary", big: true, onClick: () => localSetup(g) })
          : null,
      ]),
      g.modes.includes("online")
        ? el("p", { class: "muted center", style: "margin-top:12px; font-size:.85rem" },
            "Two phones: your partner scans a QR or opens a link to join.")
        : null,
    ]),
  ]));
}

/* ---------------- Online: HOST ---------------- */
function hostFlow(g) {
  // Step 1: name
  askName(g, "What's your name?", (myName, myColor) => {
    saveName(myName);
    saveColor(myColor);
    // Step 2: create room
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
      // A guest (re)joined mid-game — replay start + the current screen.
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
      render([
        topbar({ onBack: home, right: status.node }),
        el("div", { class: "card center" }, [
          el("h2", {}, `${g.emoji} ${g.title}`),
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
            big: true, disabled: !partnerName,
            onClick: () => {
              started = true;
              transport.send({ t: "start" });
              setTimeout(() => startOnline(g, transport, { isHost: true, myName, partnerName, myColor, partnerColor, joinUrl }), 250);
            },
          })),
      ]);
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
            button("Play on one phone", { big: true, onClick: () => localSetup(g) }),
            button("Back", { variant: "ghost", onClick: home }),
          ]),
        ]);
      });
  });
}

/* ---------------- Online: GUEST (join link) ---------------- */
function joinFlow(gameId, peerId) {
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
      // Re-introduce ourselves on every (re)connect so the host can resync us.
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
      if (msg.t === "welcome") { partnerName = msg.name || "Host"; partnerColor = normalizePlayerColor(msg.color, PLAYER_COLORS[0]); showStatus(`Connected to ${partnerName}. Waiting for them to start…`); }
      if (msg.t === "start") { started = true; startOnline(g, transport, { isHost: false, myName, partnerName: partnerName || "Host", myColor, partnerColor, joinUrl: location.href }); }
    });

    showStatus("Connecting to the host…");
  });
}

function startOnline(g, transport, opts) {
  const session = onlineSession(transport, opts);
  setPlayerColors(session.players, session.playerColors);
  const reconnectInfo = () => reconnectSheet(session);
  g.mount({ mode: "online", isHost: opts.isHost, session, players: session.players, playerColors: session.playerColors, exit: home, reconnectInfo });
}

// Tap the connection pill mid-game to re-show the rejoin code / status.
function reconnectSheet(session) {
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

/* ---------------- Local: setup names ---------------- */
function localSetup(g) {
  const max = g.maxPlayers;
  const min = g.minPlayers;
  let count = Math.max(min, 2);
  const names = [];
  const colors = [];
  for (let i = 0; i < max; i++) names[i] = `Player ${i + 1}`;
  for (let i = 0; i < max; i++) colors[i] = PLAYER_COLORS[i % PLAYER_COLORS.length];
  if (rememberedName()) names[0] = rememberedName();
  colors[0] = rememberedColor();

  function draw() {
    const inputs = [];
    for (let i = 0; i < count; i++) {
      const input = el("input", { class: "field", value: names[i], maxlength: "16",
        "aria-label": `Player ${i + 1} name`,
        oninput: (e) => { names[i] = e.target.value; } });
      const colorControl = playerColorControl(() => (names[i] || `Player ${i + 1}`).trim(), colors[i], (color) => {
        colors[i] = color;
        if (i === 0) saveColor(color);
      });
      inputs.push(el("div", { class: "name-row player-name-row" }, [colorControl, input]));
    }
    const counter = max > min
      ? el("div", { class: "card" }, [
          el("p", { class: "muted center" }, "How many players?"),
          el("div", { class: "counter" }, [
            el("button", { class: "btn round-btn secondary", disabled: count <= min, onClick: () => { if (count > min) { count--; draw(); } } }, "−"),
            el("span", { class: "num" }, String(count)),
            el("button", { class: "btn round-btn secondary", disabled: count >= max, onClick: () => { if (count < max) { count++; draw(); } } }, "+"),
          ]),
        ])
      : null;

    render([
      topbar({ onBack: () => go(`#/g/${g.id}`), right: el("button", { class: "iconbtn", onClick: () => rulesModal(g) }, "?") }),
      el("div", { class: "hero" }, [el("h1", {}, `${g.emoji} ${g.title}`), el("div", { class: "tag" }, g.localSetupTag || "One phone — pass it around.")]),
      counter,
      el("div", { class: "card stack" }, [el("p", { class: "muted center" }, "Player names & colors"), ...inputs]),
      el("div", { class: "footer-actions" },
        button("Start →", { big: true, onClick: () => {
          const finalNames = names.slice(0, count).map((n, i) => {
            const trimmed = (n || "").trim();
            return trimmed || `Player ${i + 1}`;
          });
          const finalColors = colors.slice(0, count).map((color, i) => normalizePlayerColor(color, PLAYER_COLORS[i % PLAYER_COLORS.length]));
          saveName(finalNames[0]);
          saveColor(finalColors[0]);
          setPlayerColors(finalNames, finalColors);
          const session = localSession(finalNames, finalColors);
          g.mount({ mode: "local", isHost: true, session, players: finalNames, playerColors: finalColors, exit: home });
        } })),
    ]);
  }
  draw();
}

/* ---------------- Shared: name prompt ---------------- */
function askName(g, prompt, next) {
  let color = rememberedColor();
  const input = el("input", { class: "field", placeholder: "Your name", value: rememberedName(), maxlength: "16", enterkeyhint: "go" });
  const colorControl = playerColorControl(() => input.value.trim() || "you", color, (nextColor) => { color = nextColor; });
  const submit = () => { const v = (input.value || "").trim() || "You"; next(v, color); };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  setTimeout(() => input.focus(), 50);
  render(el("div", { class: "screen name-screen" }, [
    topbar({ onBack: home }),
    el("div", { class: "game-stage compact" }, [
      el("div", { class: "hero" }, [el("h1", {}, `${g.emoji} ${g.title}`), el("div", { class: "tag" }, prompt)]),
      el("div", { class: "card stack" }, [
        el("div", { class: "name-row" }, [colorControl, input]),
        el("p", { class: "muted color-hint" }, "Choose the color your partner will see."),
        button("Continue →", { big: true, onClick: submit }),
      ]),
    ]),
  ]));
}

/* ---------------- utils ---------------- */
function copy(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => toast("Link copied! 📋")).catch(() => toast("Copy failed"));
  } else {
    const ta = el("textarea", {}, text); document.body.append(ta); ta.select();
    try { document.execCommand("copy"); toast("Link copied! 📋"); } catch { toast("Copy failed"); }
    ta.remove();
  }
}
