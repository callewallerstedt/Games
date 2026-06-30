// "Impostor" — 3–10 players, one phone.
// Everyone gets the SAME question except one random impostor, who gets a
// related-but-different question. Pass the phone so each reads (and optionally
// answers) in secret. Then the group discusses and votes who the impostor is.

import { el, render, button, gameHeader, passDevice, segmented, scoreChip, shuffle, celebrate, haptic, localReadyGate, onlineReadyGate, connectionPill, scoreboard } from "../ui.js";
import { IMPOSTOR } from "../data/decks.js";

const game = {
  id: "impostor",
  title: "Impostor",
  emoji: "🕵️",
  color: "linear-gradient(135deg,#5b6cff,#9d6bff)",
  blurb: "One player got a different question. Sniff out the impostor!",
  minPlayers: 3,
  maxPlayers: 10,
  modes: ["local", "online"],
  lobbySettings: [{ key: "answerMode", label: "Answers", type: "choice", options: ["type", "say"], default: "type" }],
  estMinutes: 12,
  rulesHTML: `
    <p>For 3–10 players. Everyone answers a question — but <b>one secret impostor</b>
    gets a slightly different question and has to blend in.</p>
    <ol>
      <li>Each player privately sees their question on their own device, or by passing one device.</li>
      <li>Share answers out loud and <b>discuss</b> — who seems off?</li>
      <li>The group votes for the impostor. Catch them and the group scores; if they slip
      through, the impostor scores!</li>
    </ol>
    <p class="muted">Tip: the questions overlap, so a good impostor sounds just like everyone else. 😏</p>`,
  mount(ctx) { if (ctx.mode === "online") online(ctx); else local(ctx); },
};

