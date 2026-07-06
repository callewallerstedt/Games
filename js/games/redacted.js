// "Redacted" — a cooperative trivia game of the black marker.
//
// Each round pairs one CLUE GIVER against the rest of the table as GUESSERS, all
// on the same team. The clue giver alone sees the full question and its answer,
// and blacks out as many words as they dare. The guessers see only what survived
// the marker and must name the answer.
//
//   Question: "What prison is located on an island near San Francisco?"
//   Answer:   Alcatraz
//   Redacted: ▬▬ ▬▬ ▬▬ ▬▬ ▬▬ ▬▬ ▬▬ San Francisco?
//
// Score = number of blacked-out words, but ONLY if a guesser gets it right. Hide
// more to score more — hide too much and nobody can answer. It's one shared team
// total; the clue giver's job is to leave the perfect breadcrumb.
//
// Local play is pass-and-play (the marker phase and each guess are private, gated
// behind a "hand me the phone" screen). Online is host-authoritative like Jeopardy:
// the host owns the answer and NEVER ships it to a guesser before the reveal — the
// redacted words are stripped out server-side, so peeking at the wire shows nothing.

import {
  el, render, button, gameHeader, passDevice, scoreChip, shuffle, celebrate,
  haptic, connectionPill, onlineReadyGate, localReadyGate, setGameCleanup,
  recordStandings, PLAYER_COLORS,
} from "../ui.js";
import { QUESTIONS } from "../data/redacted.js";

// If a guesser's connection drops mid-round, don't hang the team forever.
const STALL_TIMEOUT_MS = 60000;

const game = {
  id: "redacted",
  title: "Redacted",
  emoji: "🖊️",
  color: "linear-gradient(135deg,#1f2937,#111827 60%,#4b5563)",
  blurb: "Black out the question — the fewer words left, the bigger the score.",
  minPlayers: 2,
  maxPlayers: 8,
  onlineMaxPlayers: 8,
  pickColors: true,
  modes: ["local", "online"],
  estMinutes: 15,
  rulesHTML: `
    <p>A cooperative trivia game — everyone's on the <b>same team</b>.</p>
    <ol>
      <li>Each round one player is the <b>clue giver</b> and sees the full question
        <i>and</i> the answer.</li>
      <li>They tap words to <b>black them out</b>, leaving just enough for a teammate
        to guess.</li>
      <li>The <b>guessers</b> see only the redacted question and type their answer.</li>
      <li><b>Right</b> → the team scores <b>one point per blacked-out word</b>.
        <b>Wrong</b> → zero.</li>
    </ol>
    <p>Hide as many words as you dare. The clue giver role passes around the table
    each round, and the team total keeps climbing.</p>
    <p class="muted">On a single phone, pass it to whoever the screen asks for — the
    answer stays hidden from the guessers.</p>`,
  mount(ctx) {
    if (ctx.mode === "online") online(ctx);
    else local(ctx);
  },
};

/* --------------------------------- helpers -------------------------------- */

// Loose answer match: case-insensitive, punctuation- and accent-insensitive,
// whitespace-collapsed, and forgiving of a leading article.
function normalize(s) {
  return String(s == null ? "" : s)
    .toLowerCase()
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(the|a|an)\s+/, "");
}
function isCorrect(guess, entry) {
  const g = normalize(guess);
  if (!g) return false;
  const accepted = [entry.answer, ...(entry.alts || [])].map(normalize);
  return accepted.includes(g);
}

const tokenize = (question) => String(question).trim().split(/\s+/);

// Render a question as word chips. `hidden` is a Set of indices.
// mode: "editor" (giver taps to toggle, hidden words stay faintly readable),
//       "masked" (guessers/others — hidden words are solid bars, text gone),
//       "reveal" (full text, previously-hidden words highlighted).
function wordRow(tokens, hidden, mode, onToggle) {
  return el("div", { class: `red-words red-words-${mode}` }, tokens.map((tok, i) => {
    const isHidden = hidden.has(i);
    if (mode === "masked") {
      return isHidden
        ? el("span", { class: "red-word masked", "aria-label": "redacted word" }, " ")
        : el("span", { class: "red-word shown" }, tok);
    }
    if (mode === "reveal") {
      return el("span", { class: `red-word ${isHidden ? "was-hidden" : "shown"}` }, tok);
    }
    // editor
    return el("button", {
      type: "button",
      class: `red-word chip ${isHidden ? "hidden" : "shown"}`,
      "aria-pressed": isHidden ? "true" : "false",
      onClick: () => { haptic(6); onToggle(i); },
    }, tok);
  }));
}

