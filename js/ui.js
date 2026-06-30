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

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

// Render a full screen into #app. `content` is a node or array of nodes.
export function render(content) {
  const app = clear($app());
  for (const c of [].concat(content)) if (c) app.append(c);
  window.scrollTo(0, 0);
}

// Inline logo mark — a heart-shaped chat bubble, matching the app icon.
export function logoMark(size = 26) {
  const span = el("span", { class: "logo", style: `width:${size}px;height:${size}px` });
  span.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">
    <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="var(--brand)"/><stop offset="1" stop-color="var(--accent)"/>
    </linearGradient></defs>
    <path fill="url(#lg)" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
    <circle cx="8.5" cy="9" r="1.05" fill="#fff"/><circle cx="12" cy="9" r="1.05" fill="#fff"/><circle cx="15.5" cy="9" r="1.05" fill="#fff"/>
  </svg>`;
  return span;
}

export function topbar({ onBack, right } = {}) {
  return el("div", { class: "topbar" }, [
    onBack ? el("button", { class: "iconbtn", "aria-label": "Back", onClick: onBack }, "‹") : null,
    el("div", { class: "brand" }, [logoMark(24), "Together"]),
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
  return topbar({ onBack: ctx.exit, right });
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
    const overlay = el("div", { class: "pass" }, [
      el("div", { class: "hand" }, "🤝"),
      el("div", {}, "Pass the phone to"),
      el("div", { class: "who" }, name),
      subtitle ? el("div", { class: "sub" }, subtitle) : null,
      el("button", {
        class: "btn big", onClick: () => { overlay.remove(); resolve(); },
      }, `I'm ${name} — ready`),
    ]);
    document.body.append(overlay);
  });
}

export const PLAYER_COLORS = ["#6c5ce7", "#ff5e98", "#14b88a", "#f0a13b"];

export function scoreChip(n, label, opts = {}) {
  const { active, color } = opts;
  const style = active && color ? `--chip-color:${color}` : undefined;
  return el("div", {
    class: `score-chip ${active ? "active" : ""}`.trim(),
    style,
  }, [el("span", { class: "n" }, String(n)), el("span", { class: "l" }, label)]);
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
  { value: "auto", label: "✨ Default" },
  { value: "cute", label: "🌸 Cute" },
  { value: "dark", label: "🌙 Dark" },
];
export const getTheme = () => localStorage.getItem("together_theme") || "auto";
export function applyTheme(t) {
  t = t || getTheme();
  if (t === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
  try { localStorage.setItem("together_theme", t); } catch {}
}
// Theme picker sheet. onChange called after applying.
export function themePicker(onChange) {
  const seg = segmented(THEMES, getTheme(), (v) => { applyTheme(v); onChange && onChange(v); });
  return modal("🎨 Theme", [el("p", { class: "muted" }, "Pick a vibe for the whole app."), seg.node]);
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
