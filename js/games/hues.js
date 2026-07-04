// "Color Clue" — inspired by Hues and Cues.
// One player sees a secret colour and gives a 1–2 word clue; the other taps the
// colour on a spectrum. Score by how close. Roles swap. Co-op team score.
// Works on two phones (secret colour stays on the cluer's phone) or one (pass it).

import { el, render, button, pill, connectionPill, passDevice, gameHeader, scoreChip, celebrate, onlineReadyGate, localReadyGate } from "../ui.js";

const COLS = 12;
const ROWS = 8;
const cellColor = (r, c) => `hsl(${Math.round((c / COLS) * 360)}, 72%, ${Math.round(86 - r * (60 / (ROWS - 1)))}%)`;
const randCell = () => ({ r: Math.floor(Math.random() * ROWS), c: Math.floor(Math.random() * COLS) });
function distance(a, b) {
  const dc = Math.min(Math.abs(a.c - b.c), COLS - Math.abs(a.c - b.c)); // hue wraps around
  return dc + Math.abs(a.r - b.r);
}
const pointsFor = (d) => Math.max(0, 5 - d); // bullseye 5 → 0 at distance ≥5

const game = {
  id: "hues",
  title: "Color Clue",
  emoji: "🎨",
  color: "linear-gradient(135deg,#ff6b9d,#ffa84b 55%,#4bd1ff)",
  blurb: "Clue a secret colour in 1–2 words — can the room find it?",
  minPlayers: 2,
  maxPlayers: 8,
  modes: ["local", "online"],
  estMinutes: 10,
  rulesHTML: `
    <p>Each round one player is the <b>Clue-giver</b>; everyone else guesses. The role
    rotates each round.</p>
    <ol>
      <li>The Clue-giver secretly sees a colour 🎯.</li>
      <li>They give a <b>one or two word</b> clue (e.g. "ocean", "ripe banana").</li>
      <li>Every other player taps the colour they think it is on the spectrum.</li>
      <li>The closer each guess, the more points — a bullseye is <b>5</b>! 🎯</li>
    </ol>
    <p>It's <b>co-op</b>: every guess adds to one shared team score. Rotate the clue-giver
    each round and see how high the whole room can climb.</p>
    <p class="muted">No naming the colour itself — that's cheating! 😄</p>`,
  mount(ctx) {
    if (ctx.mode === "online") onlineGame(ctx);
    else localGame(ctx);
  },
};

const header = (ctx, statusEl) => gameHeader(ctx, game, statusEl);

// Build the colour spectrum. opts: { onPick, pick, target, guess, preview, disabled }
// Returns the wrap element; the inner grid is reused so highlights can be moved
// in place (see markGrid) instead of rebuilding the whole grid on every tap.
function grid(opts = {}) {
  const g = el("div", { class: "hue-grid", style: `grid-template-columns: repeat(${COLS}, 1fr)` });
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const classes = ["hue-cell"];
      if (opts.pick && opts.pick.r === r && opts.pick.c === c) classes.push("pick");
      if (opts.target && opts.target.r === r && opts.target.c === c) classes.push("target");
      if (opts.guess && opts.guess.r === r && opts.guess.c === c) classes.push("guess");
      // Multiple guessers (online, 3+ players): mark every locked-in guess cell.
      if (opts.guesses && opts.guesses.some((g) => g && g.r === r && g.c === c)) classes.push("guess");
      if (opts.preview && opts.preview.r === r && opts.preview.c === c) classes.push("preview");
      const cell = el("button", {
        class: classes.join(" "),
        style: `background:${cellColor(r, c)}`,
        "data-r": String(r),
        "data-c": String(c),
        "aria-label": `row ${r + 1} column ${c + 1}`,
        disabled: !!opts.disabled,
        onClick: opts.onPick ? () => opts.onPick({ r, c }) : undefined,
      });
      g.append(cell);
    }
  }
  return el("div", { class: "hue-wrap" }, g);
}