function online(ctx) {
  const { session } = ctx;
  const names = session.players;
  const answerMode = session.settings.answerMode || "type";
  let deck = shuffle(IMPOSTOR);
  let deckIndex = 0;
  let round = 0;
  let pair = null;
  let impostor = 0;
  let answers = names.map(() => null);
  let votes = names.map(() => null);
  const scores = names.map(() => 0);
  const status = connectionPill();
  session.onStatus(status.set);
  const screen = (body) => render(el("div", { class: "screen" }, [gameHeader(ctx, game, status.node), body]));
  const wait = (text) => screen(el("div", { class: "card center" }, [el("div", { class: "spinner" }), el("p", { class: "muted" }, text)]));

  function showQuestion(question) {
    if (answerMode === "say") {
      screen(el("div", { class: "card" }, [
        el("div", { class: "pill" }, `${names[session.myIndex]} - private question`),
        el("div", { class: "q-big" }, question),
        el("p", { class: "muted center" }, "Remember it and answer aloud during discussion. Do not read the question aloud."),
        button("Got it", { big: true, onClick: () => submitAnswer("") }),
      ]));
      return;
    }
    const input = el("input", { class: "field", placeholder: "Your answer", maxlength: "40", autocomplete: "off" });
    const submit = button("Lock answer", { big: true, disabled: true, onClick: () => submitAnswer(input.value.trim()) });
    input.addEventListener("input", () => { submit.disabled = !input.value.trim(); });
    input.addEventListener("keydown", (event) => { if (event.key === "Enter" && !submit.disabled) submit.click(); });
    screen(el("div", { class: "card" }, [
      el("div", { class: "pill" }, `${names[session.myIndex]} - private question`),
      el("div", { class: "q-big" }, question),
      el("div", { class: "stack" }, [input, submit]),
    ]));
    setTimeout(() => input.focus(), 30);
  }

  function submitAnswer(answer) {
    answers[session.myIndex] = answer;
    if (session.isHost) checkAnswers();
    else session.send("imp_answer", { round, answer });
    wait("Answer locked. Waiting for everyone.");
  }

  function startRound() {
    if (!session.isHost) return;
    if (deckIndex >= deck.length) { deck = shuffle(IMPOSTOR); deckIndex = 0; }
    round++;
    pair = deck[deckIndex++];
    impostor = Math.floor(Math.random() * names.length);
    answers = names.map(() => null);
    votes = names.map(() => null);
    names.forEach((_, i) => session.sendTo(i, "imp_role", {
      round,
      question: i === impostor ? pair.impostor : pair.main,
    }));
  }

  function checkAnswers() {
    if (!session.isHost || answers.some((answer) => answer == null)) return;
    const payload = { round, answers: answers.slice(), answerMode };
    session.send("imp_discuss", payload);
    showDiscuss(payload);
  }

  function showDiscuss(payload) {
    const rows = payload.answerMode === "type"
      ? payload.answers.map((answer, i) => el("div", { class: "answer-card reveal-anim" }, [el("span", { class: "who" }, names[i]), el("span", { class: "val" }, answer)]))
      : [];
    screen(el("div", { class: "screen" }, [
      el("div", { class: "card" }, [
        el("div", { class: "kicker" }, "Discussion"),
        el("h2", { class: "center" }, "Who received the different question?"),
        el("p", { class: "muted center" }, payload.answerMode === "type" ? "Compare the answers, then vote." : "Take turns saying answers aloud, then vote."),
      ]),
      rows.length ? el("div", { class: "stack" }, rows) : null,
      el("div", { class: "footer-actions" }, onlineReadyGate(session, `imp:discuss:${round}`, () => {
        if (session.isHost) { session.send("imp_vote_phase", { round }); showVote(); }
      }, { label: "Ready to vote" })),
    ]));
  }

  function showVote() {
    let selected = null;
    const draw = () => screen(el("div", { class: "screen" }, [
      el("h2", { class: "center" }, "Cast your private vote"),
      el("div", { class: "stack" }, names.map((name, i) => el("button", {
        class: `choice ${selected === i ? "sel" : ""}`,
        disabled: i === session.myIndex,
        onClick: () => { selected = i; draw(); },
      }, [el("span", { class: "lead" }, name.slice(0, 1).toUpperCase()), el("span", {}, name)]))),
      el("div", { class: "footer-actions" }, button("Lock vote", { big: true, disabled: selected == null, onClick: () => submitVote(selected) })),
    ]));
    draw();
  }

  function submitVote(vote) {
    votes[session.myIndex] = vote;
    if (session.isHost) checkVotes(); else session.send("imp_vote", { round, vote });
    wait("Vote locked. Waiting for the room.");
  }

  function checkVotes() {
    if (!session.isHost || votes.some((vote) => vote == null)) return;
    const counts = names.map(() => 0);
    votes.forEach((vote) => { counts[vote]++; });
    const highest = Math.max(...counts);
    const leaders = counts.map((count, i) => count === highest ? i : -1).filter((i) => i >= 0);
    const caught = leaders.length === 1 && leaders[0] === impostor;
    if (caught) names.forEach((_, i) => { if (i !== impostor) scores[i]++; });
    else scores[impostor] += 2;
    const payload = { round, pair, impostor, votes: votes.slice(), caught, scores: scores.slice() };
    session.send("imp_reveal", payload);
    showReveal(payload);
  }

  function showReveal(payload) {
    if (payload.caught) celebrate(); else haptic([10, 40, 10]);
    screen(el("div", { class: "screen" }, [
      el("div", { class: `verdict ${payload.caught ? "match" : "nomatch"}` }, payload.caught ? "Impostor caught" : "Impostor escaped"),
      el("div", { class: "card stack" }, [
        el("div", { class: "answer-card me" }, [el("span", { class: "who" }, "Impostor"), el("span", { class: "val" }, names[payload.impostor])]),
        el("div", { class: "answer-card" }, [el("span", { class: "who" }, "Main question"), el("span", { class: "val" }, payload.pair.main)]),
        el("div", { class: "answer-card" }, [el("span", { class: "who" }, "Impostor question"), el("span", { class: "val" }, payload.pair.impostor)]),
      ]),
      scoreboard(names, payload.scores, { colors: ctx.playerColors }),
      el("div", { class: "footer-actions" }, onlineReadyGate(session, `imp:reveal:${payload.round}`, startRound, { label: "Ready for next" })),
    ]));
  }

  session.on("imp_role", (message) => { round = message.round; showQuestion(message.question); });
  session.on("imp_answer", (message) => { if (session.isHost && message.round === round) { answers[message.from] = message.answer; checkAnswers(); } });
  session.on("imp_discuss", (message) => { if (!session.isHost) showDiscuss(message); });
  session.on("imp_vote_phase", (message) => { if (!session.isHost && message.round === round) showVote(); });
  session.on("imp_vote", (message) => { if (session.isHost && message.round === round) { votes[message.from] = message.vote; checkVotes(); } });
  session.on("imp_reveal", (message) => { if (!session.isHost) showReveal(message); });

  if (session.isHost) startRound(); else wait("Waiting for the host to deal roles.");
}

