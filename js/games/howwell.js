// "How Well Do You Know Me?" — Newlywed-style.
// One answers about themselves; the other guesses what they'll say; then the
// answerer judges if the guess was right. Roles swap. Co-op "how well we know
// each other" score. Online (2 phones) or one phone (pass it).

import { el, render, button, connectionPill, passDevice, gameHeader, scoreChip, meter, shuffle, celebrate, onlineReadyGate, localReadyGate } from "../ui.js";
import { HOWWELL } from "../data/decks.js";

const game = {
  id: "howwell",
  title: "How Well Do You Know Me?",
  emoji: "💌",
  color: "linear-gradient(135deg,#14b88a,#4bd1ff)",
  blurb: "Guess what your partner will say — then they reveal the truth.",
  minPlayers: 2,
  maxPlayers: 2,
  modes: ["local", "online"],
  estMinutes: 12,
  rulesHTML: `
    <p>Take turns. One of you answers about themselves; the other tries to guess that answer.</p>
    <ol>
      <li>The <b>answerer</b> secretly writes their real answer.</li>
      <li>The <b>guesser</b> writes what they think the answerer will say.</li>
      <li>Both reveal — then the answerer decides: did they nail it? ✅ / ❌</li>
      <li>Every ✅ grows your "how well you know each other" score. Then you swap!</li>
    </ol>
    <p class="muted">Answers are personal, so the answerer is the judge. Be generous — close counts! 💚</p>`,
  mount(ctx) { ctx.mode === "online" ? online(ctx) : local(ctx); },
};

const input = (placeholder, onDone, label) => {
  const f = el("input", { class: "field", type: "text", placeholder, autocomplete: "off", enterkeyhint: "done", maxlength: "60" });
  const b = button(label, { big: true, disabled: true, onClick: () => onDone(f.value.trim()) });
  f.addEventListener("input", () => { b.disabled = f.value.trim() === ""; });
  f.addEventListener("keydown", (e) => { if (e.key === "Enter" && !b.disabled) onDone(f.value.trim()); });
  setTimeout(() => f.focus(), 50);
  return el("div", { class: "stack" }, [f, b]);
};

const revealPair = (q, answerer, answer, guesser, guess) =>
  el("div", { class: "screen" }, [
    el("div", { class: "q-big" }, q),
    el("div", { class: "stack" }, [
      el("div", { class: "answer-card reveal-anim" }, [el("span", { class: "who" }, `${guesser} guessed`), el("span", { class: "val" }, guess)]),
      el("div", { class: "answer-card me reveal-anim" }, [el("span", { class: "who" }, `${answerer}'s real answer`), el("span", { class: "val" }, answer)]),
    ]),
  ]);

const scoreFooter = (stats) => el("div", { style: "margin:12px 4px 0" }, [
  el("div", { class: "tiny muted center", style: "margin-bottom:6px" }, `You know each other · ${stats.correct}/${stats.rounds}`),
  meter(stats.rounds ? stats.correct / stats.rounds : 0),
]);

