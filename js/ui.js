// Small DOM + UI helpers shared across screens.

import {
  createTetrisGame,
  normalizeTetrisGame,
  pauseActiveTetris,
  tetrisView,
} from "./arcade-tetris.js";

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
  pauseActiveTetris();
  const app = clear($app());
  for (const c of [].concat(content)) if (c) app.append(c);
  decorateWaitingScreens(app);
  ensureReactionDock();
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

let brandTapCount = 0;
let brandTapTimer = null;

function onBrandTap() {
  brandTapCount++;
  clearTimeout(brandTapTimer);
  if (brandTapCount >= 3) {
    brandTapCount = 0;
    showDebugMenu();
    return;
  }
  brandTapTimer = setTimeout(() => {
    if (brandTapCount === 1) hardRefreshSite();
    brandTapCount = 0;
  }, 450);
}

function showDebugMenu() {
  const close = modal("Debug", el("div", { class: "stack", style: "gap:12px" }, [
    button("Hard reset (clear cache & refresh)", { big: true, onClick: () => { close(); hardRefreshSite(); } }),
    button("Show waiting arcade", { big: true, onClick: () => { close(); injectWaitingArcadePreview(); } }),
  ]), { centered: true });
}

function injectWaitingArcadePreview() {
  const app = $app();
  if (!app) return;
  const existing = app.querySelector(".waiting-arcade");
  if (existing) {
    existing.scrollIntoView({ behavior: "smooth", block: "nearest" });
    toast("Waiting arcade already on screen");
    return;
  }
  const target = app.querySelector(".screen") || app;
  const arcade = waitingArcadePanel();
  const footer = target.querySelector(":scope > .footer-actions");
  if (footer) target.insertBefore(arcade, footer);
  else target.append(arcade);
  arcade.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

export function topbar({ onBack, right } = {}) {
  return el("div", { class: "topbar" }, [
    onBack ? el("button", { class: "iconbtn", "aria-label": "Back", title: "Back", onClick: onBack }, "‹") : null,
    el("button", {
      class: "brand brand-refresh",
      type: "button",
      "aria-label": "Party Games — refresh for latest version",
      title: "Refresh for latest version (triple-tap for debug)",
      onClick: onBrandTap,
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
    offs.forEach((off) => { try { off?.(); } catch {} });
    offs.length = 0;
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
  const offs = [];
  offs.push(session.on("ready_gate", (m) => {
    if (!session.isHost || !m || m.id !== gateId || done) return;
    ready.add(m.from);
    updateStatus();
    publishState();
    maybeGo();
  }));
  offs.push(session.on("ready_gate_state", (m) => {
    if (!m || m.id !== gateId || done) return;
    ready.clear();
    (m.ready || []).forEach((i) => ready.add(i));
    updateStatus();
  }));
  offs.push(session.on("ready_gate_go", (m) => {
    if (!m || m.id !== gateId) return;
    finish();
  }));
  return el("div", { class: "ready-gate" }, [status, btn]);
}

export function localReadyGate(names, onAllReady, opts = {}) {
  const label = !opts.label || opts.label.toLowerCase() === "ready" ? "Continue" : opts.label;
  return el("div", { class: "ready-gate local-ready-gate" },
    button(label, { big: true, onClick: onAllReady }));
}

// ---------- Global reactions ----------
const REACTION_EMOJIS = ["💀", "😭", "?", "!", "😡", "😂", "🔥", "💖"];
const REACTION_POS_KEY = "party_reaction_dock_pos_v1";
let reactionDock = null;
let reactionLayer = null;
let reactionSession = null;
let reactionOff = null;
const reactionSeen = new Set();

function reactionId() {
  try { return crypto.randomUUID(); } catch { return `r${Date.now()}${Math.random().toString(36).slice(2)}`; }
}

function rememberReaction(id) {
  if (!id) return false;
  if (reactionSeen.has(id)) return true;
  reactionSeen.add(id);
  if (reactionSeen.size > 100) reactionSeen.delete(reactionSeen.values().next().value);
  return false;
}

function seededRandom(seed) {
  let x = 0;
  String(seed || Math.random()).split("").forEach((ch) => { x = Math.imul(31, x) + ch.charCodeAt(0) | 0; });
  return () => {
    x = Math.imul(1664525, x) + 1013904223 | 0;
    return ((x >>> 0) / 4294967296);
  };
}

function clampDockPosition(left, top) {
  const margin = 10;
  const size = 58;
  return {
    left: Math.max(margin, Math.min(window.innerWidth - size - margin, left)),
    top: Math.max(margin + (window.visualViewport?.offsetTop || 0), Math.min(window.innerHeight - size - margin, top)),
  };
}

function loadDockPosition() {
  try {
    const saved = JSON.parse(localStorage.getItem(REACTION_POS_KEY) || "null");
    if (Number.isFinite(saved?.left) && Number.isFinite(saved?.top)) return clampDockPosition(saved.left, saved.top);
  } catch {}
  return clampDockPosition(16, window.innerHeight - 118);
}

function saveDockPosition(left, top) {
  try { localStorage.setItem(REACTION_POS_KEY, JSON.stringify(clampDockPosition(left, top))); } catch {}
}

function placeReactionDock(left, top) {
  if (!reactionDock) return;
  const pos = clampDockPosition(left, top);
  reactionDock.style.left = `${pos.left}px`;
  reactionDock.style.top = `${pos.top}px`;
  reactionDock.style.right = "auto";
  reactionDock.style.bottom = "auto";
}

function reactionFloatLayer() {
  if (reactionLayer?.isConnected) return reactionLayer;
  reactionLayer = el("div", { class: "reaction-float-layer", "aria-hidden": "true" });
  document.body.append(reactionLayer);
  return reactionLayer;
}

function spawnReaction(emoji, seed = Math.random()) {
  const rnd = seededRandom(seed);
  const node = el("div", { class: "reaction-float" }, emoji);
  const x = 10 + rnd() * 80;
  const dx = Math.round((rnd() - 0.5) * 96);
  const rot = Math.round((rnd() - 0.5) * 36);
  const scale = (0.9 + rnd() * 0.45).toFixed(2);
  const dur = Math.round(1350 + rnd() * 520);
  node.style.cssText = `--rx:${x}vw;--rdx:${dx}px;--rrot:${rot}deg;--rscale:${scale};--rdur:${dur}ms;`;
  reactionFloatLayer().append(node);
  setTimeout(() => node.remove(), dur + 120);
}

function sendReaction(emoji) {
  const id = reactionId();
  const seed = `${id}:${Date.now()}`;
  rememberReaction(id);
  spawnReaction(emoji, seed);
  haptic(10);
  if (reactionSession?.mode === "online") {
    reactionSession.sendPrivate("app_reaction", { id, emoji, seed, at: Date.now() });
  }
}

function setReactionPalette(open) {
  if (!reactionDock) return;
  reactionDock.classList.toggle("open", !!open);
  const btn = reactionDock.querySelector(".reaction-main");
  if (btn) btn.setAttribute("aria-expanded", open ? "true" : "false");
}

function ensureReactionDock() {
  if (reactionDock?.isConnected) return reactionDock;
  let drag = null;
  let suppressClick = false;
  const main = el("button", {
    class: "reaction-main",
    type: "button",
    "aria-label": "Reactions",
    "aria-expanded": "false",
    title: "Reactions",
    onClick: () => {
      if (suppressClick) return;
      setReactionPalette(!reactionDock.classList.contains("open"));
    },
    onKeydown: (event) => {
      if (event.key !== "Escape") return;
      setReactionPalette(false);
      event.stopPropagation();
    },
  }, "☺");
  const choices = el("div", { class: "reaction-palette", role: "menu" },
    REACTION_EMOJIS.map((emoji) => el("button", {
      class: "reaction-choice",
      type: "button",
      role: "menuitem",
      "aria-label": `Send ${emoji}`,
      title: emoji,
      onClick: (event) => {
        event.stopPropagation();
        sendReaction(emoji);
      },
    }, emoji)));
  reactionDock = el("div", { class: "reaction-dock" }, [choices, main]);
  reactionDock.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".reaction-choice")) return;
    const rect = reactionDock.getBoundingClientRect();
    drag = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: rect.left,
      top: rect.top,
      moved: false,
      mainTap: !!event.target.closest(".reaction-main"),
    };
    reactionDock.setPointerCapture?.(event.pointerId);
  });
  reactionDock.addEventListener("pointermove", (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true;
    if (!drag.moved) return;
    placeReactionDock(drag.left + dx, drag.top + dy);
  });
  reactionDock.addEventListener("pointerup", (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    const tappedMain = !drag.moved && drag.mainTap;
    if (drag.moved) {
      const rect = reactionDock.getBoundingClientRect();
      saveDockPosition(rect.left, rect.top);
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 0);
    } else if (tappedMain) {
      setReactionPalette(!reactionDock.classList.contains("open"));
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 0);
    }
    drag = null;
  });
  document.body.append(reactionDock);
  const pos = loadDockPosition();
  placeReactionDock(pos.left, pos.top);
  window.addEventListener("resize", () => {
    if (!reactionDock?.isConnected) return;
    const rect = reactionDock.getBoundingClientRect();
    placeReactionDock(rect.left, rect.top);
  });
  return reactionDock;
}

