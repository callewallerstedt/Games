// "Neon Code" — a competitive code-making and deduction duel.

import { el, render, button, pill, connectionPill, passDevice, gameHeader, scoreChip, celebrate, haptic } from "../ui.js";

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

function local(ctx) {
  const names = ctx.players;
  const scores = [0, 0];
  const statusEl = pill("Pass & play");
  let round = 0;
  const screen = (body) => render(el("div", { class: "screen" }, [gameHeader(ctx, game, statusEl), body]));

  async function playRound() {
    const maker = round % 2;
    const breaker = 1 - maker;
    await passDevice(names[maker], "Create a secret neon code");
    const secret = await new Promise((resolve) => composer(screen, `${names[maker]}, build the code`, resolve));
    await passDevice(names[breaker], `Crack ${names[maker]}'s hidden code`);
    const history = [];

    function takeGuess() {
      guessComposer(screen, `${names[breaker]}, crack the pattern`, history, (guess) => {
        const feedback = scoreGuess(secret, guess);
        history.push({ guess, ...feedback });
        const solved = feedback.exact === CODE_LENGTH;
        const done = solved || history.length >= MAX_ATTEMPTS;
        if (done) {
          if (solved) scores[breaker] += MAX_ATTEMPTS - history.length + 1;
          else scores[maker] += 3;
          screen(resultView(names, maker, breaker, secret, history, scores, () => { round++; playRound(); }));
        } else {
          haptic(feedback.exact ? [8, 18, 8] : 8);
          takeGuess();
        }
      });
    }
    takeGuess();
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
  let scores = [0, 0];
  let secret = null;
  let history = [];

  const makerIdx = () => round % 2;
  const breakerIdx = () => 1 - makerIdx();

  function beginRound() {
    secret = null;
    history = [];
    if (myIdx === makerIdx()) {
      composer(screen, "Build a code your partner cannot crack", (code) => {
        secret = code;
        session.send("nc_ready", { round });
        screen(waitingCard("maker", `${names[breakerIdx()]} is studying your code`, history));
      });
    } else {
      screen(waitingCard("breaker", `${names[makerIdx()]} is building the code`, history));
    }
  }

  function showBreakerTurn() {
    guessComposer(screen, `Crack ${names[makerIdx()]}'s pattern`, history, (guess) => {
      session.send("nc_guess", { round, guess });
      screen(waitingCard("breaker", "Guess sent", history));
    });
  }

  function nextRound() {
    if (isHost) {
      round++;
      session.send("nc_round", { round, scores });
      beginRound();
    } else {
      session.send("nc_next");
    }
  }

  function showResult() {
    screen(resultView(names, makerIdx(), breakerIdx(), secret, history, scores, nextRound));
  }

  session.on("nc_round", (m) => {
    round = m.round;
    scores = m.scores;
    beginRound();
  });

  session.on("nc_ready", (m) => {
    if (m.round === round && myIdx === breakerIdx()) showBreakerTurn();
  });

  session.on("nc_guess", (m) => {
    if (m.round !== round || myIdx !== makerIdx() || !secret) return;
    const feedback = scoreGuess(secret, m.guess);
    history.push({ guess: m.guess, ...feedback });
    const solved = feedback.exact === CODE_LENGTH;
    const done = solved || history.length >= MAX_ATTEMPTS;
    if (done) {
      if (solved) scores[breakerIdx()] += MAX_ATTEMPTS - history.length + 1;
      else scores[makerIdx()] += 3;
    }
    session.send("nc_feedback", {
      round,
      entry: history.at(-1),
      done,
      secret: done ? secret : null,
      scores,
    });
    if (done) showResult();
    else screen(waitingCard("maker", `${names[breakerIdx()]} is making another guess`, history));
  });

  session.on("nc_feedback", (m) => {
    if (m.round !== round || myIdx !== breakerIdx()) return;
    history.push(m.entry);
    scores = m.scores;
    if (m.done) {
      secret = m.secret;
      showResult();
    } else {
      haptic(m.entry.exact ? [8, 18, 8] : 8);
      showBreakerTurn();
    }
  });

  if (isHost) session.on("nc_next", nextRound);

  if (isHost) {
    session.send("nc_round", { round, scores });
    beginRound();
  } else {
    screen(waitingCard("breaker", `Waiting for ${session.partnerName} to start`));
  }
}

export default game;
