// "Think Alike" — inspired by Herd Mentality.
// Everyone secretly answers the same question, then it reveals at the same time.
// Online = 2 players, simultaneous reveal + mind-meld streak.
// Local = 2–8 players, pass-the-phone, majority scores, odd-one-out gets the Pink Cow 🐷.

import { el, render, button, pill, connectionPill, passDevice, gameHeader, scoreChip, shuffle, celebrate } from "../ui.js";
import { HERD_QUESTIONS } from "../data/herd-questions.js";

const norm = (s) => (s || "").trim().toLowerCase().replace(/\s+/g, " ");

const game = {
  id: "herd",
  title: "Think Alike",
  emoji: "🐮",
  color: "linear-gradient(135deg,#6c5ce7,#9d8bff)",
  blurb: "Answer the same question — do your brains match?",
  minPlayers: 2,
  maxPlayers: 8,
  modes: ["local", "online"],
  estMinutes: 10,
  rulesHTML: `
    <p>A simple question pops up. Everyone secretly writes an answer — then it all
    reveals at once.</p>
    <h3>Two phones (couples)</h3>
    <ol>
      <li>You both see the same question.</li>
      <li>Type your answer and tap <b>Done</b>.</li>
      <li>When you're both in, the answers flip over together.</li>
      <li><b>Match</b> = you think alike! Build up a mind-meld streak. 🧠</li>
    </ol>
    <h3>One phone (2–8 players)</h3>
    <ol>
      <li>Pass the phone around — each person types their answer in secret.</li>
      <li>The biggest matching group scores a point each.</li>
      <li>The odd one out gets the <b>Pink Cow</b> 🐷 — try not to keep it!</li>
    </ol>
    <p class="muted">There are no wrong answers — just be a herd.</p>`,
  mount(ctx) {
    if (ctx.mode === "online") onlineGame(ctx);
    else localGame(ctx);
  },
};

const header = (ctx, statusEl) => gameHeader(ctx, game, statusEl);

function answerInput(onDone, placeholder = "Your answer…") {
  const input = el("input", { class: "field", type: "text", placeholder, autocomplete: "off",
    enterkeyhint: "done", maxlength: "40" });
  const btn = button("Done ✓", { big: true, disabled: true, onClick: () => onDone(input.value) });
  input.addEventListener("input", () => { btn.disabled = norm(input.value) === ""; });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !btn.disabled) onDone(input.value); });
  setTimeout(() => input.focus(), 50);
  return { wrap: el("div", { class: "stack" }, [input, btn]), input };
}

/* ---------------- ONLINE (2 players, host-authoritative) ---------------- */
function onlineGame(ctx) {
  const { session, exit } = ctx;
  const isHost = session.isHost;
  const deck = shuffle(HERD_QUESTIONS);
  let qi = 0;
  let stats = { rounds: 0, matches: 0, streak: 0 };
  let pending = { a1: null, a2: null }; // a1 = host, a2 = guest (host only)
  let currentQ = "";

  const status = connectionPill();
  session.onStatus(status.set);

  function screen(body) {
    render(el("div", { class: "screen" }, [header(ctx, status.node), body]));
  }

  // ---- Host drives rounds ----
  function hostNewRound() {
    if (qi >= deck.length) qi = 0;
    currentQ = deck[qi++];
    pending = { a1: null, a2: null };
    session.send("herd_round", { q: currentQ });
    showAnswer(currentQ);
  }

  function hostTryReveal() {
    if (pending.a1 == null || pending.a2 == null) return;
    const match = norm(pending.a1) === norm(pending.a2);
    stats.rounds++;
    if (match) { stats.matches++; stats.streak++; } else { stats.streak = 0; }
    const payload = { a1: pending.a1, a2: pending.a2, match, stats };
    session.send("herd_reveal", payload);
    showReveal(payload);
  }

  // ---- Shared screens ----
  function showAnswer(q) {
    let mine = null;
    const { wrap } = answerInput((val) => {
      mine = val;
      if (isHost) { pending.a1 = val; } else { session.send("herd_answer", { text: val }); }
      showWaiting(q, mine);
      if (isHost) hostTryReveal();
    });
    screen(el("div", { class: "card" }, [
      el("div", { class: "pill" }, "Secret answer"),
      el("div", { class: "q-big" }, q),
      wrap,
    ]));
  }

  function showWaiting(q, mine) {
    screen(el("div", { class: "card" }, [
      el("div", { class: "q-big" }, q),
      el("div", { class: "answer-card" }, [el("span", { class: "who" }, "You said"), el("span", { class: "val" }, mine)]),
      el("div", { class: "waiting" }, [el("div", { class: "spinner" }), `Waiting for ${session.partnerName}…`]),
    ]));
  }

  function showReveal(p) {
    if (p.match) celebrate();
    const a1 = el("div", { class: "answer-card reveal-anim" }, [
      el("span", { class: "who" }, isHost ? "You" : session.partnerName),
      el("span", { class: "val" }, p.a1),
    ]);
    const a2 = el("div", { class: "answer-card reveal-anim" }, [
      el("span", { class: "who" }, isHost ? session.partnerName : "You"),
      el("span", { class: "val" }, p.a2),
    ]);
    const verdict = el("div", { class: `verdict ${p.match ? "match" : "nomatch"}` },
      p.match ? "🧠 You think alike!" : "🐮 Off the herd!");
    const next = button("Next question →", { big: true, onClick: () => {
      if (isHost) hostNewRound(); else session.send("herd_next");
    } });
    // Host can manually count a near-miss (typos / phrasing) as a match.
    const override = (!p.match && isHost) ? button("✅ Close enough — count it", { variant: "secondary", onClick: () => {
      stats.matches++; stats.streak = (stats.streak || 0) + 1;
      const np = { a1: p.a1, a2: p.a2, match: true, stats };
      session.send("herd_override", np); showReveal(np);
    } }) : null;
    screen(el("div", { class: "screen" }, [
      el("div", { class: "q-big" }, currentQ),
      el("div", { class: "stack" }, [a1, a2]),
      verdict,
      p.stats.streak > 1 ? el("div", { class: "center streak" }, `🔥 ${p.stats.streak} in a row!`) : null,
      el("div", { class: "scorebar" }, [
        scoreChip(p.stats.matches, "matched"),
        scoreChip(p.stats.rounds, "rounds"),
      ]),
      el("div", { class: "footer-actions" }, [override, next]),
    ]));
  }

  // ---- Wire messages ----
  session.on("herd_round", (m) => { currentQ = m.q; showAnswer(m.q); });
  session.on("herd_reveal", (m) => { stats = m.stats; showReveal(m); });
  session.on("herd_override", (m) => { stats = m.stats; showReveal(m); });
  if (isHost) {
    session.on("herd_answer", (m) => { pending.a2 = m.text; hostTryReveal(); });
    session.on("herd_next", () => hostNewRound());
  }

  // Kick off
  if (isHost) hostNewRound();
  else screen(el("div", { class: "waiting" }, [el("div", { class: "spinner" }), `Waiting for ${session.partnerName} to start…`]));
}

