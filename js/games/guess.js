// "Closest Guess" — estimate wild numbers; nearest answer wins the round.
import { el, render, button, gameHeader, passDevice, scoreChip, shuffle, celebrate, haptic, connectionPill, onlineReadyGate, localReadyGate } from "../ui.js";
import { GUESS_PROMPTS } from "../data/guess-prompts.js";

const game = {
  id: "guess",
  title: "Closest Guess",
  emoji: "📏",
  color: "linear-gradient(135deg,#4bd1ff,#6c5ce7)",
  blurb: "How many? How long? How far? Closest estimate wins!",
  minPlayers: 2,
  maxPlayers: 10,
  modes: ["local", "online"],
  estMinutes: 12,
  rulesHTML: `
    <p>We show a question with a unit (meters, years, teeth, whatever). Everyone secretly guesses a number.</p>
    <ol>
      <li>Each player enters their estimate (on their phone or pass the device).</li>
      <li>We reveal the true answer and everyone's <b>error</b> (how far off).</li>
      <li>Closest guess wins the round! 🎯</li>
    </ol>`,
  mount(ctx) {
    if (ctx.mode === "online") online(ctx);
    else local(ctx);
  },
};

function fmt(n) {
  if (Math.abs(n) >= 1000) return n.toLocaleString();
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(1);
}

function revealScreen(names, item, guesses, errors, scores, nextControl) {
  const best = Math.min(...errors);
  const winners = errors.map((e, i) => e === best ? i : -1).filter((i) => i >= 0);
  const rows = names.map((n, i) => {
    const off = errors[i];
    const isWin = off === best;
    return el("div", { class: `answer-card reveal-anim ${isWin ? "me" : ""}` }, [
      el("span", { class: "who" }, n + (isWin ? " 🎯" : "")),
      el("span", { class: "val" }, [
        el("div", {}, fmt(guesses[i]) + " " + item.unit),
        el("div", { class: "tiny muted", style: "font-weight:600;margin-top:2px" }, `off by ${fmt(off)}`),
      ]),
    ]);
  });
  return el("div", { class: "screen" }, [
    el("div", { class: "card center" }, [
      el("div", { class: "kicker" }, "True answer"),
      el("div", { class: "q-big", style: "font-size:2.2rem" }, `${fmt(item.answer)}`),
      el("p", { class: "muted" }, item.unit),
      el("div", { class: "verdict match" }, winners.length > 1 ? "Tie! 🤝" : `${names[winners[0]]} was closest!`),
    ]),
    el("div", { class: "stack" }, rows),
    el("div", { class: "scorebar" }, names.map((n, i) => scoreChip(scores[i], n))),
    el("div", { class: "footer-actions" }, nextControl),
  ]);
}

function guessInputScreen(names, myIndex, item, onSubmit) {
  const input = el("input", { class: "field", type: "number", inputmode: "decimal", placeholder: "Your guess…" });
  const btn = button("Lock in ✓", { big: true, disabled: true, onClick: () => onSubmit(parseFloat(input.value)) });
  input.addEventListener("input", () => { btn.disabled = input.value === "" || isNaN(parseFloat(input.value)); });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !btn.disabled) btn.click(); });
  setTimeout(() => input.focus(), 40);
  return el("div", { class: "card" }, [
    el("div", { class: "pill" }, `${names[myIndex]} — secret guess`),
    el("div", { class: "q-big" }, item.q),
    el("p", { class: "center muted" }, [`Unit: `, el("b", {}, item.unit)]),
    el("div", { class: "stack" }, [input, btn]),
  ]);
}

function waitingView(msg) {
  return el("div", { class: "card center" }, [el("div", { class: "waiting" }, [el("div", { class: "spinner" }), msg])]);
}