export function bindReactionSession(session) {
  ensureReactionDock();
  if (reactionOff) {
    try { reactionOff(); } catch {}
    reactionOff = null;
  }
  reactionSession = session?.mode === "online" ? session : null;
  if (!reactionSession) return;
  reactionOff = reactionSession.on("app_reaction", (message) => {
    if (!message?.emoji || !REACTION_EMOJIS.includes(message.emoji)) return;
    if (rememberReaction(message.id)) return;
    spawnReaction(message.emoji, message.seed || message.id);
    if (reactionSession?.isHost && message.from !== reactionSession.myIndex) {
      reactionSession.sendPrivate("app_reaction", {
        id: message.id,
        emoji: message.emoji,
        seed: message.seed || message.id,
        at: message.at || Date.now(),
        origin: message.origin ?? message.from,
      });
    }
  });
  if (!reactionSession.__reactionDestroyWrapped) {
    const originalDestroy = reactionSession.destroy?.bind(reactionSession);
    reactionSession.destroy = () => {
      if (reactionSession === session) bindReactionSession(null);
      originalDestroy?.();
    };
    reactionSession.__reactionDestroyWrapped = true;
  }
}

// ---------- Waiting arcade ----------
const WAITING_ARCADE_KEY = "party_waiting_arcade_v1";
const MINES_CONFIGS = {
  easy: { id: "easy", label: "Easy", rows: 6, cols: 6, mines: 6 },
  medium: { id: "medium", label: "Medium", rows: 8, cols: 8, mines: 10 },
  hard: { id: "hard", label: "Hard", rows: 10, cols: 10, mines: 16 },
};
const MINES_NUM_COLORS = ["", "#2563a6", "#178765", "#c2410c", "#7c3aed", "#be123c", "#0f766e", "#334155", "#111827"];
const ARCADE_HIGHSCORES_KEY = "party_arcade_highscores_v1";

