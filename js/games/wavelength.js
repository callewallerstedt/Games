// Wavelength: one player gives a spoken clue, everyone else guesses on a fine scale.
import {
  el, render, button, pill, connectionPill, passDevice, gameHeader, celebrate,
  onlineReadyGate, localReadyGate, scoreboard,
} from "../ui.js";

const SPECTRUMS = [
  ["cheap", "expensive"], ["normal", "insane"], ["boring", "thrilling"],
  ["quiet", "loud"], ["tiny", "huge"], ["casual", "fancy"], ["easy", "hard"],
  ["safe", "dangerous"], ["classic", "weird"], ["slow", "fast"],
  ["cute", "terrifying"], ["underrated", "overrated"], ["low effort", "high effort"],
  ["cold", "hot"], ["messy", "organized"], ["private", "public"], ["mild", "spicy"],
  ["realistic", "delusional"], ["useful", "useless"], ["forgettable", "iconic"],
  ["bad first date", "perfect first date"], ["never mention it", "tell everyone"],
  ["weekday activity", "vacation activity"], ["harmless", "chaotic"],
];

const rand = (n) => Math.floor(Math.random() * n);
const clamp = (n) => Math.max(0, Math.min(100, Number(n) || 0));
const pointsFor = (target, guess) => Math.max(0, 10 - Math.floor(Math.abs(target - guess) / 5));

const game = {
  id: "wavelength",
  title: "Wavelength",
  emoji: "📡",
  color: "linear-gradient(135deg,#0891b2,#84cc16)",
  blurb: "Give a spoken clue on a spectrum. Everyone slides to where it belongs.",
  minPlayers: 2,
  maxPlayers: 10,
  modes: ["local", "online"],
  estMinutes: 12,
  rulesHTML: `
    <p>One player sees a hidden point on a spectrum, such as <b>cheap to expensive</b>.</p>
    <ol>
      <li>The clue-giver says one clue out loud. Nothing needs to be typed.</li>
      <li>Every other player moves their private slider to where the clue belongs.</li>
      <li>Closer guesses score more. A perfect hit scores <b>10</b>.</li>
      <li>The clue-giver earns the group's average, then the role rotates.</li>
    </ol>`,
  mount(ctx) { if (ctx.mode === "online") online(ctx); else local(ctx); },
};

function scaleView(spectrum, { target = null, guesses = [] } = {}) {
  return el("div", { class: "wave-card" }, [
    el("div", { class: "wave-labels" }, [el("b", {}, spectrum[0]), el("b", {}, spectrum[1])]),
    el("div", { class: "wave-track" }, [
      target == null ? null : el("i", { class: "wave-pin target", style: `left:${clamp(target)}%`, title: "Target" }, "T"),
      ...guesses.filter((guess) => guess?.value != null).map((guess, i) =>
        el("i", {
          class: "wave-pin guess",
          style: `left:${clamp(guess.value)}%;--pin-row:${i % 3}`,
          title: `${guess.name}: ${guess.value}`,
        }, String(guess.name || "?").slice(0, 1).toUpperCase())),
    ]),
  ]);
}

function targetScreen(spectrum, target, cluerName, onDone) {
  return el("div", { class: "card stack" }, [
    el("div", { class: "pill" }, `${cluerName} - clue-giver`),
    scaleView(spectrum, { target }),
    el("p", { class: "muted center" }, "Say a clue out loud that belongs near the target. Do not say a number."),
    button("I gave the clue", { big: true, onClick: onDone }),
  ]);
}

function guessScreen(spectrum, guesserName, onGuess) {
  let value = 50;
  const readout = el("div", { class: "wave-readout" }, "50");
  let preview = scaleView(spectrum, { guesses: [{ name: guesserName, value }] });
  const input = el("input", {
    class: "wave-slider", type: "range", min: "0", max: "100", step: "1", value: "50",
    "aria-label": `Guess for ${spectrum[0]} to ${spectrum[1]}`,
    oninput: (event) => {
      value = clamp(event.target.value);
      readout.textContent = String(value);
      const next = scaleView(spectrum, { guesses: [{ name: guesserName, value }] });
      preview.replaceWith(next);
      preview = next;
    },
  });
  return el("div", { class: "card stack" }, [
    preview,
    el("div", { class: "wave-guess-label" }, `${guesserName}'s guess`),
    readout,
    input,
    button("Lock guess", { big: true, onClick: () => onGuess(value) }),
  ]);
}

function waiting(text) {
  return el("div", { class: "card center" }, [el("div", { class: "spinner" }), el("p", { class: "muted" }, text)]);
}

function revealScreen(ctx, payload, nextNode) {
  const guessPins = payload.guesses.map((value, i) => ({ name: payload.names[i], value }));
  const rows = payload.names.map((name, i) => {
    if (i === payload.cluer) return el("div", { class: "answer-card" }, [
      el("span", { class: "who" }, `${name} (clue-giver)`),
      el("span", { class: "val" }, `+${payload.roundPoints[i]}`),
    ]);
    return el("div", { class: "answer-card reveal-anim" }, [
      el("span", { class: "who" }, name),
      el("span", { class: "val" }, `${payload.guesses[i]} · +${payload.roundPoints[i]}`),
    ]);
  });
  if (Math.max(...payload.roundPoints) >= 8) celebrate();
  return el("div", { class: "screen" }, [
    scaleView(payload.spectrum, { target: payload.target, guesses: guessPins }),
    el("div", { class: "stack" }, rows),
    scoreboard(payload.names, payload.scores, { colors: ctx.playerColors }),
    el("div", { class: "footer-actions" }, nextNode),
  ]);
}

