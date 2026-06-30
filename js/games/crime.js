// "Case Files" — cooperative detective stories; uncover clues, then accuse.
import { el, render, button, gameHeader, passDevice, scoreChip, shuffle, celebrate, haptic, localReadyGate, onlineReadyGate, connectionPill, scoreboard } from "../ui.js";
import { CRIME_CASES } from "../data/crime-cases.js";

const game = {
  id: "crime",
  title: "Case Files",
  emoji: "🔎",
  color: "linear-gradient(135deg,#2d3436,#636e72)",
  blurb: "Read the case, dig up clues, solve the mystery together.",
  minPlayers: 2,
  maxPlayers: 6,
  modes: ["local", "online"],
  estMinutes: 20,
  rulesHTML: `
    <p>A crime mystery with hidden clues. Work together — but score individually on the final accusation.</p>
    <ol>
      <li>Read the case intro aloud.</li>
      <li>Take turns revealing <b>one clue</b> each on your own device or a shared one.</li>
      <li>When ready, everyone makes a secret accusation: who dunnit?</li>
      <li>Correct accusations score. We explain the full solution. 🕵️</li>
    </ol>
    <p class="muted">Talk it out between clues — the best detectives connect dots early.</p>`,
  mount(ctx) { if (ctx.mode === "online") online(ctx); else local(ctx); },
};

function norm(s) {
  return (s || "").trim().toLowerCase();
}

function checkAnswer(guess, caseData) {
  const g = norm(guess);
  if (!g) return false;
  if (norm(caseData.solution) === g) return true;
  return caseData.keywords.some((k) => g.includes(k));
}

