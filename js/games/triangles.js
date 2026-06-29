// "Triangle Lines" — draw lines between dots; complete a triangle to go again.
import { el, render, button, gameHeader, scoreChip, celebrate, haptic } from "../ui.js";

const SIZE = 5; // 5x5 dots

const game = {
  id: "triangles",
  title: "Triangle Lines",
  emoji: "📐",
  color: "linear-gradient(135deg,#14b88a,#4bd1ff)",
  blurb: "Connect dots — close a triangle, score it, draw again!",
  minPlayers: 2,
  maxPlayers: 4,
  modes: ["local"],
  estMinutes: 12,
  rulesHTML: `
    <p>A grid of dots. On your turn, draw a line between two nearby dots.</p>
    <ol>
      <li>Tap one dot, then a neighbor to claim that edge.</li>
      <li>If you complete a triangle (3 edges), you <b>score it</b> and get another turn!</li>
      <li>Most triangles when the board fills up wins.</li>
    </ol>
    <p class="muted">Lines can go horizontal, vertical, or diagonal between adjacent dots.</p>`,
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

function triangleKey(a, b, c) {
  return [a, b, c].sort((x, y) => x - y).join(",");
}

function findNewTriangles(edges, a, b, claimed) {
  const found = [];
  for (const c of neighbors(a)) {
    if (c === b) continue;
    const k1 = edgeKey(a, c);
    const k2 = edgeKey(b, c);
    const k3 = edgeKey(a, b);
    if (edges.has(k1) && edges.has(k2) && edges.has(k3)) {
      const tk = triangleKey(a, b, c);
      if (!claimed.has(tk)) found.push([a, b, c]);
    }
  }
  return found;
}

function local(ctx) {
  const names = ctx.players;
  const n = names.length;
  let turn = 0;
  const scores = names.map(() => 0);
  const edges = new Map(); // key -> player index
  const claimed = new Set(); // triangle keys
  let selected = null;

  const statusEl = el("span", { class: "pill" }, `${names[n - 1]} vs …`);
  const screen = (b) => render(el("div", { class: "screen" }, [gameHeader(ctx, game, statusEl), b]));

  function allEdgesCount() {
    let max = 0;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        neighbors(idx(r, c)).forEach((j) => {
          if (j > idx(r, c)) max++;
        });
      }
    }
    return max;
  }
  const totalEdges = allEdgesCount();

  function drawBoard() {
    selected = null;
    const edgeSet = new Set(edges.keys());
    const wrap = el("div", { class: "tri-wrap" });
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "tri-svg");
    svg.setAttribute("viewBox", "0 0 100 100");

    const cell = 100 / (SIZE - 1);
    const pos = (i) => {
      const { r, c } = rc(i);
      return { x: c * cell, y: r * cell };
    };

    // Draw claimed triangles lightly
    claimed.forEach((tk) => {
      const [a, b, c] = tk.split(",").map(Number);
      const pa = pos(a), pb = pos(b), pc = pos(c);
      const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
      poly.setAttribute("points", `${pa.x},${pa.y} ${pb.x},${pb.y} ${pc.x},${pc.y}`);
      poly.setAttribute("class", "tri-fill");
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
      line.setAttribute("class", `tri-line p${owner}`);
      svg.append(line);
    });

    wrap.append(svg);

    const dotLayer = el("div", { class: "tri-dots" });
    for (let i = 0; i < SIZE * SIZE; i++) {
      const { r, c } = rc(i);
      dotLayer.append(el("button", {
        class: `tri-dot ${selected === i ? "sel" : ""}`,
        style: `left:${(c / (SIZE - 1)) * 100}%;top:${(r / (SIZE - 1)) * 100}%`,
        "aria-label": `dot ${i + 1}`,
        onClick: () => onDot(i),
      }));
    }
    wrap.append(dotLayer);

    statusEl.textContent = `${names[turn]}'s turn`;

    screen(el("div", { class: "screen" }, [
      el("div", { class: "card" }, [
        el("p", { class: "muted center tiny" }, selected == null ? "Tap a dot, then a neighbor" : "Now tap a connected dot"),
        wrap,
      ]),
      el("div", { class: "scorebar" }, names.map((nm, i) => scoreChip(scores[i], nm))),
      el("div", { class: "footer-actions" }, button("Restart board", { variant: "ghost", onClick: reset })),
    ]));
  }

  function onDot(i) {
    if (selected == null) {
      selected = i;
      drawBoard();
      return;
    }
    if (selected === i) {
      selected = null;
      drawBoard();
      return;
    }
    const a = selected, b = i;
    if (!neighbors(a).includes(b)) {
      selected = i;
      drawBoard();
      return;
    }
    const k = edgeKey(a, b);
    if (edges.has(k)) {
      selected = i;
      drawBoard();
      return;
    }

    edges.set(k, turn);
    const edgeSet = new Set(edges.keys());
    const newTris = findNewTriangles(edgeSet, a, b, claimed);
    newTris.forEach((t) => {
      claimed.add(triangleKey(...t));
      scores[turn]++;
    });

    selected = null;
    haptic(newTris.length ? [12, 20, 12] : 8);
    if (newTris.length) celebrate();

    if (edges.size >= totalEdges) return gameOver();

    if (newTris.length === 0) turn = (turn + 1) % n;
    drawBoard();
  }

  function gameOver() {
    const best = Math.max(...scores);
    const wins = scores.map((s, i) => s === best ? i : -1).filter((i) => i >= 0);
    screen(el("div", { class: "screen" }, [
      el("div", { class: "card center" }, [
        el("div", { class: "verdict match" }, "Board complete!"),
        el("p", {}, wins.length > 1 ? "It's a tie!" : `${names[wins[0]]} wins with ${best} triangles!`),
      ]),
      el("div", { class: "scorebar" }, names.map((nm, i) => scoreChip(scores[i], nm))),
      el("div", { class: "footer-actions" }, button("Play again", { big: true, onClick: reset })),
    ]));
  }

  function reset() {
    edges.clear();
    claimed.clear();
    scores.fill(0);
    turn = 0;
    drawBoard();
  }

  reset();
}

export default game;
