// "Crazy True or False" — bonkers facts; race to call them right.
import { el, render, button, gameHeader, passDevice, shuffle, celebrate, haptic, localReadyGate, onlineReadyGate, connectionPill, scoreboard } from "../ui.js";
import { TRUEFALSE_FACTS } from "../data/truefalse-facts.js";

const game = {
  id: "truefalse",
  title: "Crazy True or False",
  emoji: "🤯",
  color: "linear-gradient(135deg,#a855f7,#ff5e98)",
  blurb: "Wild claims — who's fastest to spot the truth?",
  minPlayers: 2,
  maxPlayers: 10,
  modes: ["local", "online"],
  estMinutes: 10,
  rulesHTML: `
    <p>We read a crazy-sounding statement. Everyone picks <b>True</b> or <b>False</b> in secret.</p>
    <ol>
      <li>Pick privately on your own device, or pass one device around.</li>
      <li>Big reveal: the real answer + why it's wild.</li>
      <li>Correct guesses score a point. Most points after you've had enough wins!</li>
    </ol>
    <p class="muted">Some are unbelievable because they're true. Some are believable because they're lies. 😈</p>`,
  mount(ctx) { if (ctx.mode === "online") online(ctx); else local(ctx); },
};

function choiceView(name, statement, onPick) {
  return el("div", { class: "card" }, [
    el("div", { class: "pill" }, `${name} - make your call`),
    el("div", { class: "q-big", style: "font-size:1.35rem" }, statement),
    el("div", { class: "btn-row", style: "margin-top:14px" }, [
      button("True", { big: true, onClick: () => onPick(true) }),
      button("False", { variant: "secondary", big: true, onClick: () => onPick(false) }),
    ]),
  ]);
}

function revealView(ctx, names, fact, picks, scores, readyControl) {
  const rows = names.map((name, i) => {
    const correct = picks[i] === fact.answer;
    return el("div", { class: `answer-card reveal-anim ${correct ? "me" : ""}` }, [
      el("span", { class: "who" }, name),
      el("span", { class: "val" }, `${picks[i] ? "True" : "False"} ${correct ? "✓" : "×"}`),
    ]);
  });
  return el("div", { class: "screen" }, [
    el("div", { class: "card" }, [
      el("div", { class: "q-big", style: "font-size:1.25rem" }, fact.statement),
      el("div", { class: `verdict ${fact.answer ? "match" : "nomatch"}` }, fact.answer ? "True" : "False"),
      el("p", { class: "muted center" }, fact.explain),
    ]),
    el("div", { class: "stack" }, rows),
    scoreboard(names, scores, { colors: ctx.playerColors }),
    el("div", { class: "footer-actions" }, readyControl),
  ]);
}

function online(ctx) {
  const { session } = ctx;
  const names = session.players;
  const scores = names.map(() => 0);
  let deck = shuffle(TRUEFALSE_FACTS);
  let deckIndex = 0;
  let round = 0;
  let fact = null;
  let picks = names.map(() => null);
  const status = connectionPill();
  session.onStatus(status.set);
  const screen = (body) => render(el("div", { class: "screen" }, [gameHeader(ctx, game, status.node), body]));

  function wait(text) {
    screen(el("div", { class: "card center" }, [el("div", { class: "spinner" }), el("p", { class: "muted" }, text)]));
  }

  function showQuestion(statement) {
    screen(choiceView(names[session.myIndex], statement, (value) => {
      picks[session.myIndex] = value;
      if (session.isHost) checkReveal();
      else session.send("tf_pick", { value, round });
      wait("Answer locked. Waiting for everyone else.");
    }));
  }

  function startRound() {
    if (!session.isHost) return;
    if (deckIndex >= deck.length) { deck = shuffle(TRUEFALSE_FACTS); deckIndex = 0; }
    fact = deck[deckIndex++];
    picks = names.map(() => null);
    round++;
    session.send("tf_round", { statement: fact.statement, round });
    showQuestion(fact.statement);
  }

  function checkReveal() {
    if (!session.isHost || picks.some((pick) => pick === null)) return;
    picks.forEach((pick, i) => { if (pick === fact.answer) scores[i]++; });
    const payload = { fact, picks: picks.slice(), scores: scores.slice(), round };
    session.send("tf_reveal", payload);
    showReveal(payload);
  }

  function showReveal(payload) {
    if (payload.picks.filter((pick) => pick === payload.fact.answer).length === 1) celebrate();
    screen(revealView(ctx, names, payload.fact, payload.picks, payload.scores,
      onlineReadyGate(session, `tf:${payload.round}`, startRound, { label: "Ready for next" })));
    haptic(12);
  }

  session.on("tf_round", (message) => {
    if (session.isHost) return;
    round = message.round;
    picks = names.map(() => null);
    showQuestion(message.statement);
  });
  session.on("tf_pick", (message) => {
    if (!session.isHost || message.round !== round) return;
    picks[message.from] = message.value;
    checkReveal();
  });
  session.on("tf_reveal", (message) => { if (!session.isHost) showReveal(message); });

  if (session.isHost) screen(el("div", { class: "card center" }, [
    el("h2", {}, "Crazy True or False"),
    el("p", { class: "muted" }, `${names.length} players in the room.`),
    button("Start", { big: true, onClick: startRound }),
  ]));
  else wait("Waiting for the host to start.");
}