function online(ctx) {
  const { session } = ctx;
  const isHost = session.isHost;
  const deck = shuffle(HOWWELL);
  let i = 0, round = 0;
  let stats = { rounds: 0, correct: 0 };
  let q = null, answererIdx = 0;
  let pending = { answer: null, guess: null };

  const status = connectionPill();
  session.onStatus(status.set);
  const screen = (body) => render(el("div", { class: "screen" }, [gameHeader(ctx, game, status.node), body]));
  const myIdx = isHost ? 0 : 1;
  const amAnswerer = () => answererIdx === myIdx;
  const nameOf = (idx) => session.players[idx];

  function hostNewRound() {
    if (i >= deck.length) i = 0;
    q = deck[i++]; answererIdx = round % 2; pending = { answer: null, guess: null };
    session.send("hw_round", { q, answererIdx });
    showRole();
  }
  function tryReveal() {
    if (pending.answer == null || pending.guess == null) return;
    const payload = { q, answererIdx, answer: pending.answer, guess: pending.guess };
    session.send("hw_reveal", payload);
    showReveal(payload);
  }

  function showRole() {
    if (amAnswerer()) {
      screen(el("div", { class: "card" }, [
        el("div", { class: "pill" }, "✍️ About you — secret"),
        el("div", { class: "q-big" }, q),
        input("Your honest answer…", (v) => { if (isHost) pending.answer = v; else session.send("hw_answer", { text: v }); waitingFor(); if (isHost) tryReveal(); }, "Lock in ✓"),
      ]));
    } else {
      screen(el("div", { class: "card" }, [
        el("div", { class: "pill" }, `🔮 What will ${nameOf(answererIdx)} say?`),
        el("div", { class: "q-big" }, q),
        input("Your guess…", (v) => { if (isHost) pending.guess = v; else session.send("hw_guess", { text: v }); waitingFor(); if (isHost) tryReveal(); }, "Lock in guess ✓"),
      ]));
    }
  }
  function waitingFor() {
    screen(el("div", { class: "card" }, [el("div", { class: "q-big" }, q),
      el("div", { class: "waiting" }, [el("div", { class: "spinner" }), `Waiting for ${session.partnerName}…`])]));
  }
  function showReveal(p) {
    const body = revealPair(p.q, nameOf(p.answererIdx), p.answer, nameOf(p.answererIdx === 0 ? 1 : 0), p.guess);
    const iJudge = p.answererIdx === myIdx;
    if (iJudge) {
      body.append(el("div", { class: "kicker", style: "margin-top:14px" }, "Did they get it right?"),
        el("div", { class: "btn-row", style: "margin-top:10px" }, [
          button("❌ Nope", { variant: "secondary", big: true, onClick: () => judge(false) }),
          button("✅ Yes!", { big: true, onClick: () => judge(true) }),
        ]));
    } else {
      body.append(el("div", { class: "waiting" }, [el("div", { class: "spinner" }), `${nameOf(p.answererIdx)} is judging your guess…`]));
    }
    screen(body);
  }
  function judge(correct) {
    if (isHost) { applyResult(correct); session.send("hw_result", { correct, stats }); showResult(correct, stats); }
    else session.send("hw_judge", { correct });
  }
  function applyResult(correct) { stats.rounds++; if (correct) stats.correct++; }
  function showResult(correct, st) {
    stats = st;
    if (correct) celebrate();
    screen(el("div", { class: "screen" }, [
      el("div", { class: `verdict ${correct ? "match" : "nomatch"}`, style: "margin-top:30px" }, correct ? "✅ Nailed it!" : "❌ So close!"),
      scoreFooter(stats),
      el("div", { class: "footer-actions" }, onlineReadyGate(session, `hw:${stats.rounds}`, () => {
        if (isHost) { round++; hostNewRound(); }
      }, { label: "Ready for next ->" })),
    ]));
  }

  session.on("hw_round", (m) => { q = m.q; answererIdx = m.answererIdx; showRole(); });
  session.on("hw_reveal", (m) => { q = m.q; answererIdx = m.answererIdx; showReveal(m); });
  session.on("hw_result", (m) => showResult(m.correct, m.stats));
  if (isHost) {
    session.on("hw_answer", (m) => { pending.answer = m.text; tryReveal(); });
    session.on("hw_guess", (m) => { pending.guess = m.text; tryReveal(); });
    session.on("hw_judge", (m) => { applyResult(m.correct); session.send("hw_result", { correct: m.correct, stats }); showResult(m.correct, stats); });
  }
  if (isHost) hostNewRound();
  else screen(el("div", { class: "waiting" }, [el("div", { class: "spinner" }), `Waiting for ${session.partnerName} to start…`]));
}

function local(ctx) {
  const names = ctx.players;
  const deck = shuffle(HOWWELL);
  let i = 0, round = 0;
  let stats = { rounds: 0, correct: 0 };
  const statusEl = el("span", { class: "pill" }, "Pass & play");
  const screen = (body) => render(el("div", { class: "screen" }, [gameHeader(ctx, game, statusEl), body]));

  async function playRound() {
    if (i >= deck.length) i = 0;
    const q = deck[i++];
    const aIdx = round % 2, gIdx = 1 - aIdx;

    await passDevice(names[aIdx], "Answer about yourself — secret!");
    const answer = await new Promise((res) => screen(el("div", { class: "card" }, [
      el("div", { class: "pill" }, `✍️ ${names[aIdx]} — about you`),
      el("div", { class: "q-big" }, q), input("Your honest answer…", res, "Lock in ✓")])));

    await passDevice(names[gIdx], `Guess what ${names[aIdx]} said`);
    const guess = await new Promise((res) => screen(el("div", { class: "card" }, [
      el("div", { class: "pill" }, `🔮 What will ${names[aIdx]} say?`),
      el("div", { class: "q-big" }, q), input("Your guess…", res, "Lock in guess ✓")])));

    const body = revealPair(q, names[aIdx], answer, names[gIdx], guess);
    body.append(el("div", { class: "kicker", style: "margin-top:14px" }, `${names[aIdx]}, did ${names[gIdx]} get it right?`),
      el("div", { class: "btn-row", style: "margin-top:10px" }, [
        button("❌ Nope", { variant: "secondary", big: true, onClick: () => finish(false) }),
        button("✅ Yes!", { big: true, onClick: () => finish(true) }),
      ]));
    screen(body);

    function finish(correct) {
      stats.rounds++; if (correct) { stats.correct++; celebrate(); }
      screen(el("div", { class: "screen" }, [
        el("div", { class: `verdict ${correct ? "match" : "nomatch"}`, style: "margin-top:30px" }, correct ? "✅ Nailed it!" : "❌ So close!"),
        scoreFooter(stats),
        el("div", { class: "footer-actions" }, localReadyGate(names, () => { round++; playRound(); }, { label: "ready" })),
      ]));
    }
  }
  playRound();
}

export default game;
