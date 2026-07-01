// "Jeopardy" — a shared trivia board. Pick a theme, then take turns choosing a
// clue from the 5×5 grid (five categories × 100→500 points). Answer right and you
// keep the points and pick again; answer wrong and you lose those points and the
// turn passes on. When the whole board is cleared, the highest score wins.
//
// Everyone looks at one board, so local mode is pass-and-play on a single phone.
// Online is host-authoritative (like Triangle Lines): only the player whose turn
// it is can act, the host owns the answers and never sends the correct option to
// clients until the reveal, and each change is broadcast as a fresh board state.

import {
  el, render, button, gameHeader, scoreChip, haptic, celebrate, shuffle,
  connectionPill, onlineReadyGate, localReadyGate, PLAYER_COLORS,
} from "../ui.js";
import { THEMES, VALUES } from "../data/jeopardy.js";

const LETTERS = ["A", "B", "C", "D"];
const cellKey = (c, r) => `${c}-${r}`;

const game = {
  id: "jeopardy",
  title: "Jeopardy",
  emoji: "🧠",
  color: "linear-gradient(135deg,#060ce9,#1b3bd6 55%,#e2b13c)",
  blurb: "Pick a clue off the board — right keeps the points, wrong loses them.",
  minPlayers: 2,
  maxPlayers: 6,
  onlineMaxPlayers: 6,
  pickColors: true,
  modes: ["local", "online"],
  estMinutes: 15,
  rulesHTML: `
    <p>Choose a <b>theme</b>, then a 5×5 board appears: five categories across,
    point values from <b>100</b> to <b>500</b> down.</p>
    <ol>
      <li>On your turn, tap any open square to reveal its multiple-choice clue.</li>
      <li><b>Right</b> — you win that many points and <b>go again</b>.</li>
      <li><b>Wrong</b> — you <b>lose</b> that many points and the turn passes on.</li>
      <li>Higher values are harder but worth more.</li>
    </ol>
    <p>When every square is used, the player with the <b>most points wins</b>.</p>
    <p class="muted">Everyone shares one board — on a single phone, just pass it to
    whoever's turn it is.</p>`,
  mount(ctx) { play(ctx); },
};