function categoryTag(text) {
  return el("div", { class: "red-cat" }, [el("span", { class: "red-cat-dot" }), text]);
}

function waitingCard(msg) {
  return el("div", { class: "card center" }, [el("div", { class: "waiting" }, [el("div", { class: "spinner" }), msg])]);
}

// The clue giver's marker screen. Returns a detached node; calls onSubmit(hiddenArray).
function clueEditor({ giverName, entry, onSubmit }) {
  const tokens = tokenize(entry.question);
  const hidden = new Set();

  const counter = el("div", { class: "red-count" });
  const submit = button("Send redacted clue →", { big: true, disabled: true, onClick: () => onSubmit(Array.from(hidden).sort((a, b) => a - b)) });

  const refresh = () => {
    const k = hidden.size;
    counter.textContent = k === 0
      ? "Tap words to black them out."
      : `${k} word${k === 1 ? "" : "s"} hidden · worth ${k} point${k === 1 ? "" : "s"} if guessed`;
    submit.disabled = k === 0;
  };

  const rowWrap = el("div", { class: "red-editor-words" });
  const draw = () => {
    rowWrap.replaceChildren(wordRow(tokens, hidden, "editor", (i) => {
      if (hidden.has(i)) hidden.delete(i); else hidden.add(i);
      draw(); refresh();
    }));
  };
  draw(); refresh();

  const bulk = el("div", { class: "red-bulk" }, [
    button("Hide all", { variant: "secondary", onClick: () => { tokens.forEach((_, i) => hidden.add(i)); draw(); refresh(); } }),
    button("Show all", { variant: "secondary", onClick: () => { hidden.clear(); draw(); refresh(); } }),
  ]);

  return el("div", { class: "card red-editor" }, [
    el("div", { class: "pill" }, `${giverName} — clue giver`),
    categoryTag(entry.category),
    el("p", { class: "red-editor-hint muted tiny" }, "Tap words to redact them. Leave just enough for your team."),
    rowWrap,
    el("div", { class: "red-answer" }, [el("span", { class: "muted tiny" }, "Answer (only you can see)"), el("strong", {}, entry.answer)]),
    bulk,
    counter,
    el("div", { class: "footer-actions" }, submit),
  ]);
}

// The guesser's screen: redacted question + answer box. Calls onGuess(text).
function guessScreen({ guesserName, category, tokens, hidden, redactedCount, onGuess }) {
  const input = el("input", {
    class: "field", type: "text", placeholder: "Your answer…",
    autocomplete: "off", autocapitalize: "off", spellcheck: "false",
  });
  const btn = button("Lock in answer ✓", { big: true, disabled: true, onClick: () => onGuess(input.value) });
  input.addEventListener("input", () => { btn.disabled = input.value.trim() === ""; });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !btn.disabled) btn.click(); });
  setTimeout(() => input.focus(), 50);

  return el("div", { class: "card red-guess" }, [
    el("div", { class: "pill" }, `${guesserName} — guessing`),
    categoryTag(category),
    wordRow(tokens, new Set(hidden), "masked"),
    el("p", { class: "red-guess-hint muted tiny center" },
      `${redactedCount} word${redactedCount === 1 ? "" : "s"} blacked out — name the answer.`),
    el("div", { class: "stack" }, [input, btn]),
  ]);
}

