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
  blurb: "Clue a secret colour in 1–2 words — can they find it?",
  minPlayers: 2,
  maxPlayers: 2,
  modes: ["local", "online"],
  estMinutes: 10,
  rulesHTML: `
    <p>One of you is the <b>Clue-giver</b>, the other is the <b>Guesser</b>. Then you swap.</p>
    <ol>
      <li>The Clue-giver secretly sees a colour 🎯.</li>
      <li>They give a <b>one or two word</b> clue (e.g. "ocean", "ripe banana").</li>
      <li>The Guesser taps the colour they think it is on the spectrum.</li>
      <li>The closer the guess, the more points — a bullseye is <b>5</b>! 🎯</li>
    </ol>
    <p>It's <b>co-op</b>: you're building one team score together. Swap roles each round
    and see how high you can climb.</p>
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

/* ---------------- ONLINE ---------------- */
function onlineGame(ctx) {
  const { session } = ctx;
  const isHost = session.isHost;
  let round = 0;
  let team = { total: 0, best: 0 };
  let target = null; // host knows always; guest knows only when cluing
  let clue = "";
  let partnerPreview = null;
  let waitingOpts = null;

  const status = connectionPill();
  session.onStatus(status.set);
  const screen = (body) => render(el("div", { class: "screen" }, [header(ctx, status.node), body]));

  const showWaiting = (opts) => {
    waitingOpts = opts;
    screen(waitingView({ ...opts, preview: partnerPreview }));
  };
  // The clue-giver watches the guesser explore: move the preview marker on the
  // existing grid instead of rebuilding the whole screen on every nudge.
  const liveGrid = () => document.querySelector(".screen .hue-wrap");
  const refreshWaiting = () => { markGrid(liveGrid(), "preview", partnerPreview); };
  const resetRoundState = () => {
    partnerPreview = null;
    waitingOpts = null;
  };

  const cluerIndex = () => round % 2; // players[0] = host
  const iAmCluer = () => (isHost ? cluerIndex() === 0 : cluerIndex() === 1);

  // ---- Clue-giver UI ----
  function showClue() {
    screen(el("div", { class: "card" }, [
      el("div", { class: "pill" }, "Your secret colour 🤫"),
      el("div", { class: "swatch", style: `background:${cellColor(target.r, target.c)}; margin:12px 0` }),
      el("p", { class: "muted center" }, "Describe it in one or two words. Don't name the colour!"),
      clueInput((text) => {
        clue = text;
        if (isHost) startGuessPhase();
        else {
          session.send("hues_clue", { clue: text });
          showWaiting({ msg: `Sent! Waiting for ${session.partnerName} to guess…`, clue: text });
        }
      }),
    ]));
  }

  // ---- Guesser UI ----
  function showGuess(theClue) {
    waitingOpts = null;
    let pick = null;
    const hint = el("p", { class: "center muted", style: "margin:8px 0 0" }, "Tap a colour to start exploring.");
    const lockBtn = button("Lock in guess 🎯", { big: true, disabled: true, onClick: () => {
      if (!pick) return;
      if (isHost) hostReveal(pick);
      else {
        session.send("hues_guess", { cell: pick });
        showWaiting({ msg: "Checking…", clue: theClue, pick });
      }
    } });
    const gridWrap = grid({ onPick: (cell) => {
      pick = cell;
      markGrid(gridWrap, "pick", cell);     // move my highlight in place, no re-render
      session.send("hues_preview", { cell }); // let the clue-giver watch live
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

  // ---- Reveal ----
  function hostReveal(guess) {
    const d = distance(target, guess);
    const pts = pointsFor(d);
    team.total += pts; team.best = Math.max(team.best, pts);
    const payload = { target, guess, clue, pts, team, round };
    session.send("hues_reveal", payload);
    showReveal(payload);
  }

  function showReveal(p) {
    if (p.pts >= 4) celebrate();
    const next = onlineReadyGate(session, `hues:${p.round}`, () => {
      if (isHost) { round++; hostNewRound(); }
    }, { label: "Ready for next" });
    screen(el("div", { class: "screen" }, [
      el("div", { class: "center" }, [el("span", { class: "muted" }, "Clue was"), el("div", { class: "clue-tag", style: "margin:8px 0 14px" }, p.clue)]),
      grid({ target: p.target, guess: p.guess, disabled: true }),
      el("div", { class: "verdict match", style: "margin-top:14px" }, `🎯 +${p.pts} points`),
      el("div", { class: "scorebar" }, [scoreChip(p.team.total, "team total"), scoreChip(p.team.best, "best round")]),
      el("p", { class: "center muted" }, p.pts === 5 ? "Bullseye! Perfect read 💞" : p.pts >= 3 ? "So close!" : "Tricky one — swap and try again."),
      el("div", { class: "footer-actions" }, next),
    ]));
  }

  // ---- Host round control ----
  function hostNewRound() {
    resetRoundState();
    target = randCell();
    clue = "";
    if (cluerIndex() === 0) {
      // host clues
      session.send("hues_phase", { phase: "wait", msg: `Waiting for ${session.partnerName}'s clue…` });
      showClue();
    } else {
      // guest clues
      session.send("hues_target", { cell: target });
      showWaiting({ msg: `Waiting for ${session.partnerName}'s clue…` });
    }
  }
  function startGuessPhase() {
    // called on host after a clue exists; figure out who guesses
    partnerPreview = null;
    if (cluerIndex() === 0) {
      // host clued → guest guesses
      session.send("hues_guessnow", { clue });
      showWaiting({ msg: `Waiting for ${session.partnerName} to guess…`, clue });
    } else {
      // guest clued → host guesses
      showGuess(clue);
    }
  }

  // ---- Messages ----
  session.on("hues_target", (m) => { target = m.cell; showClue(); });
  session.on("hues_phase", (m) => { if (m.phase === "wait") showWaiting({ msg: m.msg }); });
  session.on("hues_clue", (m) => { clue = m.clue; startGuessPhase(); });      // host only path
  session.on("hues_guessnow", (m) => { clue = m.clue; partnerPreview = null; showGuess(m.clue); });  // guest guesser
  session.on("hues_preview", (m) => { partnerPreview = m.cell; refreshWaiting(); });
  session.on("hues_guess", (m) => { hostReveal(m.cell); });                    // host computes
  session.on("hues_reveal", (m) => { team = m.team; round = m.round; waitingOpts = null; showReveal(m); });

  if (isHost) hostNewRound();
  else showWaiting({ msg: `Waiting for ${session.partnerName} to start…` });
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