// Move a single highlight class to one cell (or clear it) without re-rendering.
function markGrid(wrap, cls, cell) {
  if (!wrap) return;
  wrap.querySelectorAll(`.hue-cell.${cls}`).forEach((node) => node.classList.remove(cls));
  if (cell) {
    const next = wrap.querySelector(`.hue-cell[data-r="${cell.r}"][data-c="${cell.c}"]`);
    if (next) next.classList.add(cls);
  }
}

function clueInput(onDone) {
  const input = el("input", { class: "field", type: "text", placeholder: "one or two words…",
    autocomplete: "off", enterkeyhint: "done", maxlength: "24" });
  const btn = button("Send clue ✓", { big: true, disabled: true, onClick: () => onDone(input.value.trim()) });
  input.addEventListener("input", () => { btn.disabled = input.value.trim() === ""; });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !btn.disabled) onDone(input.value.trim()); });
  setTimeout(() => input.focus(), 50);
  return el("div", { class: "stack" }, [input, btn]);
}

function clueBlock(theClue) {
  return el("div", { class: "center" }, [
    el("span", { class: "muted" }, "The clue is"),
    el("div", { class: "clue-tag", style: "margin:8px 0 16px" }, theClue),
  ]);
}

function waitingView({ msg, clue, pick, preview, disabled = true }) {
  const parts = [];
  if (clue) parts.push(clueBlock(clue));
  parts.push(grid({ pick, preview, disabled }));
  if (preview) parts.push(el("p", { class: "center muted", style: "margin:0 0 8px" }, "Your partner is exploring the colours…"));
  parts.push(el("div", { class: "waiting" }, [el("div", { class: "spinner" }), msg]));
  return el("div", { class: "card" }, parts);
}

