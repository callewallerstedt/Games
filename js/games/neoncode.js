// "Neon Code" — a competitive code-making and deduction duel.

import { el, render, button, pill, connectionPill, passDevice, gameHeader, scoreChip, celebrate, haptic, onlineReadyGate, localReadyGate } from "../ui.js";

const CODE_LENGTH = 4;
const MAX_ATTEMPTS = 8;
const TOKENS = [
  { id: "pink", name: "Pink diamond", glyph: "◆", color: "#ff4f9a" },
  { id: "cyan", name: "Cyan circle", glyph: "●", color: "#20c8e8" },
  { id: "amber", name: "Amber triangle", glyph: "▲", color: "#ffb020" },
  { id: "violet", name: "Violet square", glyph: "■", color: "#8b5cf6" },
  { id: "green", name: "Green star", glyph: "★", color: "#20b878" },
  { id: "red", name: "Red cross", glyph: "✚", color: "#ef4f55" },
];

const game = {
  id: "neoncode",
  title: "Neon Code",
  emoji: "🔐",
  color: "linear-gradient(135deg,#15162b,#8b5cf6 55%,#20c8e8)",
  blurb: "Build a secret pattern. Crack it with logic before your guesses run out.",
  minPlayers: 2,
  maxPlayers: 2,
  modes: ["local", "online"],
  estMinutes: 12,
  rulesHTML: `
    <p>Take turns as <b>Codemaker</b> and <b>Codebreaker</b>.</p>
    <ol>
      <li>The Codemaker creates a hidden sequence of four neon symbols. Repeats are allowed.</li>
      <li>The Codebreaker has <b>${MAX_ATTEMPTS} guesses</b>.</li>
      <li>After every guess, <b>Exact</b> tells how many symbols are correct and in the right slot. <b>Near</b> tells how many other symbols belong in the code but are in the wrong slots.</li>
      <li>The feedback gives totals only — it never reveals which slots matched.</li>
    </ol>
    <p class="muted">Crack it quickly for more points. If the code survives all guesses, the Codemaker scores.</p>`,
  mount(ctx) { ctx.mode === "online" ? online(ctx) : local(ctx); },
};

export function scoreGuess(secret, guess) {
  let exact = 0;
  const remainingSecret = new Map();
  const remainingGuess = [];
  for (let i = 0; i < CODE_LENGTH; i++) {
    if (secret[i] === guess[i]) exact++;
    else {
      remainingSecret.set(secret[i], (remainingSecret.get(secret[i]) || 0) + 1);
      remainingGuess.push(guess[i]);
    }
  }
  let near = 0;
  for (const token of remainingGuess) {
    const left = remainingSecret.get(token) || 0;
    if (left > 0) {
      near++;
      remainingSecret.set(token, left - 1);
    }
  }
  return { exact, near };
}

function tokenById(id) {
  return TOKENS.find((token) => token.id === id);
}

function peg(id, className = "") {
  const token = tokenById(id);
  return el("span", {
    class: `nc-peg ${className}`.trim(),
    style: token ? `--peg:${token.color}` : "",
    "aria-label": token?.name || "Empty slot",
  }, token?.glyph || "");
}

function slots(values, hidden = false) {
  return el("div", { class: "nc-slots", "aria-label": hidden ? "Hidden four-symbol code" : "Four-symbol code" },
    Array.from({ length: CODE_LENGTH }, (_, i) => hidden && values[i] ? peg(null, "hidden") : peg(values[i], values[i] ? "filled" : "empty")));
}

function picker(onPick) {
  return el("div", { class: "nc-picker" }, TOKENS.map((token) =>
    el("button", {
      class: "nc-token",
      type: "button",
      style: `--peg:${token.color}`,
      "aria-label": `Add ${token.name}`,
      onClick: () => onPick(token.id),
    }, token.glyph)));
}