function online(ctx) {
  const { session } = ctx;
  const isHost = session.isHost;
  const names = session.players;
  const count = names.length;
  let deck = shuffle(GUESS_PROMPTS);
  let qi = 0;
  const scores = names.map(() => 0);
  let currentItem = null;
  let guesses = names.map(() => null);
  let submitted = 0;

  const status = connectionPill();
  session.onStatus(status.set);
  const screen = (b) => render(el("div", { class: "screen" }, [gameHeader(ctx, game, status.node), b]));

  function showGuess() {
    submitted = 0;
    guesses = names.map(() => null);
    screen(guessInputScreen(names, session.myIndex, currentItem, (value) => {
      guesses[session.myIndex] = value;
      if (isHost) {
        submitted++;
        checkReveal();
      } else {
        session.send("guess_submit", { value });
        screen(waitingView("Waiting for other players…"));
      }
    }));
  }

  function checkReveal() {
    if (!isHost) return;
    const done = guesses.every((g) => g !== null);
    if (!done) {
      screen(waitingView(`Waiting for players… (${guesses.filter((g) => g !== null).length}/${count})`));
      return;
    }
    const errors = guesses.map((g) => Math.abs(g - currentItem.answer));
    const best = Math.min(...errors);
    const winners = errors.map((e, i) => e === best ? i : -1).filter((i) => i >= 0);
    winners.forEach((i) => { scores[i]++; });
    const payload = { item: currentItem, guesses: guesses.slice(), errors, scores: scores.slice() };
    session.send("guess_reveal", payload);
    showReveal(payload);
  }

  function showReveal(p) {
    if (p.errors.filter((e) => e === Math.min(...p.errors)).length === 1) celebrate();
    screen(revealScreen(names, p.item, p.guesses, p.errors, p.scores,
      onlineReadyGate(session, `guess:${qi}`, () => { if (isHost) hostNewRound(); }, { label: "Ready for next" })));
    haptic(12);
  }

  function hostNewRound() {
    if (qi >= deck.length) { deck = shuffle(GUESS_PROMPTS); qi = 0; }
    currentItem = deck[qi++];
    session.send("guess_round", { q: currentItem.q, unit: currentItem.unit });
    showGuess();
  }

  session.on("guess_round", (m) => {
    if (isHost) return;
    currentItem = { q: m.q, unit: m.unit };
    showGuess();
  });
  session.on("guess_submit", (m) => {
    if (!isHost) return;
    guesses[m.from] = m.value;
    checkReveal();
  });
  session.on("guess_reveal", showReveal);

  screen(el("div", { class: "card center" }, [
    el("h2", {}, "📏 Closest Guess"),
    el("p", { class: "muted" }, `${count} players · wild estimation questions`),
    isHost
      ? el("div", { class: "footer-actions" }, button("Start →", { big: true, onClick: hostNewRound }))
      : waitingView(`Waiting for ${session.players[0]} to start…`),
  ]));
}

function local(ctx) {
  const names = ctx.players;
  let deck = shuffle(GUESS_PROMPTS);
  let qi = 0;
  const scores = names.map(() => 0);
  const statusEl = el("span", { class: "pill" }, `${names.length} players`);
  const screen = (b) => render(el("div", { class: "screen" }, [gameHeader(ctx, game, statusEl), b]));

  async function round() {
    if (qi >= deck.length) { deck = shuffle(GUESS_PROMPTS); qi = 0; }
    const item = deck[qi++];
    const guesses = [];

    for (let i = 0; i < names.length; i++) {
      await passDevice(names[i], "Don't let anyone see your guess!");
      await new Promise((res) => {
        screen(guessInputScreen(names, i, item, (value) => { guesses[i] = value; res(); }));
      });
    }

    const errors = guesses.map((g) => Math.abs(g - item.answer));
    const best = Math.min(...errors);
    const winners = errors.map((e, i) => e === best ? i : -1).filter((i) => i >= 0);
    winners.forEach((i) => { scores[i]++; });
    if (winners.length === 1) celebrate();

    screen(revealScreen(names, item, guesses, errors, scores,
      localReadyGate(names, round, { label: "Ready for next" })));
    haptic(12);
  }

  screen(el("div", { class: "card center" }, [
    el("h2", {}, "📏 Closest Guess"),
    el("p", { class: "muted" }, `${deck.length} wild estimation questions ready.`),
    el("div", { class: "footer-actions" }, button("Start →", { big: true, onClick: round })),
  ]));
}

export default game;
