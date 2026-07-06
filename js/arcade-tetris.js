// Tetris mini-game for the waiting arcade.

const COLS = 10;
const ROWS = 20;
const PIECES = ["I", "O", "T", "S", "Z", "J", "L"];
const COLORS = {
  I: "#22d3ee",
  O: "#facc15",
  T: "#c084fc",
  S: "#4ade80",
  Z: "#f87171",
  J: "#60a5fa",
  L: "#fb923c",
  G: "ghost",
};

const SHAPE_DEFS = {
  I: [[1, 1, 1, 1]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1]],
  S: [[0, 1, 1], [1, 1, 0]],
  Z: [[1, 1, 0], [0, 1, 1]],
  J: [[1, 0, 0], [1, 1, 1]],
  L: [[0, 0, 1], [1, 1, 1]],
};

function rotateMatrix(matrix) {
  const h = matrix.length;
  const w = matrix[0].length;
  const out = Array.from({ length: w }, () => Array(h).fill(0));
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) out[c][h - 1 - r] = matrix[r][c];
  }
  return out;
}

function buildRotations(def) {
  const rots = [def];
  for (let i = 0; i < 3; i++) rots.push(rotateMatrix(rots[rots.length - 1]));
  return rots;
}

const ROTATIONS = Object.fromEntries(
  Object.entries(SHAPE_DEFS).map(([id, def]) => [id, buildRotations(def)]),
);

const SPAWN_X = { I: 3, O: 4, T: 3, S: 3, Z: 3, J: 3, L: 3 };

let activeSession = null;

export function pauseActiveTetris() {
  activeSession?.cleanup();
  activeSession = null;
}

export function createTetrisGame() {
  return {
    board: Array.from({ length: ROWS }, () => Array(COLS).fill("")),
    piece: null,
    next: "",
    bag: [],
    score: 0,
    lines: 0,
    level: 1,
    status: "ready",
    scoreRecorded: false,
  };
}

export function normalizeTetrisGame(raw) {
  if (!raw || !raw.board) return createTetrisGame();
  if (!Array.isArray(raw.board) || raw.board.length !== ROWS) return createTetrisGame();
  return {
    ...createTetrisGame(),
    ...raw,
    board: raw.board.map((row) => row.slice(0, COLS).concat(Array(Math.max(0, COLS - row.length)).fill(""))),
    bag: Array.isArray(raw.bag) ? raw.bag.filter((p) => PIECES.includes(p)) : [],
    status: ["ready", "running", "paused", "lost"].includes(raw.status) ? raw.status : "ready",
  };
}

function pullFromBag(game) {
  if (!game.bag.length) {
    game.bag = PIECES.slice().sort(() => Math.random() - 0.5);
  }
  return game.bag.pop();
}

function pieceCells(type, rot, px, py) {
  const matrix = ROTATIONS[type][rot];
  const cells = [];
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      if (!matrix[r][c]) continue;
      cells.push({ r: py + r, c: px + c });
    }
  }
  return cells;
}

function canPlace(game, type, px, py, rot) {
  return pieceCells(type, rot, px, py).every(({ r, c }) =>
    c >= 0 && c < COLS && r < ROWS && (r < 0 || !game.board[r][c]),
  );
}

function ghostY(game) {
  if (!game.piece) return 0;
  const p = game.piece;
  let y = p.y;
  while (canPlace(game, p.type, p.x, y + 1, p.rot)) y++;
  return y;
}

function spawnPiece(game) {
  const type = game.next || pullFromBag(game);
  game.next = pullFromBag(game);
  game.piece = { type, rot: 0, x: SPAWN_X[type] ?? 3, y: -1 };
  if (!canPlace(game, type, game.piece.x, game.piece.y, 0)) {
    game.piece = null;
    game.status = "lost";
  }
}

function ensurePieces(game) {
  if (!game.next) game.next = pullFromBag(game);
  if (!game.piece && game.status !== "lost") spawnPiece(game);
}

function lockPiece(game) {
  const p = game.piece;
  if (!p) return;
  for (const { r, c } of pieceCells(p.type, p.rot, p.x, p.y)) {
    if (r >= 0 && r < ROWS && c >= 0 && c < COLS) game.board[r][c] = p.type;
  }
  game.piece = null;
  clearLines(game);
  if (game.status !== "lost") spawnPiece(game);
}

