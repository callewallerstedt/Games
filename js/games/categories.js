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
      <li>When time is up, the host reviews every answer in order.</li>
      <li>For each answer the host can <b>decline</b> it or confirm it for <b>1</b> or <b>2 points</b>.</li>
      <li>Unique answers usually earn 2 pts; shared answers usually earn 1 pt each — but the host decides.</li>
      <li>Everyone sees the final scores, then readies up for a new letter.</li>
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

function suggestedHint(letter, answer, suggested) {
  const value = normalize(answer);
  if (!value) return "No answer — usually 0 pts";
  if (!value.startsWith(letter.toLowerCase())) return `Doesn't start with ${letter} — usually 0 pts`;
  if (suggested === 2) return "Nobody else wrote this — usually 2 pts";
  if (suggested === 1) return "Someone else wrote the same thing — usually 1 pt";
  return "Usually 0 pts";
}

function reviewItems(categories, names) {
  const items = [];
  categories.forEach((category, categoryIndex) => {
    names.forEach((name, playerIndex) => {
      items.push({ category, categoryIndex, name, playerIndex });
    });
  });
  return items;
}

function hostReviewScreen(ctx, payload, onComplete) {
  const { letter, categories, answers, names, suggestedPoints } = payload;
  const items = reviewItems(categories, names);
  let index = 0;
  const finalPoints = answers.map(() => categories.map(() => 0));

  function showStep() {
    if (index >= items.length) {
      onComplete(finalPoints);
      return;
    }

    const item = items[index];
    const answer = answers[item.playerIndex]?.[item.categoryIndex] || "";
    const suggested = suggestedPoints[item.playerIndex]?.[item.categoryIndex] || 0;
    const displayAnswer = answer || "No answer";
    const decide = (points) => {
      finalPoints[item.playerIndex][item.categoryIndex] = points;
      index++;
      showStep();
    };

    const categoryContext = names.map((name, playerIndex) => {
      const rowAnswer = answers[playerIndex]?.[item.categoryIndex] || "No answer";
      const isCurrent = playerIndex === item.playerIndex;
      const itemIdx = items.findIndex((entry) => entry.categoryIndex === item.categoryIndex && entry.playerIndex === playerIndex);
      const priorPoints = itemIdx >= 0 && itemIdx < index ? finalPoints[playerIndex][item.categoryIndex] : null;
      return el("div", { class: `answer-card ${isCurrent ? "me category-review-current" : ""} ${priorPoints != null ? "category-review-done" : ""}` }, [
        el("span", { class: "who" }, name),
        el("span", { class: "val" }, `${rowAnswer}${priorPoints ? `  +${priorPoints}` : priorPoints === 0 ? "  0" : ""}`),
      ]);
    });

    render(el("div", { class: "screen" }, [
      gameHeader(ctx, game, ctx._statusNode),
      el("div", { class: "category-result-head" }, [
        el("div", { class: "category-letter small" }, letter),
        el("div", {}, [
          el("h2", {}, "Host review"),
          el("p", { class: "muted" }, `${item.category} · ${index + 1} of ${items.length}`),
        ]),
      ]),
      el("section", { class: "category-result" }, [
        el("h3", {}, item.category),
        ...categoryContext,
      ]),
      el("div", { class: "category-review-focus card" }, [
        el("div", { class: "pill" }, "Your call"),
        el("div", { class: "category-review-answer" }, [
          el("span", { class: "who" }, item.name),
          el("span", { class: "val" }, displayAnswer),
        ]),
        el("p", { class: "muted tiny center" }, suggestedHint(letter, answer, suggested)),
      ]),
      el("div", { class: "footer-actions" }, [
        el("div", { class: "btn-row" }, [
          button("Decline", { variant: "secondary", big: true, onClick: () => decide(0) }),
          button("1 pt", { big: true, onClick: () => decide(1) }),
          button("2 pts", { big: true, onClick: () => decide(2) }),
        ]),
      ]),
    ]));
  }

  showStep();
}

function waitingForHostReview() {
  return el("div", { class: "card center" }, [
    el("div", { class: "spinner" }),
    el("p", { class: "muted" }, "The host is reviewing everyone's answers."),
  ]);
}

function applyPoints(points, scores) {
  points.forEach((row, playerIndex) => {
    row.forEach((point) => { if (point) scores[playerIndex] += point; });
  });
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
      el("div", {}, [el("h2", {}, "Round results"), el("p", { class: "muted" }, "Scores chosen by the host for this round.")]),
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
  ctx._statusNode = status.node;
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
    const suggestedPoints = computeSuggestedPoints(letter, categories, answers);
    const reviewPayload = { round, letter, categories, answers, names, suggestedPoints };
    session.send("cat_review", reviewPayload);
    startHostReview(reviewPayload);
  }

  function startHostReview(reviewPayload) {
    if (session.isHost) {
      hostReviewScreen(ctx, reviewPayload, (points) => {
        applyPoints(points, scores);
        const payload = { round, letter, categories, answers, points, scores: scores.slice(), names };
        session.send("cat_reveal", payload);
        showResult(payload);
      });
    } else {
      screen(waitingForHostReview());
    }
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
  session.on("cat_review", (message) => { if (!session.isHost) startHostReview(message); });
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
    const suggestedPoints = computeSuggestedPoints(letter, categories, answers);
    await passDevice(names[0], "Review everyone's answers");
    if (disposed) return;
    const points = await new Promise((resolve) => {
      hostReviewScreen(ctx, { letter, categories, answers, names, suggestedPoints }, resolve);
    });
    if (disposed) return;
    applyPoints(points, scores);
    const payload = { round, letter, categories, answers, points, scores: scores.slice(), names };
    screen(resultView(ctx, payload, localReadyGate(names, playRound, { label: "Next letter" })));
  }

  playRound();
}

export default game;