/* ---------------- ONLINE (2–8 players, host-authoritative) ---------------- */
function onlineGame(ctx) {
  const { session } = ctx;
  const isHost = session.isHost;
  const names = session.players;
  const N = names.length;
  let round = 0;
  let team = { total: 0, best: 0 };
  let target = null;                 // host + current clue-giver know it
  let clue = "";
  let guesses = names.map(() => null); // host-authoritative locked guesses
  let progress = { count: 0, total: Math.max(1, N - 1) };
  let phase = null;                    // 'cluer-wait' | 'guesser-wait' — for live progress redraws

  const status = connectionPill();
  session.onStatus(status.set);
  const screen = (body) => render(el("div", { class: "screen" }, [header(ctx, status.node), body]));

  const cluerIndex = () => round % N;
  const iAmCluer = () => session.myIndex === cluerIndex();
  const guesserIndices = () => names.map((_, i) => i).filter((i) => i !== cluerIndex());

  // ---- Waiting screens ----
  function showWaitClue() {
    phase = null;
    screen(waitingView({ msg: `Waiting for ${names[cluerIndex()]}'s clue…`, disabled: true }));
  }
  function showCluerWait() {
    phase = "cluer-wait";
    screen(waitingView({ msg: `Watching the room guess · ${progress.count}/${progress.total} in`, clue, disabled: true }));
  }
  function showGuesserWait(pick) {
    phase = "guesser-wait";
    showGuesserWait.pick = pick ?? showGuesserWait.pick ?? null;
    screen(waitingView({ msg: `Guess locked · ${progress.count}/${progress.total} in`, clue, pick: showGuesserWait.pick, disabled: true }));
  }
  function redrawProgress() {
    if (phase === "cluer-wait") showCluerWait();
    else if (phase === "guesser-wait") showGuesserWait();
  }

  // ---- Clue-giver UI ----
  function showClue() {
    phase = null;
    screen(el("div", { class: "card" }, [
      el("div", { class: "pill" }, "Your secret colour 🤫"),
      el("div", { class: "swatch", style: `background:${cellColor(target.r, target.c)}; margin:12px 0` }),
      el("p", { class: "muted center" }, "Describe it in one or two words. Don't name the colour!"),
      clueInput((text) => {
        clue = text;
        if (isHost) startGuessPhase();
        else session.send("hues_clue", { round, clue: text });
        showCluerWait();
      }),
    ]));
  }

  // ---- Guesser UI ----
  function showGuess(theClue) {
    phase = null;
    showGuesserWait.pick = null;
    let pick = null;
    const hint = el("p", { class: "center muted", style: "margin:8px 0 0" }, "Tap a colour to start exploring.");
    const lockBtn = button("Lock in guess 🎯", { big: true, disabled: true, onClick: () => {
      if (!pick) return;
      guesses[session.myIndex] = pick;
      showGuesserWait(pick);
      if (isHost) recordGuess(session.myIndex, pick);
      else session.send("hues_guess", { round, cell: pick });
    } });
    const gridWrap = grid({ onPick: (cell) => {
      pick = cell;
      markGrid(gridWrap, "pick", cell);     // move my highlight in place, no re-render
      hint.textContent = "Tap around — lock in when you're sure.";
      lockBtn.disabled = false;
    } });
    screen(el("div", { class: "screen" }, [
      clueBlock(theClue),
      gridWrap,
      hint,
      el("div", { class: "footer-actions" }, lockBtn),
    ]));
  }

  // ---- Host round control ----
  function hostNewRound() {
    if (!isHost) return;
    target = randCell();
    clue = "";
    guesses = names.map(() => null);
    progress = { count: 0, total: Math.max(1, N - 1) };
    const cluer = cluerIndex();
    session.send("hues_round", { round, cluer });
    if (cluer === session.myIndex) showClue();      // host is clue-giver
    else {
      session.sendTo(cluer, "hues_target", { round, cell: target });
      showWaitClue();                                // host is a guesser, waits for clue
    }
  }
  function startGuessPhase() {
    if (!isHost) return;
    progress = { count: 0, total: Math.max(1, N - 1) };
    session.send("hues_guessnow", { round, clue });
    if (iAmCluer()) showCluerWait();
    else showGuess(clue);
  }

  function recordGuess(i, cell) {
    if (!isHost || i === cluerIndex() || guesses[i] != null) return;
    guesses[i] = cell;
    progress = { count: guesserIndices().filter((g) => guesses[g] != null).length, total: Math.max(1, N - 1) };
    session.send("hues_progress", { round, count: progress.count, total: progress.total });
    redrawProgress();
    if (guesserIndices().every((g) => guesses[g] != null)) hostReveal();
  }

  // ---- Reveal ----
  function hostReveal() {
    if (!isHost) return;
    const points = names.map((_, i) => (i === cluerIndex() || guesses[i] == null) ? null : pointsFor(distance(target, guesses[i])));
    const roundPoints = points.reduce((sum, p) => sum + (p || 0), 0);
    team.total += roundPoints;
    team.best = Math.max(team.best, roundPoints);
    const payload = { round, cluer: cluerIndex(), target, clue, guesses: guesses.slice(), points, roundPoints, team };
    session.send("hues_reveal", payload);
    showReveal(payload);
  }

  function showReveal(p) {
    phase = null;
    if (p.roundPoints >= 4) celebrate();
    const guessCells = p.guesses.filter((g, i) => i !== p.cluer && g != null);
    const rows = names.map((name, i) => {
      if (i === p.cluer) return el("div", { class: "answer-card me" }, [
        el("span", { class: "who" }, `${name} (clue-giver)`),
        el("span", { class: "val" }, "🤫"),
      ]);
      return el("div", { class: "answer-card reveal-anim" }, [
        el("span", { class: "who" }, name),
        el("span", { class: "val" }, p.points[i] == null ? "—" : `+${p.points[i]}`),
      ]);
    });
    const next = onlineReadyGate(session, `hues:${p.round}`, () => {
      if (isHost) { round++; hostNewRound(); }
    }, { label: "Ready for next" });
    screen(el("div", { class: "screen" }, [
      el("div", { class: "center" }, [el("span", { class: "muted" }, "Clue was"), el("div", { class: "clue-tag", style: "margin:8px 0 14px" }, p.clue)]),
      grid({ target: p.target, guesses: guessCells, disabled: true }),
      el("div", { class: "verdict match", style: "margin-top:14px" }, `🎯 +${p.roundPoints} this round`),
      el("div", { class: "stack" }, rows),
      el("div", { class: "scorebar" }, [scoreChip(p.team.total, "team total"), scoreChip(p.team.best, "best round")]),
      el("div", { class: "footer-actions" }, next),
    ]));
  }

  // ---- Messages ----
  session.on("hues_round", (m) => {
    if (isHost) return;
    round = m.round;
    clue = "";
    if (session.myIndex !== m.cluer) showWaitClue();   // guessers wait for the clue; the cluer waits for hues_target
  });
  session.on("hues_target", (m) => {
    if (m.round !== round) return;
    target = m.cell;
    showClue();                                        // I'm the clue-giver this round
  });
  session.on("hues_clue", (m) => {                     // guest cluer → host
    if (!isHost || m.round !== round) return;
    clue = m.clue;
    startGuessPhase();
  });
  session.on("hues_guessnow", (m) => {
    if (m.round !== round) return;
    clue = m.clue;
    if (iAmCluer()) showCluerWait();                   // guest cluer waits while others guess
    else showGuess(m.clue);
  });
  session.on("hues_guess", (m) => {                    // guesser → host
    if (!isHost || m.round !== round) return;
    recordGuess(m.from, m.cell);
  });
  session.on("hues_progress", (m) => {
    if (m.round !== round) return;
    progress = { count: m.count, total: m.total };
    redrawProgress();
  });
  session.on("hues_reveal", (m) => {
    if (isHost) return;
    team = m.team; round = m.round;
    showReveal(m);
  });

  if (isHost) hostNewRound();
  else showWaitClue();
}