function lineScore(count, level) {
  const table = [0, 100, 300, 500, 800];
  return (table[count] || 800) * level;
}

function clearLines(game) {
  const kept = game.board.filter((row) => row.some((cell) => !cell));
  const cleared = ROWS - kept.length;
  if (!cleared) return;
  while (kept.length < ROWS) kept.unshift(Array(COLS).fill(""));
  game.board = kept;
  game.lines += cleared;
  game.level = 1 + Math.floor(game.lines / 10);
  game.score += lineScore(cleared, game.level);
}

function dropInterval(game) {
  return Math.max(90, 820 - (game.level - 1) * 62);
}

function tryRotate(game, dir) {
  const p = game.piece;
  if (!p) return false;
  const nextRot = (p.rot + dir + 4) % 4;
  for (const dx of [0, -1, 1, -2, 2]) {
    if (canPlace(game, p.type, p.x + dx, p.y, nextRot)) {
      p.x += dx;
      p.rot = nextRot;
      return true;
    }
  }
  return false;
}

function moveHorizontal(game, dx) {
  const p = game.piece;
  if (!p || !canPlace(game, p.type, p.x + dx, p.y, p.rot)) return false;
  p.x += dx;
  return true;
}

function softDrop(game) {
  const p = game.piece;
  if (!p) return false;
  if (canPlace(game, p.type, p.x, p.y + 1, p.rot)) {
    p.y++;
    game.score += 1;
    return true;
  }
  lockPiece(game);
  return true;
}

function hardDrop(game) {
  const p = game.piece;
  if (!p) return false;
  const target = ghostY(game);
  game.score += Math.max(0, target - p.y) * 2;
  p.y = target;
  lockPiece(game);
  return true;
}

function buildDisplayGrid(game) {
  const grid = game.board.map((row) => row.slice());
  const mark = (type, cells, ghost = false) => {
    for (const { r, c } of cells) {
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS) continue;
      if (ghost) {
        if (!grid[r][c]) grid[r][c] = "G";
      } else {
        grid[r][c] = type;
      }
    }
  };
  if (game.piece) {
    const p = game.piece;
    mark("G", pieceCells(p.type, p.rot, p.x, ghostY(game)), true);
    mark(p.type, pieceCells(p.type, p.rot, p.x, p.y));
  }
  return grid;
}

function previewGrid(type) {
  const grid = Array.from({ length: 4 }, () => Array(4).fill(""));
  if (!type) return grid;
  const matrix = ROTATIONS[type][0];
  const offsetR = Math.floor((4 - matrix.length) / 2);
  const offsetC = Math.floor((4 - matrix[0].length) / 2);
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      if (matrix[r][c]) grid[r + offsetR][c + offsetC] = type;
    }
  }
  return grid;
}