function loadArcadeHighscores() {
  try {
    const raw = JSON.parse(localStorage.getItem(ARCADE_HIGHSCORES_KEY) || "{}");
    return { merge: Number(raw.merge) || 0, minesWins: Number(raw.minesWins) || 0, tetris: Number(raw.tetris) || 0 };
  } catch {
    return { merge: 0, minesWins: 0, tetris: 0 };
  }
}

function saveArcadeHighscores(scores) {
  try { localStorage.setItem(ARCADE_HIGHSCORES_KEY, JSON.stringify(scores)); } catch {}
}

function recordMergeHighscore(score) {
  const scores = loadArcadeHighscores();
  const isNew = score > scores.merge;
  if (isNew) {
    scores.merge = score;
    saveArcadeHighscores(scores);
  }
  return { best: Math.max(scores.merge, score), isNew: isNew && score > 0 };
}

function recordMinesClear() {
  const scores = loadArcadeHighscores();
  scores.minesWins += 1;
  saveArcadeHighscores(scores);
  return scores.minesWins;
}

function recordTetrisHighscore(score) {
  const scores = loadArcadeHighscores();
  const isNew = score > scores.tetris;
  if (isNew) {
    scores.tetris = score;
    saveArcadeHighscores(scores);
  }
  return { best: Math.max(scores.tetris, score), isNew: isNew && score > 0 };
}

function recordTetrisEnd(game) {
  if (game.status !== "lost" || game.scoreRecorded) return;
  game.scoreRecorded = true;
  game.scoreMeta = recordTetrisHighscore(game.score);
}

function recordMergeEnd(game) {
  if (game.status === "running" || game.scoreRecorded) return;
  game.scoreRecorded = true;
  game.scoreMeta = recordMergeHighscore(game.score);
}

function minesRevealedCount(game) {
  return game.cells.filter((cell) => cell.revealed && !cell.mine).length;
}

function minesSafeTotal(game) {
  return game.cells.length - game.mineCount;
}

