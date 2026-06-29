// "Fleet Strike" — classic Battleship. Place your ships, then take turns firing.
// Online = two phones, hidden boards. Local = pass the phone between turns.

import { el, render, topbar, button, pill, connectionPill, passDevice, rulesModal } from "../ui.js";

const SIZE = 10;
const SHIPS = [
  { id: 1, size: 5, name: "Carrier" },
  { id: 2, size: 4, name: "Battleship" },
  { id: 3, size: 3, name: "Cruiser" },
  { id: 4, size: 3, name: "Submarine" },
  { id: 5, size: 2, name: "Patrol" },
];

const game = {
  id: "battleship",
  title: "Fleet Strike",
  emoji: "⚓",
  blurb: "Place your fleet, then hunt theirs — hit, miss, sink!",
  minPlayers: 2,
  maxPlayers: 2,
  modes: ["local", "online"],
  estMinutes: 15,
  rulesHTML: `
    <p>Classic naval combat for two. Each player hides five ships on a 10×10 grid,
    then you take turns calling coordinates.</p>
    <ol>
      <li><b>Deploy</b> — move your ship with the arrow buttons, ↻ to rotate, then tap <b>Place ship</b>.</li>
      <li><b>Battle</b> — tap the enemy grid to fire. 💥 = hit, 💦 = miss.</li>
      <li>Sink every enemy ship to win!</li>
    </ol>
    <p class="muted">Two phones: your board stays secret on your device.
    One phone: pass it between turns so they never see your fleet.</p>`,
  mount(ctx) {
    if (ctx.mode === "online") onlineGame(ctx);
    else localGame(ctx);
  },
};

function header(ctx, statusEl) {
  return topbar({
    onBack: ctx.exit,
    right: el("div", { style: "display:flex; gap:8px; align-items:center" }, [
      statusEl || null,
      el("button", { class: "iconbtn", "aria-label": "Rules", onClick: () => rulesModal(game) }, "?"),
    ]),
  });
}

function emptyBoard() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}


function canPlace(board, r, c, size, horiz) {
  for (let i = 0; i < size; i++) {
    const rr = horiz ? r : r + i;
    const cc = horiz ? c + i : c;
    if (rr < 0 || cc < 0 || rr >= SIZE || cc >= SIZE) return false;
    if (board[rr][cc]) return false;
  }
  return true;
}

function placeShip(board, r, c, shipId, size, horiz) {
  const cells = [];
  for (let i = 0; i < size; i++) {
    const rr = horiz ? r : r + i;
    const cc = horiz ? c + i : c;
    board[rr][cc] = shipId;
    cells.push({ r: rr, c: cc });
  }
  return cells;
}

function randomFleet() {
  const board = emptyBoard();
  const fleet = [];
  for (const ship of SHIPS) {
    let placed = false;
    for (let tries = 0; tries < 400 && !placed; tries++) {
      const horiz = Math.random() < 0.5;
      const r = Math.floor(Math.random() * SIZE);
      const c = Math.floor(Math.random() * SIZE);
      if (canPlace(board, r, c, ship.size, horiz)) {
        const cells = placeShip(board, r, c, ship.id, ship.size, horiz);
        fleet.push({ ...ship, cells, hits: 0 });
        placed = true;
      }
    }
    if (!placed) return randomFleet();
  }
  return { board, fleet };
}

function previewCells(r, c, size, horiz) {
  const cells = [];
  for (let i = 0; i < size; i++) {
    cells.push({ r: horiz ? r : r + i, c: horiz ? c + i : c });
  }
  return cells;
}

function previewValid(board, r, c, size, horiz) {
  return previewCells(r, c, size, horiz).every(({ r: rr, c: cc }) =>
    rr >= 0 && cc >= 0 && rr < SIZE && cc < SIZE && !board[rr][cc],
  ) && previewCells(r, c, size, horiz).length === size;
}

