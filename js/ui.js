// Small DOM + UI helpers shared across screens.

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === false || v == null) continue;
    else if (v === true) node.setAttribute(k, "");
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

export const $app = () => document.getElementById("app");

let activeGameCleanup = null;
export function setGameCleanup(cleanup) { activeGameCleanup = typeof cleanup === "function" ? cleanup : null; }
export function disposeActiveGame() {
  const cleanup = activeGameCleanup;
  activeGameCleanup = null;
  try { cleanup?.(); } catch {}
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

export const PLAYER_COLORS = [
  "#8b5cf6", "#ec4899", "#ef4444", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#06b6d4",
  "#3b82f6", "#6366f1", "#a855f7", "#64748b",
];

const activePlayerColors = new Map();
export function normalizePlayerColor(color, fallback = PLAYER_COLORS[0]) {
  return /^#[0-9a-f]{6}$/i.test(color || "") ? color.toLowerCase() : fallback;
}
export function setPlayerColors(names = [], colors = []) {
  activePlayerColors.clear();
  names.forEach((name, i) => activePlayerColors.set(name, normalizePlayerColor(colors[i], PLAYER_COLORS[i % PLAYER_COLORS.length])));
}
export function playerColor(name, fallback = PLAYER_COLORS[0]) {
  return activePlayerColors.get(name) || fallback;
}

// Render a full screen into #app. `content` is a node or array of nodes.
export function render(content) {
  const app = clear($app());
  for (const c of [].concat(content)) if (c) app.append(c);
  window.scrollTo(0, 0);
}

export function hardRefreshSite() {
  const run = async () => {
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((reg) => reg.unregister()));
      }
    } catch {}
    const url = new URL(location.href.split("#")[0]);
    url.searchParams.set("_", String(Date.now()));
    location.replace(`${url.toString()}${location.hash || ""}`);
  };
  run();
}

export function topbar({ onBack, right } = {}) {
  return el("div", { class: "topbar" }, [
    onBack ? el("button", { class: "iconbtn", "aria-label": "Back", title: "Back", onClick: onBack }, "‹") : null,
    el("button", {
      class: "brand brand-refresh",
      type: "button",
      "aria-label": "Party Games — refresh for latest version",
      title: "Refresh for latest version",
      onClick: hardRefreshSite,
    }, "Party Games"),
    el("div", { class: "spacer" }),
    right || null,
  ]);
}

export function button(label, opts = {}) {
  const { variant = "", onClick, disabled, big } = opts;
  return el("button", {
    class: `btn ${variant} ${big ? "big" : ""}`.trim(),
    disabled: !!disabled,
    onClick,
  }, label);
}

export function pill(text, state = "") {
  return el("span", { class: `pill ${state}`.trim() }, [el("span", { class: "dot" }), text]);
}

// A connection-status pill that updates in place. For online games.
export function connectionPill() {
  const map = {
    connected: ["Connected", "ok"],
    reconnecting: ["Reconnecting…", "warn"],
    closed: ["Disconnected", "bad"],
    waiting: ["Waiting…", "warn"],
  };
  const wrap = el("span");
  let node = pill("Connected", "ok");
  wrap.append(node);
  return {
    node: wrap,
    set(s) { const [t, c] = map[s] || ["…", ""]; const n = pill(t, c); node.replaceWith(n); node = n; },
  };
}

export function toast(msg, ms = 1800) {
  const t = el("div", { class: "toast" }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), ms);
}

// Modal. Returns a close() fn. Pass { centered: true } for a dialog in the middle of the screen.
export function modal(titleText, bodyNodes, { centered = false } = {}) {
  const close = () => bg.remove();
  const sheet = el("div", { class: centered ? "modal modal-center" : "modal" }, [
    el("div", { class: "topbar" }, [
      el("h2", {}, titleText),
      el("div", { class: "spacer" }),
      el("button", { class: "iconbtn", "aria-label": "Close", onClick: close }, "✕"),
    ]),
    ...[].concat(bodyNodes),
  ]);
  const bg = el("div", {
    class: centered ? "modal-bg modal-bg-center" : "modal-bg",
    onClick: (e) => { if (e.target === bg) close(); },
  }, [sheet]);
  document.body.append(bg);
  return close;
}