function online(ctx) {
  const { session } = ctx;
  const names = session.players;
  let deck = shuffle(CRIME_CASES);
  let caseIndex = 0;
  let round = 0;
  let current = null;
  let revealed = [];
  let accusations = names.map(() => null);
  const scores = names.map(() => 0);
  const status = connectionPill();
  session.onStatus(status.set);
  const screen = (body) => render(el("div", { class: "screen" }, [gameHeader(ctx, game, status.node), body]));
  const wait = (text) => screen(el("div", { class: "card center" }, [el("div", { class: "spinner" }), el("p", { class: "muted" }, text)]));

  function publicCase() {
    return { title: current.title, intro: current.intro, suspects: current.suspects };
  }

  function investigationPayload() {
    const active = revealed.length % names.length;
    return {
      round,
      caseData: publicCase(),
      active,
      revealed: revealed.map((index) => ({ index, ...current.clues[index] })),
      available: current.clues.map((clue, index) => ({ index, label: clue.label })).filter((clue) => !revealed.includes(clue.index)),
      maxClues: Math.min(names.length * 2, current.clues.length),
    };
  }

  function startCase() {
    if (!session.isHost) return;
    if (caseIndex >= deck.length) { deck = shuffle(CRIME_CASES); caseIndex = 0; }
    round++;
    current = deck[caseIndex++];
    revealed = [];
    accusations = names.map(() => null);
    const payload = investigationPayload();
    session.send("crime_state", payload);
    showInvestigation(payload);
  }

  function showInvestigation(payload) {
    const isActive = session.myIndex === payload.active;
    const clueCards = payload.revealed.map((clue) => el("div", { class: "crime-clue reveal-anim" }, [
      el("div", { class: "who" }, clue.label), el("p", {}, clue.text),
    ]));
    screen(el("div", { class: "screen" }, [
      el("div", { class: "card" }, [
        el("div", { class: "kicker" }, payload.revealed.length ? "Investigation" : "New case"),
        el("h2", { class: "center" }, payload.caseData.title),
        el("p", {}, payload.caseData.intro),
        el("p", { class: "muted center tiny" }, `${payload.revealed.length}/${payload.maxClues} clues opened`),
      ]),
      clueCards.length ? el("div", { class: "stack" }, clueCards) : null,
      isActive ? el("div", { class: "card stack" }, [
        el("div", { class: "pill" }, `${names[payload.active]} - choose a clue`),
        ...payload.available.map((clue) => button(clue.label, {
          variant: "secondary",
          onClick: () => {
            if (session.isHost) chooseClue(clue.index, session.myIndex);
            else session.send("crime_choose", { round, index: clue.index });
          },
        })),
      ]) : el("div", { class: "waiting compact-wait" }, `${names[payload.active]} is choosing the next clue.`),
    ]));
  }

  function chooseClue(index, player) {
    if (!session.isHost || player !== revealed.length % names.length || revealed.includes(index) || !current.clues[index]) return;
    revealed.push(index);
    const maxClues = Math.min(names.length * 2, current.clues.length);
    if (revealed.length >= maxClues) {
      const payload = { round, caseData: publicCase(), revealed: investigationPayload().revealed };
      session.send("crime_accuse_phase", payload);
      showAccusation(payload);
      return;
    }
    const payload = investigationPayload();
    session.send("crime_state", payload);
    showInvestigation(payload);
  }

  function showAccusation(payload) {
    let selected = null;
    const draw = () => screen(el("div", { class: "screen" }, [
      el("div", { class: "card" }, [
        el("h2", { class: "center" }, "Make your private accusation"),
        el("p", { class: "muted center" }, "Review the evidence, then choose one suspect."),
      ]),
      el("div", { class: "stack" }, payload.revealed.map((clue) => el("div", { class: "crime-clue" }, [el("div", { class: "who" }, clue.label), el("p", {}, clue.text)]))),
      el("div", { class: "stack" }, payload.caseData.suspects.map((suspect) => button(suspect, {
        variant: selected === suspect ? "" : "secondary",
        onClick: () => { selected = suspect; draw(); },
      }))),
      el("div", { class: "footer-actions" }, button("Lock accusation", { big: true, disabled: !selected, onClick: () => submitAccusation(selected) })),
    ]));
    draw();
  }

  function submitAccusation(accusation) {
    accusations[session.myIndex] = accusation;
    if (session.isHost) checkAccusations(); else session.send("crime_accuse", { round, accusation });
    wait("Accusation locked. Waiting for the other detectives.");
  }

  function checkAccusations() {
    if (!session.isHost || accusations.some((value) => value == null)) return;
    const correct = accusations.map((accusation) => checkAnswer(accusation, current));
    correct.forEach((value, i) => { if (value) scores[i]++; });
    const payload = {
      round, title: current.title, solution: current.solution, explain: current.explain,
      accusations: accusations.slice(), correct, scores: scores.slice(),
    };
    session.send("crime_reveal", payload);
    showReveal(payload);
  }

  function showReveal(payload) {
    if (payload.correct.some(Boolean)) celebrate();
    screen(el("div", { class: "screen" }, [
      el("div", { class: "card" }, [
        el("div", { class: "kicker" }, "Solution"),
        el("div", { class: "verdict match" }, payload.solution),
        el("p", {}, payload.explain),
      ]),
      el("div", { class: "stack" }, names.map((name, i) => el("div", { class: `answer-card ${payload.correct[i] ? "me" : ""}` }, [
        el("span", { class: "who" }, name),
        el("span", { class: "val" }, `${payload.accusations[i]} ${payload.correct[i] ? "✓" : "×"}`),
      ]))),
      scoreboard(names, payload.scores, { colors: ctx.playerColors }),
      el("div", { class: "footer-actions" }, onlineReadyGate(session, `crime:${payload.round}`, startCase, { label: "Ready for next case" })),
    ]));
    haptic(12);
  }

  session.on("crime_state", (message) => { if (!session.isHost) { round = message.round; showInvestigation(message); } });
  session.on("crime_choose", (message) => { if (session.isHost && message.round === round) chooseClue(message.index, message.from); });
  session.on("crime_accuse_phase", (message) => { if (!session.isHost) showAccusation(message); });
  session.on("crime_accuse", (message) => { if (session.isHost && message.round === round) { accusations[message.from] = message.accusation; checkAccusations(); } });
  session.on("crime_reveal", (message) => { if (!session.isHost) showReveal(message); });

  if (session.isHost) startCase(); else wait("Waiting for the host to open a case.");
}

