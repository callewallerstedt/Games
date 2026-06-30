// Letter Categories: fill selected categories with answers beginning with one letter.
import {
  el, render, button, pill, connectionPill, passDevice, gameHeader, celebrate,
  scoreboard, setGameCleanup,
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
      <li>When time is up, scores appear instantly: <b>unique = 2 pts</b>, <b>shared = 1 pt</b>, blank or wrong = 0.</li>
      <li>The host can tap any score to change it (0 / 1 / 2) if they disagree.</li>
      <li>The host taps <b>Next letter</b> and everyone jumps straight into the next round.</li>
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

function computeSuggestedPoints(letter, categories, answers) {
  const points = answers.map(() => categories.map(() => 0));
  categories.forEach((_, categoryIndex) => {
    const values = answers.map((row) => normalize(row?.[categoryIndex]));
    const counts = new Map();
    values.forEach((value) => { if (value) counts.set(value, (counts.get(value) || 0) + 1); });
    values.forEach((value, playerIndex) => {
      const valid = value && value.startsWith(letter.toLowerCase());
      if (!valid) return;
      const count = counts.get(value);
      points[playerIndex][categoryIndex] = count === 1 ? 2 : count >= 2 ? 1 : 0;
    });
  });
  return points;
}

function resultView(ctx, payload, opts = {}) {
  const categoryBlocks = payload.categories.map((category, categoryIndex) => el("section", { class: "category-result" }, [
    el("h3", {}, category),
    ...payload.names.map((name, playerIndex) => {
      const answer = payload.answers[playerIndex]?.[categoryIndex] || "No answer";
      const point = payload.points[playerIndex]?.[categoryIndex] || 0;
      const label = point ? `+${point}` : "0";
      const pointEl = opts.editable
        ? el("button", { class: `category-point edit p${point}`, title: "Tap to change points (0 / 1 / 2)", onClick: () => opts.onAdjust(playerIndex, categoryIndex) }, label)
        : el("span", { class: `category-point p${point}` }, point ? `+${point}` : "");
      return el("div", { class: `answer-card ${point ? "me" : ""}` }, [
        el("span", { class: "who" }, name),
        el("span", { class: "val" }, answer),
        pointEl,
      ]);
    }),
  ]));
  return el("div", { class: "screen" }, [
    el("div", { class: "category-result-head" }, [
      el("div", { class: "category-letter small" }, payload.letter),
      el("div", {}, [el("h2", {}, "Round results"), el("p", { class: "muted" }, opts.editable ? "Tap any score to change it." : "Scores chosen by the host.")]),
    ]),
    el("div", { class: "category-results" }, categoryBlocks),
    scoreboard(payload.names, payload.scores, { colors: ctx.playerColors }),
    el("div", { class: "footer-actions" }, opts.footer),
  ]);
}

function online(ctx) {
  const { session } = ctx;
  const names = session.players;
  const categories = Array.isArray(session.settings.categories) && session.settings.categories.length >= 3
    ? session.settings.categories : DEFAULT_CATEGORIES;
  const seconds = Number(session.settings.roundSeconds) || 60;
  const scores = names.map(() => 0);
  let baseScores = scores.slice();   // scores before the current round
  let roundPoints = null;            // editable per-answer points for this round
  let answers = names.map(() => null);
  let letter = "A";
  let round = 0;
  let hostTimeout = null;
  let celebrated = false;
  let revealed = false;
  let disposed = false;
  setGameCleanup(() => { disposed = true; clearTimeout(hostTimeout); });
  const status = connectionPill();
  session.onStatus(status.set);
  ctx._statusNode = status.node;
  const screen = (body) => { if (!disposed) render(el("div", { class: "screen" }, [gameHeader(ctx, game, status.node), body])); };

  function startRound() {
    if (!session.isHost) return;
    clearTimeout(hostTimeout);
    celebrated = false;
    revealed = false;
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

  // Time's up (or everyone submitted): auto-score and reveal results instantly —
  // no slow one-by-one host review, no waiting on every player to ready up.
  function finishRound() {
    if (!session.isHost || disposed || revealed) return;
    revealed = true;
    clearTimeout(hostTimeout);
    answers = answers.map((row) => row || categories.map(() => ""));
    baseScores = scores.slice();
    roundPoints = computeSuggestedPoints(letter, categories, answers);
    applyRoundPoints();
    broadcastReveal();
    showHostResult();
  }

  function applyRoundPoints() {
    baseScores.forEach((base, playerIndex) => {
      scores[playerIndex] = base + roundPoints[playerIndex].reduce((sum, point) => sum + point, 0);
    });
  }

  function broadcastReveal() {
    session.send("cat_reveal", { round, letter, categories, answers, points: roundPoints, scores: scores.slice(), names });
  }

  // Host taps a score → cycle 0 → 1 → 2, rescore, and push the update live.
  function adjustPoint(playerIndex, categoryIndex) {
    roundPoints[playerIndex][categoryIndex] = (roundPoints[playerIndex][categoryIndex] + 1) % 3;
    applyRoundPoints();
    broadcastReveal();
    showHostResult();
  }

  function maybeCelebrate(payload) {
    if (!celebrated && payload.points.some((row) => row.some(Boolean))) { celebrated = true; celebrate(); }
  }

  function showHostResult() {
    const payload = { round, letter, categories, answers, points: roundPoints, scores: scores.slice(), names };
    maybeCelebrate(payload);
    screen(resultView(ctx, payload, {
      editable: true,
      onAdjust: adjustPoint,
      footer: button("Next letter ▶", { big: true, onClick: startRound }),
    }));
  }

  function showGuestResult(payload) {
    maybeCelebrate(payload);
    screen(resultView(ctx, payload, {
      editable: false,
      footer: el("div", { class: "waiting compact-wait" }, [el("div", { class: "spinner" }), "Host is picking the next letter…"]),
    }));
  }

  session.on("cat_round", (message) => { if (!session.isHost) { celebrated = false; round = message.round; letter = message.letter; answers = names.map(() => null); showForm(message); } });
  session.on("cat_answers", (message) => {
    if (!session.isHost || message.round !== round || answers[message.from] != null) return;
    answers[message.from] = message.values;
    maybeFinish();
  });
  session.on("cat_reveal", (message) => { if (!session.isHost) showGuestResult(message); });

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
  ctx._statusNode = status;
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
    const points = computeSuggestedPoints(letter, categories, answers);
    if (names.length > 1) { await passDevice(names[0], "Review & score this round"); if (disposed) return; }
    const base = scores.slice();
    const apply = () => base.forEach((b, pi) => { scores[pi] = b + points[pi].reduce((sum, point) => sum + point, 0); });
    apply();
    let celebratedLocal = false;
    const show = () => {
      if (!celebratedLocal && points.some((row) => row.some(Boolean))) { celebratedLocal = true; celebrate(); }
      screen(resultView(ctx, { round, letter, categories, answers, points, scores: scores.slice(), names }, {
        editable: true,
        onAdjust: (pi, ci) => { points[pi][ci] = (points[pi][ci] + 1) % 3; apply(); show(); },
        footer: button("Next letter ▶", { big: true, onClick: () => { if (!disposed) playRound(); } }),
      }));
    };
    show();
  }

  playRound();
}

export default game;
