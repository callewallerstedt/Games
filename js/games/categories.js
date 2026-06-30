// Letter Categories: fill selected categories with answers beginning with one letter.
import {
  el, render, button, pill, connectionPill, passDevice, gameHeader, celebrate,
  onlineReadyGate, localReadyGate, scoreboard, setGameCleanup,
} from "../ui.js";

const ALL_CATEGORIES = [
  "City", "Country", "Food", "Person", "Movie / Series", "Animal",
  "Object", "Job", "Brand", "Song / Artist", "Sport", "Nature",
];
const DEFAULT_CATEGORIES = ALL_CATEGORIES.slice(0, 6);
const LETTERS = "ABCDEFGHJKLMNPRSTW".split("");
const randomLetter = () => LETTERS[Math.floor(Math.random() * LETTERS.length)];
const normalize = (value) => (value || "").trim().toLowerCase().replace(/\s+/g, " ");

const game = {
  id: "categories",
  title: "Letter Categories",
  emoji: "✍️",
  color: "linear-gradient(135deg,#2563a6,#17a673)",
  blurb: "One letter, several categories, and a race for answers nobody else wrote.",
  minPlayers: 2,
  maxPlayers: 10,
  modes: ["local", "online"],
  estMinutes: 12,
  lobbySettings: [
    { key: "categories", label: "Answer columns", type: "multiselect", options: ALL_CATEGORIES, default: DEFAULT_CATEGORIES, minSelected: 3 },
    { key: "roundSeconds", label: "Writing time", type: "choice", options: [45, 60, 90, 120], default: 60 },
  ],
  rulesHTML: `
    <p>Every round uses one random letter and the categories selected by the host.</p>
    <ol>
      <li>Write one answer per category that starts with the round letter.</li>
      <li>A valid answer nobody else wrote scores <b>2 points</b>.</li>
      <li>If two or more players write the same answer in a category, each of them scores <b>1 point</b>.</li>
      <li>Everyone reviews the answers, then readies up for a new letter.</li>
    </ol>`,
  mount(ctx) { if (ctx.mode === "online") online(ctx); else local(ctx); },
};

function timerDisplay(seconds, onExpire) {
  const total = Math.max(1, Number(seconds) || 60);
  const number = el("b", {}, String(total));
  const fill = el("i", { style: "width:100%" });
  const node = el("div", { class: "category-timer" }, [fill, number]);
  const start = Date.now();
  let expired = false;
  const id = setInterval(() => {
    if (!node.isConnected) { clearInterval(id); return; }
    const left = Math.max(0, total * 1000 - (Date.now() - start));
    number.textContent = String(Math.ceil(left / 1000));
    fill.style.width = `${(left / (total * 1000)) * 100}%`;
    if (!left && !expired) {
      expired = true;
      clearInterval(id);
      onExpire?.();
    }
  }, 100);
  node.stop = () => clearInterval(id);
  return node;
}

function answerForm(letter, categories, playerName, seconds, onSubmit) {
  let submitted = false;
  const inputs = categories.map((category) => el("input", {
    class: "field category-input",
    placeholder: `${letter}...`,
    maxlength: "42",
    autocomplete: "off",
    "aria-label": category,
  }));
  const submit = () => {
    if (submitted) return;
    submitted = true;
    timer.stop?.();
    onSubmit(inputs.map((input) => input.value.trim()));
  };
  const timer = timerDisplay(seconds, submit);
  const rows = categories.map((category, i) => el("label", { class: "category-field" }, [
    el("span", {}, category), inputs[i],
  ]));
  setTimeout(() => inputs[0]?.focus(), 30);
  return el("div", { class: "screen" }, [
    el("div", { class: "category-round-head" }, [
      el("div", { class: "category-letter", "aria-label": `Letter ${letter}` }, letter),
      el("div", {}, [el("strong", {}, playerName), el("div", { class: "muted tiny" }, "Unique = 2 pts · Shared = 1 pt")]),
      timer,
    ]),
    el("div", { class: "category-form" }, rows),
    el("div", { class: "footer-actions" }, button("Submit answers", { big: true, onClick: submit })),
  ]);
}

function scoreAnswers(letter, categories, answers, scores) {
  const points = answers.map(() => categories.map(() => 0));
  categories.forEach((_, categoryIndex) => {
    const values = answers.map((row) => normalize(row?.[categoryIndex]));
    const counts = new Map();
    values.forEach((value) => { if (value) counts.set(value, (counts.get(value) || 0) + 1); });
    values.forEach((value, playerIndex) => {
      const valid = value && value.startsWith(letter.toLowerCase());
      if (!valid) return;
      const count = counts.get(value);
      const earned = count === 1 ? 2 : count >= 2 ? 1 : 0;
      if (earned) {
        points[playerIndex][categoryIndex] = earned;
        scores[playerIndex] += earned;
      }
    });
  });
  return points;
}

