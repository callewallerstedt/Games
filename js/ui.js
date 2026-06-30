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

export function topbar({ onBack, right } = {}) {
  return el("div", { class: "topbar" }, [
    onBack ? el("button", { class: "iconbtn", "aria-label": "Back", title: "Back", onClick: onBack }, "‹") : null,
    el("div", { class: "brand" }, "Party Games"),
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

// Bottom-sheet modal. Returns a close() fn.
export function modal(titleText, bodyNodes) {
  const close = () => bg.remove();
  const sheet = el("div", { class: "modal" }, [
    el("div", { class: "topbar" }, [
      el("h2", {}, titleText),
      el("div", { class: "spacer" }),
      el("button", { class: "iconbtn", "aria-label": "Close", onClick: close }, "✕"),
    ]),
    ...[].concat(bodyNodes),
  ]);
  const bg = el("div", { class: "modal-bg", onClick: (e) => { if (e.target === bg) close(); } }, [sheet]);
  document.body.append(bg);
  return close;
}

export function rulesModal(game) {
  return modal(`${game.emoji} ${game.title} — how to play`, el("div", { html: game.rulesHTML }));
}

// Standard in-game header: back button + rules + (optional) connection status.
// In online games the status pill is tappable to re-show the rejoin code.
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
  return topbar({ onBack: () => { disposeActiveGame(); ctx.exit(); }, right });
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

export function scoreboard(players, scores, opts = {}) {
  const activeIndex = Number.isInteger(opts.activeIndex) ? opts.activeIndex : -1;
  return el("div", { class: "scorebar shared-scoreboard", "aria-label": "Scoreboard" },
    players.map((name, i) => scoreChip(scores[i] ?? 0, name, {
      active: i === activeIndex,
      color: opts.colors?.[i],
    })));
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
];
export const getTheme = () => {
  const saved = localStorage.getItem("together_theme") || "auto";
  return THEMES.some((theme) => theme.value === saved) ? saved : "auto";
};
export function applyTheme(t) {
  t = t || getTheme();
  if (t === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    if (t === "light") meta.setAttribute("content", "#f5f7f8");
    else if (t === "dark") meta.setAttribute("content", "#17142b");
    else meta.setAttribute("content", meta.media?.includes("dark") ? "#17142b" : "#eee9ff");
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
