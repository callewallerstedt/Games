// "Jeopardy" — a shared trivia board. Pick a theme, then take turns choosing a
// clue from the 5×5 grid (five categories × 100→500 points). The player whose turn
// it is *types* an answer; then the answer is revealed and a judge (the host online,
// or the group on a shared phone) marks it right or wrong. Right keeps the points
// and the turn; wrong passes the turn — and, if the "lose points" option is on,
// subtracts those points. When the whole board is cleared, the highest score wins.
//
// Everyone looks at one board, so local mode is pass-and-play on a single phone.
// Online is host-authoritative (like Triangle Lines): only the player whose turn
// it is can answer, the host owns the correct answers and never sends them to
// clients until the reveal, and each change is broadcast as a fresh board state.

import {
  el, render, button, gameHeader, scoreChip, haptic, celebrate,
  connectionPill, onlineReadyGate, localReadyGate, PLAYER_COLORS, segmented,
} from "../ui.js";
import { THEMES, VALUES } from "../data/jeopardy.js";

const cellKey = (c, r) => `${c}-${r}`;
const TOTAL_CELLS = 25;

const game = {
  id: "jeopardy",
  title: "Jeopardy",
  emoji: "🧠",
  color: "linear-gradient(135deg,#060ce9,#1b3bd6 55%,#e2b13c)",
  blurb: "Pick a clue, type your answer — a judge says if you nailed it.",
  minPlayers: 2,
  maxPlayers: 6,
  onlineMaxPlayers: 6,
  pickColors: true,
  modes: ["local", "online"],
  estMinutes: 15,
  rulesHTML: `
    <p>Choose a <b>theme</b> (and whether wrong answers cost points), then a 5×5
    board appears: five categories across, values from <b>100</b> to <b>500</b> down.</p>
    <ol>
      <li>On your turn, tap any open square to reveal its clue.</li>
      <li><b>Type your answer</b> and submit — no multiple choice.</li>
      <li>The correct answer is revealed and the <b>judge</b> marks you right or wrong.</li>
      <li><b>Right</b> — you win the points and <b>go again</b>.</li>
      <li><b>Wrong</b> — the turn passes on, and you <b>lose</b> the points if that
      option is switched on.</li>
      <li>Higher values are harder but worth more — <b>500s are brutal</b>.</li>
    </ol>
    <p>When every square is used, the player with the <b>most points wins</b>.</p>
    <p class="muted">Online, the <b>host</b> is the judge. On one phone, the group
    judges together — just pass it to whoever's turn it is.</p>`,
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
    phase: "setup",           // setup | board | answer | judge | over
    themeIndex: null,
    penalty: true,            // do wrong answers subtract points?
    turn: 0,
    scores: names.map(() => 0),
    used: [],                 // array of "c-r" keys
    cur: null,                // { c, r, q, typed? }  — no correct answer here
    reveal: null,             // { answer, typed, result: { right, delta } | null }
  };
  // Host-only: the correct answer for the clue currently on screen. Kept out of S so
  // it is never broadcast to clients before the reveal (the judge step).
  let hostAnswer = null;
  // Local setup choice for the "lose points on wrong" option, before a theme is set.
  let setupPenalty = true;
  let celebrated = false;

  const isHostAuthority = () => !online || session.isHost;
  // Who may answer right now — the turn-holder. Locally everyone shares the screen,
  // so the turn-holder always acts; online, only the device whose index is the turn.
  const iControl = () => (!online ? true : session.myIndex === S.turn);
  // Who may judge / advance. Online that's the host; on a shared phone, this device.
  const iJudge = () => (!online || session.isHost);
  const theme = () => THEMES[S.themeIndex];

  const frame = (body) => render(el("div", { class: "screen jeo-screen" }, [gameHeader(ctx, game, status?.node), body]));

  /* ------------------------------- host logic ------------------------------- */

  function commit() {
    if (online && session.isHost) session.send("jeo_state", { state: S });
    renderState();
  }

  function startWithTheme(idx, penalty) {
    if (!isHostAuthority()) { session.send("jeo_act", { kind: "theme", idx, penalty }); return; }
    S = {
      phase: "board", themeIndex: idx, penalty: penalty !== false, turn: 0,
      scores: names.map(() => 0), used: [], cur: null, reveal: null,
    };
    hostAnswer = null;
    celebrated = false;
    commit();
  }

  function pickCell(player, c, r) {
    if (player !== S.turn || S.phase !== "board") return;
    if (S.used.includes(cellKey(c, r))) return;
    const clue = theme().categories[c].clues[r];
    hostAnswer = clue.a;
    S.cur = { c, r, q: clue.q };
    S.reveal = null;
    S.phase = "answer";
    commit();
  }

  function submitAnswer(player, text) {
    if (player !== S.turn || S.phase !== "answer") return;
    const typed = (text || "").trim();
    S.cur = { ...S.cur, typed };
    S.reveal = { answer: hostAnswer, typed, result: null };
    S.phase = "judge";
    commit();
  }

  // Judge the revealed answer. Not gated by turn — the judge (host / shared phone)
  // scores whoever's turn it is.
  function judge(right) {
    if (S.phase !== "judge" || !S.reveal || S.reveal.result) return;
    const value = VALUES[S.cur.r];
    const delta = right ? value : (S.penalty ? -value : 0);
    S.scores[S.turn] += delta;
    S.used = S.used.concat(cellKey(S.cur.c, S.cur.r));
    S.reveal = { ...S.reveal, result: { right, delta } };
    commit();
  }

  function nextAfterJudge() {
    if (S.phase !== "judge" || !S.reveal || !S.reveal.result) return;
    const right = S.reveal.result.right;
    S.cur = null; S.reveal = null;
    hostAnswer = null;
    if (S.used.length >= TOTAL_CELLS) { S.phase = "over"; commit(); return; }
    if (!right) S.turn = (S.turn + 1) % n;
    S.phase = "board";
    commit();
  }

  function rematch() {
    S = { phase: "setup", themeIndex: null, penalty: S.penalty, turn: 0, scores: names.map(() => 0), used: [], cur: null, reveal: null };
    hostAnswer = null;
    setupPenalty = S.penalty;
    celebrated = false;
    commit();
  }

  function applyAction(player, kind, m) {
    if (kind === "theme") startWithTheme(m.idx, m.penalty);
    else if (kind === "pick") pickCell(player, m.c, m.r);
    else if (kind === "submit") submitAnswer(player, m.text);
    else if (kind === "judge") judge(m.right);
    else if (kind === "next") nextAfterJudge();
    else if (kind === "rematch") rematch();
  }

  // A tap dispatches locally (host / local play) or over the wire (online guest).
  function dispatch(kind, payload = {}) {
    const me = online ? session.myIndex : S.turn;
    if (isHostAuthority()) applyAction(me, kind, payload);
    else session.send("jeo_act", { kind, ...payload });
  }
  const act = {
    theme: (idx, penalty) => dispatch("theme", { idx, penalty }),
    pick: (c, r) => dispatch("pick", { c, r }),
    submit: (text) => dispatch("submit", { text }),
    judge: (right) => dispatch("judge", { right }),
    next: () => dispatch("next"),
    rematch: () => dispatch("rematch"),
  };

  if (online) {
    session.on("jeo_act", (m) => { if (session.isHost) applyAction(m.from, m.kind, m); });
    session.on("jeo_state", (m) => { if (!session.isHost) { S = m.state; renderState(); } });
  }

  /* --------------------------------- render --------------------------------- */

  const spinnerWait = (text) => el("div", { class: "waiting compact-wait" }, [el("div", { class: "spinner" }), text]);

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

  function clueHead() {
    return el("div", { class: "jeo-q-head" }, [
      el("span", { class: "jeo-q-cat" }, theme().categories[S.cur.c].name),
      el("span", { class: "jeo-q-value" }, String(VALUES[S.cur.r])),
    ]);
  }

  function renderState() {
    if (S.phase === "setup") return renderSetup();
    if (S.phase === "board") return renderBoard();
    if (S.phase === "answer") return renderAnswer();
    if (S.phase === "judge") return renderJudge();
    if (S.phase === "over") return renderOver();
  }

  function renderSetup() {
    const canPick = isHostAuthority();
    const penaltyToggle = segmented(
      [{ label: "Lose points", value: true }, { label: "No penalty", value: false }],
      setupPenalty,
      (v) => { setupPenalty = v; },
    );
    frame(el("div", { class: "jeo-setup" }, [
      el("div", { class: "jeo-logo" }, [el("span", { class: "jeo-logo-q" }, "?"), el("b", {}, "JEOPARDY")]),
      el("p", { class: "jeo-tag" }, canPick ? "Pick a theme and start the board." : "The host is setting up…"),
      canPick ? el("div", { class: "jeo-option" }, [
        el("span", { class: "jeo-option-label" }, "Wrong answers:"),
        penaltyToggle.node,
      ]) : null,
      el("div", { class: "jeo-themes" }, THEMES.map((t, i) => el("button", {
        class: "jeo-theme-card",
        disabled: !canPick,
        onClick: canPick ? () => act.theme(i, penaltyToggle.get()) : undefined,
      }, [
        el("span", { class: "jeo-theme-emoji" }, t.emoji),
        el("span", { class: "jeo-theme-title" }, t.title),
        el("span", { class: "jeo-theme-blurb" }, t.blurb),
      ]))),
      !canPick ? spinnerWait("Waiting for the host") : null,
    ]));
  }

  function renderBoard() {
    const t = theme();
    const mine = iControl();
    const headerRow = t.categories.map((cat) => el("div", { class: "jeo-cat" }, cat.name));
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

  function renderAnswer() {
    const mine = iControl();
    let body;
    if (mine) {
      const input = el("input", {
        class: "field jeo-input", type: "text", placeholder: "Type your answer…",
        autocomplete: "off", autocapitalize: "sentences", spellcheck: "false", enterkeyhint: "send",
      });
      let sent = false;
      const send = (val) => {
        if (sent) return; sent = true;
        haptic(10);
        act.submit(val != null ? val : input.value);
      };
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
      setTimeout(() => input.focus(), 40);
      body = el("div", { class: "jeo-answer-form" }, [
        input,
        button("Submit answer", { big: true, onClick: () => send() }),
        el("button", { class: "btn ghost jeo-idk", onClick: () => send("") }, "I don't know — reveal answer"),
      ]);
    } else {
      body = spinnerWait(`${names[S.turn]} is answering…`);
    }
    frame(el("div", { class: "jeo-question" }, [
      clueHead(),
      el("div", { class: "jeo-q-text" }, S.cur.q),
      body,
      scorebar(),
    ]));
  }

  function renderJudge() {
    const value = VALUES[S.cur.r];
    const r = S.reveal;
    const judged = !!r.result;
    const guess = r.typed && r.typed.length ? r.typed : "— (no answer)";

    const revealBlock = el("div", { class: "jeo-reveal" }, [
      el("div", { class: "jeo-reveal-row guess" }, [
        el("span", { class: "jeo-reveal-tag" }, `${names[S.turn]} said`),
        el("span", { class: "jeo-reveal-val" }, guess),
      ]),
      el("div", { class: "jeo-reveal-row answer" }, [
        el("span", { class: "jeo-reveal-tag" }, "Correct answer"),
        el("span", { class: "jeo-reveal-val strong" }, r.answer),
      ]),
    ]);

    let footer;
    if (!judged) {
      footer = iJudge()
        ? el("div", { class: "jeo-judge-actions" }, [
            el("p", { class: "muted center tiny" }, online ? "Host: is that right?" : "Was that right?"),
            el("div", { class: "jeo-judge-btns" }, [
              el("button", { class: "btn jeo-judge-no", onClick: () => { haptic(10); act.judge(false); } }, "✗ Wrong"),
              el("button", { class: "btn jeo-judge-yes", onClick: () => { haptic(12); act.judge(true); } }, "✓ Correct"),
            ]),
          ])
        : spinnerWait(online ? "The host is judging…" : "Judging…");
    } else {
      const { right, delta } = r.result;
      const banked = S.scores[S.turn];
      const verdictText = right
        ? `Correct! +${value}`
        : (delta < 0 ? `Wrong — ${delta} points` : "Wrong — no penalty");
      footer = el("div", { class: "jeo-reveal-foot" }, [
        el("div", { class: `jeo-verdict ${right ? "ok" : "bad"}` }, verdictText),
        el("p", { class: "muted center tiny" }, right
          ? `${names[S.turn]} keeps the board (now ${banked}).`
          : `${names[S.turn]} is on ${banked}. Turn passes on.`),
        iJudge()
          ? button(S.used.length >= TOTAL_CELLS ? "See final scores" : (right ? "Pick again →" : "Next player →"),
              { big: true, onClick: act.next })
          : spinnerWait("Waiting for the next clue…"),
      ]);
    }

    frame(el("div", { class: "jeo-question" }, [
      clueHead(),
      el("div", { class: "jeo-q-text" }, S.cur.q),
      revealBlock,
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
        ? onlineReadyGate(session, `jeo:over`, () => { if (session.isHost) rematch(); }, { label: "Play again" })
        : localReadyGate(names, () => act.rematch(), { label: "Play again" })),
    ]));
    if (!celebrated && best > 0) { celebrated = true; celebrate(); }
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