// Shared reveal. `p` carries the full round outcome.
function revealScreen(names, colors, p, nextControl) {
  const { entry, tokens, hidden, correct, points, guessText, guesserIndex, giverIndex, teamScore, manualAccept } = p;
  const verdict = el("div", { class: `red-verdict ${correct ? "ok" : "bad"}` },
    correct
      ? `${manualAccept ? "Accepted" : "Correct"}! +${points}`
      : "Not this time — 0 points");

  const guessLine = (guesserIndex == null || !guessText)
    ? el("p", { class: "muted center tiny" }, "No one landed a guess in time.")
    : el("p", { class: "red-guessline center" }, [
        el("b", { style: `color:${colors[guesserIndex]}` }, names[guesserIndex]),
        " guessed ",
        el("q", { class: correct ? "ok-text" : "bad-text" }, guessText),
      ]);

  return el("div", { class: "screen red-reveal" }, [
    verdict,
    el("div", { class: "card center red-reveal-card" }, [
      categoryTag(entry.category),
      wordRow(tokens, new Set(hidden), "reveal"),
      el("div", { class: "red-answer-big" }, [el("span", { class: "muted tiny" }, "Answer"), el("strong", {}, entry.answer)]),
      el("p", { class: "muted tiny center" }, `${hidden.length} word${hidden.length === 1 ? "" : "s"} were blacked out by `,
      ),
      el("p", { class: "red-giverline center tiny" }, [el("b", { style: `color:${colors[giverIndex]}` }, names[giverIndex])]),
      guessLine,
    ]),
    el("div", { class: "red-team" }, [el("span", {}, "Team score"), el("strong", {}, String(teamScore))]),
    el("div", { class: "footer-actions" }, nextControl),
  ]);
}

function hostReviewPanel(names, colors, guesses, answer, allSubmitted, onAccept, onMiss) {
  const rows = guesses.map((g) => el("div", { class: "red-host-guess-row" }, [
    el("div", { class: "red-host-guess-meta" }, [
      el("b", { style: `color:${colors[g.from]}` }, names[g.from]),
      el("q", {}, g.text),
    ]),
    el("button", {
      class: "btn red-host-accept",
      type: "button",
      onClick: () => onAccept(g.from, g.text),
    }, "Accept ✓"),
  ]));
  return el("div", { class: "card red-host-panel" }, [
    el("div", { class: "red-host-head" }, [
      el("span", { class: "red-host-badge" }, "Host"),
      el("strong", {}, allSubmitted ? "Round decision" : "Review guesses"),
    ]),
    el("p", { class: "red-host-hint muted tiny center" },
      allSubmitted
        ? `No exact match for “${answer}”. Accept a close answer or mark the round wrong.`
        : "Accept a close answer even if it isn't an exact match."),
    guesses.length
      ? el("div", { class: "red-host-guesses" }, rows)
      : el("p", { class: "muted tiny center" }, "Waiting for guesses…"),
    allSubmitted && guesses.length
      ? el("div", { class: "footer-actions" }, button("No points this round", { variant: "secondary", onClick: onMiss }))
      : null,
  ]);
}

function adjudicationScreen({ giverName, entry, attempts, names, colors, onAccept, onSkip }) {
  return el("div", { class: "card red-host-panel" }, [
    el("div", { class: "pill" }, `${giverName} — accept a close answer?`),
    categoryTag(entry.category),
    el("p", { class: "red-host-hint muted tiny center" },
      `The answer is “${entry.answer}”. Tap Accept if a guess was close enough.`),
    el("div", { class: "red-host-guesses" }, attempts.map((a) => el("div", { class: "red-host-guess-row" }, [
      el("div", { class: "red-host-guess-meta" }, [
        el("b", { style: `color:${colors[a.index]}` }, names[a.index]),
        el("q", {}, a.text),
      ]),
      el("button", {
        class: "btn red-host-accept",
        type: "button",
        onClick: () => onAccept(a.index),
      }, "Accept ✓"),
    ]))),
    el("div", { class: "footer-actions" }, button("No — zero points", { variant: "secondary", onClick: onSkip })),
  ]);
}

function wrapRound(body, extra) {
  return extra ? el("div", { class: "red-round-stack" }, [body, extra]) : body;
}

/* ------------------------------ ONLINE (host) ----------------------------- */