function composer(renderInto, title, onDone) {
  let code = [];
  function draw() {
    renderInto(el("div", { class: "screen" }, [
      el("div", { class: "nc-role maker" }, [el("span", {}, "CODEMAKER"), el("b", {}, title)]),
      el("div", { class: "card nc-console" }, [
        el("p", { class: "muted center" }, "Choose four symbols. Repeats are allowed."),
        slots(code),
        picker((id) => { if (code.length < CODE_LENGTH) { code.push(id); haptic(7); draw(); } }),
        el("div", { class: "btn-row", style: "margin-top:14px" }, [
          button("Delete", { variant: "secondary", disabled: !code.length, onClick: () => { code.pop(); draw(); } }),
          button("Clear", { variant: "ghost", disabled: !code.length, onClick: () => { code = []; draw(); } }),
        ]),
      ]),
      el("div", { class: "footer-actions" }, button("Lock secret code →", {
        big: true,
        disabled: code.length !== CODE_LENGTH,
        onClick: () => onDone(code.slice()),
      })),
    ]));
  }
  draw();
}

function guessComposer(renderInto, title, history, onDone) {
  let guess = [];
  function draw() {
    renderInto(el("div", { class: "screen" }, [
      el("div", { class: "nc-role breaker" }, [
        el("span", {}, "CODEBREAKER"),
        el("b", {}, title),
        el("small", {}, `${MAX_ATTEMPTS - history.length} guesses left`),
      ]),
      historyBoard(history),
      el("div", { class: "card nc-console" }, [
        slots(guess),
        picker((id) => { if (guess.length < CODE_LENGTH) { guess.push(id); haptic(7); draw(); } }),
        el("div", { class: "btn-row", style: "margin-top:14px" }, [
          button("Delete", { variant: "secondary", disabled: !guess.length, onClick: () => { guess.pop(); draw(); } }),
          button("Submit guess", { disabled: guess.length !== CODE_LENGTH, onClick: () => onDone(guess.slice()) }),
        ]),
      ]),
    ]));
  }
  draw();
}

function historyBoard(history) {
  if (!history.length) {
    return el("div", { class: "nc-empty-history" }, "No clues yet — make your first guess.");
  }
  return el("div", { class: "nc-history" }, history.map((entry, index) =>
    el("div", { class: "nc-history-row" }, [
      el("span", { class: "nc-attempt" }, String(index + 1)),
      el("div", { class: "nc-mini-code" }, entry.guess.map((id) => peg(id))),
      el("div", { class: "nc-feedback" }, [
        el("span", { class: "exact" }, `${entry.exact} exact`),
        el("span", { class: "near" }, `${entry.near} near`),
      ]),
    ])));
}

function waitingCard(role, message, history = []) {
  return el("div", { class: "screen" }, [
    el("div", { class: `nc-role ${role}` }, [el("span", {}, role === "maker" ? "CODEMAKER" : "CODEBREAKER"), el("b", {}, message)]),
    historyBoard(history),
    el("div", { class: "waiting" }, [el("div", { class: "spinner" }), "Waiting for the next move…"]),
  ]);
}

function resultView(names, maker, breaker, secret, history, scores, onNext) {
  const solved = history.at(-1)?.exact === CODE_LENGTH;
  if (solved) celebrate();
  return el("div", { class: "screen" }, [
    el("div", { class: `verdict ${solved ? "match" : "nomatch"}` }, solved
      ? `🔓 ${names[breaker]} cracked it in ${history.length}!`
      : `🛡️ ${names[maker]}'s code survived!`),
    el("div", { class: "card nc-reveal" }, [
      el("div", { class: "tiny muted center" }, "The secret code"),
      slots(secret),
    ]),
    historyBoard(history),
    el("div", { class: "scorebar" }, names.map((name, i) => scoreChip(scores[i], name))),
    el("div", { class: "footer-actions" }, button("Swap roles →", { big: true, onClick: onNext })),
  ]);
}

function ownCodeCard(secret, history) {
  return el("div", { class: "card nc-reveal" }, [
    el("div", { class: "tiny muted center" }, "Your secret code"),
    slots(secret),
    history.length ? el("div", { class: "tiny muted center", style: "margin-top:8px" }, "Guesses against it") : null,
    history.length ? historyBoard(history) : null,
  ]);
}