function local(ctx) {
  const names = ctx.players;
  let answerMode = "type";
  let deck = shuffle(IMPOSTOR), di = 0;
  const score = { group: 0, impostor: 0 };
  const statusEl = el("span", { class: "pill" }, `${names.length} players`);
  const screen = (b) => render(el("div", { class: "screen" }, [gameHeader(ctx, game, statusEl), b]));

  function chooseMode() {
    const seg = segmented(
      [{ value: "type", label: "⌨️ Type & reveal" }, { value: "say", label: "🗣️ Say out loud" }],
      answerMode, (v) => (answerMode = v));
    screen(el("div", { class: "screen" }, [
      el("div", { class: "hero" }, [el("h2", {}, "🕵️ Impostor"), el("div", { class: "tag muted" }, "One of you gets a different question. Blend in!")]),
      el("div", { class: "card" }, [el("p", { class: "muted center" }, "How will you answer each round?"), seg.node]),
      el("div", { class: "footer-actions" }, button("Start round →", { big: true, onClick: () => { answerMode = seg.get(); playRound(); } })),
    ]));
  }

  async function playRound() {
    if (di >= deck.length) { deck = shuffle(IMPOSTOR); di = 0; }
    const pair = deck[di++];
    const impostor = Math.floor(Math.random() * names.length);
    const answers = [];
    for (let i = 0; i < names.length; i++) {
      await passDevice(names[i], "Your secret question — don't show anyone!");
      const q = i === impostor ? pair.impostor : pair.main;
      await new Promise((res) => {
        if (answerMode === "type") {
          const f = el("input", { class: "field", style: "text-align:left", placeholder: "Your answer…", maxlength: "40" });
          const b = button("Lock in ✓", { big: true, disabled: true, onClick: () => { answers[i] = f.value.trim(); res(); } });
          f.addEventListener("input", () => { b.disabled = f.value.trim() === ""; });
          f.addEventListener("keydown", (e) => { if (e.key === "Enter" && !b.disabled) { answers[i] = f.value.trim(); res(); } });
          setTimeout(() => f.focus(), 50);
          screen(el("div", { class: "card" }, [el("div", { class: "pill" }, `${names[i]} — your question`), el("div", { class: "q-big" }, q), el("div", { class: "stack" }, [f, b])]));
        } else {
          screen(el("div", { class: "card" }, [
            el("div", { class: "pill" }, `${names[i]} — your question`),
            el("div", { class: "q-big" }, q),
            el("p", { class: "muted center" }, "Remember it — you'll say your answer out loud. Don't read your question aloud!"),
            button("Got it — hide 🙈", { big: true, onClick: () => res() }),
          ]));
        }
      });
    }
    discuss(pair, impostor, answers);
  }

  function discuss(pair, impostor, answers) {
    const rows = answerMode === "type"
      ? answers.map((a, i) => el("div", { class: "answer-card reveal-anim" }, [el("span", { class: "who" }, names[i]), el("span", { class: "val" }, a)]))
      : [];
    screen(el("div", { class: "screen" }, [
      el("div", { class: "kicker" }, "Everyone gather round"),
      el("h2", { class: "center", style: "margin:8px 0" }, "Who's the impostor? 🕵️"),
      el("p", { class: "muted center" }, answerMode === "type" ? "Here's what everyone wrote — discuss!" : "Go round and say your answers, then discuss."),
      rows.length ? el("div", { class: "stack" }, rows) : null,
      el("div", { class: "footer-actions" }, button("Ready to vote →", { big: true, onClick: () => vote(pair, impostor) })),
    ]));
  }

  function vote(pair, impostor) {
    let sel = null;
    const draw = () => screen(el("div", { class: "screen" }, [
      el("div", { class: "kicker" }, "Group vote"),
      el("h2", { class: "center", style: "margin:8px 0 14px" }, "Tap the impostor"),
      el("div", { class: "stack" }, names.map((n, i) =>
        el("button", { class: `choice ${sel === i ? "sel" : ""}`, onClick: () => { sel = i; draw(); } },
          [el("span", { class: "lead" }, (n[0] || "?").toUpperCase()), el("span", {}, n)]))),
      el("div", { class: "footer-actions" }, button("Reveal! 🎭", { big: true, disabled: sel === null, onClick: () => reveal(pair, impostor, sel) })),
    ]));
    draw();
  }

  function reveal(pair, impostor, sel) {
    const caught = sel === impostor;
    if (caught) { score.group++; celebrate(); } else { score.impostor++; haptic([10, 40, 10, 40]); }
    screen(el("div", { class: "screen" }, [
      el("div", { class: `verdict ${caught ? "match" : "nomatch"}` }, caught ? "🕵️ Impostor caught!" : "🎭 The impostor escaped!"),
      el("div", { class: "card stack" }, [
        el("div", { class: "answer-card me" }, [el("span", { class: "who" }, "The impostor was"), el("span", { class: "val" }, names[impostor])]),
        el("div", { class: "answer-card" }, [el("span", { class: "who" }, "Everyone's question"), el("span", { class: "val", style: "font-size:.98rem" }, pair.main)]),
        el("div", { class: "answer-card" }, [el("span", { class: "who" }, "Impostor's question"), el("span", { class: "val", style: "font-size:.98rem" }, pair.impostor)]),
      ]),
      el("div", { class: "scorebar" }, [scoreChip(score.group, "group wins"), scoreChip(score.impostor, "impostor wins")]),
      el("div", { class: "footer-actions" }, localReadyGate(names, playRound, { label: "ready" })),
    ]));
  }

  chooseMode();
}

export default game;