export function rulesModal(game) {
  return modal(`${game.emoji} ${game.title} — how to play`, el("div", { html: game.rulesHTML }), { centered: true });
}

// Standard in-game header: back button + rules + (optional) connection status.
// In online games the status pill is tappable to re-show the rejoin code.
// When the host is online, the back button opens a menu: end this game (back to
// the lobby) or finish the whole party (final leaderboard).
export function gameHeader(ctx, game, statusNode) {
  if (statusNode && ctx && ctx.reconnectInfo) {
    statusNode.style.cursor = "pointer";
    statusNode.title = "Connection — tap to show rejoin code";
    statusNode.onclick = ctx.reconnectInfo;
  }
  const right = el("div", { style: "display:flex; gap:8px; align-items:center" }, [
    statusNode || null,
    el("button", { class: "iconbtn", "aria-label": "Rules", onClick: () => rulesModal(game) }, "?"),
  ]);
  const onBack = ctx?.finishParty
    ? () => hostExitMenu(ctx)
    : () => { disposeActiveGame(); ctx.exit(); };
  return topbar({ onBack, right });
}

// Host-only menu shown from the in-game back button.
export function hostExitMenu(ctx) {
  let close;
  close = modal("Host controls", el("div", { class: "stack host-menu" }, [
    button("End this game · back to lobby", { big: true, variant: "secondary", onClick: () => { close(); disposeActiveGame(); ctx.exit(); } }),
    button("Finish party 🏆", { big: true, onClick: () => { close(); disposeActiveGame(); ctx.finishParty(); } }),
    el("p", { class: "muted center tiny", style: "margin:4px 0 0" }, "End the game to pick another, or finish the party to reveal the winner."),
  ]), { centered: true });
}

// Segmented control. options: [{value,label}]. Returns { node, get() }.
export function segmented(options, initial, onChange) {
  let value = initial;
  const wrap = el("div", { class: "seg" });
  const buttons = options.map((o) =>
    el("button", { class: o.value === value ? "on" : "", onClick: () => {
      value = o.value; buttons.forEach((b, i) => b.classList.toggle("on", options[i].value === value));
      onChange && onChange(value);
    } }, o.label));
  buttons.forEach((b) => wrap.append(b));
  return { node: wrap, get: () => value };
}

// A compatibility meter bar (0..1).
export function meter(frac) {
  return el("div", { class: "meter" }, el("i", { style: `width:${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%` }));
}

// "Hand the phone to <name>" overlay. Resolves when they tap Ready.
export function passDevice(name, subtitle) {
  return new Promise((resolve) => {
    const color = playerColor(name);
    const overlay = el("div", { class: "pass", style: `--player-color:${color}` }, [
      el("div", { class: "pass-kicker" }, "Private turn"),
      el("div", { class: "pass-label" }, "Pass the device to"),
      el("div", { class: "who" }, name),
      subtitle ? el("div", { class: "sub" }, subtitle) : null,
      el("div", { class: "pass-privacy" }, `Only ${name} should look at the screen.`),
      el("button", {
        class: "btn big", onClick: () => { overlay.remove(); resolve(); },
      }, `I’m ${name} - continue`),
    ]);
    document.body.append(overlay);
  });
}

export function scoreChip(n, label, opts = {}) {
  const active = typeof opts === "object" && !!opts.active;
  const rawColor = typeof opts === "string" ? opts : opts?.color;
  const resolvedColor = normalizePlayerColor(rawColor || playerColor(label));
  return el("div", {
    class: `score-chip player-colored ${active ? "active" : ""}`.trim(),
    style: `--player-color:${resolvedColor};--chip-color:${resolvedColor}`,
  }, [el("span", { class: "n" }, String(n)), el("span", { class: "l" }, label)]);
}

// The latest standings any game has shown via scoreboard(). The lobby reads this
// when a game ends so the party leaderboard can credit the round's winner(s).
let latestStandings = null;
export function recordStandings(players, scores) {
  if (!Array.isArray(players) || !Array.isArray(scores)) return;
  latestStandings = { players: players.slice(), scores: scores.map((n) => Number(n) || 0) };
}
export function takeStandings() { return latestStandings; }
export function clearStandings() { latestStandings = null; }

