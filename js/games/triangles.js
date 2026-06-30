// "Triangle Lines" — tap two nearby dots to draw a line; close a triangle, go again.
import { el, render, button, gameHeader, scoreChip, haptic, PLAYER_COLORS, localReadyGate } from "../ui.js";

const SIZE = 4;
const INSET = 8;
const SPAN = 100 - INSET * 2;
const LINE_WIDTH = 5.5;

const game = {
  id: "triangles",
  title: "Triangle Lines",
  emoji: "📐",
  color: "linear-gradient(135deg,#14b88a,#4bd1ff)",
  blurb: "Connect dots — close a triangle, score it, draw again!",
  minPlayers: 2,
  maxPlayers: 4,
  modes: ["local"],
  pickColors: true,
  estMinutes: 12,
  rulesHTML: `
    <p>A grid of dots. On your turn, draw a line between two nearby dots.</p>
    <ol>
      <li>Tap one dot (it highlights), then tap a <b>neighbor</b> to draw a line.</li>
      <li>Complete a triangle → you score and <b>go again</b>!</li>
      <li>Most triangles when lines run out wins.</li>
    </ol>
    <p class="muted">Tap the highlighted dot again to cancel your pick.</p>`,
  mount(ctx) { local(ctx); },
};

function idx(r, c) { return r * SIZE + c; }
function rc(i) { return { r: Math.floor(i / SIZE), c: i % SIZE }; }

function neighbors(i) {
  const { r, c } = rc(i);
  const out = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE) out.push(idx(rr, cc));
    }
  }
  return out;
}

function edgeKey(a, b) { return a < b ? `${a}-${b}` : `${b}-${a}`; }
function triangleKey(a, b, c) { return [a, b, c].sort((x, y) => x - y).join(","); }

function hexAlpha(hex, alpha) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function findNewTriangles(edgeKeys, a, b, claimed) {
  const set = new Set(edgeKeys);
  const found = [];
  for (const c of neighbors(a)) {
    if (c === b) continue;
    const k1 = edgeKey(a, c), k2 = edgeKey(b, c), k3 = edgeKey(a, b);
    if (set.has(k1) && set.has(k2) && set.has(k3)) {
      const tk = triangleKey(a, b, c);
      if (!claimed.has(tk)) found.push(tk);
    }
  }
  return found;
}