function local(ctx) {
  const names = ctx.players;
  let deck = shuffle(TRUEFALSE_FACTS);
  let qi = 0;
  const scores = names.map(() => 0);
  const statusEl = el("span", { class: "pill" }, `${names.length} players`);
  const screen = (b) => render(el("div", { class: "screen" }, [gameHeader(ctx, game, statusEl), b]));

  async function round() {
    if (qi >= deck.length) { deck = shuffle(TRUEFALSE_FACTS); qi = 0; }
    const fact = deck[qi++];
    const picks = [];

    for (let i = 0; i < names.length; i++) {
      await passDevice(names[i], "True or False — make your call!");
      await new Promise((res) => {
        const pick = (v) => { picks[i] = v; res(); };
        screen(el("div", { class: "card" }, [
          el("div", { class: "pill" }, names[i]),
          el("div", { class: "q-big", style: "font-size:1.35rem" }, fact.statement),
          el("div", { class: "btn-row", style: "margin-top:14px" }, [
            button("True", { big: true, onClick: () => pick(true) }),
            button("False", { variant: "secondary", big: true, onClick: () => pick(false) }),
          ]),
        ]));
      });
    }

    picks.forEach((p, i) => { if (p === fact.answer) scores[i]++; });
    const correctCount = picks.filter((p) => p === fact.answer).length;
    if (correctCount === 1) celebrate();

    const rows = names.map((n, i) => {
      const ok = picks[i] === fact.answer;
      return el("div", { class: `answer-card reveal-anim ${ok ? "me" : ""}` }, [
        el("span", { class: "who" }, n),
        el("span", { class: "val" }, [
          picks[i] ? "True" : "False",
          ok ? " ✓" : " ✗",
        ]),
      ]);
    });

    screen(el("div", { class: "screen" }, [
      el("div", { class: "card" }, [
        el("div", { class: "q-big", style: "font-size:1.25rem" }, fact.statement),
        el("div", { class: `verdict ${fact.answer ? "match" : "nomatch"}`, style: "font-size:1.6rem" },
          fact.answer ? "✅ TRUE!" : "❌ FALSE!"),
        el("p", { class: "muted center" }, fact.explain),
      ]),
      el("div", { class: "stack" }, rows),
      scoreboard(names, scores, { colors: ctx.playerColors }),
      el("div", { class: "footer-actions" }, localReadyGate(names, round, { label: "ready" })),
    ]));
    haptic(12);
  }

  screen(el("div", { class: "card center" }, [
    el("h2", {}, "🤯 Crazy True or False"),
    el("p", { class: "muted" }, `${deck.length} mind-bending facts loaded.`),
    el("div", { class: "footer-actions" }, button("Start →", { big: true, onClick: round })),
  ]));
}

export default game;