function play(ctx) {
  const names = ctx.players;
  const n = names.length;
  const online = ctx.mode === "online";
  const session = ctx.session;
  const colors = Array.from({ length: n }, (_, i) => ctx.playerColors?.[i] || PLAYER_COLORS[i % PLAYER_COLORS.length]);

  const status = online ? connectionPill() : null;
  if (status) session.onStatus(status.set);

  // Shared board state. On the host (and in local play) this is authoritative and
  // mutated directly; on online guests it is replaced wholesale from jeo_state.
  let S = {
    phase: "setup",           // setup | board | question | reveal | over
    themeIndex: null,
    turn: 0,
    scores: names.map(() => 0),
    used: [],                 // array of "c-r" keys
    cur: null,                // { c, r, q, options:[4] }  — no correct index here
    reveal: null,             // { pick, correct, right, delta }
  };
  // Host-only: the correct option index for the clue currently on screen. Kept out
  // of S so it is never broadcast to clients before the reveal.
  let hostCorrect = null;

  const isHostAuthority = () => !online || session.isHost;
  // Who is allowed to act right now. Locally everyone shares the screen, so the
  // turn-holder always acts; online, only the device whose index matches the turn.
  const iControl = () => (!online ? true : session.myIndex === S.turn);
  const theme = () => THEMES[S.themeIndex];

  const frame = (body) => render(el("div", { class: "screen jeo-screen" }, [gameHeader(ctx, game, status?.node), body]));

  /* ------------------------------- host logic ------------------------------- */

  function commit() {
    if (online && session.isHost) session.send("jeo_state", { state: S });
    renderState();
  }

  function startWithTheme(idx) {
    if (!isHostAuthority()) { session.send("jeo_act", { kind: "theme", idx }); return; }
    S = {
      phase: "board", themeIndex: idx, turn: 0,
      scores: names.map(() => 0), used: [], cur: null, reveal: null,
    };
    hostCorrect = null;
    commit();
  }

  function pickCell(player, c, r) {
    if (player !== S.turn || S.phase !== "board") return;
    if (S.used.includes(cellKey(c, r))) return;
    const clue = theme().categories[c].clues[r];
    const order = shuffle([0, 1, 2, 3]);
    hostCorrect = order.indexOf(0);      // correct answer authored at index 0
    S.cur = { c, r, q: clue.q, options: order.map((i) => clue.a[i]) };
    S.reveal = null;
    S.phase = "question";
    commit();
  }

  function answer(player, optIndex) {
    if (player !== S.turn || S.phase !== "question") return;
    const value = VALUES[S.cur.r];
    const right = optIndex === hostCorrect;
    const delta = right ? value : -value;
    S.scores[S.turn] += delta;
    S.used = S.used.concat(cellKey(S.cur.c, S.cur.r));
    S.reveal = { pick: optIndex, correct: hostCorrect, right, delta };
    S.phase = "reveal";
    commit();
  }

  function nextAfterReveal(player) {
    if (player !== S.turn || S.phase !== "reveal") return;
    const right = S.reveal.right;
    S.cur = null; S.reveal = null;
    hostCorrect = null;
    if (S.used.length >= 25) { S.phase = "over"; commit(); return; }
    if (!right) S.turn = (S.turn + 1) % n;
    S.phase = "board";
    commit();
  }

  function rematch(player) {
    if (player !== S.turn && S.phase === "over") { /* any turn-holder may restart */ }
    S = { phase: "setup", themeIndex: null, turn: 0, scores: names.map(() => 0), used: [], cur: null, reveal: null };
    hostCorrect = null;
    commit();
  }

  function applyAction(player, kind, m) {
    if (kind === "theme") startWithTheme(m.idx);
    else if (kind === "pick") pickCell(player, m.c, m.r);
    else if (kind === "answer") answer(player, m.i);
    else if (kind === "next") nextAfterReveal(player);
    else if (kind === "rematch") rematch(player);
  }

  // A tap dispatches locally (host / local play) or over the wire (online guest).
  function dispatch(kind, payload = {}) {
    const me = online ? session.myIndex : S.turn;
    if (isHostAuthority()) applyAction(me, kind, payload);
    else session.send("jeo_act", { kind, ...payload });
  }
  const act = {
    theme: (idx) => dispatch("theme", { idx }),
    pick: (c, r) => dispatch("pick", { c, r }),
    answer: (i) => dispatch("answer", { i }),
    next: () => dispatch("next"),
    rematch: () => dispatch("rematch"),
  };

  if (online) {
    session.on("jeo_act", (m) => { if (session.isHost) applyAction(m.from, m.kind, m); });
    session.on("jeo_state", (m) => { if (!session.isHost) { S = m.state; renderState(); } });
  }

  /* --------------------------------- render --------------------------------- */

  function scorebar() {
    return el("div", { class: "scorebar jeo-scorebar" }, names.map((nm, i) =>
      scoreChip(S.scores[i], nm, { active: i === S.turn, color: colors[i] })));
  }

  function turnBanner(text) {
    const color = colors[S.turn];
    return el("div", { class: "jeo-turn", style: `--turn-color:${color}`, role: "status" }, [
      el("span", { class: "jeo-turn-dot", "aria-hidden": "true" }),
      el("span", { class: "jeo-turn-name" }, names[S.turn]),
      el("span", { class: "jeo-turn-label" }, text),
    ]);
  }

  function renderState() {
    if (S.phase === "setup") return renderSetup();
    if (S.phase === "board") return renderBoard();
    if (S.phase === "question" || S.phase === "reveal") return renderQuestion();
    if (S.phase === "over") return renderOver();
  }

  function renderSetup() {
    const canPick = isHostAuthority();
    frame(el("div", { class: "jeo-setup" }, [
      el("div", { class: "jeo-logo" }, [el("span", { class: "jeo-logo-q" }, "?"), el("b", {}, "JEOPARDY")]),
      el("p", { class: "jeo-tag" }, canPick ? "Pick a theme for the board." : "The host is picking a theme…"),
      el("div", { class: "jeo-themes" }, THEMES.map((t, i) => el("button", {
        class: "jeo-theme-card",
        disabled: !canPick,
        onClick: canPick ? () => act.theme(i) : undefined,
      }, [
        el("span", { class: "jeo-theme-emoji" }, t.emoji),
        el("span", { class: "jeo-theme-title" }, t.title),
        el("span", { class: "jeo-theme-blurb" }, t.blurb),
      ]))),
      !canPick ? el("div", { class: "waiting compact-wait" }, [el("div", { class: "spinner" }), "Waiting for the host"]) : null,
    ]));
  }

  function renderBoard() {
    const t = theme();
    const mine = iControl();
    const headerRow = t.categories.map((cat) =>
      el("div", { class: "jeo-cat" }, cat.name));
    const cells = [];
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const used = S.used.includes(cellKey(c, r));
        cells.push(el("button", {
          class: `jeo-cell ${used ? "used" : ""}`.trim(),
          disabled: used || !mine,
          "aria-label": `${t.categories[c].name} for ${VALUES[r]}`,
          onClick: (!used && mine) ? () => { haptic(8); act.pick(c, r); } : undefined,
        }, used ? "" : String(VALUES[r])));
      }
    }
    frame(el("div", { class: "jeo-board-wrap" }, [
      turnBanner(mine ? " — pick a clue" : " is picking…"),
      el("div", { class: "jeo-board" }, [
        el("div", { class: "jeo-cats" }, headerRow),
        el("div", { class: "jeo-grid" }, cells),
      ]),
      !mine ? el("p", { class: "muted center tiny" }, "Watching the board…") : null,
      scorebar(),
    ]));
  }

  function renderQuestion() {
    const t = theme();
    const reveal = S.phase === "reveal" ? S.reveal : null;
    const mine = iControl();
    const value = VALUES[S.cur.r];
    const options = el("div", { class: "jeo-answers" }, S.cur.options.map((text, i) => {
      const classes = ["jeo-answer"];
      if (reveal) {
        if (i === reveal.correct) classes.push("correct");
        else if (i === reveal.pick) classes.push("wrong");
      }
      return el("button", {
        class: classes.join(" "),
        disabled: !!reveal || !mine,
        onClick: (!reveal && mine) ? () => { haptic(10); act.answer(i); } : undefined,
      }, [el("span", { class: "jeo-letter" }, LETTERS[i]), el("span", { class: "jeo-opt" }, text)]);
    }));

    let footer;
    if (reveal) {
      const banked = S.scores[S.turn];
      footer = el("div", { class: "jeo-reveal-foot" }, [
        el("div", { class: `jeo-verdict ${reveal.right ? "ok" : "bad"}` },
          reveal.right ? `Correct! +${value}` : `Wrong — ${reveal.delta} points`),
        el("p", { class: "muted center tiny" }, reveal.right
          ? `${names[S.turn]} keeps the board (now ${banked}).`
          : `${names[S.turn]} drops to ${banked}. Turn passes on.`),
        mine
          ? button(S.used.length >= 25 ? "See final scores" : (reveal.right ? "Pick again →" : "Next player →"),
              { big: true, onClick: act.next })
          : el("div", { class: "waiting compact-wait" }, [el("div", { class: "spinner" }), `Waiting for ${names[S.turn]}`]),
      ]);
    } else if (mine) {
      footer = el("p", { class: "muted center tiny" }, "Choose your answer.");
    } else {
      footer = el("div", { class: "waiting compact-wait" }, [el("div", { class: "spinner" }), `${names[S.turn]} is answering…`]);
    }

    frame(el("div", { class: "jeo-question" }, [
      el("div", { class: "jeo-q-head" }, [
        el("span", { class: "jeo-q-cat" }, t.categories[S.cur.c].name),
        el("span", { class: "jeo-q-value" }, String(value)),
      ]),
      el("div", { class: "jeo-q-text" }, S.cur.q),
      options,
      footer,
      scorebar(),
    ]));
  }

  function renderOver() {
    const ranked = names
      .map((nm, i) => ({ nm, score: S.scores[i], color: colors[i] }))
      .sort((a, b) => b.score - a.score);
    const best = ranked[0].score;
    const winners = ranked.filter((r) => r.score === best);
    const tie = winners.length > 1;
    if (S.phase === "over") { /* celebrate once on entry handled below */ }
    frame(el("div", { class: "jeo-over" }, [
      el("div", { class: "jeo-logo" }, [el("span", { class: "jeo-logo-q" }, "?"), el("b", {}, "JEOPARDY")]),
      el("h1", { class: "jeo-over-title" }, tie
        ? `It's a tie at ${best}!`
        : `${winners[0].nm} wins with ${best}!`),
      el("div", { class: "jeo-standings" }, ranked.map((r, i) => el("div", {
        class: `jeo-standing ${i === 0 ? "winner" : ""}`.trim(), style: `--player-color:${r.color}`,
      }, [
        el("span", { class: "jeo-standing-place" }, ["🥇", "🥈", "🥉"][i] || `#${i + 1}`),
        el("span", { class: "jeo-standing-dot" }),
        el("span", { class: "jeo-standing-name" }, r.nm),
        el("strong", {}, String(r.score)),
      ]))),
      el("div", { class: "footer-actions" }, online
        ? onlineReadyGate(session, `jeo:over`, () => { if (session.isHost) rematch(0); }, { label: "Play again" })
        : localReadyGate(names, () => act.rematch(), { label: "Play again" })),
    ]));
    if (best > 0) celebrate();
  }

  // Boot.
  if (online && !session.isHost) {
    // Guests wait for the first jeo_state; show a friendly placeholder meanwhile.
    frame(el("div", { class: "jeo-setup" }, [
      el("div", { class: "jeo-logo" }, [el("span", { class: "jeo-logo-q" }, "?"), el("b", {}, "JEOPARDY")]),
      el("div", { class: "waiting" }, [el("div", { class: "spinner" }), "Joining the board…"]),
    ]));
  } else {
    renderState();
  }
}

export default game;
