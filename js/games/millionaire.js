// "Who Wants to Be a Millionaire" — climb the money ladder one trivia question at
// a time. Play all together as one team, or split into rival teams that each run
// their own ladder. Classic lifelines: 50:50, Ask the Audience, Phone a Friend.
//
// Online is host-authoritative: the host owns the questions and never sends the
// correct answer to clients until the reveal. Local mode is pass-and-play, with
// each named player taking the hot seat in turn.

import {
  el, render, button, pill, connectionPill, passDevice, gameHeader,
  celebrate, haptic, onlineReadyGate, localReadyGate, shuffle,
} from "../ui.js";
import { LADDER, SAFE_RUNGS, RUNG_BUCKET, QUESTIONS } from "../data/millionaire.js";

const LETTERS = ["A", "B", "C", "D"];
const TEAM_COLORS = ["#f4c430", "#27c46b", "#4d96ff", "#ff5fa2"];
const money = (n) => "$" + Number(n || 0).toLocaleString("en-US");

const game = {
  id: "millionaire",
  title: "Millionaire",
  emoji: "💰",
  color: "linear-gradient(135deg,#0a1f6b,#1746c9 55%,#f4c430)",
  blurb: "Climb the money ladder to a million — lifelines and all.",
  minPlayers: 1,
  maxPlayers: 10,
  onlineMaxPlayers: 10,
  modes: ["local", "online"],
  estMinutes: 15,
  rulesHTML: `
    <p>Answer 15 trivia questions of rising difficulty to climb from <b>$100</b> to
    <b>$1,000,000</b>. One wrong answer ends your run — but you keep your last
    <b>safe haven</b> ($1,000 and $32,000 are guaranteed once reached).</p>
    <h3>Teams</h3>
    <ul>
      <li><b>All together</b> — the whole room is one team voting on each answer.</li>
      <li><b>Rival teams</b> — split up; every team runs the same ladder and the
      richest team at the end wins. Drag players between teams in the lobby.</li>
    </ul>
    <h3>Lifelines (once each)</h3>
    <ul>
      <li><b>50:50</b> — removes two wrong answers.</li>
      <li><b>Ask the Audience</b> — a poll suggests an answer.</li>
      <li><b>Phone a Friend</b> — a friend gives their best guess.</li>
    </ul>
    <p class="muted">You can <b>walk away</b> any time to bank what you've earned.</p>`,
  mount(ctx) { if (ctx.mode === "online") onlineGame(ctx); else localGame(ctx); },
};

/* ----------------------------- shared helpers ----------------------------- */

// Pick a random unused question for a rung, shuffle its options, and return
// { q, options, correct } with the correct option index after shuffling.
function drawQuestion(rung, used) {
  const bucket = RUNG_BUCKET[rung];
  const pool = QUESTIONS[bucket];
  let pick = null;
  const fresh = pool.filter((item) => !used.has(item));
  const source = fresh.length ? fresh : pool;
  pick = source[Math.floor(Math.random() * source.length)];
  used.add(pick);
  const order = shuffle([0, 1, 2, 3]);
  const options = order.map((i) => pick.a[i]);
  const correct = order.indexOf(0); // correct answer was authored at index 0
  return { q: pick.q, options, correct };
}

// Guaranteed winnings if you miss after correctly banking up to lastCorrectIndex.
function safeHavenValue(lastCorrectIndex) {
  let value = 0;
  for (const s of SAFE_RUNGS) if (s <= lastCorrectIndex) value = Math.max(value, LADDER[s]);
  return value;
}