function local(ctx) {
  const names = ctx.players;
  let deck = shuffle(CRIME_CASES);
  let ci = 0;
  const scores = names.map(() => 0);
  const statusEl = el("span", { class: "pill" }, "Detective mode");
  const screen = (b) => render(el("div", { class: "screen" }, [gameHeader(ctx, game, statusEl), b]));

  async function playCase() {
    if (ci >= deck.length) { deck = shuffle(CRIME_CASES); ci = 0; }
    const c = deck[ci++];
    const revealed = new Set();
    let clueRound = 0;
    const maxClues = Math.min(names.length * 2, c.clues.length);

    await new Promise((res) => {
      screen(el("div", { class: "screen" }, [
        el("div", { class: "card" }, [
          el("div", { class: "kicker" }, "New case"),
          el("h2", { class: "center" }, c.title),
          el("p", { style: "line-height:1.5" }, c.intro),
          el("p", { class: "muted center tiny" }, `${c.clues.length} clues to investigate · ${c.suspects.length} suspects`),
        ]),
        el("div", { class: "footer-actions" }, button("Open case →", { big: true, onClick: res })),
      ]));
    });

    while (revealed.size < maxClues) {
      const pi = clueRound % names.length;
      await passDevice(names[pi], "Pick a clue to reveal to the group");
      await new Promise((res) => {
        const list = el("div", { class: "stack" });
        c.clues.forEach((cl, i) => {
          if (revealed.has(i)) return;
          list.append(button(cl.label, {
            variant: "secondary",
            onClick: () => {
              revealed.add(i);
              res();
            },
          }));
        });
        if (!list.childNodes.length) { res(); return; }
        screen(el("div", { class: "card" }, [
          el("div", { class: "pill" }, `${names[pi]} — investigate`),
          el("p", { class: "muted center" }, "Choose one clue to read aloud"),
          list,
        ]));
      });
      clueRound++;

      const board = el("div", { class: "stack" });
      [...revealed].sort((a, b) => a - b).forEach((i) => {
        const cl = c.clues[i];
        board.append(el("div", { class: "crime-clue reveal-anim" }, [
          el("div", { class: "who" }, cl.label),
          el("p", {}, cl.text),
        ]));
      });

      if (revealed.size < maxClues) {
        await new Promise((res) => {
          screen(el("div", { class: "screen" }, [
            el("div", { class: "card stack" }, board.children.length ? [...board.children] : [el("p", { class: "muted" }, "…")]),
            el("div", { class: "footer-actions" }, button("Continue investigation →", { big: true, onClick: res })),
          ]));
        });
      }
    }

    const clueBoard = el("div", { class: "stack" });
    [...revealed].sort((a, b) => a - b).forEach((i) => {
      const cl = c.clues[i];
      clueBoard.append(el("div", { class: "crime-clue" }, [
        el("div", { class: "who" }, cl.label),
        el("p", {}, cl.text),
      ]));
    });

    await new Promise((res) => {
      screen(el("div", { class: "screen" }, [
        el("div", { class: "card" }, [
          el("h2", { class: "center", style: "font-size:1.2rem" }, "Evidence board"),
          el("p", { class: "muted center tiny" }, "Discuss before you accuse!"),
        ]),
        clueBoard,
        el("div", { class: "footer-actions" }, button("Make accusations →", { big: true, onClick: res })),
      ]));
    });

    const accusations = [];

    for (let i = 0; i < names.length; i++) {
      await passDevice(names[i], "Who do you think did it?");
      await new Promise((res) => {
        const btns = c.suspects.map((s) =>
          button(s, { variant: "secondary", onClick: () => { accusations[i] = s; res(); } }),
        );
        const custom = el("input", { class: "field", style: "text-align:left", placeholder: "Or type a name…", maxlength: "40" });
        const go = button("Accuse ✓", { big: true, disabled: true, onClick: () => {
          accusations[i] = custom.value.trim() || accusations[i];
          res();
        } });
        custom.addEventListener("input", () => { go.disabled = !custom.value.trim() && !accusations[i]; });
        screen(el("div", { class: "card stack" }, [
          el("div", { class: "pill" }, `${names[i]} — your accusation`),
          ...btns,
          el("div", { class: "divider" }, "or type it"),
          custom,
          go,
        ]));
      });
    }

    accusations.forEach((a, i) => { if (checkAnswer(a, c)) scores[i]++; });
    const solvers = accusations.map((a, i) => checkAnswer(a, c) ? i : -1).filter((i) => i >= 0);
    if (solvers.length) celebrate();

    const rows = names.map((n, i) => el("div", { class: `answer-card ${solvers.includes(i) ? "me" : ""}` }, [
      el("span", { class: "who" }, n),
      el("span", { class: "val" }, accusations[i] + (solvers.includes(i) ? " ✓" : " ✗")),
    ]));

    screen(el("div", { class: "screen" }, [
      el("div", { class: "card" }, [
        el("h2", { class: "center" }, "🔓 Solution"),
        el("div", { class: "verdict match" }, c.solution),
        el("p", {}, c.explain),
      ]),
      el("h3", { class: "center", style: "margin:12px 0 8px;font-size:.95rem" }, "Clues you found"),
      clueBoard,
      el("h3", { class: "center", style: "margin:16px 0 8px;font-size:.95rem" }, "Accusations"),
      el("div", { class: "stack" }, rows),
      el("div", { class: "scorebar" }, names.map((n, i) => scoreChip(scores[i], n))),
      el("div", { class: "footer-actions" }, localReadyGate(names, playCase, { label: "ready" })),
    ]));
    haptic(12);
  }

  screen(el("div", { class: "card center" }, [
    el("h2", {}, "🔎 Case Files"),
    el("p", { class: "muted" }, `${deck.length} mysteries loaded.`),
    el("div", { class: "footer-actions" }, button("Open first case →", { big: true, onClick: playCase })),
  ]));
}

export default game;