function boardGrid(opts) {
  const g = el("div", { class: "bs-grid" });
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const classes = ["bs-cell"];
      const val = opts.board?.[r]?.[c] ?? 0;
      const shot = opts.shots?.[r]?.[c];
      const prev = opts.preview?.find((p) => p.r === r && p.c === c);
      if (opts.mode === "own") {
        if (val) classes.push("ship");
        if (shot === "hit") classes.push("hit");
        if (shot === "miss") classes.push("miss");
        if (prev) classes.push(opts.previewOk ? "preview" : "preview-bad");
      } else {
        if (shot === "hit") classes.push("hit");
        else if (shot === "miss") classes.push("miss");
        else if (shot === "sunk") classes.push("sunk");
        else classes.push("unknown");
      }
      const disabled = opts.disabled || (opts.mode === "target" && shot);
      g.append(el("button", {
        class: classes.join(" "),
        "aria-label": `row ${r + 1} col ${c + 1}`,
        disabled: !!disabled,
        onClick: opts.onCell ? () => opts.onCell(r, c) : undefined,
      }, shot === "hit" ? "💥" : shot === "miss" ? "💦" : shot === "sunk" ? "🔥" : ""));
    }
  }
  return g;
}

function placementScreen(ctx, statusEl, onDone) {
  let horiz = true;
  let shipIdx = 0;
  let cursorR = 0;
  let cursorC = 0;
  const board = emptyBoard();
  const fleet = [];

  function move(dr, dc) {
    cursorR = Math.max(0, Math.min(SIZE - 1, cursorR + dr));
    cursorC = Math.max(0, Math.min(SIZE - 1, cursorC + dc));
    draw();
  }

  function draw(subtitle) {
    const ship = SHIPS[shipIdx];
    const preview = ship ? previewCells(cursorR, cursorC, ship.size, horiz) : [];
    const ok = ship && previewValid(board, cursorR, cursorC, ship.size, horiz);

    const arrows = el("div", { class: "bs-arrows" }, [
      el("div", { class: "bs-arrows-mid" }, [
        el("button", { class: "btn round-btn secondary", type: "button", onClick: () => move(-1, 0) }, "↑"),
        el("div", { class: "bs-arrows-row" }, [
          el("button", { class: "btn round-btn secondary", type: "button", onClick: () => move(0, -1) }, "←"),
          el("button", { class: "btn round-btn secondary", type: "button", onClick: () => move(0, 1) }, "→"),
        ]),
        el("button", { class: "btn round-btn secondary", type: "button", onClick: () => move(1, 0) }, "↓"),
      ]),
    ]);

    const body = el("div", { class: "card" }, [
      el("div", { class: "pill" }, subtitle || "Deploy your fleet"),
      ship
        ? el("p", { class: "center muted" }, `Place ${ship.name} (${ship.size}) — ${horiz ? "horizontal ↔" : "vertical ↕"}`)
        : el("p", { class: "center verdict match" }, "Fleet ready!"),
      boardGrid({
        mode: "own",
        board,
        preview,
        previewOk: ok,
      }),
      ship ? el("div", { class: "stack", style: "margin-top:12px" }, [
        arrows,
        el("div", { class: "btn-row" }, [
          button("↻ Rotate", { variant: "secondary", onClick: () => { horiz = !horiz; draw(subtitle); } }),
          button("🎲 Random", { variant: "secondary", onClick: () => {
            const rolled = randomFleet();
            onDone(rolled.board, rolled.fleet);
          } }),
        ]),
        button("Place ship ✓", { big: true, disabled: !ok, onClick: () => {
          const cells = placeShip(board, cursorR, cursorC, ship.id, ship.size, horiz);
          fleet.push({ ...ship, cells, hits: 0 });
          shipIdx++;
          cursorR = 0;
          cursorC = 0;
          draw(subtitle);
        } }),
      ]) : el("div", { class: "footer-actions" }, button("Ready for battle →", { big: true, onClick: () => onDone(board, fleet) })),
    ]);
    render(el("div", { class: "screen" }, [header(ctx, statusEl), body]));
  }

  draw();
}