function duelResultView(names, secrets, histories, scores, onNext, readyNode) {
  const solved = histories.map((h) => h.at(-1)?.exact === CODE_LENGTH);
  if (solved.some(Boolean)) celebrate();
  return el("div", { class: "screen" }, [
    el("div", { class: "verdict match" }, "Round complete"),
    el("div", { class: "nc-duel-results" }, names.map((name, i) => el("div", { class: "card nc-reveal" }, [
      el("div", { class: "tiny muted center" }, `${name}'s code`),
      slots(secrets[i]),
      el("div", { class: `verdict ${solved[i] ? "match" : "nomatch"}`, style: "margin-top:10px" },
        solved[i] ? `Cracked in ${histories[i].length}` : "Code survived"),
      historyBoard(histories[i]),
    ]))),
    el("div", { class: "scorebar" }, names.map((name, i) => scoreChip(scores[i], name))),
    el("div", { class: "footer-actions" }, readyNode || localReadyGate(names, onNext, { label: "ready" })),
  ]);
}

function local(ctx) {
  const names = ctx.players;
  const scores = [0, 0];
  const statusEl = pill("Pass & play");
  let round = 0;
  const screen = (body) => render(el("div", { class: "screen" }, [gameHeader(ctx, game, statusEl), body]));

  async function playRound() {
    const secrets = [null, null];
    const histories = [[], []]; // history[i] = guesses against player i's code
    const done = [false, false];
    for (let i = 0; i < 2; i++) {
      await passDevice(names[i], "Create your secret neon code");
      secrets[i] = await new Promise((resolve) => composer(screen, `${names[i]}, build your code`, resolve));
    }

    let turn = round % 2;
    async function takeTurn() {
      if (done[0] && done[1]) {
        screen(duelResultView(names, secrets, histories, scores, () => { round++; playRound(); }));
        return;
      }
      const breaker = turn % 2;
      const owner = 1 - breaker;
      if (done[owner]) { turn++; takeTurn(); return; }
      await passDevice(names[breaker], `Crack ${names[owner]}'s code`);
      const guess = await new Promise((resolve) => {
        const renderGuess = (body) => screen(el("div", { class: "screen" }, [ownCodeCard(secrets[breaker], histories[breaker]), body]));
        guessComposer(renderGuess, `${names[breaker]}, crack the pattern`, histories[owner], resolve);
      });
      const feedback = scoreGuess(secrets[owner], guess);
      histories[owner].push({ guess, ...feedback });
      const solved = feedback.exact === CODE_LENGTH;
      done[owner] = solved || histories[owner].length >= MAX_ATTEMPTS;
      if (done[owner]) {
        if (solved) scores[breaker] += MAX_ATTEMPTS - histories[owner].length + 1;
        else scores[owner] += 3;
      } else {
        haptic(feedback.exact ? [8, 18, 8] : 8);
      }
      turn++;
      takeTurn();
    }
    takeTurn();
  }

  playRound();
}