/* ---------------- LOCAL (2–8 players, pass the phone) ---------------- */
function localGame(ctx) {
  const names = ctx.players;
  const deck = shuffle(HERD_QUESTIONS);
  let qi = 0;
  const scores = names.map(() => 0);
  let cows = names.map(() => false);

  const statusEl = pill(`${names.length} players`);
  function screen(body) { render(el("div", { class: "screen" }, [header(ctx, statusEl), body])); }

  async function playRound() {
    if (qi >= deck.length) qi = 0;
    const q = deck[qi++];
    const answers = [];
    for (let i = 0; i < names.length; i++) {
      await passDevice(names[i], "Don't let the others peek!");
      await new Promise((resolve) => {
        const { wrap } = answerInput((val) => { answers[i] = val; resolve(); });
        screen(el("div", { class: "card" }, [
          el("div", { class: "pill" }, `${names[i]} — secret answer`),
          el("div", { class: "q-big" }, q),
          wrap,
        ]));
      });
    }
    reveal(q, answers);
  }

  function reveal(q, answers) {
    const groups = {};
    answers.forEach((a, i) => { (groups[norm(a)] ||= []).push(i); });
    const maxSize = Math.max(...Object.values(groups).map((g) => g.length));
    cows = names.map(() => false);
    let matched2p = names.length === 2 && maxSize === 2;
    let overridden = false;
    if (names.length === 2) {
      if (matched2p) { scores[0]++; scores[1]++; celebrate(); }
      else cows = [true, true];
    } else {
      Object.values(groups).forEach((g) => {
        if (g.length === maxSize && maxSize > 1) g.forEach((i) => scores[i]++);
        if (g.length === 1) g.forEach((i) => { cows[i] = true; });
      });
    }

    function draw() {
      const pointsLine = names.length === 2
        ? el("div", { class: `verdict ${matched2p ? "match" : "nomatch"}` },
            matched2p ? "🧠 You think alike! +1 each" : "🐮 No match — Pink Cow for both!")
        : el("div", { class: "verdict match" }, "🐄 The herd scores!");
      const rows = answers.map((a, i) => el("div", { class: "answer-card reveal-anim" }, [
        el("span", { class: "who" }, names[i] + (cows[i] ? " 🐷" : "")),
        el("span", { class: "val" }, a),
      ]));
      const standings = names.map((n, i) => ({ n, s: scores[i], cow: cows[i] }))
        .sort((a, b) => b.s - a.s)
        .map((p) => el("div", { class: "answer-card" }, [
          el("span", { class: "who" }, p.n + (p.cow ? " 🐷" : "")),
          el("span", { class: "val" }, String(p.s)),
        ]));
      const override = (names.length === 2 && !matched2p && !overridden)
        ? button("✅ Close enough — count it", { variant: "secondary", onClick: () => {
            scores[0]++; scores[1]++; cows = [false, false]; matched2p = true; overridden = true; celebrate(); draw();
          } })
        : null;
      screen(el("div", { class: "screen" }, [
        el("div", { class: "q-big" }, q),
        el("div", { class: "stack" }, rows),
        pointsLine,
        el("h3", { class: "center", style: "margin-top:16px" }, "Standings"),
        el("div", { class: "stack" }, standings),
        el("div", { class: "footer-actions" }, [override, button("Next question →", { big: true, onClick: playRound })]),
      ]));
    }
    draw();
  }

  playRound();
}

export default game;