/* ---------------- LOCAL (pass the phone) ---------------- */
function localGame(ctx) {
  const names = ctx.players;
  let round = 0;
  let team = { total: 0, best: 0 };
  const statusEl = pill("Pass & play");
  const screen = (body) => render(el("div", { class: "screen" }, [header(ctx, statusEl), body]));

  async function playRound() {
    const cluer = round % 2;
    const guesser = 1 - cluer;
    const target = randCell();

    await passDevice(names[cluer], "You're the Clue-giver 🤫");
    const clue = await new Promise((resolve) => {
      screen(el("div", { class: "card" }, [
        el("div", { class: "pill" }, `${names[cluer]} — your secret colour`),
        el("div", { class: "swatch", style: `background:${cellColor(target.r, target.c)}; margin:12px 0` }),
        el("p", { class: "muted center" }, "One or two words. Don't name the colour!"),
        clueInput(resolve),
      ]));
    });

    await passDevice(names[guesser], `You're guessing. Clue: "${clue}"`);
    const guess = await new Promise((resolve) => {
      let pick = null;
      const lockBtn = button("Lock in guess 🎯", { big: true, disabled: true, onClick: () => { if (pick) resolve(pick); } });
      const gridWrap = grid({ onPick: (cell) => { pick = cell; markGrid(gridWrap, "pick", cell); lockBtn.disabled = false; } });
      screen(el("div", { class: "screen" }, [
        el("div", { class: "center" }, [el("span", { class: "muted" }, "The clue is"), el("div", { class: "clue-tag", style: "margin:8px 0 16px" }, clue)]),
        gridWrap,
        el("div", { class: "footer-actions" }, lockBtn),
      ]));
    });

    const pts = pointsFor(distance(target, guess));
    team.total += pts; team.best = Math.max(team.best, pts);
    if (pts >= 4) celebrate();
    screen(el("div", { class: "screen" }, [
      el("div", { class: "center" }, [el("span", { class: "muted" }, "Clue was"), el("div", { class: "clue-tag", style: "margin:8px 0 14px" }, clue)]),
      grid({ target, guess, disabled: true }),
      el("div", { class: "verdict match", style: "margin-top:14px" }, `🎯 +${pts} points`),
      el("div", { class: "scorebar" }, [scoreChip(team.total, "team total"), scoreChip(team.best, "best round")]),
      el("p", { class: "center muted" }, pts === 5 ? "Bullseye! 💞" : pts >= 3 ? "So close!" : "Tricky one!"),
      el("div", { class: "footer-actions" }, localReadyGate(names, () => { round++; playRound(); }, { label: "Ready for next" })),
    ]));
  }

  playRound();
}

export default game;
