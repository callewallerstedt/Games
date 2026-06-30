// "Think Alike" — inspired by Herd Mentality.
// Everyone secretly answers the same question, then it reveals at the same time.
// Online = 2 players, simultaneous reveal + mind-meld streak.
// Local = 2–8 players, pass-the-phone, majority scores, odd-one-out gets the Pink Cow 🐷.

import { el, render, button, pill, connectionPill, passDevice, gameHeader, shuffle, celebrate, onlineReadyGate, localReadyGate, scoreboard } from "../ui.js";
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

/* ---------------- ONLINE (2-8 players, host-authoritative) ---------------- */
function onlineGame(ctx) {
  const { session } = ctx;
  const names = session.players;
  let deck = shuffle(HERD_QUESTIONS);
  let qi = 0;
  let round = 0;
  const scores = names.map(() => 0);
  let answers = names.map(() => null);
  let currentQ = "";
  // Snapshot of cumulative scores before the current round, so the host can
  // re-decide who matched and we rescore cleanly from the same baseline.
  let baseScores = scores.slice();
  const status = connectionPill();
  session.onStatus(status.set);
  const screen = (body) => render(el("div", { class: "screen" }, [header(ctx, status.node), body]));

  function hostNewRound() {
    if (!session.isHost) return;
    if (qi >= deck.length) { deck = shuffle(HERD_QUESTIONS); qi = 0; }
    currentQ = deck[qi++];
    answers = names.map(() => null);
    round++;
    session.send("herd_round", { q: currentQ, round });
    showAnswer(currentQ);
  }

  // Recompute scores from the round baseline given the set of players who count
  // as "the herd", then broadcast. A herd needs at least 2 people to score.
  function hostApplyMatch(matchedSet) {
    if (!session.isHost) return;
    const valid = matchedSet.size >= 2;
    const matched = names.map((_, i) => valid && matchedSet.has(i));
    matched.forEach((isMatched, i) => { scores[i] = baseScores[i] + (isMatched ? 1 : 0); });
    const payload = { q: currentQ, answers: answers.slice(), scores: scores.slice(), matched, round };
    session.send("herd_reveal", payload);
    showReveal(payload);
  }

  function hostTryReveal() {
    if (!session.isHost || answers.some((answer) => answer == null)) return;
    baseScores = scores.slice();
    // Auto-detect the largest exact-match group(s) as the starting herd; the
    // host can then adjust who really matched before scoring.
    const groups = new Map();
    answers.forEach((answer, i) => {
      const key = norm(answer);
      groups.set(key, [...(groups.get(key) || []), i]);
    });
    const grouped = Array.from(groups.values());
    const largest = Math.max(...grouped.map((group) => group.length));
    const matchedSet = new Set();
    if (largest > 1) grouped.filter((group) => group.length === largest).forEach((group) => group.forEach((i) => matchedSet.add(i)));
    hostApplyMatch(matchedSet);
  }

  function showAnswer(q) {
    const { wrap } = answerInput((val) => {
      answers[session.myIndex] = val;
      if (session.isHost) hostTryReveal();
      else session.send("herd_answer", { text: val, round });
      showWaiting(q, val);
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
      el("div", { class: "waiting" }, [el("div", { class: "spinner" }), "Waiting for the rest of the room"]),
    ]));
  }

  function showReveal(payload) {
    const matched = payload.matched || names.map(() => false);
    const herdSize = matched.filter(Boolean).length;
    if (herdSize > 1) celebrate();
    // Host can retoggle who actually matched (handy when 3+ players phrase the
    // same idea differently), then rescore.
    const sel = new Set(matched.map((m, i) => (m ? i : -1)).filter((i) => i >= 0));

    const rows = payload.answers.map((answer, i) => {
      const card = el("div", {
        class: `answer-card reveal-anim ${matched[i] ? "me" : ""} ${session.isHost ? "selectable" : ""} ${sel.has(i) ? "chosen" : ""}`.trim(),
      }, [
        el("span", { class: "who" }, names[i] + (matched[i] ? "" : " 🐷")),
        el("span", { class: "val" }, answer),
      ]);
      if (session.isHost) {
        card.onclick = () => { if (sel.has(i)) sel.delete(i); else sel.add(i); card.classList.toggle("chosen"); };
      }
      return card;
    });

    const hostControls = session.isHost
      ? el("div", { class: "stack herd-override" }, [
          el("p", { class: "muted center tiny", style: "margin:0" }, "Tap the players who said the same thing, then score the herd."),
          button("✓ Score the herd", { variant: "secondary", onClick: () => hostApplyMatch(new Set(sel)) }),
        ])
      : null;

    screen(el("div", { class: "screen" }, [
      el("div", { class: "q-big" }, payload.q),
      el("div", { class: "stack" }, rows),
      el("div", { class: `verdict ${herdSize > 1 ? "match" : "nomatch"}` },
        herdSize > 1 ? `🐄 The herd: ${herdSize} matched` : "Everyone went their own way"),
      hostControls,
      scoreboard(names, payload.scores, { colors: ctx.playerColors }),
      el("div", { class: "footer-actions" }, onlineReadyGate(session, `herd:${payload.round}`, hostNewRound, { label: "Ready for next" })),
    ]));
  }

  session.on("herd_round", (message) => {
    if (session.isHost) return;
    currentQ = message.q;
    round = message.round;
    answers = names.map(() => null);
    showAnswer(message.q);
  });
  session.on("herd_answer", (message) => {
    if (!session.isHost || message.round !== round) return;
    answers[message.from] = message.text;
    hostTryReveal();
  });
  session.on("herd_reveal", (message) => { if (!session.isHost) showReveal(message); });

  if (session.isHost) hostNewRound();
  else screen(el("div", { class: "waiting" }, [el("div", { class: "spinner" }), "Waiting for the host to start"]));
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
    const groups = new Map();
    answers.forEach((a, i) => {
      const key = norm(a);
      groups.set(key, (groups.get(key) || []).concat(i));
    });
    const groupedAnswers = Array.from(groups.values());
    const maxSize = Math.max(...groupedAnswers.map((g) => g.length));
    cows = names.map(() => false);
    let matched2p = names.length === 2 && maxSize === 2;
    let overridden = false;
    if (names.length === 2) {
      if (matched2p) { scores[0]++; scores[1]++; celebrate(); }
      else cows = [true, true];
    } else {
      groupedAnswers.forEach((g) => {
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
        el("div", { class: "footer-actions" }, [override, localReadyGate(names, playRound, { label: "ready" })]),
      ]));
    }
    draw();
  }

  playRound();
}

export default game;
