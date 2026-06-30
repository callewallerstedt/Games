// "Wavelength" - clue a hidden position on a spectrum, then guess with a slider.

import { el, render, button, pill, connectionPill, passDevice, gameHeader, scoreChip, celebrate, onlineReadyGate, localReadyGate } from "../ui.js";

const SPECTRUMS = [
  ["cheap", "expensive"],
  ["normal", "insane"],
  ["boring", "thrilling"],
  ["quiet", "loud"],
  ["tiny", "huge"],
  ["casual", "fancy"],
  ["easy", "hard"],
  ["safe", "dangerous"],
  ["classic", "weird"],
  ["slow", "fast"],
  ["cute", "terrifying"],
  ["underrated", "overrated"],
  ["low effort", "high effort"],
  ["cold", "hot"],
  ["messy", "organized"],
  ["private", "public"],
  ["mild", "spicy"],
  ["realistic", "delusional"],
  ["useful", "useless"],
  ["forgettable", "iconic"],
];

const rand = (n) => Math.floor(Math.random() * n);
const clamp = (n) => Math.max(0, Math.min(100, Number(n) || 0));
const pointsFor = (target, guess) => Math.max(0, 10 - Math.floor(Math.abs(target - guess) / 5));

const game = {
  id: "wavelength",
  title: "Wavelength",
  emoji: "📡",
  color: "linear-gradient(135deg,#0891b2,#84cc16)",
  blurb: "Give a clue on a spectrum. Your partner slides to where they think it lands.",
  minPlayers: 2,
  maxPlayers: 2,
  modes: ["local", "online"],
  estMinutes: 10,
  rulesHTML: `
    <p>One player sees a hidden point on a spectrum, like <b>cheap to expensive</b>.</p>
    <ol>
      <li>The clue-giver says a clue out loud. No typing required.</li>
      <li>The guesser moves the slider to the point they think fits.</li>
      <li>The closer the guess, the more points. A perfect hit scores <b>10</b>.</li>
      <li>Swap roles each round and build a team score.</li>
    </ol>`,
  mount(ctx) { ctx.mode === "online" ? online(ctx) : local(ctx); },
};

function scaleView(spectrum, opts = {}) {
  const target = opts.target == null ? null : clamp(opts.target);
  const guess = opts.guess == null ? null : clamp(opts.guess);
  return el("div", { class: "wave-card" }, [
    el("div", { class: "wave-labels" }, [el("b", {}, spectrum[0]), el("b", {}, spectrum[1])]),
    el("div", { class: "wave-track" }, [
      target == null ? null : el("i", { class: "wave-pin target", style: `left:${target}%` }, "T"),
      guess == null ? null : el("i", { class: "wave-pin guess", style: `left:${guess}%` }, "G"),
    ]),
  ]);
}

function targetScreen(spectrum, target, cluerName, onDone) {
  return el("div", { class: "card stack" }, [
    el("div", { class: "pill" }, `${cluerName} sees the target`),
    scaleView(spectrum, { target }),
    el("p", { class: "muted center" }, "Say a clue out loud that lands near the target."),
    button("Clue given ->", { big: true, onClick: onDone }),
  ]);
}

function guessScreen(spectrum, guesserName, onGuess) {
  let value = 50;
  const readout = el("div", { class: "wave-readout" }, "50");
  const input = el("input", {
    class: "wave-slider",
    type: "range",
    min: "0",
    max: "100",
    step: "1",
    value: String(value),
    oninput: (e) => {
      value = clamp(e.target.value);
      readout.textContent = String(value);
      preview.replaceWith(scaleView(spectrum, { guess: value }));
      preview = wrap.firstChild;
    },
  });
  let preview = scaleView(spectrum, { guess: value });
  const wrap = el("div", { class: "card stack" }, [
    preview,
    readout,
    input,
    button(`${guesserName}, lock guess`, { big: true, onClick: () => onGuess(value) }),
  ]);
  return wrap;
}

function revealScreen(spectrum, target, guess, pts, team, nextNode) {
  if (pts >= 8) celebrate();
  return el("div", { class: "screen" }, [
    scaleView(spectrum, { target, guess }),
    el("div", { class: `verdict ${pts >= 6 ? "match" : "nomatch"}` }, `+${pts} points`),
    el("div", { class: "scorebar" }, [scoreChip(team.total, "team total"), scoreChip(team.best, "best")]),
    el("p", { class: "muted center" }, pts === 10 ? "Perfect wavelength." : pts >= 7 ? "Very close." : "Talk it out and swap."),
    el("div", { class: "footer-actions" }, nextNode),
  ]);
}