function battleView(ctx, statusEl, {
  myBoard, myFleet, myShots, enemyShots, myTurn, enemyName, onFire, footer,
}) {
  render(el("div", { class: "screen" }, [
    header(ctx, statusEl),
    el("div", { class: "pill center", style: "margin-bottom:10px" },
      myTurn ? "Your turn — fire!" : `Waiting for ${enemyName}…`),
    el("div", { class: "bs-boards" }, [
      el("div", {}, [
        el("div", { class: "bs-label" }, "Enemy waters"),
        boardGrid({ mode: "target", shots: myShots, disabled: !myTurn, onCell: myTurn ? onFire : null }),
      ]),
      el("div", {}, [
        el("div", { class: "bs-label" }, "Your fleet"),
        boardGrid({ mode: "own", board: myBoard, shots: enemyShots }),
      ]),
    ]),
    footer || null,
  ]));
}

function applyShot(fleet, board, r, c) {
  const id = board[r][c];
  if (!id) return { hit: false, sunk: null };
  const ship = fleet.find((s) => s.id === id);
  ship.hits++;
  const sunk = ship.hits >= ship.size ? ship : null;
  return { hit: true, sunk };
}


/* ---------------- ONLINE ---------------- */
function onlineGame(ctx) {
  const { session } = ctx;
  const isHost = session.isHost;
  const me = isHost ? 0 : 1;
  const status = connectionPill();
  session.onStatus(status.set);

  let myBoard = null;
  let myFleet = null;
  let myShots = emptyBoard().map((r) => r.map(() => null));
  let enemyShots = emptyBoard().map((r) => r.map(() => null));
  let turn = 0;
  let ready = [false, false];
  let gameOver = false;

  function waiting(msg) {
    render(el("div", { class: "screen" }, [
      header(ctx, status.node),
      el("div", { class: "card center waiting" }, [el("div", { class: "spinner" }), msg]),
    ]));
  }

  function startBattle() {
    turn = 0;
    refreshBattle();
  }

  function refreshBattle(footer) {
    battleView(ctx, status.node, {
      myBoard, myFleet, myShots, enemyShots,
      myTurn: !gameOver && turn === me,
      enemyName: session.partnerName,
      onFire: (r, c) => {
        if (turn !== me || myShots[r][c]) return;
        session.send("bs_shot", { r, c });
        myShots[r][c] = "pending";
        waiting("Shot fired…");
      },
      footer,
    });
  }

  function checkWin(fleet) {
    return fleet.every((s) => s.hits >= s.size);
  }

  session.on("bs_ready", () => {
    ready[isHost ? 1 : 0] = true;
    if (isHost && ready[0] && ready[1]) {
      session.send("bs_start", {});
      startBattle();
    } else if (!isHost) {
      waiting(`Waiting for ${session.partnerName}…`);
    }
  });

  session.on("bs_start", () => startBattle());

  session.on("bs_shot", (m) => {
    const { r, c } = m;
    const result = applyShot(myFleet, myBoard, r, c);
    enemyShots[r][c] = result.hit ? "hit" : "miss";
    let sunk = null;
    if (result.sunk) {
      result.sunk.cells.forEach(({ r: rr, c: cc }) => { enemyShots[rr][cc] = "sunk"; });
      sunk = result.sunk.name;
    }
    const won = checkWin(myFleet);
    const myIdx = isHost ? 0 : 1;
    session.send("bs_result", { r, c, hit: result.hit, sunk, won, nextTurn: myIdx });
    if (won) {
      gameOver = true;
      render(el("div", { class: "screen" }, [
        header(ctx, status.node),
        el("div", { class: "card center" }, [
          el("div", { class: "verdict nomatch", style: "font-size:2rem" }, "Your fleet is sunk…"),
          el("p", { class: "muted" }, `${session.partnerName} wins!`),
        ]),
        el("div", { class: "footer-actions" }, button("Back to menu", { big: true, onClick: ctx.exit })),
      ]));
    } else {
      turn = myIdx;
      refreshBattle();
    }
  });

  session.on("bs_result", (m) => {
    const { r, c, hit, sunk, won, nextTurn } = m;
    if (myShots[r][c] === "pending") {
      myShots[r][c] = hit ? (sunk ? "sunk" : "hit") : "miss";
    }
    if (won) {
      gameOver = true;
      render(el("div", { class: "screen" }, [
        header(ctx, status.node),
        el("div", { class: "card center" }, [
          el("div", { class: "verdict match", style: "font-size:2rem" }, "🏆 You win!"),
          el("p", { class: "muted" }, hit ? (sunk ? `Sunk their ${sunk}!` : "Direct hit!") : "…"),
        ]),
        el("div", { class: "footer-actions" }, button("Back to menu", { big: true, onClick: ctx.exit })),
      ]));
      return;
    }
    turn = nextTurn;
    refreshBattle();
  });

  placementScreen(ctx, status.node, (board, fleet) => {
    myBoard = board;
    myFleet = fleet;
    ready[me] = true;
    session.send("bs_ready", {});
    if (isHost && ready[0] && ready[1]) {
      session.send("bs_start", {});
      startBattle();
    } else {
      waiting(`Waiting for ${session.partnerName} to deploy…`);
    }
  });
}

