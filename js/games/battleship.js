// "Fleet Strike" — classic Battleship with direct placement, clear shot ownership,
// and host-authoritative online play. Local mode passes one phone between turns.

import { el, render, topbar, button, pill, connectionPill, passDevice, rulesModal, celebrate, haptic } from "../ui.js";

const SIZE = 10;
const COLS = "ABCDEFGHIJ";
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
  color: "linear-gradient(135deg,#2563eb,#06b6d4)",
  blurb: "Place your fleet, then hunt theirs — hit, miss, sink!",
  minPlayers: 2,
  maxPlayers: 2,
  modes: ["local", "online"],
  estMinutes: 15,
  rulesHTML: `
    <p>Hide five ships on your 10×10 ocean, then take turns firing at enemy coordinates.</p>
    <ol>
      <li><b>Deploy</b> — tap a square to position the highlighted ship. Rotate it if needed, then place it.</li>
      <li><b>Attack</b> — tap a square in <b>Your shots</b>. A red × is your hit; a blue dot is your miss.</li>
      <li><b>Defend</b> — <b>Your fleet</b> shows enemy fire separately. Orange ! marks damage to your ships.</li>
      <li>Sink all five enemy ships to win.</li>
    </ol>
    <p class="muted">Two phones keep each fleet private. On one phone, use the hand-off screen before every secret turn.</p>`,
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

function emptyShots() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
}

function coordinate(r, c) {
  return `${COLS[c]}${r + 1}`;
}