function local(ctx) {
  const names = ctx.players;
  const n = names.length;
  const colors = Array.from({ length: n }, (_, i) => ctx.playerColors?.[i] || PLAYER_COLORS[i % PLAYER_COLORS.length]);
  let turn = 0;
  const scores = names.map(() => 0);
  const edges = new Map();
  const claimed = new Map();
  let selected = null;

  const turnBanner = el("div", { class: "tri-turn", role: "status" });
  const hintEl = el("p", { class: "muted center tiny tri-hint" }, "Tap a dot to start");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "tri-svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  const dotLayer = el("div", { class: "tri-dots" });
  const wrap = el("div", { class: "tri-wrap" }, [svg, dotLayer]);
  const scorebar = el("div", { class: "scorebar tri-scorebar" });

  const cell = SPAN / (SIZE - 1);
  const pos = (i) => { const { r, c } = rc(i); return { x: INSET + c * cell, y: INSET + r * cell }; };
  const pct = (v) => `${INSET + (v / (SIZE - 1)) * SPAN}%`;

  const dots = [];
  for (let i = 0; i < SIZE * SIZE; i++) {
    const { r, c } = rc(i);
    const btn = el("button", {
      class: "tri-dot",
      type: "button",
      style: `left:${pct(c)};top:${pct(r)}`,
      "aria-label": `dot ${i + 1}`,
    });
    btn.addEventListener("click", (e) => { e.preventDefault(); onDot(i); });
    dotLayer.append(btn);
    dots.push(btn);
  }

  function totalEdges() {
    let count = 0;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        neighbors(idx(r, c)).forEach((j) => { if (j > idx(r, c)) count++; });
      }
    }
    return count;
  }
  const maxEdges = totalEdges();

  function updateTurnUI() {
    const color = colors[turn];
    turnBanner.style.setProperty("--turn-color", color);
    turnBanner.replaceChildren(
      el("span", { class: "tri-turn-dot", "aria-hidden": "true" }),
      el("span", { class: "tri-turn-name" }, names[turn]),
      el("span", { class: "tri-turn-label" }, "'s turn"),
    );
    wrap.style.setProperty("--turn-color", color);
  }

  function paint() {
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    claimed.forEach((owner, tk) => {
      const [a, b, c] = tk.split(",").map(Number);
      const pa = pos(a), pb = pos(b), pc = pos(c);
      const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
      poly.setAttribute("points", `${pa.x},${pa.y} ${pb.x},${pb.y} ${pc.x},${pc.y}`);
      poly.setAttribute("class", "tri-fill");
      poly.setAttribute("fill", hexAlpha(colors[owner], 0.32));
      svg.append(poly);
    });

    edges.forEach((owner, k) => {
      const [a, b] = k.split("-").map(Number);
      const pa = pos(a), pb = pos(b);
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", pa.x);
      line.setAttribute("y1", pa.y);
      line.setAttribute("x2", pb.x);
      line.setAttribute("y2", pb.y);
      line.setAttribute("class", "tri-line");
      line.setAttribute("stroke", colors[owner]);
      line.setAttribute("stroke-width", String(LINE_WIDTH));
      line.setAttribute("stroke-linecap", "round");
      svg.append(line);
    });

    dots.forEach((btn, i) => {
      btn.className = "tri-dot";
      if (selected === i) btn.classList.add("sel");
      else if (selected != null && neighbors(selected).includes(i) && !edges.has(edgeKey(selected, i))) {
        btn.classList.add("nbr");
      }
    });

    updateTurnUI();
    hintEl.textContent = selected == null
      ? "Tap a dot"
      : "Tap a glowing neighbor — or tap again to cancel";

    scorebar.replaceChildren(...names.map((nm, i) => scoreChip(scores[i], nm, {
      active: i === turn,
      color: colors[i],
    })));
  }

  function onDot(i) {
    if (selected == null) {
      selected = i;
      haptic(8);
      paint();
      return;
    }
    if (selected === i) {
      selected = null;
      paint();
      return;
    }
    const a = selected, b = i;
    if (!neighbors(a).includes(b)) {
      selected = i;
      haptic(8);
      paint();
      return;
    }
    const k = edgeKey(a, b);
    if (edges.has(k)) {
      selected = i;
      paint();
      return;
    }

    edges.set(k, turn);
    const newTris = findNewTriangles([...edges.keys()], a, b, claimed);
    newTris.forEach((tk) => { claimed.set(tk, turn); scores[turn]++; });

    selected = null;
    haptic(newTris.length ? [10, 20, 10] : 8);

    if (edges.size >= maxEdges) return gameOver();
    if (newTris.length === 0) turn = (turn + 1) % n;
    paint();
  }

  function gameOver() {
    const best = Math.max(...scores);
    const wins = scores.map((s, i) => (s === best ? i : -1)).filter((i) => i >= 0);
    render(el("div", { class: "screen" }, [
      gameHeader(ctx, game),
      el("div", { class: "card center" }, [
        el("div", { class: "verdict match" }, "Board complete!"),
        el("p", {}, wins.length > 1 ? "It's a tie!" : `${names[wins[0]]} wins with ${best} triangles!`),
      ]),
      el("div", { class: "scorebar" }, names.map((nm, i) => scoreChip(scores[i], nm, { color: colors[i] }))),
      el("div", { class: "footer-actions" }, localReadyGate(names, reset, { label: "ready" })),
    ]));
  }

  function reset() {
    edges.clear();
    claimed.clear();
    scores.fill(0);
    turn = 0;
    selected = null;
    mountBoard();
  }

  function mountBoard() {
    paint();
    render(el("div", { class: "screen" }, [
      gameHeader(ctx, game),
      turnBanner,
      el("div", { class: "card tri-card" }, [hintEl, wrap]),
      scorebar,
      el("div", { class: "footer-actions" }, button("Restart board", { variant: "ghost", onClick: reset })),
    ]));
  }

  mountBoard();
}

export default game;