// Simulated audience poll: the crowd leans toward the right answer, more so on
// easy questions. Returns an array of percentages aligned to the option indices.
function simulateAudience(correct, bucket, hiddenSet = new Set()) {
  const visible = [0, 1, 2, 3].filter((i) => !hiddenSet.has(i));
  const correctBias = [0, 70, 62, 52, 42, 34][bucket] || 45;
  const weights = visible.map((i) => {
    if (i === correct) return correctBias + Math.random() * 14;
    return 6 + Math.random() * 22;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  const dist = [0, 0, 0, 0];
  visible.forEach((opt, k) => { dist[opt] = Math.round((weights[k] / total) * 100); });
  // nudge so the visible options sum to exactly 100
  const sum = visible.reduce((a, opt) => a + dist[opt], 0);
  if (visible.length) dist[visible[0]] += 100 - sum;
  return dist;
}

// Simulated friend: more reliable on easy questions, shakier on hard ones.
function phoneFriend(correct, bucket, options) {
  const reliability = [0, 0.92, 0.85, 0.72, 0.58, 0.45][bucket] || 0.6;
  const right = Math.random() < reliability;
  const pick = right ? correct : (correct + 1 + Math.floor(Math.random() * 3)) % 4;
  const sure = right ? ["I'm almost certain", "Oh, easy — it's", "100%, it's"] : ["I think maybe", "Not totally sure, but possibly", "Hmm… I'd guess"];
  const lead = sure[Math.floor(Math.random() * sure.length)];
  return { pick, text: `${lead} ${LETTERS[pick]}: “${options[pick]}”.` };
}

function logo() {
  return el("div", { class: "mm-logo" }, [
    el("div", { class: "mm-logo-ring" }, el("span", {}, "?")),
    el("div", { class: "mm-logo-text" }, [el("b", {}, "WHO WANTS TO BE A"), el("strong", {}, "MILLIONAIRE")]),
  ]);
}

// The money ladder as a compact horizontal strip; the current rung is centered.
function ladderRail(rung) {
  const chips = LADDER.map((val, i) => {
    const classes = ["mm-rung"];
    if (i === rung) classes.push("current");
    if (SAFE_RUNGS.includes(i)) classes.push("safe");
    if (i < rung) classes.push("won");
    return el("div", { class: classes.join(" ") }, [
      el("span", { class: "mm-rung-num" }, String(i + 1)),
      el("span", { class: "mm-rung-val" }, money(val)),
    ]);
  });
  const wrap = el("div", { class: "mm-ladder" }, chips);
  setTimeout(() => { const c = wrap.querySelector(".mm-rung.current"); if (c) c.scrollIntoView({ inline: "center", block: "nearest" }); }, 0);
  return wrap;
}

// answer lozenges. opts: { options, hidden:Set, selected, locked, correct, wrong,
//   tally:[counts], disabled, onPick }
function answerGrid(opts) {
  const hidden = opts.hidden || new Set();
  return el("div", { class: "mm-answers" }, opts.options.map((text, i) => {
    const classes = ["mm-answer"];
    if (hidden.has(i)) classes.push("gone");
    if (opts.selected === i) classes.push("selected");
    if (opts.locked === i) classes.push("locked");
    if (opts.correct === i) classes.push("correct");
    if (opts.wrong === i) classes.push("wrong");
    const count = opts.tally?.[i] || 0;
    return el("button", {
      class: classes.join(" "),
      disabled: !!opts.disabled || hidden.has(i),
      onClick: opts.onPick && !hidden.has(i) ? () => opts.onPick(i) : undefined,
    }, [
      el("span", { class: "mm-letter" }, LETTERS[i]),
      el("span", { class: "mm-opt" }, text),
      count > 0 ? el("span", { class: "mm-votes" }, "●".repeat(Math.min(count, 6))) : null,
    ]);
  }));
}

function lifelineRow(lifelines, { disabled, onUse }) {
  const items = [
    { key: "fifty", label: "50:50", glyph: "50·50" },
    { key: "audience", label: "Ask the Audience", glyph: "👥" },
    { key: "phone", label: "Phone a Friend", glyph: "📞" },
  ];
  return el("div", { class: "mm-lifelines" }, items.map((item) => {
    const used = lifelines[item.key];
    return el("button", {
      class: `mm-lifeline ${used ? "used" : ""}`.trim(),
      "aria-label": item.label,
      title: item.label,
      disabled: used || disabled,
      onClick: () => onUse(item.key),
    }, [el("span", { class: "mm-lifeline-glyph" }, item.glyph)]);
  }));
}

function audiencePanel(dist, options, hidden = new Set()) {
  return el("div", { class: "mm-audience" }, [
    el("div", { class: "mm-audience-title" }, "👥 Audience poll"),
    el("div", { class: "mm-bars" }, options.map((_, i) => hidden.has(i) ? null : el("div", { class: "mm-bar-col" }, [
      el("div", { class: "mm-bar-track" }, el("div", { class: "mm-bar-fill", style: `height:${dist[i]}%` })),
      el("div", { class: "mm-bar-label" }, `${LETTERS[i]} · ${dist[i]}%`),
    ]))),
  ]);
}

function phonePanel(phone) {
  return el("div", { class: "mm-phone" }, [el("span", {}, "📞"), el("p", {}, phone.text)]);
}

/* -------------------------------- ONLINE -------------------------------- */
function onlineGame(ctx) {
  const { session } = ctx;
  const isHost = session.isHost;
  const names = session.players;
  const N = names.length;
  const status = connectionPill();
  session.onStatus(status.set);
  const frame = (body) => render(el("div", { class: "screen mm-screen" }, [gameHeader(ctx, game, status.node), body]));

  const teamColor = (t) => TEAM_COLORS[t % TEAM_COLORS.length];
  const teamName = (count, t) => (count === 1 ? "Everyone" : `Team ${t + 1}`);

  // Replicated lobby state.
  let teamCount = 1;
  let teamOf = names.map(() => 0);

  // Host-authoritative play state.
  let teams = [];
  let rung = 0;
  let q = null;
  let used = new Set();

  // Client view state (what we last received / chose locally).
  let state = null;        // last mm_state
  let lastRung = -1;
  let myVote = null;
  let myHidden = new Set();
  let myAudience = null;
  let myPhone = null;

  const myTeamIndex = () => teamOf[session.myIndex];

  /* ---- lobby / team builder ---- */
  function canStart() {
    for (let t = 0; t < teamCount; t++) if (!teamOf.includes(t)) return false;
    return true;
  }
  function broadcastTeams() { session.send("mm_teams", { teamCount, teamOf }); }

  function renderBuild() {
    const grouped = Array.from({ length: teamCount }, (_, t) =>
      names.map((n, i) => ({ n, i })).filter((p) => teamOf[p.i] === t));
    const teamCards = grouped.map((members, t) => el("div", { class: "mm-team", style: `--team:${teamColor(t)}` }, [
      el("div", { class: "mm-team-name" }, teamName(teamCount, t)),
      el("div", { class: "mm-team-members" }, members.length
        ? members.map((p) => el("button", {
            class: `mm-chip ${p.i === session.myIndex ? "me" : ""}`.trim(),
            disabled: !isHost,
            onClick: isHost ? () => { teamOf[p.i] = (teamOf[p.i] + 1) % teamCount; broadcastTeams(); renderBuild(); } : undefined,
          }, p.n + (p.i === session.myIndex ? " (you)" : "")))
        : el("span", { class: "mm-team-empty" }, "—")),
    ]));

    const countPicker = isHost ? el("div", { class: "mm-count" }, [
      el("span", {}, "Teams"),
      el("div", { class: "mm-count-btns" }, [1, 2, 3, 4].filter((k) => k <= N).map((k) =>
        el("button", { class: `mm-count-btn ${teamCount === k ? "on" : ""}`.trim(), onClick: () => {
          teamCount = k;
          teamOf = teamOf.map((t) => (t >= k ? 0 : t));
          if (k > 1) names.forEach((_, i) => { teamOf[i] = i % k; }); // spread out evenly
          broadcastTeams(); renderBuild();
        } }, k === 1 ? "All together" : String(k)))),
    ]) : null;

    frame(el("div", { class: "mm-build" }, [
      logo(),
      el("p", { class: "mm-tag" }, "Form your teams, then climb for the million."),
      countPicker,
      el("div", { class: `mm-teams cols-${teamCount}` }, teamCards),
      el("p", { class: "muted center tiny" }, isHost
        ? (teamCount === 1 ? "Everyone plays as one team." : "Tap a player to move them to the next team.")
        : "The host is setting up the teams…"),
      isHost
        ? el("div", { class: "footer-actions" }, button("Start the game ▶", { big: true, disabled: !canStart(), onClick: startGame }))
        : el("div", { class: "waiting compact-wait" }, [el("div", { class: "spinner" }), "Waiting for the host to start"]),
    ]));
  }

  /* ---- host play control ---- */
  function startGame() {
    if (!isHost || !canStart()) return;
    teams = Array.from({ length: teamCount }, (_, t) => ({
      members: names.map((n, i) => i).filter((i) => teamOf[i] === t),
      banked: 0, out: false, walked: false, won: false,
      locked: false, lockedAnswer: null, votes: {},
      lifelines: { fifty: false, audience: false, phone: false },
    }));
    rung = 0; used = new Set();
    startRung();
  }

  function startRung() {
    q = drawQuestion(rung, used);
    teams.forEach((tm) => { if (!tm.out) { tm.locked = false; tm.lockedAnswer = null; tm.votes = {}; } });
    pushState();
  }

  function tallyOf(tm) {
    const counts = [0, 0, 0, 0];
    tm.members.forEach((i) => { const v = tm.votes[i]; if (v != null) counts[v]++; });
    return counts;
  }
  function plurality(tm) {
    const counts = tallyOf(tm);
    let best = -1, idx = null;
    for (let i = 0; i < 4; i++) if (counts[i] > best) { best = counts[i]; idx = i; }
    return best > 0 ? idx : null;
  }

  function publicState() {
    return {
      phase: "quiz", rung, ladderValue: LADDER[rung],
      q: { q: q.q, options: q.options },
      teamCount, teamOf,
      teams: teams.map((tm) => ({
        members: tm.members, banked: tm.banked, out: tm.out, walked: tm.walked, won: tm.won,
        locked: tm.locked, lifelines: tm.lifelines, tally: tallyOf(tm),
      })),
    };
  }
  function pushState() { const ps = publicState(); session.send("mm_state", ps); applyState(ps); }

  function maybeReveal() {
    const active = teams.filter((tm) => !tm.out);
    if (active.length === 0) { endGame(); return; }
    if (active.every((tm) => tm.locked)) doReveal();
  }

  function doReveal() {
    const correct = q.correct;
    const results = teams.map((tm) => {
      if (tm.out) return { out: true, walked: tm.walked, won: tm.won, banked: tm.banked, answer: tm.lockedAnswer, correct: false };
      const ans = tm.locked ? tm.lockedAnswer : plurality(tm);
      const right = ans === correct;
      if (right) {
        tm.banked = LADDER[rung];
        if (rung + 1 >= LADDER.length) { tm.out = true; tm.won = true; }
        return { answer: ans, correct: true, banked: tm.banked, won: tm.won, out: tm.out };
      }
      tm.out = true;
      tm.banked = safeHavenValue(rung - 1);
      return { answer: ans, correct: false, banked: tm.banked, out: true };
    });
    const payload = {
      phase: "reveal", rung, correct, q: { q: q.q, options: q.options },
      teamCount, teamOf, results,
      teams: teams.map((tm) => ({ members: tm.members, banked: tm.banked, out: tm.out, won: tm.won })),
    };
    session.send("mm_reveal", payload);
    applyReveal(payload);
  }

  function hostNext() {
    rung += 1;
    const active = teams.filter((tm) => !tm.out);
    if (active.length === 0 || rung >= LADDER.length) endGame();
    else startRung();
  }

  function endGame() {
    const standings = teams.map((tm, t) => ({
      name: teamName(teamCount, t), color: teamColor(t),
      banked: tm.banked, won: !!tm.won, members: tm.members.map((i) => names[i]),
    }));
    session.send("mm_over", { standings });
    showOver(standings);
  }

  /* ---- host action logic (called directly for the host, via messages for guests) ---- */
  function sendToTeam(t, type, payload) {
    teams[t].members.forEach((i) => session.sendTo(i, type, payload));
  }
  function hostVote(from, answer) {
    const tm = teams[teamOf[from]];
    if (!tm || tm.out || tm.locked) return;
    tm.votes[from] = answer;
    pushState();
  }
  function hostLock(from) {
    const tm = teams[teamOf[from]];
    if (!tm || tm.out || tm.locked) return;
    const ans = plurality(tm);
    if (ans == null) return;
    tm.locked = true; tm.lockedAnswer = ans;
    pushState(); maybeReveal();
  }
  function hostWalk(from) {
    const tm = teams[teamOf[from]];
    if (!tm || tm.out) return;
    tm.walked = true; tm.out = true;
    tm.banked = rung > 0 ? LADDER[rung - 1] : 0;
    pushState(); maybeReveal();
  }
  function hostLifeline(from, type) {
    const t = teamOf[from]; const tm = teams[t];
    if (!tm || tm.out || tm.lifelines[type]) return;
    tm.lifelines[type] = true;
    if (type === "fifty") sendToTeam(t, "mm_fifty", { hide: shuffle([0, 1, 2, 3].filter((i) => i !== q.correct)).slice(0, 2) });
    else if (type === "audience") sendToTeam(t, "mm_audience", { dist: simulateAudience(q.correct, RUNG_BUCKET[rung]) });
    else if (type === "phone") sendToTeam(t, "mm_phone", phoneFriend(q.correct, RUNG_BUCKET[rung], q.options));
    pushState();
  }

  // A player's tap dispatches to the host directly (host) or over the wire (guest).
  const act = {
    vote: (answer) => isHost ? hostVote(session.myIndex, answer) : session.send("mm_vote", { answer }),
    lock: () => isHost ? hostLock(session.myIndex) : session.send("mm_lock", {}),
    walk: () => isHost ? hostWalk(session.myIndex) : session.send("mm_walk", {}),
    lifeline: (type) => isHost ? hostLifeline(session.myIndex, type) : session.send("mm_lifeline", { type }),
  };

  session.on("mm_vote", (m) => { if (isHost) hostVote(m.from, m.answer); });
  session.on("mm_lock", (m) => { if (isHost) hostLock(m.from); });
  session.on("mm_walk", (m) => { if (isHost) hostWalk(m.from); });
  session.on("mm_lifeline", (m) => { if (isHost) hostLifeline(m.from, m.type); });

  /* ---- client rendering from replicated state ---- */
  function applyState(ps) {
    state = ps; teamCount = ps.teamCount; teamOf = ps.teamOf;
    if (ps.rung !== lastRung) { lastRung = ps.rung; myVote = null; myHidden = new Set(); myAudience = null; myPhone = null; }
    renderQuiz();
  }

  function renderQuiz() {
    if (!state) return;
    const t = myTeamIndex();
    const tm = state.teams[t];
    const iAmOut = tm.out;
    const mates = tm.members.length;
    const otherTeams = state.teams
      .map((teamState, idx) => ({ teamState, idx }))
      .filter((x) => x.idx !== t);

    const header = el("div", { class: "mm-quiz-head" }, [
      el("span", { class: "mm-prize", style: `--team:${teamColor(t)}` }, [
        el("b", {}, teamName(state.teamCount, t)),
        el("span", {}, `Playing for ${money(state.ladderValue)}`),
      ]),
      state.teamCount > 1
        ? el("div", { class: "mm-rivals" }, otherTeams.map((x) => el("span", {
            class: `mm-rival ${x.teamState.out ? "out" : ""}`.trim(), style: `--team:${teamColor(x.idx)}`,
          }, [el("i", {}), `${teamName(state.teamCount, x.idx)} · ${money(x.teamState.banked)}${x.teamState.out ? "" : ` · ${x.teamState.locked ? "locked" : "deciding"}`}`])))
        : null,
    ]);

    if (iAmOut) {
      frame(el("div", { class: "mm-quiz spectator" }, [
        header,
        el("div", { class: "mm-banked-note" }, tm.won ? "🏆 You hit the million!" : `Your team is out with ${money(tm.banked)}.`),
        el("div", { class: "mm-question" }, state.q.q),
        answerGrid({ options: state.q.options, disabled: true }),
        el("p", { class: "muted center" }, state.teamCount > 1 ? "Watching the rival teams play on…" : "Waiting for the round to wrap up…"),
      ]));
      return;
    }

    const onPick = (i) => { if (tm.locked) return; myVote = i; act.vote(i); renderQuiz(); };
    const lockBtn = button(myVote == null ? "Pick an answer" : `Final answer: ${LETTERS[myVote]} 🔒`, {
      big: true, disabled: tm.locked || plurExists(tm.tally) == null,
      onClick: act.lock,
    });

    frame(el("div", { class: "mm-quiz" }, [
      header,
      ladderRail(state.rung),
      el("div", { class: "mm-question" }, state.q.q),
      myAudience ? audiencePanel(myAudience, state.q.options, myHidden) : null,
      myPhone ? phonePanel(myPhone) : null,
      answerGrid({
        options: state.q.options, hidden: myHidden,
        selected: myVote != null ? myVote : undefined,
        tally: mates > 1 ? tm.tally : null,
        disabled: tm.locked, onPick,
      }),
      lifelineRow(tm.lifelines, { disabled: tm.locked, onUse: act.lifeline }),
      tm.locked
        ? el("div", { class: "waiting compact-wait" }, [el("div", { class: "spinner" }), state.teamCount > 1 ? "Locked in — waiting for rival teams…" : "Locked in — revealing…"])
        : el("div", { class: "mm-actions" }, [
            lockBtn,
            button("Walk away with " + money(state.rung > 0 ? LADDER[state.rung - 1] : 0), { variant: "secondary", onClick: act.walk }),
          ]),
      isHost ? el("div", { class: "mm-host-tools" }, button("Force reveal", { variant: "ghost", onClick: hostForceReveal })) : null,
    ]));
  }

  // host can force the reveal if a team stalls — unlocked active teams lock their
  // current plurality (or count as no-answer).
  function hostForceReveal() {
    if (!isHost) return;
    teams.forEach((tm) => {
      if (tm.out || tm.locked) return;
      tm.lockedAnswer = plurality(tm); tm.locked = true;
    });
    pushState(); doReveal();
  }

  function applyReveal(rev) {
    teamCount = rev.teamCount; teamOf = rev.teamOf;
    const t = teamOf[session.myIndex];
    const myResult = rev.results[t];
    if (myResult && myResult.correct && !myResult.out) celebrate();
    const rows = rev.results.map((res, idx) => {
      if (rev.teamCount === 1 && idx !== t) return null;
      const right = res.correct;
      const label = res.out && res.walked ? "walked away" : res.won ? "WON $1,000,000!" : right ? "correct! advancing" : res.out ? "wrong — out" : "";
      return el("div", { class: `mm-result ${right ? "ok" : res.out ? "bad" : ""}`.trim(), style: `--team:${teamColor(idx)}` }, [
        el("b", {}, teamName(rev.teamCount, idx)),
        el("span", {}, `${res.answer != null ? LETTERS[res.answer] + " · " : ""}${label}`),
        el("strong", {}, money(res.banked)),
      ]);
    });
    const activeLeft = rev.teams.filter((tm) => !tm.out).length;
    frame(el("div", { class: "mm-quiz reveal" }, [
      el("div", { class: "mm-question" }, rev.q.q),
      answerGrid({ options: rev.q.options, correct: rev.correct, disabled: true }),
      el("div", { class: "mm-result-list" }, rows),
      el("div", { class: "footer-actions" },
        onlineReadyGate(session, `mm:${rev.rung}`, () => { if (isHost) hostNext(); },
          { label: activeLeft > 0 && rev.rung + 1 < LADDER.length ? "Ready for next question" : "See final results" })),
    ]));
  }

  function showOver(standings) {
    const ranked = standings.slice().sort((a, b) => b.banked - a.banked);
    const top = ranked[0];
    if (top && top.banked > 0) celebrate();
    frame(el("div", { class: "mm-over" }, [
      logo(),
      el("h1", { class: "mm-over-title" }, top && top.banked > 0
        ? (standings.length > 1 ? `${top.name} wins with ${money(top.banked)}!` : `You banked ${money(top.banked)}!`)
        : "No money this time — play again!"),
      el("div", { class: "mm-standings" }, ranked.map((s, i) => el("div", {
        class: `mm-standing ${i === 0 && s.banked > 0 ? "winner" : ""}`.trim(), style: `--team:${s.color}`,
      }, [
        el("span", { class: "mm-standing-place" }, ["🥇", "🥈", "🥉"][i] || `#${i + 1}`),
        el("span", { class: "mm-standing-name" }, `${s.name}${s.won ? " 👑" : ""}`),
        el("strong", {}, money(s.banked)),
      ]))),
      el("p", { class: "muted center tiny" }, "Teams: " + standings.map((s) => `${s.name} (${s.members.join(", ")})`).join(" · ")),
      el("div", { class: "footer-actions" }, isHost
        ? button("Back to game room", { big: true, onClick: ctx.exit })
        : el("p", { class: "muted center" }, "Thanks for playing!")),
    ]));
  }

  /* ---- client subscriptions ---- */
  session.on("mm_teams", (m) => { if (isHost) return; teamCount = m.teamCount; teamOf = m.teamOf; if (!state) renderBuild(); });
  session.on("mm_state", (m) => { if (!isHost) applyState(m); });
  session.on("mm_reveal", (m) => { if (!isHost) applyReveal(m); });
  session.on("mm_over", (m) => { if (!isHost) showOver(m.standings); });
  session.on("mm_fifty", (m) => { myHidden = new Set(m.hide); renderQuiz(); });
  session.on("mm_audience", (m) => { myAudience = m.dist; renderQuiz(); });
  session.on("mm_phone", (m) => { myPhone = { pick: m.pick, text: m.text }; renderQuiz(); });

  // start
  if (isHost) { broadcastTeams(); renderBuild(); }
  else { renderBuild(); frame(el("div", { class: "mm-build" }, [logo(), el("div", { class: "waiting" }, [el("div", { class: "spinner" }), "Joining the studio…"])])); }
}

function plurExists(tally) {
  if (!tally) return 0; // single-voter teams: lock allowed once they've voted (handled host-side)
  let best = -1, idx = null;
  for (let i = 0; i < 4; i++) if (tally[i] > best) { best = tally[i]; idx = i; }
  return best > 0 ? idx : null;
}

/* --------------------------------- LOCAL --------------------------------- */
function localGame(ctx) {
  const names = ctx.players;
  const statusEl = pill(names.length > 1 ? `${names.length} contestants` : "Solo");
  const frame = (body) => render(el("div", { class: "screen mm-screen" }, [gameHeader(ctx, game, statusEl), body]));
  const used = new Set();
  const results = [];

  async function playContestant(ci) {
    if (names.length > 1) await passDevice(names[ci], "You're in the hot seat!");
    let rung = 0;
    let banked = 0;
    const lifelines = { fifty: false, audience: false, phone: false };

    while (rung < LADDER.length) {
      const q = drawQuestion(rung, used);
      const bucket = RUNG_BUCKET[rung];
      const stop = await new Promise((resolve) => {
        let hidden = new Set();
        let audience = null;
        let phone = null;
        let selected = null;
        let locked = false;

        function draw() {
          const body = [
            el("div", { class: "mm-quiz-head" }, [
              el("span", { class: "mm-prize", style: "--team:#f4c430" }, [el("b", {}, names[ci]), el("span", {}, `Playing for ${money(LADDER[rung])}`)]),
            ]),
            ladderRail(rung),
            el("div", { class: "mm-question" }, q.q),
            audience ? audiencePanel(audience, q.options, hidden) : null,
            phone ? phonePanel(phone) : null,
            answerGrid({
              options: q.options, hidden, selected: selected != null ? selected : undefined,
              locked: locked ? selected : undefined,
              disabled: locked,
              onPick: (i) => { selected = i; draw(); },
            }),
            lifelineRow(lifelines, { disabled: locked, onUse: (key) => {
              if (lifelines[key]) return;
              lifelines[key] = true;
              if (key === "fifty") hidden = new Set(shuffle([0, 1, 2, 3].filter((i) => i !== q.correct)).slice(0, 2));
              else if (key === "audience") audience = simulateAudience(q.correct, bucket, hidden);
              else if (key === "phone") phone = phoneFriend(q.correct, bucket, q.options);
              if (key === "fifty" && selected != null && hidden.has(selected)) selected = null;
              draw();
            } }),
            el("div", { class: "mm-actions" }, [
              button(selected == null ? "Pick an answer" : `Final answer: ${LETTERS[selected]} 🔒`, {
                big: true, disabled: selected == null, onClick: () => lockIn(),
              }),
              button("Walk away with " + money(rung > 0 ? LADDER[rung - 1] : 0), { variant: "secondary", onClick: () => resolve({ walked: true, banked: rung > 0 ? LADDER[rung - 1] : 0 }) }),
            ]),
          ];
          frame(el("div", { class: "mm-quiz" }, body));
        }

        function lockIn() {
          if (selected == null || locked) return;
          locked = true;
          const right = selected === q.correct;
          haptic(right ? [10, 30, 10] : 30);
          // reveal
          frame(el("div", { class: "mm-quiz reveal" }, [
            el("div", { class: "mm-question" }, q.q),
            answerGrid({ options: q.options, correct: q.correct, wrong: right ? undefined : selected, disabled: true }),
            el("div", { class: `mm-result ${right ? "ok" : "bad"}`, style: "--team:#f4c430" }, [
              el("b", {}, right ? "Correct!" : "Wrong answer"),
              el("strong", {}, right ? money(LADDER[rung]) : money(safeHavenValue(rung - 1))),
            ]),
            el("div", { class: "footer-actions" }, button(
              right ? (rung + 1 >= LADDER.length ? "Collect $1,000,000 🏆" : "Next question →") : "End run",
              { big: true, onClick: () => {
                if (right) {
                  if (rung + 1 >= LADDER.length) { celebrate(); resolve({ won: true, banked: LADDER[rung] }); }
                  else resolve({ advance: true });
                } else resolve({ out: true, banked: safeHavenValue(rung - 1) });
              } })),
          ]));
          if (right && rung + 1 < LADDER.length) {} // continue handled on click
        }

        draw();
      });

      if (stop.advance) { banked = LADDER[rung]; rung += 1; continue; }
      banked = stop.banked != null ? stop.banked : banked;
      break;
    }
    results[ci] = banked;
  }

  async function run() {
    for (let ci = 0; ci < names.length; ci++) await playContestant(ci);
    const ranked = names.map((n, i) => ({ n, banked: results[i] || 0 })).sort((a, b) => b.banked - a.banked);
    const top = ranked[0];
    if (top && top.banked > 0) celebrate();
    frame(el("div", { class: "mm-over" }, [
      logo(),
      el("h1", { class: "mm-over-title" }, top && top.banked > 0
        ? (names.length > 1 ? `${top.n} wins with ${money(top.banked)}!` : `You banked ${money(top.banked)}!`)
        : "No money this time — play again!"),
      el("div", { class: "mm-standings" }, ranked.map((s, i) => el("div", {
        class: `mm-standing ${i === 0 && s.banked > 0 ? "winner" : ""}`.trim(), style: "--team:#f4c430",
      }, [
        el("span", { class: "mm-standing-place" }, ["🥇", "🥈", "🥉"][i] || `#${i + 1}`),
        el("span", { class: "mm-standing-name" }, s.n),
        el("strong", {}, money(s.banked)),
      ]))),
      el("div", { class: "footer-actions" }, button("Back to menu", { big: true, onClick: ctx.exit })),
    ]));
  }

  run();
}

export default game;