function arcadeGameOverCard({ tone, title, detail, scoreLabel, score, bestLabel, best, isNewRecord, onRestart }) {
  return el("div", { class: "arcade-result-overlay", role: "dialog", "aria-label": title }, [
    el("div", { class: "arcade-result-card" }, [
      el("div", { class: `arcade-result-title ${tone}`.trim() }, title),
      detail ? el("div", { class: "arcade-result-sub" }, detail) : null,
      el("div", { class: "arcade-result-scores" }, [
        el("div", { class: "arcade-result-stat" }, [
          el("span", { class: "arcade-result-label" }, scoreLabel),
          el("span", { class: "arcade-result-value" }, score),
        ]),
        el("div", { class: "arcade-result-stat" }, [
          el("span", { class: "arcade-result-label" }, bestLabel),
          el("span", { class: "arcade-result-value" }, best),
        ]),
      ]),
      isNewRecord ? el("div", { class: "arcade-result-record" }, "New best!") : null,
      el("button", { class: "arcade-restart", type: "button", onClick: onRestart }, "Play again"),
    ]),
  ]);
}

function arcadeBestBadge(label, value) {
  if (!value) return null;
  return el("span", { class: "arcade-best" }, [el("span", { class: "arcade-best-label" }, label), el("span", { class: "arcade-best-value" }, value)]);
}

function arcadeDefaults() {
  return { tab: "mines", minesDifficulty: "easy", minesMode: "dig", mines: null, merge: null, tetris: null };
}

function loadArcadeState() {
  try {
    const state = { ...arcadeDefaults(), ...JSON.parse(localStorage.getItem(WAITING_ARCADE_KEY) || "{}") };
    if (!["mines", "merge", "tetris"].includes(state.tab)) state.tab = "mines";
    if (!MINES_CONFIGS[state.minesDifficulty]) state.minesDifficulty = "easy";
    if (!["dig", "flag"].includes(state.minesMode)) state.minesMode = "dig";
    return state;
  } catch {
    return arcadeDefaults();
  }
}

function saveArcadeState(state) {
  try { localStorage.setItem(WAITING_ARCADE_KEY, JSON.stringify(state)); } catch {}
}

function decorateWaitingScreens(root) {
  if (!root || root.querySelector(".waiting-arcade")) return;
  if (!isWaitingRender(root)) return;
  const target = root.querySelector(".screen") || root;
  const arcade = waitingArcadePanel();
  const footer = target.querySelector(":scope > .footer-actions");
  if (footer) target.insertBefore(arcade, footer);
  else target.append(arcade);
}

function isWaitingRender(root) {
  const waitingNodes = Array.from(root.querySelectorAll(".waiting, .compact-wait"))
    .filter((node) => !node.closest(".waiting-arcade"));
  if (waitingNodes.length) return true;
  const hasSpinner = Array.from(root.querySelectorAll(".spinner"))
    .some((node) => !node.closest(".waiting-arcade"));
  if (!hasSpinner) return false;
  return /\b(waiting|locked|joining|opening|reconnecting|returning|checking|watching)\b/i.test(root.textContent || "");
}

function waitingArcadePanel() {
  const state = loadArcadeState();
  if (!state.mines) state.mines = createMinesGame(state.minesDifficulty);
  if (!state.merge) state.merge = createMergeGame();
  else state.merge = normalizeMergeGame(state.merge);
  if (!state.tetris) state.tetris = createTetrisGame();
  else state.tetris = normalizeTetrisGame(state.tetris);
  saveArcadeState(state);
  const panel = el("section", {
    class: "waiting-arcade",
    "aria-label": "Waiting arcade",
    onPointerdown: (event) => event.stopPropagation(),
    onClick: (event) => event.stopPropagation(),
  });
  renderArcade(panel, state);
  return panel;
}

function rerenderArcade(panel, mutator) {
  const state = loadArcadeState();
  if (!state.mines) state.mines = createMinesGame(state.minesDifficulty);
  if (!state.merge) state.merge = createMergeGame();
  else state.merge = normalizeMergeGame(state.merge);
  if (!state.tetris) state.tetris = createTetrisGame();
  else state.tetris = normalizeTetrisGame(state.tetris);
  mutator?.(state);
  saveArcadeState(state);
  renderArcade(panel, state);
}

function renderArcade(panel, state) {
  panel.__tetrisCleanup?.();
  panel.__tetrisCleanup = null;
  const tab = (value, label) => el("button", {
    class: `arcade-tab ${state.tab === value ? "on" : ""}`.trim(),
    type: "button",
    onClick: () => rerenderArcade(panel, (next) => { next.tab = value; }),
  }, label);
  const gameView = state.tab === "mines"
    ? minesView(panel, state)
    : state.tab === "merge"
      ? mergeView(panel, state)
      : tetrisView(panel, state, {
        el,
        saveArcadeState,
        rerenderArcade,
        loadArcadeHighscores,
        recordTetrisHighscore,
        recordTetrisEnd,
        arcadeGameOverCard,
        arcadeBestBadge,
        bindSwipe,
      });
  panel.replaceChildren(
    el("div", { class: "arcade-head" }, [
      el("div", { class: "arcade-title" }, "Waiting arcade"),
      el("div", { class: "arcade-tabs" }, [tab("mines", "Mines"), tab("merge", "2048"), tab("tetris", "Tetris")]),
    ]),
    gameView,
  );
}

