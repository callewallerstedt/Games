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

export function topbar({ onBack, right } = {}) {
  return el("div", { class: "topbar" }, [
    onBack ? el("button", { class: "iconbtn", "aria-label": "Back", onClick: onBack }, "‹") : null,
    el("div", { class: "brand" }, ["🎲", "Together"]),
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

export function scoreChip(n, label) {
  return el("div", { class: "score-chip" }, [el("span", { class: "n" }, String(n)), el("span", { class: "l" }, label)]);
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