/* ---------------- LOCAL ---------------- */
async function localGame(ctx) {
  const [p1, p2] = ctx.players;
  const statusEl = pill("Pass & play");

  const fleets = [];
  const boards = [];

  for (let i = 0; i < 2; i++) {
    await passDevice(ctx.players[i], "Deploy your fleet in secret");
    const placed = await new Promise((resolve) => {
      placementScreen(ctx, statusEl, (board, fleet) => resolve({ board, fleet }));
    });
    boards[i] = placed.board;
    fleets[i] = placed.fleet;
  }

  let turn = 0;
  const shots = [emptyBoard().map((r) => r.map(() => null)), emptyBoard().map((r) => r.map(() => null))];
  let gameOver = false;

  async function round() {
    if (gameOver) return;
    const shooter = turn;
    const defender = 1 - turn;
    await passDevice(ctx.players[shooter], `Fire at ${ctx.players[defender]}'s fleet`);
    await new Promise((resolve) => {
      battleView(ctx, statusEl, {
        myBoard: boards[shooter],
        myFleet: fleets[shooter],
        myShots: shots[shooter],
        enemyShots: shots[defender],
        myTurn: true,
        enemyName: ctx.players[defender],
        onFire: (r, c) => {
          if (shots[shooter][r][c]) return;
          const result = applyShot(fleets[defender], boards[defender], r, c);
          shots[shooter][r][c] = result.hit ? "hit" : "miss";
          shots[defender][r][c] = result.hit ? "hit" : "miss";
          if (result.sunk) {
            result.sunk.cells.forEach(({ r: rr, c: cc }) => {
              shots[shooter][rr][cc] = "sunk";
              shots[defender][rr][cc] = "sunk";
            });
          }
          const won = fleets[defender].every((s) => s.hits >= s.size);
          gameOver = won;
          render(el("div", { class: "screen" }, [
            header(ctx, statusEl),
            el("div", { class: "card center" }, [
              el("div", { class: "verdict match", style: "font-size:2rem" }, result.hit ? "💥 Hit!" : "💦 Miss"),
              result.sunk ? el("p", {}, `🔥 Sunk the ${result.sunk.name}!`) : null,
              won ? el("p", { class: "verdict match" }, `${ctx.players[shooter]} wins! ⚓`) : null,
            ]),
            el("div", { class: "footer-actions" }, button(won ? "Back to menu" : "Next turn →", {
              big: true,
              onClick: () => {
                if (won) ctx.exit();
                else { turn = 1 - turn; round(); }
              },
            })),
          ]));
          resolve();
        },
      });
    });
  }

  round();
}

export default game;