function minesConfig(id) {
  return MINES_CONFIGS[id] || MINES_CONFIGS.easy;
}

function createMinesGame(difficulty = "easy") {
  const cfg = minesConfig(difficulty);
  return {
    difficulty: cfg.id,
    rows: cfg.rows,
    cols: cfg.cols,
    mineCount: cfg.mines,
    firstMove: true,
    status: "running",
    cells: Array.from({ length: cfg.rows * cfg.cols }, () => ({ mine: false, count: 0, revealed: false, flagged: false })),
  };
}

function minesNeighbors(game, index) {
  const row = Math.floor(index / game.cols);
  const col = index % game.cols;
  const out = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const rr = row + dr;
      const cc = col + dc;
      if (rr >= 0 && cc >= 0 && rr < game.rows && cc < game.cols) out.push(rr * game.cols + cc);
    }
  }
  return out;
}

function seedMines(game, safeIndex) {
  const blocked = new Set([safeIndex, ...minesNeighbors(game, safeIndex)]);
  let candidates = game.cells.map((_, i) => i).filter((i) => !blocked.has(i));
  if (candidates.length < game.mineCount) candidates = game.cells.map((_, i) => i).filter((i) => i !== safeIndex);
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  candidates.slice(0, game.mineCount).forEach((i) => { game.cells[i].mine = true; });
  game.cells.forEach((cell, i) => {
    cell.count = cell.mine ? 0 : minesNeighbors(game, i).filter((n) => game.cells[n].mine).length;
  });
  game.firstMove = false;
}

function revealMineCell(game, index) {
  if (game.status !== "running") return;
  const cell = game.cells[index];
  if (!cell || cell.flagged || cell.revealed) return;
  if (game.firstMove) seedMines(game, index);
  if (cell.mine) {
    cell.revealed = true;
    game.cells.forEach((c) => { if (c.mine) c.revealed = true; });
    game.status = "lost";
    return;
  }
  const queue = [index];
  const seen = new Set();
  while (queue.length) {
    const i = queue.shift();
    if (seen.has(i)) continue;
    seen.add(i);
    const current = game.cells[i];
    if (!current || current.flagged || current.revealed) continue;
    current.revealed = true;
    if (current.count === 0) minesNeighbors(game, i).forEach((n) => queue.push(n));
  }
  if (game.cells.every((c) => c.mine || c.revealed)) {
    game.status = "won";
    game.cells.forEach((c) => { if (c.mine) c.flagged = true; });
    if (!game.winRecorded) {
      game.winRecorded = true;
      recordMinesClear();
    }
  }
}

function toggleMineFlag(game, index) {
  if (game.status !== "running") return;
  const cell = game.cells[index];
  if (!cell || cell.revealed) return;
  cell.flagged = !cell.flagged;
}