export function tetrisView(panel, state, ui) {
  activeSession?.cleanup();
  const game = normalizeTetrisGame(state.tetris);
  state.tetris = game;
  if (game.status === "running") {
    game.status = "paused";
    ui.saveArcadeState(state);
  }

  const highscores = ui.loadArcadeHighscores();
  let timer = null;
  let root = null;
  let boardEl = null;
  let statusEl = null;
  let pauseOverlay = null;
  let endedOverlay = null;
  let linesEl = null;
  let levelEl = null;

  const boardWrap = ui.el("div", { class: "arcade-board-wrap arcade-board-wrap--tetris" });
  boardEl = ui.el("div", { class: "tetris-board", style: `--tet-cols:${COLS};--tet-rows:${ROWS};` });
  boardWrap.append(boardEl);
  const nextGrid = ui.el("div", { class: "tetris-next-grid" });

  const restart = () => ui.rerenderArcade(panel, (next) => {
    next.tetris = createTetrisGame();
    next.tetris.status = "ready";
  });

  const syncStatus = () => {
    if (!statusEl) return;
    statusEl.textContent = statusLabel(game);
    statusEl.className = `arcade-state ${game.status === "lost" ? "lost" : game.status === "running" ? "" : "warn"}`.trim();
  };

  const syncPauseOverlay = () => {
    pauseOverlay?.remove();
    pauseOverlay = null;
    if (game.status === "ready" || game.status === "paused") {
      pauseOverlay = ui.el("div", { class: "tetris-pause-overlay" }, [
        ui.el("div", { class: "tetris-pause-card" }, [
          ui.el("div", { class: "tetris-pause-title" }, game.status === "ready" ? "Ready to play" : "Paused"),
          ui.el("div", { class: "tetris-pause-sub" }, "Your board is saved — pick up right where you left off."),
          ui.el("button", {
            class: "arcade-restart",
            type: "button",
            onClick: (event) => {
              event.stopPropagation();
              startRunning();
            },
          }, game.status === "ready" ? "Play" : "Resume"),
        ]),
      ]);
      boardWrap.append(pauseOverlay);
    }
  };

  const syncEndedOverlay = () => {
    if (game.status !== "lost") {
      endedOverlay?.remove();
      endedOverlay = null;
      return;
    }
    if (endedOverlay?.isConnected) return;
    ui.recordTetrisEnd(game);
    const meta = game.scoreMeta || ui.recordTetrisHighscore(game.score);
    endedOverlay = ui.arcadeGameOverCard({
      tone: "lost",
      title: "Stacked out",
      detail: `${game.lines} line${game.lines === 1 ? "" : "s"} cleared`,
      scoreLabel: "Score",
      score: String(game.score),
      bestLabel: "Best",
      best: String(meta.best),
      isNewRecord: meta.isNew,
      onRestart: restart,
    });
    boardWrap.append(endedOverlay);
    root?.classList.add("ended");
  };

  const paintBoard = () => {
    if (!boardEl) return;
    const grid = buildDisplayGrid(game);
    boardEl.replaceChildren(...grid.flat().map((cell) => {
      const ghost = cell === "G" && game.piece;
      const type = ghost ? game.piece.type : cell;
      return ui.el("div", {
        class: `tetris-cell ${cell ? "filled" : ""} ${ghost ? "ghost" : ""}`.trim(),
        style: type ? `--tet-color:${COLORS[type]}` : "",
      });
    }));
    const preview = previewGrid(game.next);
    nextGrid.replaceChildren(...preview.flat().map((cell) => ui.el("div", {
      class: `tetris-mini-cell ${cell ? "filled" : ""}`.trim(),
      style: cell ? `--tet-color:${COLORS[cell]}` : "",
    })));
    if (linesEl) linesEl.textContent = String(game.lines);
    if (levelEl) levelEl.textContent = String(game.level);
    syncStatus();
    syncPauseOverlay();
    syncEndedOverlay();
  };

  const stopTimer = () => {
    if (timer) window.clearTimeout(timer);
    timer = null;
  };

  const scheduleTick = () => {
    stopTimer();
    if (game.status !== "running") return;
    timer = window.setTimeout(() => {
      if (game.status !== "running") return;
      softDrop(game);
      if (game.status === "lost") {
        ui.saveArcadeState(state);
        paintBoard();
        stopTimer();
        return;
      }
      ui.saveArcadeState(state);
      paintBoard();
      scheduleTick();
    }, dropInterval(game));
  };

  const pause = (auto = false) => {
    if (game.status !== "running") return;
    game.status = "paused";
    stopTimer();
    ui.saveArcadeState(state);
    paintBoard();
    if (!auto) syncStatus();
  };

  const startRunning = () => {
    if (game.status === "lost") return;
    ensurePieces(game);
    if (game.status === "lost") {
      ui.saveArcadeState(state);
      paintBoard();
      return;
    }
    game.status = "running";
    ui.saveArcadeState(state);
    paintBoard();
    scheduleTick();
    root?.focus({ preventScroll: true });
  };

  const togglePause = () => {
    if (game.status === "running") pause(false);
    else if (game.status === "ready" || game.status === "paused") startRunning();
  };

  const act = (fn) => {
    if (game.status !== "running") return;
    fn();
    if (game.status === "lost") ui.recordTetrisEnd(game);
    ui.saveArcadeState(state);
    paintBoard();
    if (game.status === "running") scheduleTick();
  };

  const controlBtn = (label, aria, onClick, extra = "") => ui.el("button", {
    class: `tetris-btn ${extra}`.trim(),
    type: "button",
    "aria-label": aria,
    onClick,
  }, label);

  const sidePanel = ui.el("div", { class: "tetris-side" }, [
    ui.el("div", { class: "tetris-stat-block" }, [
      ui.el("span", { class: "tetris-stat-label" }, "Next"),
      nextGrid,
    ]),
    ui.el("div", { class: "tetris-stat-block" }, [
      ui.el("span", { class: "tetris-stat-label" }, "Lines"),
      (linesEl = ui.el("span", { class: "tetris-stat-value" }, "0")),
    ]),
    ui.el("div", { class: "tetris-stat-block" }, [
      ui.el("span", { class: "tetris-stat-label" }, "Level"),
      (levelEl = ui.el("span", { class: "tetris-stat-value" }, "1")),
    ]),
  ]);

  const controls = ui.el("div", { class: "tetris-controls", "aria-label": "Tetris controls" }, [
    controlBtn("↻", "Rotate", () => act(() => tryRotate(game, 1)), "tetris-btn-rotate"),
    ui.el("div", { class: "tetris-dpad" }, [
      controlBtn("←", "Left", () => act(() => moveHorizontal(game, -1))),
      ui.el("div", { class: "tetris-dpad-stack" }, [
        controlBtn("↑", "Rotate", () => act(() => tryRotate(game, 1)), "tetris-btn-small"),
        controlBtn("↓", "Soft drop", () => act(() => softDrop(game)), "tetris-btn-small"),
      ]),
      controlBtn("→", "Right", () => act(() => moveHorizontal(game, 1))),
    ]),
    controlBtn("⤓", "Hard drop", () => act(() => hardDrop(game)), "tetris-btn-drop"),
  ]);

  statusEl = ui.el("span", { class: "arcade-state" }, statusLabel(game));

  root = ui.el("div", {
    class: `arcade-game tetris-game${game.status === "lost" ? " ended" : ""}`.trim(),
    tabindex: "0",
    "aria-label": "Tetris game",
    onPointerdown: () => root?.focus({ preventScroll: true }),
    onKeydown: (event) => {
      const key = event.key;
      if (key === "p" || key === "P" || key === "Escape") {
        event.preventDefault();
        togglePause();
        return;
      }
      if ((key === "Enter" || key === " ") && (game.status === "ready" || game.status === "paused")) {
        event.preventDefault();
        startRunning();
        return;
      }
      if (game.status !== "running") return;
      const map = {
        ArrowLeft: () => moveHorizontal(game, -1),
        ArrowRight: () => moveHorizontal(game, 1),
        ArrowDown: () => softDrop(game),
        ArrowUp: () => tryRotate(game, 1),
        " ": () => hardDrop(game),
        x: () => tryRotate(game, 1),
        X: () => tryRotate(game, 1),
        z: () => tryRotate(game, -1),
        Z: () => tryRotate(game, -1),
      };
      if (!map[key]) return;
      event.preventDefault();
      act(map[key]);
    },
  }, [
    ui.el("div", { class: "arcade-controls" }, [
      ui.el("div", { class: "arcade-controls-left" }, [
        statusEl,
        ui.arcadeBestBadge("Best", highscores.tetris ? String(highscores.tetris) : null),
      ]),
      game.status === "lost"
        ? ui.el("button", { class: "arcade-restart arcade-restart-inline", type: "button", onClick: restart }, "Play again")
        : ui.el("button", {
          class: `arcade-play${game.status === "running" ? " on" : ""}`.trim(),
          type: "button",
          onClick: togglePause,
        }, game.status === "running" ? "Pause" : "Play"),
    ]),
    ui.el("div", { class: "tetris-layout" }, [
      boardWrap,
      sidePanel,
    ]),
    controls,
  ]);

  ui.bindSwipe(boardEl, (direction) => {
    if (game.status !== "running") return;
    if (direction === "left") act(() => moveHorizontal(game, -1));
    else if (direction === "right") act(() => moveHorizontal(game, 1));
    else if (direction === "down") act(() => softDrop(game));
    else if (direction === "up") act(() => tryRotate(game, 1));
  }, { threshold: 24 });

  const onVisibility = () => {
    if (document.hidden && game.status === "running") pause(true);
  };
  document.addEventListener("visibilitychange", onVisibility);

  activeSession = {
    pause,
    cleanup() {
      stopTimer();
      document.removeEventListener("visibilitychange", onVisibility);
      if (game.status === "running") pause(true);
      activeSession = null;
    },
  };
  panel.__tetrisCleanup = () => activeSession?.cleanup();

  paintBoard();
  queueMicrotask(() => root.focus({ preventScroll: true }));
  return root;
}

function statusLabel(game) {
  if (game.status === "lost") return "Over";
  if (game.status === "paused") return "Paused";
  if (game.status === "ready") return "Ready";
  return String(game.score);
}