function online(ctx) {
  const { session } = ctx;
  const isHost = session.isHost;
  const names = session.players;
  const n = names.length;
  const colors = names.map((_, i) => ctx.playerColors?.[i] || PLAYER_COLORS[i % PLAYER_COLORS.length]);

  // Host-authoritative state.
  let deck = shuffle(QUESTIONS);
  let di = 0;
  let round = 0;
  let teamScore = 0;
  const contrib = names.map(() => 0);   // per-player credit for the party leaderboard

  // Current round (host mirrors everything; guests learn only what's safe).
  let entry = null;           // host: full question+answer. guests: never set.
  let giverIndex = 0;
  let tokens = [];            // guests: full token list, but hidden words blanked
  let hidden = [];            // indices blacked out
  let resolved = false;
  const submitted = new Set();
  let guessesLog = [];
  let stall = null;
  let disposed = false;

  setGameCleanup(() => { disposed = true; clearTimeout(stall); });

  const status = connectionPill();
  session.onStatus(status.set);
  const screen = (b) => { if (!disposed) render(el("div", { class: "screen red-screen" }, [gameHeader(ctx, game, status.node), b])); };

  const isGiver = () => session.myIndex === giverIndex;

  /* ---- host round control ---- */

  function hostStartRound() {
    if (!isHost) return;
    if (di >= deck.length) { deck = shuffle(QUESTIONS); di = 0; }
    entry = deck[di++];
    giverIndex = round % n;
    round++;
    hidden = [];
    resolved = false;
    submitted.clear();
    guessesLog = [];
    clearTimeout(stall);

    const tk = tokenize(entry.question);
    // Everyone learns whose turn it is and the category. The giver ALSO gets the
    // full question + answer, privately.
    session.send("red_round", { round, giverIndex, category: entry.category, wordCount: tk.length });
    session.sendTo(giverIndex, "red_clue_task", {
      round, category: entry.category, question: entry.question, answer: entry.answer,
    });
    // Host renders its own view for this round.
    renderForRound({ waitingForClue: true, tokens: tk });
  }

  // Host receives the giver's chosen redaction and opens guessing.
  function hostOpenGuessing(m) {
    if (!isHost || m.round !== round || resolved) return;
    if (m.from !== giverIndex) return;
    const tk = tokenize(entry.question);
    const hid = (m.hidden || []).filter((i) => Number.isInteger(i) && i >= 0 && i < tk.length);
    if (!hid.length) return; // giver must hide at least one word
    hidden = hid;
    // Ship guessers a MASKED token list: blacked-out words are replaced so the
    // answer can't leak through the wire. The answer itself is never sent.
    const masked = tk.map((t, i) => (hidden.includes(i) ? "" : t));
    session.send("red_guess_open", {
      round, giverIndex, category: entry.category, tokens: masked, hidden, redactedCount: hidden.length,
    });
    tokens = tk;
    renderForRound({ guessing: true });
    clearTimeout(stall);
    stall = setTimeout(() => hostResolve(null, null), STALL_TIMEOUT_MS);
  }

  function hostHandleGuess(m) {
    if (!isHost || m.round !== round || resolved) return;
    if (m.from === giverIndex) return;
    submitted.add(m.from);
    const guess = { from: m.from, text: m.guess };
    const existing = guessesLog.findIndex((g) => g.from === m.from);
    if (existing >= 0) guessesLog[existing] = guess;
    else guessesLog.push(guess);
    if (isCorrect(m.guess, entry)) { hostResolve(m.from, m.guess, m.from); return; }
    renderForRound({ guessing: true, allSubmitted: submitted.size >= n - 1 });
  }

  function hostAcceptManual(from, text) {
    hostResolve(from, text, from, { manual: true });
  }

  function hostForceMiss() {
    const last = guessesLog[guessesLog.length - 1];
    hostResolve(null, last?.text || "", last?.from ?? null);
  }

  // correctIndex scores the round (null = miss); shownIndex/guessText are just the
  // attempt to echo on the reveal card.
  function hostResolve(correctIndex, guessText, shownIndex = correctIndex, { manual = false } = {}) {
    if (!isHost || resolved) return;
    resolved = true;
    clearTimeout(stall);
    const correct = correctIndex != null;
    const points = correct ? hidden.length : 0;
    if (correct) {
      teamScore += points;
      contrib[giverIndex] += points;
      contrib[correctIndex] += points;
    }
    recordStandings(names, contrib);
    const payload = {
      round, giverIndex, guesserIndex: guessText ? shownIndex : null, guessText: guessText || "",
      correct, points, teamScore, manualAccept: manual,
      question: entry.question, answer: entry.answer, alts: entry.alts || [],
      category: entry.category, hidden,
    };
    session.send("red_reveal", payload);
    showReveal(payload);
  }

  /* ---- host: broadcasting its own live view (host may be giver/guesser) ---- */

  function broadcastState() { /* state already pushed via explicit messages */ }

  function hostPanel(allSubmitted = false) {
    return hostReviewPanel(
      names, colors, guessesLog, entry.answer, allSubmitted,
      (from, text) => hostAcceptManual(from, text),
      () => hostForceMiss(),
    );
  }

  function renderForRound({ waitingForClue, guessing, allSubmitted } = {}) {
    // Host's own perspective of the current phase.
    if (waitingForClue) {
      if (isGiver()) {
        screen(clueEditor({
          giverName: names[giverIndex], entry,
          onSubmit: (hid) => { hidden = hid; hostApplyOwnClue(hid); },
        }));
      } else {
        screen(waitingCard(`${names[giverIndex]} is blacking out the clue…`));
      }
      return;
    }
    if (guessing) {
      let body;
      if (isGiver()) {
        body = el("div", { class: "card center" }, [
          el("div", { class: "pill" }, "Clue sent 🖊️"),
          categoryTag(entry.category),
          wordRow(tokenize(entry.question), new Set(hidden), "reveal"),
          waitingCard("Waiting for a teammate to answer…"),
        ]);
      } else if (submitted.has(session.myIndex)) {
        body = waitingCard("Locked in — waiting for the round to resolve…");
      } else {
        const tk = tokenize(entry.question);
        const masked = tk.map((t, i) => (hidden.includes(i) ? "" : t));
        body = guessScreen({
          guesserName: names[session.myIndex], category: entry.category,
          tokens: masked, hidden, redactedCount: hidden.length,
          onGuess: (text) => hostLocalGuess(text),
        });
      }
      screen(wrapRound(body, isHost ? hostPanel(allSubmitted) : null));
    }
  }

  // Host is the giver and just submitted its own redaction.
  function hostApplyOwnClue(hid) {
    hostOpenGuessing({ round, from: giverIndex, hidden: hid });
  }
  // Host is a guesser and just answered.
  function hostLocalGuess(text) {
    submitted.add(session.myIndex);
    screen(waitingCard("Locked in — waiting for the round to resolve…"));
    hostHandleGuess({ round, from: session.myIndex, guess: text });
  }

  function showReveal(p) {
    const tokens = tokenize(p.question);
    if (p.correct) celebrate(); else haptic(20);
    screen(revealScreen(names, colors, {
      entry: { category: p.category, question: p.question, answer: p.answer },
      tokens, hidden: p.hidden, correct: p.correct, points: p.points,
      guessText: p.guessText, guesserIndex: p.guesserIndex, giverIndex: p.giverIndex,
      teamScore: p.teamScore, manualAccept: p.manualAccept,
    }, onlineReadyGate(session, `redacted:${p.round}`, () => { if (isHost) hostStartRound(); }, { label: "Next round →" })));
  }

  /* ---- guest handlers ---- */

  session.on("red_round", (m) => {
    if (isHost) return;
    round = m.round; giverIndex = m.giverIndex; resolved = false; submitted.clear();
    entry = null; hidden = [];
    if (session.myIndex === giverIndex) {
      screen(waitingCard("Getting your secret question ready…"));
    } else {
      screen(waitingCard(`${names[giverIndex]} is blacking out the clue…`));
    }
  });

  session.on("red_clue_task", (m) => {
    if (isHost || m.round !== round || session.myIndex !== giverIndex) return;
    entry = { category: m.category, question: m.question, answer: m.answer };
    screen(clueEditor({
      giverName: names[giverIndex], entry,
      onSubmit: (hid) => {
        session.send("red_clue_submit", { round, hidden: hid });
        hidden = hid;
        screen(el("div", { class: "card center" }, [
          el("div", { class: "pill" }, "Clue sent 🖊️"),
          categoryTag(entry.category),
          wordRow(tokenize(entry.question), new Set(hid), "reveal"),
          waitingCard("Waiting for a teammate to answer…"),
        ]));
      },
    }));
  });

  session.on("red_guess_open", (m) => {
    if (isHost || m.round !== round) return;
    giverIndex = m.giverIndex; hidden = m.hidden; tokens = m.tokens;
    if (session.myIndex === giverIndex) return; // giver already waiting
    if (submitted.has(session.myIndex)) return;
    screen(guessScreen({
      guesserName: names[session.myIndex], category: m.category,
      tokens: m.tokens, hidden: m.hidden, redactedCount: m.redactedCount,
      onGuess: (text) => {
        submitted.add(session.myIndex);
        session.send("red_guess_submit", { round, guess: text });
        screen(waitingCard("Locked in — waiting for the round to resolve…"));
      },
    }));
  });

  session.on("red_clue_submit", (m) => { if (isHost) hostOpenGuessing(m); });
  session.on("red_guess_submit", (m) => { if (isHost) hostHandleGuess(m); });
  session.on("red_reveal", (m) => { if (!isHost) showReveal(m); });

  /* ---- boot ---- */

  if (isHost) {
    screen(el("div", { class: "card center red-intro" }, [
      el("div", { class: "red-logo" }, [el("span", { class: "red-bar" }), el("b", {}, "REDACTED")]),
      el("p", { class: "muted" }, `${n} players · one team · black out the clues`),
      el("div", { class: "footer-actions" }, button("Start →", { big: true, onClick: hostStartRound })),
    ]));
  } else {
    screen(el("div", { class: "card center red-intro" }, [
      el("div", { class: "red-logo" }, [el("span", { class: "red-bar" }), el("b", {}, "REDACTED")]),
      waitingCard(`Waiting for ${names[0]} to start…`),
    ]));
  }
}