function minesView(panel, state) {
  const game = state.mines && state.mines.cells ? state.mines : createMinesGame(state.minesDifficulty);
  state.mines = game;
  const highscores = loadArcadeHighscores();
  const flagged = game.cells.filter((cell) => cell.flagged).length;
  const statusText = game.status === "won" ? "Cleared" : game.status === "lost" ? "Boom" : `${Math.max(0, game.mineCount - flagged)} left`;
  const restartMines = () => rerenderArcade(panel, (next) => { next.mines = createMinesGame(next.minesDifficulty); });
  const diffButtons = Object.values(MINES_CONFIGS).map((cfg) => el("button", {
    class: `arcade-chip ${state.minesDifficulty === cfg.id ? "on" : ""}`.trim(),
    type: "button",
    disabled: game.status === "lost",
    onClick: () => rerenderArcade(panel, (next) => { next.minesDifficulty = cfg.id; }),
  }, cfg.label));
  const modeButton = (mode, label) => el("button", {
    class: `arcade-icon ${state.minesMode === mode ? "on" : ""}`.trim(),
    type: "button",
    disabled: game.status === "lost",
    title: mode === "dig" ? "Dig" : "Flag",
    "aria-label": mode === "dig" ? "Dig" : "Flag",
    onClick: () => rerenderArcade(panel, (next) => { next.minesMode = mode; }),
  }, label);
  const cells = game.cells.map((cell, i) => {
    const label = cell.revealed
      ? cell.mine ? "💣" : cell.count ? String(cell.count) : ""
      : cell.flagged ? "⚑" : "";
    const props = {
      class: `ms-cell ${cell.revealed ? "revealed" : ""} ${cell.revealed && !cell.mine && cell.count === 0 ? "clear" : ""} ${cell.revealed && cell.count ? "num" : ""} ${cell.flagged ? "flagged" : ""} ${cell.mine && cell.revealed ? "mine" : ""}`.trim(),
      type: "button",
      disabled: game.status === "lost",
      "aria-label": `Mine cell ${i + 1}`,
      style: cell.revealed && cell.count ? `--num-color:${MINES_NUM_COLORS[cell.count]}` : "",
      onClick: () => rerenderArcade(panel, (next) => {
        const target = next.mines;
        if (next.minesMode === "flag") toggleMineFlag(target, i);
        else revealMineCell(target, i);
      }),
      onContextmenu: (event) => {
        event.preventDefault();
        rerenderArcade(panel, (next) => toggleMineFlag(next.mines, i));
      },
    };
    return el("button", props, label);
  });
  const board = el("div", {
    class: "ms-board",
    style: `--ms-cols:${game.cols};--ms-rows:${game.rows};`,
  }, cells);
  const boardWrap = el("div", { class: "arcade-board-wrap arcade-board-wrap--mines" }, [board]);
  if (game.status === "lost") {
    const revealed = minesRevealedCount(game);
    const total = minesSafeTotal(game);
    boardWrap.append(arcadeGameOverCard({
      tone: "lost",
      title: "Boom!",
      detail: `Revealed ${revealed} of ${total} safe cells`,
      scoreLabel: "This run",
      score: String(revealed),
      bestLabel: "Best clears",
      best: String(highscores.minesWins),
      isNewRecord: false,
      onRestart: restartMines,
    }));
  }
  return el("div", { class: `arcade-game mines-game${game.status === "lost" ? " ended" : ""}`.trim() }, [
    el("div", { class: "arcade-controls" }, [
      el("div", { class: "arcade-controls-left" }, [
        el("div", { class: "arcade-chip-row" }, diffButtons),
        arcadeBestBadge("Best clears", highscores.minesWins ? String(highscores.minesWins) : null),
      ]),
      game.status === "lost"
        ? el("button", { class: "arcade-restart arcade-restart-inline", type: "button", onClick: restartMines }, "Play again")
        : el("button", {
          class: "arcade-play",
          type: "button",
          onClick: restartMines,
        }, "Play"),
    ]),
    el("div", { class: "arcade-subbar" }, [
      el("span", { class: `arcade-state ${game.status}`.trim() }, statusText),
      el("div", { class: "arcade-icon-row" }, [modeButton("dig", "⛏"), modeButton("flag", "⚑")]),
    ]),
    boardWrap,
  ]);
}

const MERGE_SLIDE_MS = 130;

function createMergeGame() {
  const game = { tiles: [], score: 0, status: "running", nextId: 1 };
  spawnMergeTile(game);
  spawnMergeTile(game);
  return game;
}

function normalizeMergeGame(raw) {
  if (!raw) return createMergeGame();
  if (raw.tiles?.length) {
    if (!raw.nextId) raw.nextId = Math.max(0, ...raw.tiles.map((t) => t.id || 0)) + 1;
    return raw;
  }
  if (!raw.grid) return createMergeGame();
  const game = { tiles: [], score: raw.score || 0, status: raw.status || "running", nextId: 1 };
  raw.grid.forEach((value, i) => {
    if (value) game.tiles.push({ id: game.nextId++, value, r: Math.floor(i / 4), c: i % 4 });
  });
  return game;
}

function spawnMergeTile(game) {
  const occupied = new Set(game.tiles.map((t) => `${t.r},${t.c}`));
  const empty = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      if (!occupied.has(`${r},${c}`)) empty.push({ r, c });
    }
  }
  if (!empty.length) return null;
  const spot = empty[Math.floor(Math.random() * empty.length)];
  const tile = { id: game.nextId++, value: Math.random() < 0.9 ? 2 : 4, r: spot.r, c: spot.c };
  game.tiles.push(tile);
  return tile;
}