function canPlace(board, r, c, size, horiz) {
  for (let i = 0; i < size; i++) {
    const rr = horiz ? r : r + i;
    const cc = horiz ? c + i : c;
    if (rr < 0 || cc < 0 || rr >= SIZE || cc >= SIZE || board[rr][cc]) return false;
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
  return Array.from({ length: size }, (_, i) => ({
    r: horiz ? r : r + i,
    c: horiz ? c + i : c,
  }));
}

function previewValid(board, r, c, size, horiz) {
  return canPlace(board, r, c, size, horiz);
}

function shotDescription(mode, shot) {
  if (shot === "pending") return "shot pending";
  if (shot === "sunk") return mode === "target" ? "enemy ship sunk" : "your ship sunk";
  if (shot === "hit") return mode === "target" ? "your shot hit" : "enemy shot hit your ship";
  if (shot === "miss") return mode === "target" ? "your shot missed" : "enemy shot missed";
  return mode === "target" ? "not fired on" : "no incoming shot";
}

function markerFor(mode, shot) {
  if (shot === "pending") return "…";
  if (shot === "miss") return "•";
  if (shot === "hit") return mode === "target" ? "×" : "!";
  if (shot === "sunk") return "×";
  return "";
}

function boardGrid(opts) {
  const mode = opts.mode || "own";
  const g = el("div", { class: `bs-grid bs-${mode}`, role: "grid" });
  g.append(el("span", { class: "bs-corner", "aria-hidden": "true" }));
  for (const col of COLS) g.append(el("span", { class: "bs-coord", "aria-hidden": "true" }, col));

  for (let r = 0; r < SIZE; r++) {
    g.append(el("span", { class: "bs-coord", "aria-hidden": "true" }, String(r + 1)));
    for (let c = 0; c < SIZE; c++) {
      const classes = ["bs-cell"];
      const val = opts.board?.[r]?.[c] ?? 0;
      const shot = opts.shots?.[r]?.[c] || null;
      const prev = opts.preview?.some((p) => p.r === r && p.c === c);

      if ((mode === "own" || mode === "placement") && val) classes.push("ship");
      if (shot) classes.push(shot);
      if (prev) classes.push(opts.previewOk ? "preview" : "preview-bad");
      if (mode === "target" && !shot) classes.push("unknown");

      const state = mode === "placement"
        ? (prev ? (opts.previewOk ? "ship placement preview" : "invalid ship placement") : val ? "placed ship" : "empty water")
        : shot ? shotDescription(mode, shot) : (val && mode !== "target" ? "your ship" : shotDescription(mode, null));
      const disabled = !!opts.disabled || mode === "own" || (mode === "target" && !!shot);
      g.append(el("button", {
        class: classes.join(" "),
        type: "button",
        role: "gridcell",
        "data-coordinate": coordinate(r, c),
        "aria-label": `${coordinate(r, c)} — ${state}`,
        disabled,
        onClick: opts.onCell ? () => opts.onCell(r, c) : undefined,
      }, markerFor(mode, shot)));
    }
  }
  return g;
}

function fleetPanel(title, fleet, sunkNames = []) {
  const sunk = new Set(sunkNames);
  const tracksPlacement = Array.isArray(fleet) && fleet.length < SHIPS.length;
  const rows = SHIPS.map((def) => {
    const live = fleet?.find((ship) => ship.id === def.id);
    const hitCount = live?.hits || 0;
    const isSunk = live ? hitCount >= def.size : sunk.has(def.name);
    const pips = Array.from({ length: def.size }, (_, i) =>
      el("i", { class: `${isSunk || i < hitCount ? "lost" : tracksPlacement && !live ? "unplaced" : ""}`.trim() }));
    return el("div", { class: `bs-fleet-row ${isSunk ? "is-sunk" : ""} ${tracksPlacement && live ? "is-placed" : ""}`.trim() }, [
      el("span", {}, def.name + (tracksPlacement && live ? " ✓" : "")),
      el("span", { class: "bs-fleet-pips", "aria-label": tracksPlacement && !live ? "not placed" : isSunk ? "sunk" : `${def.size - hitCount} sections remaining` }, pips),
    ]);
  });
  return el("div", { class: "bs-fleet" }, [el("div", { class: "bs-fleet-title" }, title), ...rows]);
}

function placementScreen(ctx, statusEl, onDone) {
  let horiz = true;
  let shipIdx = 0;
  let cursorR = 0;
  let cursorC = 0;
  let board = emptyBoard();
  let fleet = [];

  function rotate() {
    horiz = !horiz;
    const ship = SHIPS[shipIdx];
    if (ship) {
      cursorR = Math.min(cursorR, horiz ? SIZE - 1 : SIZE - ship.size);
      cursorC = Math.min(cursorC, horiz ? SIZE - ship.size : SIZE - 1);
    }
    draw();
  }

  function undo() {
    const removed = fleet.pop();
    if (!removed) return;
    removed.cells.forEach(({ r, c }) => { board[r][c] = 0; });
    shipIdx = fleet.length;
    cursorR = removed.cells[0].r;
    cursorC = removed.cells[0].c;
    horiz = removed.cells.length < 2 || removed.cells[0].r === removed.cells[1].r;
    draw();
  }

  function randomize() {
    const rolled = randomFleet();
    board = rolled.board;
    fleet = rolled.fleet;
    shipIdx = SHIPS.length;
    haptic(12);
    draw();
  }

  function draw() {
    const ship = SHIPS[shipIdx];
    const preview = ship ? previewCells(cursorR, cursorC, ship.size, horiz) : [];
    const ok = !!ship && previewValid(board, cursorR, cursorC, ship.size, horiz);
    const placedNames = fleet.map((item) => item.name);

    const boardCard = el("div", { class: "bs-board-card placement-card" }, [
      el("div", { class: "bs-board-heading" }, [
        el("div", {}, [
          el("div", { class: "bs-label" }, ship ? `Deploy ${ship.name}` : "Fleet ready"),
          el("div", { class: "bs-sub" }, ship
            ? `${ship.size} squares · ${horiz ? "horizontal" : "vertical"} · tap the ocean to move`
            : "Review your hidden fleet before battle"),
        ]),
        ship ? el("span", { class: `bs-validity ${ok ? "ok" : "bad"}` }, ok ? "Fits" : "Blocked") : null,
      ]),
      boardGrid({
        mode: "placement",
        board,
        preview,
        previewOk: ok,
        onCell: (r, c) => { cursorR = r; cursorC = c; draw(); },
      }),
    ]);

    const controls = ship
      ? el("div", { class: "stack bs-placement-controls" }, [
          el("div", { class: "btn-row" }, [
            button(horiz ? "Rotate vertical ↕" : "Rotate horizontal ↔", { variant: "secondary", onClick: rotate }),
            button("Random fleet", { variant: "secondary", onClick: randomize }),
          ]),
          button(`Place ${ship.name}`, { big: true, disabled: !ok, onClick: () => {
            const cells = placeShip(board, cursorR, cursorC, ship.id, ship.size, horiz);
            fleet.push({ ...ship, cells, hits: 0 });
            shipIdx++;
            cursorR = 0;
            cursorC = 0;
            haptic(10);
            draw();
          } }),
          fleet.length ? button("Undo last ship", { variant: "ghost", onClick: undo }) : null,
        ])
      : el("div", { class: "stack bs-placement-controls" }, [
          el("div", { class: "btn-row" }, [
            button("Shuffle fleet", { variant: "secondary", onClick: randomize }),
            button("Undo last ship", { variant: "secondary", onClick: undo }),
          ]),
          button("Use this fleet →", { big: true, onClick: () => onDone(board, fleet) }),
        ]);

    render(el("div", { class: "screen" }, [
      header(ctx, statusEl),
      el("div", { class: "bs-phase" }, [
        el("span", {}, `Deployment ${Math.min(shipIdx + 1, SHIPS.length)}/${SHIPS.length}`),
        el("b", {}, ship ? "Choose a position" : "Ready"),
      ]),
      boardCard,
      fleetPanel("Your fleet", fleet, placedNames),
      controls,
    ]));
  }

  draw();
}

function battleLegend() {
  return el("div", { class: "bs-legend", "aria-label": "Shot marker legend" }, [
    el("div", {}, [el("i", { class: "out-hit" }, "×"), el("span", {}, "Your hit")]),
    el("div", {}, [el("i", { class: "out-miss" }, "•"), el("span", {}, "Your miss")]),
    el("div", {}, [el("i", { class: "in-hit" }, "!"), el("span", {}, "Enemy hit")]),
    el("div", {}, [el("i", { class: "in-miss" }, "•"), el("span", {}, "Enemy miss")]),
  ]);
}

function actionNotice(action) {
  if (!action) return null;
  const who = action.actor === "you" ? "Your shot" : "Enemy shot";
  const result = action.sunk
    ? `${action.hit ? "hit" : "miss"} · ${action.sunk} sunk`
    : action.hit ? "hit" : "miss";
  return el("div", { class: `bs-action ${action.actor === "you" ? "outgoing" : "incoming"}` }, [
    el("span", {}, who),
    el("b", {}, action.coordinate),
    el("strong", {}, result),
  ]);
}

function battleView(ctx, statusEl, {
  myBoard, myFleet, myShots, enemyShots, myTurn, enemyName, onFire,
  enemySunk = [], lastAction = null, footer = null, banner = null,
}) {
  const turnText = banner || (myTurn ? "Your turn — choose a target" : `${enemyName} is choosing a shot`);
  render(el("div", { class: "screen" }, [
    header(ctx, statusEl),
    el("div", { class: `bs-turn ${myTurn ? "active" : "waiting-turn"}` }, [
      el("span", { class: "bs-turn-dot", "aria-hidden": "true" }),
      el("div", {}, [el("b", {}, turnText), el("span", {}, myTurn ? "Tap an untouched square in enemy waters." : "Your target grid is locked until they fire.")]),
    ]),
    actionNotice(lastAction),
    el("div", { class: "bs-boards" }, [
      el("section", { class: "bs-board-card target-card", "aria-label": "Your shots at the enemy" }, [
        el("div", { class: "bs-board-heading" }, [
          el("div", {}, [el("div", { class: "bs-label" }, "Your shots"), el("div", { class: "bs-sub" }, `Targeting ${enemyName}'s hidden fleet`)]),
          el("span", { class: "bs-board-badge target" }, "ATTACK"),
        ]),
        boardGrid({ mode: "target", shots: myShots, disabled: !myTurn, onCell: myTurn ? onFire : null }),
        fleetPanel("Enemy fleet", null, enemySunk),
      ]),
      el("section", { class: "bs-board-card own-card", "aria-label": "Your fleet and incoming enemy shots" }, [
        el("div", { class: "bs-board-heading" }, [
          el("div", {}, [el("div", { class: "bs-label" }, "Your fleet"), el("div", { class: "bs-sub" }, `Incoming fire from ${enemyName}`)]),
          el("span", { class: "bs-board-badge own" }, "DEFEND"),
        ]),
        boardGrid({ mode: "own", board: myBoard, shots: enemyShots }),
        fleetPanel("Fleet health", myFleet),
      ]),
    ]),
    battleLegend(),
    footer,
  ]));
}

function applyShot(fleet, board, r, c) {
  const id = board[r][c];
  if (!id) return { hit: false, sunk: null };
  const ship = fleet.find((item) => item.id === id);
  ship.hits++;
  return { hit: true, sunk: ship.hits >= ship.size ? ship : null };
}

function fleetDefeated(fleet) {
  return fleet.every((ship) => ship.hits >= ship.size);
}

function outcomeFooter(message, buttonLabel, onClick, win = false) {
  return el("div", { class: `bs-outcome ${win ? "win" : ""}`.trim() }, [
    el("b", {}, message),
    button(buttonLabel, { big: true, onClick }),
  ]);
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
  const myShots = emptyShots();
  const enemyShots = emptyShots();
  const enemySunk = new Set();
  let turn = 0;
  const ready = [false, false];
  let gameOver = false;
  let lastAction = null;

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

  function refreshBattle(footer = null, banner = null) {
    battleView(ctx, status.node, {
      myBoard, myFleet, myShots, enemyShots,
      myTurn: !gameOver && turn === me,
      enemyName: session.partnerName,
      onFire: (r, c) => {
        if (gameOver || turn !== me || myShots[r][c]) return;
        myShots[r][c] = "pending";
        session.send("bs_shot", { r, c });
        refreshBattle(null, `Shot ${coordinate(r, c)} sent…`);
      },
      enemySunk: [...enemySunk],
      lastAction,
      footer,
      banner,
    });
  }

  session.on("bs_ready", () => {
    ready[1 - me] = true;
    if (isHost && ready[0] && ready[1]) {
      session.send("bs_start");
      startBattle();
    } else if (!isHost && ready[me]) {
      waiting(`Waiting for ${session.partnerName} to deploy…`);
    }
  });

  session.on("bs_start", startBattle);

  session.on("bs_shot", (m) => {
    const { r, c } = m;
    if (gameOver || !Number.isInteger(r) || !Number.isInteger(c) || r < 0 || c < 0 || r >= SIZE || c >= SIZE || enemyShots[r][c]) return;
    const result = applyShot(myFleet, myBoard, r, c);
    enemyShots[r][c] = result.hit ? "hit" : "miss";
    let sunk = null;
    let sunkCells = [];
    if (result.sunk) {
      sunk = result.sunk.name;
      sunkCells = result.sunk.cells;
      sunkCells.forEach(({ r: rr, c: cc }) => { enemyShots[rr][cc] = "sunk"; });
    }
    const won = fleetDefeated(myFleet);
    lastAction = { actor: "enemy", coordinate: coordinate(r, c), hit: result.hit, sunk };
    session.send("bs_result", { r, c, hit: result.hit, sunk, sunkCells, won, nextTurn: me });
    if (won) {
      gameOver = true;
      refreshBattle(outcomeFooter(`${session.partnerName} sank your fleet.`, "Back to games", ctx.exit), `${session.partnerName} wins`);
    } else {
      turn = me;
      refreshBattle();
    }
  });

  session.on("bs_result", (m) => {
    const { r, c, hit, sunk, sunkCells = [], won, nextTurn } = m;
    if (myShots[r]?.[c] !== "pending") return;
    myShots[r][c] = hit ? "hit" : "miss";
    if (sunk) {
      enemySunk.add(sunk);
      sunkCells.forEach(({ r: rr, c: cc }) => { myShots[rr][cc] = "sunk"; });
    }
    lastAction = { actor: "you", coordinate: coordinate(r, c), hit, sunk };
    if (won) {
      gameOver = true;
      celebrate();
      refreshBattle(outcomeFooter("Enemy fleet destroyed.", "Back to games", ctx.exit, true), "You win!");
      return;
    }
    turn = nextTurn;
    refreshBattle();
  });

  placementScreen(ctx, status.node, (board, fleet) => {
    myBoard = board;
    myFleet = fleet;
    ready[me] = true;
    session.send("bs_ready");
    if (isHost && ready[0] && ready[1]) {
      session.send("bs_start");
      startBattle();
    } else {
      waiting(`Waiting for ${session.partnerName} to deploy…`);
    }
  });
}

/* ---------------- LOCAL ---------------- */
async function localGame(ctx) {
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
  const shots = [emptyShots(), emptyShots()]; // shots[i] are only the shots player i fired
  let gameOver = false;

  async function round() {
    if (gameOver) return;
    const shooter = turn;
    const defender = 1 - turn;
    await passDevice(ctx.players[shooter], `Fire at ${ctx.players[defender]}'s fleet`);

    battleView(ctx, statusEl, {
      myBoard: boards[shooter],
      myFleet: fleets[shooter],
      myShots: shots[shooter],
      enemyShots: shots[defender],
      myTurn: true,
      enemyName: ctx.players[defender],
      enemySunk: fleets[defender].filter((ship) => ship.hits >= ship.size).map((ship) => ship.name),
      onFire: (r, c) => {
        if (shots[shooter][r][c]) return;
        const result = applyShot(fleets[defender], boards[defender], r, c);
        shots[shooter][r][c] = result.hit ? "hit" : "miss";
        if (result.sunk) {
          result.sunk.cells.forEach(({ r: rr, c: cc }) => { shots[shooter][rr][cc] = "sunk"; });
        }
        haptic(result.hit ? [12, 25, 12] : 10);
        const won = fleetDefeated(fleets[defender]);
        gameOver = won;
        if (won) celebrate();

        const lastAction = {
          actor: "you",
          coordinate: coordinate(r, c),
          hit: result.hit,
          sunk: result.sunk?.name || null,
        };
        const message = won
          ? `${ctx.players[shooter]} sank the final ship!`
          : result.sunk
            ? `${result.sunk.name} sunk!`
            : result.hit ? "Direct hit!" : "Miss — the turn passes.";
        const nextLabel = won ? "Back to games" : `Pass to ${ctx.players[defender]} →`;

        battleView(ctx, statusEl, {
          myBoard: boards[shooter],
          myFleet: fleets[shooter],
          myShots: shots[shooter],
          enemyShots: shots[defender],
          myTurn: false,
          enemyName: ctx.players[defender],
          enemySunk: fleets[defender].filter((ship) => ship.hits >= ship.size).map((ship) => ship.name),
          lastAction,
          banner: won ? `${ctx.players[shooter]} wins!` : "Shot resolved",
          footer: outcomeFooter(message, nextLabel, () => {
            if (won) ctx.exit();
            else { turn = defender; round(); }
          }, won),
        });
      },
    });
  }

  round();
}

export default game;