function online(ctx) {
  const { session } = ctx;
  const isHost = session.isHost;
  const myIdx = isHost ? 0 : 1;
  const names = session.players;
  const status = connectionPill();
  session.onStatus(status.set);
  const screen = (body) => render(el("div", { class: "screen" }, [gameHeader(ctx, game, status.node), body]));

  let round = 0;
  let turn = 0;
  let scores = [0, 0];
  let secrets = [null, null];
  let histories = [[], []]; // history[i] = guesses against player i's code
  let done = [false, false];
  let readySecrets = [false, false];
  let resultShown = false;

  const ownerForTurn = () => 1 - (turn % 2);
  const breakerForTurn = () => turn % 2;

  function beginRound() {
    turn = round % 2;
    secrets = [null, null];
    histories = [[], []];
    done = [false, false];
    readySecrets = [false, false];
    resultShown = false;
    composer(screen, "Build your secret code", (code) => {
      secrets[myIdx] = code;
      readySecrets[myIdx] = true;
      session.send("nc_secret_ready", { round, player: myIdx });
      if (isHost) maybeStartBreaking();
      screen(waitingCard("maker", `${names[1 - myIdx]} is locking their code`, []));
    });
  }

  function maybeStartBreaking() {
    if (!isHost || !readySecrets[0] || !readySecrets[1]) return;
    session.send("nc_turn", { round, turn, scores, histories, done });
    showTurn();
  }

  function showTurn() {
    if (done[0] && done[1]) { showResult(); return; }
    while (done[ownerForTurn()]) turn++;
    const breaker = breakerForTurn();
    const owner = ownerForTurn();
    if (isHost) session.send("nc_turn", { round, turn, scores, histories, done });
    if (myIdx === breaker) {
      const renderGuess = (body) => screen(el("div", { class: "screen" }, [ownCodeCard(secrets[myIdx], histories[myIdx]), body]));
      guessComposer(renderGuess, `Crack ${names[owner]}'s pattern`, histories[owner], (guess) => {
        session.send("nc_guess", { round, turn, guess, breaker, owner });
        screen(waitingCard("breaker", "Guess sent", histories[owner]));
      });
    } else {
      screen(el("div", { class: "screen" }, [
        el("div", { class: "nc-role maker" }, [el("span", {}, "CODEMAKER"), el("b", {}, `${names[breaker]} is guessing your code`)]),
        ownCodeCard(secrets[myIdx], histories[myIdx]),
        el("div", { class: "waiting" }, [el("div", { class: "spinner" }), "Waiting for their guess..."]),
      ]));
    }
  }

  function applyFeedback(m) {
    if (m.round !== round || !m.entry) return;
    histories[m.owner].push(m.entry);
    done[m.owner] = !!m.done;
    scores = m.scores;
    if (m.secret) secrets[m.owner] = m.secret;
    if (m.done && m.entry.exact === CODE_LENGTH) haptic([8, 18, 8]);
  }

  function scoreIncomingGuess(m) {
    if (m.round !== round || m.owner !== myIdx || !secrets[myIdx]) return;
    const feedback = scoreGuess(secrets[myIdx], m.guess);
    const nextHistory = histories[myIdx].concat({ guess: m.guess, ...feedback });
    const solved = feedback.exact === CODE_LENGTH;
    const codeDone = solved || nextHistory.length >= MAX_ATTEMPTS;
    const nextScores = scores.slice();
    if (codeDone && !done[myIdx]) {
      if (solved) nextScores[m.breaker] += MAX_ATTEMPTS - nextHistory.length + 1;
      else nextScores[myIdx] += 3;
    }
    const payload = {
      round,
      turn: m.turn,
      owner: myIdx,
      breaker: m.breaker,
      entry: { guess: m.guess, ...feedback },
      done: codeDone,
      secret: codeDone ? secrets[myIdx] : null,
      scores: nextScores,
    };
    applyFeedback(payload);
    session.send("nc_feedback", payload);
    screen(waitingCard("maker", codeDone ? "Your code is finished" : `${names[m.breaker]} gets another clue`, histories[myIdx]));
    if (isHost) advanceAfterFeedback();
  }

  function advanceAfterFeedback() {
    if (!isHost) return;
    if (done[0] && done[1]) {
      session.send("nc_result", { round, secrets, histories, scores });
      showResult();
      return;
    }
    turn++;
    showTurn();
  }

  function showResult() {
    if (resultShown) return;
    resultShown = true;
    const ready = onlineReadyGate(session, `nc:${round}:result`, () => {
      if (isHost) {
        round++;
        session.send("nc_round", { round, scores });
        beginRound();
      }
    }, { label: "Ready for next duel ->" });
    screen(duelResultView(names, secrets, histories, scores, null, ready));
  }

  session.on("nc_round", (m) => {
    round = m.round;
    scores = m.scores;
    beginRound();
  });

  session.on("nc_secret_ready", (m) => {
    if (m.round !== round) return;
    readySecrets[m.player] = true;
    maybeStartBreaking();
  });

  session.on("nc_turn", (m) => {
    if (m.round !== round) return;
    turn = m.turn;
    scores = m.scores;
    histories = m.histories;
    done = m.done;
    showTurn();
  });

  session.on("nc_guess", scoreIncomingGuess);

  session.on("nc_feedback", (m) => {
    applyFeedback(m);
    if (isHost) advanceAfterFeedback();
    else if (done[0] && done[1]) showResult();
    else screen(waitingCard("breaker", "Waiting for the next turn", histories[ownerForTurn()] || []));
  });

  session.on("nc_result", (m) => {
    if (m.round !== round) return;
    secrets = m.secrets;
    histories = m.histories;
    scores = m.scores;
    done = [true, true];
    showResult();
  });

  if (isHost) {
    session.send("nc_round", { round, scores });
    beginRound();
  } else {
    screen(waitingCard("breaker", `Waiting for ${session.partnerName} to start`));
  }
}

export default game;