function online(ctx) {
  const { session } = ctx;
  const names = session.players;
  const scores = names.map(() => 0);
  let round = 0;
  let cluer = 0;
  let spectrum = null;
  let target = 50;
  let guesses = names.map(() => null);
  const status = connectionPill();
  session.onStatus(status.set);
  const screen = (body) => render(el("div", { class: "screen" }, [gameHeader(ctx, game, status.node), body]));

  function showRole() {
    if (session.myIndex === cluer) {
      screen(targetScreen(spectrum, target, names[cluer], () => {
        if (session.isHost) beginGuessing();
        else session.send("wave_clued", { round });
        screen(waiting("Clue sent. Waiting for everyone to guess."));
      }));
    } else {
      screen(waiting(`${names[cluer]} is choosing a spoken clue.`));
    }
  }

  function hostRound() {
    if (!session.isHost) return;
    cluer = round % names.length;
    spectrum = SPECTRUMS[rand(SPECTRUMS.length)];
    target = rand(101);
    guesses = names.map(() => null);
    session.send("wave_round", { round, cluer, spectrum });
    if (cluer === 0) showRole();
    else {
      session.sendTo(cluer, "wave_target", { round, cluer, spectrum, target });
      screen(waiting(`${names[cluer]} is choosing a spoken clue.`));
    }
  }

  function beginGuessing() {
    if (!session.isHost) return;
    session.send("wave_guess_phase", { round, cluer, spectrum });
    if (session.myIndex === cluer) screen(waiting("Waiting for everyone's sliders."));
    else showGuess();
  }

  function showGuess() {
    screen(guessScreen(spectrum, names[session.myIndex], (value) => {
      guesses[session.myIndex] = value;
      if (session.isHost) checkReveal();
      else session.send("wave_guess_value", { round, value });
      screen(waiting("Guess locked. Waiting for the room."));
    }));
  }

  function checkReveal() {
    if (!session.isHost) return;
    const complete = guesses.every((guess, i) => i === cluer || guess != null);
    if (!complete) return;
    const roundPoints = names.map((_, i) => i === cluer ? 0 : pointsFor(target, guesses[i]));
    const guesserPoints = roundPoints.filter((_, i) => i !== cluer);
    roundPoints[cluer] = Math.round(guesserPoints.reduce((sum, value) => sum + value, 0) / guesserPoints.length);
    roundPoints.forEach((points, i) => { scores[i] += points; });
    const payload = { round, cluer, spectrum, target, guesses: guesses.slice(), roundPoints, scores: scores.slice(), names };
    session.send("wave_reveal", payload);
    showReveal(payload);
  }

  function showReveal(payload) {
    screen(revealScreen(ctx, payload,
      onlineReadyGate(session, `wave:${payload.round}`, () => { if (session.isHost) { round++; hostRound(); } }, { label: "Ready for next" })));
  }

  session.on("wave_round", (message) => {
    if (session.isHost) return;
    round = message.round;
    cluer = message.cluer;
    spectrum = message.spectrum;
    guesses = names.map(() => null);
    if (session.myIndex !== cluer) showRole();
  });
  session.on("wave_target", (message) => {
    round = message.round; cluer = message.cluer; spectrum = message.spectrum; target = message.target; showRole();
  });
  session.on("wave_clued", (message) => { if (session.isHost && message.round === round && message.from === cluer) beginGuessing(); });
  session.on("wave_guess_phase", (message) => {
    if (session.isHost) return;
    round = message.round; cluer = message.cluer; spectrum = message.spectrum;
    if (session.myIndex === cluer) screen(waiting("Waiting for everyone's sliders.")); else showGuess();
  });
  session.on("wave_guess_value", (message) => {
    if (!session.isHost || message.round !== round || message.from === cluer) return;
    guesses[message.from] = clamp(message.value);
    checkReveal();
  });
  session.on("wave_reveal", (message) => { if (!session.isHost) showReveal(message); });

  if (session.isHost) hostRound();
  else screen(waiting("Waiting for the host to start."));
}

function local(ctx) {
  const names = ctx.players;
  const scores = names.map(() => 0);
  let round = 0;
  const status = pill("One device");
  const screen = (body) => render(el("div", { class: "screen" }, [gameHeader(ctx, game, status), body]));

  async function playRound() {
    const spectrum = SPECTRUMS[rand(SPECTRUMS.length)];
    const target = rand(101);
    const cluer = round % names.length;
    const guesses = names.map(() => null);
    await passDevice(names[cluer], "You are the clue-giver");
    await new Promise((resolve) => screen(targetScreen(spectrum, target, names[cluer], resolve)));
    for (let i = 0; i < names.length; i++) {
      if (i === cluer) continue;
      await passDevice(names[i], "Move the slider to place the spoken clue");
      guesses[i] = await new Promise((resolve) => screen(guessScreen(spectrum, names[i], resolve)));
    }
    const roundPoints = names.map((_, i) => i === cluer ? 0 : pointsFor(target, guesses[i]));
    const guesserPoints = roundPoints.filter((_, i) => i !== cluer);
    roundPoints[cluer] = Math.round(guesserPoints.reduce((sum, value) => sum + value, 0) / guesserPoints.length);
    roundPoints.forEach((points, i) => { scores[i] += points; });
    const payload = { round, cluer, spectrum, target, guesses, roundPoints, scores: scores.slice(), names };
    screen(revealScreen(ctx, payload, localReadyGate(names, () => { round++; playRound(); }, { label: "Next round" })));
  }

  playRound();
}

export default game;