function mergeLineTiles(tiles, slots) {
  const out = [];
  let gained = 0;
  let moved = false;
  for (const tile of tiles) {
    const prev = out[out.length - 1];
    if (prev && prev.value === tile.value && !prev.merged) {
      prev.value *= 2;
      prev.merged = true;
      prev.mergePop = true;
      gained += prev.value;
      tile.dying = true;
      tile.mergeTarget = prev;
      moved = true;
    } else {
      out.push(tile);
    }
  }
  out.forEach((tile, i) => {
    const slot = slots(i);
    if (tile.r !== slot.r || tile.c !== slot.c) moved = true;
    tile.toR = slot.r;
    tile.toC = slot.c;
  });
  for (const tile of tiles) {
    if (!tile.dying || !tile.mergeTarget) continue;
    tile.toR = tile.mergeTarget.toR;
    tile.toC = tile.mergeTarget.toC;
    if (tile.r !== tile.toR || tile.c !== tile.toC) moved = true;
  }
  return { moved, gained };
}

function moveMerge(game, direction) {
  if (game.status !== "running") return false;
  game.tiles.forEach((t) => {
    delete t.born;
    delete t.mergePop;
    delete t.merged;
    delete t.dying;
    delete t.mergeTarget;
    delete t.toR;
    delete t.toC;
  });
  const config = {
    left: { group: (t) => t.r, sort: (a, b) => a.c - b.c, slots: (i, key) => ({ r: key, c: i }) },
    right: { group: (t) => t.r, sort: (a, b) => b.c - a.c, slots: (i, key) => ({ r: key, c: 3 - i }) },
    up: { group: (t) => t.c, sort: (a, b) => a.r - b.r, slots: (i, key) => ({ r: i, c: key }) },
    down: { group: (t) => t.c, sort: (a, b) => b.r - a.r, slots: (i, key) => ({ r: 3 - i, c: key }) },
  };
  const cfg = config[direction];
  const groups = new Map();
  for (const tile of game.tiles) {
    const key = cfg.group(tile);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(tile);
  }
  let moved = false;
  let gained = 0;
  for (const [key, line] of groups) {
    line.sort(cfg.sort);
    const result = mergeLineTiles(line, (i) => cfg.slots(i, key));
    if (result.moved) moved = true;
    gained += result.gained;
  }
  if (!moved) return false;
  game.score += gained;
  return true;
}

function finalizeMergeMove(game) {
  game.tiles = game.tiles.filter((t) => !t.dying);
  game.tiles.forEach((t) => {
    t.r = t.toR ?? t.r;
    t.c = t.toC ?? t.c;
    delete t.toR;
    delete t.toC;
    delete t.merged;
    delete t.dying;
    delete t.mergeTarget;
  });
}

function finishMergeTurn(game) {
  const spawned = spawnMergeTile(game);
  if (spawned) spawned.born = true;
  if (game.tiles.some((t) => t.value >= 2048)) game.status = "won";
  else if (!hasMergeMoves(game)) game.status = "lost";
  recordMergeEnd(game);
}

function hasMergeMoves(game) {
  const grid = Array(16).fill(0);
  game.tiles.forEach((t) => { grid[t.r * 4 + t.c] = t.value; });
  if (grid.some((value) => value === 0)) return true;
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 3; c++) {
      if (grid[r * 4 + c] === grid[r * 4 + c + 1]) return true;
    }
  }
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 3; r++) {
      if (grid[r * 4 + c] === grid[(r + 1) * 4 + c]) return true;
    }
  }
  return false;
}

function tileClass(value) {
  if (!value) return "empty";
  const power = Math.min(11, Math.log2(value));
  return `v${power}`;
}

function mergeStatusText(game) {
  if (game.status === "won") return "2048";
  if (game.status === "lost") return "Stuck";
  return String(game.score);
}

function bindSwipe(node, onSwipe, { threshold = 28 } = {}) {
  let start = null;
  node.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button, a, input, textarea, select, label, [role='button']")) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    start = { x: event.clientX, y: event.clientY, id: event.pointerId };
    node.setPointerCapture?.(event.pointerId);
  });
  node.addEventListener("pointerup", (event) => {
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    start = null;
    if (node.hasPointerCapture?.(event.pointerId)) node.releasePointerCapture?.(event.pointerId);
    if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;
    if (Math.abs(dx) > Math.abs(dy)) onSwipe(dx > 0 ? "right" : "left");
    else onSwipe(dy > 0 ? "down" : "up");
  });
  node.addEventListener("pointercancel", () => { start = null; });
}