function resultView(ctx, payload, nextNode) {
  const categoryBlocks = payload.categories.map((category, categoryIndex) => el("section", { class: "category-result" }, [
    el("h3", {}, category),
    ...payload.names.map((name, playerIndex) => {
      const answer = payload.answers[playerIndex]?.[categoryIndex] || "No answer";
      const point = payload.points[playerIndex]?.[categoryIndex] || 0;
      return el("div", { class: `answer-card ${point ? "me" : ""}` }, [
        el("span", { class: "who" }, name),
        el("span", { class: "val" }, `${answer}${point ? `  +${point}` : ""}`),
      ]);
    }),
  ]));
  if (payload.points.some((row) => row.some(Boolean))) celebrate();
  return el("div", { class: "screen" }, [
    el("div", { class: "category-result-head" }, [
      el("div", { class: "category-letter small" }, payload.letter),
      el("div", {}, [el("h2", {}, "Round results"), el("p", { class: "muted" }, "Unique answers = 2 pts · Shared answers = 1 pt each.")]),
    ]),
    el("div", { class: "category-results" }, categoryBlocks),
    scoreboard(payload.names, payload.scores, { colors: ctx.playerColors }),
    el("div", { class: "footer-actions" }, nextNode),
  ]);
}

function online(ctx) {
  const { session } = ctx;
  const names = session.players;
  const categories = Array.isArray(session.settings.categories) && session.settings.categories.length >= 3
    ? session.settings.categories : DEFAULT_CATEGORIES;
  const seconds = Number(session.settings.roundSeconds) || 60;
  const scores = names.map(() => 0);
  let answers = names.map(() => null);
  let letter = "A";
  let round = 0;
  let hostTimeout = null;
  let disposed = false;
  setGameCleanup(() => { disposed = true; clearTimeout(hostTimeout); });
  const status = connectionPill();
  session.onStatus(status.set);
  const screen = (body) => { if (!disposed) render(el("div", { class: "screen" }, [gameHeader(ctx, game, status.node), body])); };

  function startRound() {
    if (!session.isHost) return;
    clearTimeout(hostTimeout);
    round++;
    letter = randomLetter();
    answers = names.map(() => null);
    const payload = { round, letter, categories, seconds };
    session.send("cat_round", payload);
    showForm(payload);
    hostTimeout = setTimeout(() => finishRound(), seconds * 1000 + 350);
  }

  function showForm(payload) {
    screen(answerForm(payload.letter, payload.categories, names[session.myIndex], payload.seconds, (values) => {
      answers[session.myIndex] = values;
      if (session.isHost) maybeFinish();
      else session.send("cat_answers", { round: payload.round, values });
      screen(el("div", { class: "card center" }, [el("div", { class: "spinner" }), el("p", { class: "muted" }, "Answers locked. Waiting for the room.")]));
    }));
  }

  function maybeFinish() {
    if (session.isHost && answers.every((row) => row != null)) finishRound();
  }

  function finishRound() {
    if (!session.isHost || disposed) return;
    clearTimeout(hostTimeout);
    answers = answers.map((row) => row || categories.map(() => ""));
    const points = scoreAnswers(letter, categories, answers, scores);
    const payload = { round, letter, categories, answers, points, scores: scores.slice(), names };
    session.send("cat_reveal", payload);
    showResult(payload);
  }

  function showResult(payload) {
    screen(resultView(ctx, payload,
      onlineReadyGate(session, `cat:${payload.round}`, startRound, { label: "Ready for next letter" })));
  }

  session.on("cat_round", (message) => { if (!session.isHost) { round = message.round; letter = message.letter; answers = names.map(() => null); showForm(message); } });
  session.on("cat_answers", (message) => {
    if (!session.isHost || message.round !== round || answers[message.from] != null) return;
    answers[message.from] = message.values;
    maybeFinish();
  });
  session.on("cat_reveal", (message) => { if (!session.isHost) showResult(message); });

  if (session.isHost) startRound();
  else screen(el("div", { class: "waiting" }, [el("div", { class: "spinner" }), "Waiting for the first letter"]));
}

function local(ctx) {
  const names = ctx.players;
  const categories = Array.isArray(ctx.settings?.categories) && ctx.settings.categories.length >= 3
    ? ctx.settings.categories : DEFAULT_CATEGORIES;
  const seconds = Number(ctx.settings?.roundSeconds) || 60;
  const scores = names.map(() => 0);
  let round = 0;
  let disposed = false;
  setGameCleanup(() => { disposed = true; });
  const status = pill("One device");
  const screen = (body) => { if (!disposed) render(el("div", { class: "screen" }, [gameHeader(ctx, game, status), body])); };

  async function playRound() {
    round++;
    const letter = randomLetter();
    const answers = [];
    for (let i = 0; i < names.length; i++) {
      await passDevice(names[i], `Letter ${letter} - fill every category`);
      if (disposed) return;
      answers[i] = await new Promise((resolve) => screen(answerForm(letter, categories, names[i], seconds, resolve)));
      if (disposed) return;
    }
    const points = scoreAnswers(letter, categories, answers, scores);
    const payload = { round, letter, categories, answers, points, scores: scores.slice(), names };
    screen(resultView(ctx, payload, localReadyGate(names, playRound, { label: "Next letter" })));
  }

  playRound();
}

export default game;