function online(ctx) {
  const { session } = ctx;
  const isHost = session.isHost;
  const myIdx = isHost ? 0 : 1;
  const status = connectionPill();
  session.onStatus(status.set);
  const screen = (body) => render(el("div", { class: "screen" }, [gameHeader(ctx, game, status.node), body]));
  let round = 0;
  let team = { total: 0, best: 0 };
  let spectrum = null;
  let target = 50;

  const cluer = () => round % 2;
  const guesser = () => 1 - cluer();

  function hostRound() {
    spectrum = SPECTRUMS[rand(SPECTRUMS.length)];
    target = rand(101);
    if (cluer() === 0) {
      session.send("wave_wait", { msg: `Waiting for ${session.players[0]}'s clue...` });
      showTarget();
    } else {
      session.send("wave_target", { round, spectrum, target });
      screen(el("div", { class: "waiting" }, [el("div", { class: "spinner" }), `Waiting for ${session.players[1]}'s clue...`]));
    }
  }
  function showTarget() {
    screen(targetScreen(spectrum, target, "Clue-giver", () => {
      if (isHost) startGuess();
      else session.send("wave_clued", { round });
      screen(el("div", { class: "waiting" }, [el("div", { class: "spinner" }), `Waiting for ${session.players[guesser()]} to guess...`]));
    }));
  }
  function startGuess() {
    if (myIdx === guesser()) showGuess();
    else session.send("wave_guess", { round, spectrum });
  }
  function showGuess() {
    screen(guessScreen(spectrum, "Guesser", (guess) => {
      if (isHost) hostReveal(guess);
      else {
        session.send("wave_guess_value", { round, guess });
        screen(el("div", { class: "waiting" }, [el("div", { class: "spinner" }), "Scoring..."]));
      }
    }));
  }
  function hostReveal(guess) {
    const pts = pointsFor(target, guess);
    team.total += pts;
    team.best = Math.max(team.best, pts);
    const payload = { round, spectrum, target, guess, pts, team };
    session.send("wave_reveal", payload);
    showReveal(payload);
  }
  function showReveal(p) {
    team = p.team;
    round = p.round;
    const next = onlineReadyGate(session, `wave:${round}`, () => {
      if (isHost) { round++; hostRound(); }
    }, { label: "Ready for next ->" });
    screen(revealScreen(p.spectrum, p.target, p.guess, p.pts, p.team, next));
  }

  session.on("wave_target", (m) => { round = m.round; spectrum = m.spectrum; target = m.target; showTarget(); });
  session.on("wave_wait", (m) => screen(el("div", { class: "waiting" }, [el("div", { class: "spinner" }), m.msg])));
  session.on("wave_clued", () => startGuess());
  session.on("wave_guess", (m) => { round = m.round; spectrum = m.spectrum; showGuess(); });
  session.on("wave_guess_value", (m) => hostReveal(m.guess));
  session.on("wave_reveal", showReveal);

  if (isHost) hostRound();
  else screen(el("div", { class: "waiting" }, [el("div", { class: "spinner" }), `Waiting for ${session.partnerName} to start...`]));
}

function local(ctx) {
  const names = ctx.players;
  const statusEl = pill("Pass & play");
  const screen = (body) => render(el("div", { class: "screen" }, [gameHeader(ctx, game, statusEl), body]));
  let round = 0;
  let team = { total: 0, best: 0 };

  async function playRound() {
    const spectrum = SPECTRUMS[rand(SPECTRUMS.length)];
    const target = rand(101);
    const cluer = round % 2;
    const guesser = 1 - cluer;
    await passDevice(names[cluer], "You are the clue-giver");
    await new Promise((resolve) => screen(targetScreen(spectrum, target, names[cluer], resolve)));
    await passDevice(names[guesser], "Move the slider to guess");
    const guess = await new Promise((resolve) => screen(guessScreen(spectrum, names[guesser], resolve)));
    const pts = pointsFor(target, guess);
    team.total += pts;
    team.best = Math.max(team.best, pts);
    screen(revealScreen(spectrum, target, guess, pts, team, localReadyGate(names, () => { round++; playRound(); }, { label: "ready" })));
  }

  playRound();
}

export default game;