export function scoreboard(players, scores, opts = {}) {
  const activeIndex = Number.isInteger(opts.activeIndex) ? opts.activeIndex : -1;
  recordStandings(players, scores);
  return el("div", { class: "scorebar shared-scoreboard", "aria-label": "Scoreboard" },
    players.map((name, i) => scoreChip(scores[i] ?? 0, name, {
      active: i === activeIndex,
      color: opts.colors?.[i],
    })));
}

// Full-screen party wrap-up: a podium reveal of who won the most games.
// `entries` = [{ name, color, wins, points }], unsorted. `onClose` runs on dismiss.
export function partyLeaderboard(entries, { onClose, subtitle } = {}) {
  const ranked = entries.slice().sort((a, b) => (b.wins - a.wins) || (b.points - a.points));
  const topWins = ranked[0]?.wins ?? 0;
  const topPoints = ranked[0]?.points ?? 0;
  const winners = ranked.filter((e) => e.wins === topWins && e.points === topPoints && topWins + topPoints > 0);
  const medals = ["🥇", "🥈", "🥉"];

  const rows = ranked.map((entry, i) => {
    const isWinner = winners.includes(entry);
    return el("div", {
      class: `party-rank-row reveal-anim${isWinner ? " winner" : ""}`,
      style: `--player-color:${normalizePlayerColor(entry.color)};animation-delay:${0.12 * (ranked.length - i)}s`,
    }, [
      el("span", { class: "party-rank-place" }, medals[i] || `#${i + 1}`),
      el("span", { class: "party-rank-dot" }),
      el("span", { class: "party-rank-name" }, entry.name),
      el("span", { class: "party-rank-score" }, `${entry.wins} win${entry.wins === 1 ? "" : "s"}`),
    ]);
  });

  const champLine = winners.length === 0
    ? "What a session! 🎉"
    : winners.length === 1
      ? `${winners[0].name} wins the party! 🏆`
      : `It's a tie: ${winners.map((w) => w.name).join(" & ")}! 🏆`;

  const screen = el("div", { class: "screen party-finale" }, [
    el("div", { class: "party-finale-kicker" }, "Party results"),
    el("h1", { class: "party-finale-title" }, champLine),
    subtitle ? el("p", { class: "muted center" }, subtitle) : null,
    el("div", { class: "party-rank-list stack" }, rows),
    el("div", { class: "footer-actions" }, button("Back to games", { big: true, onClick: () => { try { onClose?.(); } catch {} } })),
  ]);
  render(screen);
  if (winners.length) celebrate();
}

export function onlineReadyGate(session, gateId, onAllReady, opts = {}) {
  const label = opts.label || "Ready";
  const count = Math.max(1, session.playerCount || session.players?.length || 2);
  const myIdx = session.myIndex ?? (session.isHost ? 0 : 1);
  const ready = new Set();
  let done = false;
  const status = el("div", { class: "ready-status muted tiny center" }, `0/${count} ready`);
  const btn = button(label, {
    big: true,
    onClick: () => {
      if (ready.has(myIdx) || done) return;
      ready.add(myIdx);
      btn.disabled = true;
      btn.textContent = "Ready - waiting for others";
      updateStatus();
      if (session.isHost) publishState();
      else session.sendPrivate("ready_gate", { id: gateId });
      maybeGo();
    },
  });
  function finish() {
    if (done) return;
    done = true;
    onAllReady();
  }
  function updateStatus() {
    status.textContent = ready.size >= count ? "Everyone is ready." : `${ready.size}/${count} ready`;
  }
  function publishState() {
    if (session.isHost) session.sendPrivate("ready_gate_state", { id: gateId, ready: Array.from(ready) });
  }
  function maybeGo() {
    if (!session.isHost || ready.size < count || done) return;
    session.sendPrivate("ready_gate_go", { id: gateId });
    finish();
  }
  session.on("ready_gate", (m) => {
    if (!session.isHost || !m || m.id !== gateId || done) return;
    ready.add(m.from);
    updateStatus();
    publishState();
    maybeGo();
  });
  session.on("ready_gate_state", (m) => {
    if (!m || m.id !== gateId || done) return;
    ready.clear();
    (m.ready || []).forEach((i) => ready.add(i));
    updateStatus();
  });
  session.on("ready_gate_go", (m) => {
    if (!m || m.id !== gateId) return;
    finish();
  });
  return el("div", { class: "ready-gate" }, [status, btn]);
}