function mergeView(panel, state) {
  const game = normalizeMergeGame(state.merge?.tiles || state.merge?.grid ? state.merge : null);
  state.merge = game;
  const highscores = loadArcadeHighscores();
  let animating = false;
  const restartMerge = () => rerenderArcade(panel, (next) => { next.merge = createMergeGame(); });
  const statusEl = el("span", { class: `arcade-state ${game.status}`.trim() }, mergeStatusText(game));
  const board = el("div", { class: "merge-board" });
  for (let i = 0; i < 16; i++) board.append(el("div", { class: "merge-cell" }));
  const layer = el("div", { class: "merge-tiles-layer" });
  board.append(layer);
  const boardWrap = el("div", { class: "arcade-board-wrap" }, [board]);

  const paintTiles = () => {
    layer.replaceChildren(...game.tiles.map((tile) => el("div", {
      class: `merge-tile ${tileClass(tile.value)}${tile.born ? " born" : ""}`.trim(),
      style: `--mr:${tile.r};--mc:${tile.c}`,
      "data-id": String(tile.id),
    }, tile.value)));
  };

  const syncStatus = () => {
    statusEl.textContent = mergeStatusText(game);
    statusEl.className = `arcade-state ${game.status}`.trim();
  };

  const syncEndOverlay = () => {
    boardWrap.querySelector(".arcade-result-overlay")?.remove();
    if (game.status !== "lost") return;
    recordMergeEnd(game);
    const meta = game.scoreMeta || recordMergeHighscore(game.score);
    boardWrap.append(arcadeGameOverCard({
      tone: "lost",
      title: "No moves left",
      detail: "The board is full — try to beat your best score.",
      scoreLabel: "Score",
      score: String(game.score),
      bestLabel: "Best",
      best: String(meta.best),
      isNewRecord: meta.isNew,
      onRestart: restartMerge,
    }));
  };

  const applyTilePositions = () => {
    for (const tile of game.tiles) {
      const node = layer.querySelector(`[data-id="${tile.id}"]`);
      if (!node) continue;
      node.style.setProperty("--mr", String(tile.toR ?? tile.r));
      node.style.setProperty("--mc", String(tile.toC ?? tile.c));
    }
  };

  const doMove = (direction) => {
    if (animating || game.status !== "running") return;
    if (!moveMerge(game, direction)) return;
    animating = true;
    saveArcadeState(state);
    paintTiles();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        applyTilePositions();
        window.setTimeout(() => {
          const popIds = game.tiles.filter((t) => t.mergePop).map((t) => t.id);
          game.tiles.filter((t) => t.dying).forEach((t) => {
            const node = layer.querySelector(`[data-id="${t.id}"]`);
            node?.classList.add("fade-out");
          });
          window.setTimeout(() => {
            finalizeMergeMove(game);
            finishMergeTurn(game);
            saveArcadeState(state);
            syncStatus();
            paintTiles();
            popIds.forEach((id) => layer.querySelector(`[data-id="${id}"]`)?.classList.add("merge-pop"));
            syncEndOverlay();
            root?.classList.toggle("ended", game.status === "lost");
            animating = false;
          }, 40);
        }, MERGE_SLIDE_MS);
      });
    });
  };

  let root;
  root = el("div", {
    class: `arcade-game merge-game${game.status === "lost" ? " ended" : ""}`.trim(),
    tabindex: "0",
    "aria-label": "2048 game",
    onPointerdown: () => root.focus({ preventScroll: true }),
    onKeydown: (event) => {
      const map = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
      const direction = map[event.key];
      if (!direction) return;
      event.preventDefault();
      doMove(direction);
    },
  }, [
    el("div", { class: "arcade-controls" }, [
      el("div", { class: "arcade-controls-left" }, [
        statusEl,
        arcadeBestBadge("Best", highscores.merge ? String(highscores.merge) : null),
      ]),
      game.status === "lost"
        ? el("button", { class: "arcade-restart arcade-restart-inline", type: "button", onClick: restartMerge }, "Play again")
        : el("button", {
          class: "arcade-play",
          type: "button",
          onClick: restartMerge,
        }, "Play"),
    ]),
    boardWrap,
    el("div", { class: "merge-controls", "aria-label": "2048 controls" }, [
      el("span"),
      el("button", { class: "arcade-icon", type: "button", "aria-label": "Up", onClick: () => doMove("up") }, "↑"),
      el("span"),
      el("button", { class: "arcade-icon", type: "button", "aria-label": "Left", onClick: () => doMove("left") }, "←"),
      el("button", { class: "arcade-icon", type: "button", "aria-label": "Down", onClick: () => doMove("down") }, "↓"),
      el("button", { class: "arcade-icon", type: "button", "aria-label": "Right", onClick: () => doMove("right") }, "→"),
    ]),
  ]);

  paintTiles();
  syncEndOverlay();
  bindSwipe(boardWrap, doMove);
  queueMicrotask(() => root.focus({ preventScroll: true }));
  return root;
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