/* -------------------------------- LOCAL ----------------------------------- */

function local(ctx) {
  const names = ctx.players;
  const n = names.length;
  const colors = names.map((_, i) => ctx.playerColors?.[i] || PLAYER_COLORS[i % PLAYER_COLORS.length]);
  let deck = shuffle(QUESTIONS);
  let di = 0;
  let round = 0;
  let teamScore = 0;
  const contrib = names.map(() => 0);

  const statusEl = el("span", { class: "pill" }, `Team · ${n} players`);
  const screen = (b) => render(el("div", { class: "screen red-screen" }, [gameHeader(ctx, game, statusEl), b]));

  async function playRound() {
    if (di >= deck.length) { deck = shuffle(QUESTIONS); di = 0; }
    const entry = deck[di++];
    const giverIndex = round % n;
    round++;
    const tokens = tokenize(entry.question);

    // 1) Clue giver blacks out words (private).
    await passDevice(names[giverIndex], "You're the clue giver — hide the words!");
    const hidden = await new Promise((res) => {
      screen(clueEditor({ giverName: names[giverIndex], entry, onSubmit: (hid) => res(hid) }));
    });

    // 2) Each other player guesses in turn (private) until someone's right.
    let correctIndex = null;   // scores the round
    let shownIndex = null;     // whose guess to echo on the reveal
    let guessText = "";
    let correct = false;
    let manualAccept = false;
    const attempts = [];
    const masked = tokens.map((t, i) => (hidden.includes(i) ? "" : t));
    for (let i = 0; i < n && !correct; i++) {
      if (i === giverIndex) continue;
      await passDevice(names[i], "Only you should see — guess the answer!");
      const text = await new Promise((res) => {
        screen(guessScreen({
          guesserName: names[i], category: entry.category,
          tokens: masked, hidden, redactedCount: hidden.length,
          onGuess: (t) => res(t),
        }));
      });
      shownIndex = i; guessText = text;
      attempts.push({ index: i, text });
      if (isCorrect(text, entry)) { correct = true; correctIndex = i; }
    }

    if (!correct && attempts.length) {
      await passDevice(names[giverIndex], "Accept a close answer?");
      const accepted = await new Promise((res) => {
        screen(adjudicationScreen({
          giverName: names[giverIndex], entry, attempts, names, colors,
          onAccept: (index) => res(index),
          onSkip: () => res(null),
        }));
      });
      if (accepted != null) {
        correct = true;
        correctIndex = accepted;
        manualAccept = true;
        const pick = attempts.find((a) => a.index === accepted);
        if (pick) { shownIndex = pick.index; guessText = pick.text; }
      }
    }

    const points = correct ? hidden.length : 0;
    if (correct) {
      teamScore += points;
      contrib[giverIndex] += points;
      contrib[correctIndex] += points;
    }
    recordStandings(names, contrib);
    if (correct) celebrate(); else haptic(20);

    screen(revealScreen(names, colors, {
      entry, tokens, hidden, correct, points, guessText, guesserIndex: shownIndex, giverIndex, teamScore, manualAccept,
    }, localReadyGate(names, playRound, { label: "Next round →" })));
  }

  screen(el("div", { class: "card center red-intro" }, [
    el("div", { class: "red-logo" }, [el("span", { class: "red-bar" }), el("b", {}, "REDACTED")]),
    el("p", { class: "muted" }, "One player hides the question, the rest guess. Same team, one growing score."),
    el("div", { class: "footer-actions" }, button("Start →", { big: true, onClick: playRound })),
  ]));
}

export default game;