export function localReadyGate(names, onAllReady, opts = {}) {
  const label = !opts.label || opts.label.toLowerCase() === "ready" ? "Continue" : opts.label;
  return el("div", { class: "ready-gate local-ready-gate" },
    button(label, { big: true, onClick: onAllReady }));
}

// Register the service worker (offline + installable). Safe no-op if unsupported.
export function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").then((reg) => {
      reg.update();
      reg.addEventListener("updatefound", () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener("statechange", () => {
          if (nw.state === "installed" && navigator.serviceWorker.controller) {
            toast("Update ready — refresh the page ✨", 4000);
          }
        });
      });
    }).catch(() => {});
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (window.__swReloaded) return;
      window.__swReloaded = true;
      location.reload();
    });
  });
}

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () => window.navigator.standalone === true ||
  window.matchMedia("(display-mode: standalone)").matches;

// One-time hint for iOS Safari users to add the app to their home screen.
export function iosInstallTip() {
  if (!isIOS() || isStandalone() || localStorage.getItem("a2hs_dismissed")) return null;
  const tip = el("div", { class: "a2hs" }, [
    el("div", { style: "font-size:1.5rem" }, "📲"),
    el("div", {}, [
      el("div", {}, [el("b", {}, "Add to Home Screen"), " for full-screen play"]),
      el("div", { class: "muted tiny" }, "Tap Share ⬆️ then “Add to Home Screen”."),
    ]),
    el("button", { class: "x", "aria-label": "Dismiss", onClick: () => { tip.remove(); try { localStorage.setItem("a2hs_dismissed", "1"); } catch {} } }, "✕"),
  ]);
  return tip;
}

// ---------- Theme ----------
export const THEMES = [
  { value: "auto", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "pink", label: "Pink" },
];
const THEME_COLORS = {
  light: "#f5f7f8",
  dark: "#111718",
  pink: "#fceef3",
  autoLight: "#f5f7f8",
  autoDark: "#111718",
};
export const getTheme = () => {
  let saved = localStorage.getItem("together_theme") || "auto";
  if (saved === "cute") saved = "pink";
  return THEMES.some((theme) => theme.value === saved) ? saved : "auto";
};
export function applyTheme(t) {
  t = t || getTheme();
  if (t === "cute") t = "pink";
  if (t === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    if (t === "light") meta.setAttribute("content", THEME_COLORS.light);
    else if (t === "dark") meta.setAttribute("content", THEME_COLORS.dark);
    else if (t === "pink") meta.setAttribute("content", THEME_COLORS.pink);
    else meta.setAttribute("content", meta.media?.includes("dark") ? THEME_COLORS.autoDark : THEME_COLORS.autoLight);
  });
  try { localStorage.setItem("together_theme", t); } catch {}
}
// Theme picker sheet. onChange called after applying.
export function themePicker(onChange) {
  const seg = segmented(THEMES, getTheme(), (v) => { applyTheme(v); onChange && onChange(v); });
  return modal("Appearance", [el("p", { class: "muted" }, "Choose how the app looks on this device."), seg.node]);
}

// ---------- Delight: confetti + haptics ----------
export function haptic(pattern = 18) { try { navigator.vibrate && navigator.vibrate(pattern); } catch {} }
export function confetti(n = 90) {
  const colors = ["#6c5ce7", "#ff5e98", "#ffa84b", "#14b88a", "#4bd1ff", "#ffd166"];
  const layer = el("div", { class: "confetti" });
  for (let i = 0; i < n; i++) {
    const p = el("i");
    p.style.cssText = `left:${Math.random() * 100}%;background:${colors[i % colors.length]};` +
      `animation-delay:${Math.random() * 0.25}s;animation-duration:${1 + Math.random() * 0.8}s;` +
      `transform:rotate(${Math.random() * 360}deg)`;
    layer.append(p);
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 2400);
}
export function celebrate() { confetti(); haptic([12, 30, 12]); }

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
