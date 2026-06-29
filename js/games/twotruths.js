// "Two Truths & a Lie" — one writes two true things and one lie about themselves;
// the other hunts the lie. Roles swap. Co-op "lie detector" score.
// Online (2 phones) or one phone (pass it).

import { el, render, button, connectionPill, passDevice, gameHeader, meter, shuffle, celebrate } from "../ui.js";

const game = {
  id: "ttl",
  title: "Two Truths & a Lie",
  emoji: "🤥",
  color: "linear-gradient(135deg,#f0a13b,#e8556b)",
  blurb: "Two truths, one lie about you — can they spot the fib?",
  minPlayers: 2,
  maxPlayers: 2,
  modes: ["local", "online"],
  estMinutes: 12,
  rulesHTML: `
    <p>A classic — and a great way to learn surprising things about each other.</p>
    <ol>
      <li>One of you writes <b>two true</b> statements about yourself and <b>one lie</b>.</li>
      <li>Mark which one is the lie, then hand over / send it.</li>
      <li>The other picks the statement they think is the <b>lie</b>.</li>
      <li>Reveal! Spotting the lie scores a point. Then swap.</li>
    </ol>
    <p class="muted">The juicier and more believable the lie, the better. 😏</p>`,
  mount(ctx) { ctx.mode === "online" ? online(ctx) : local(ctx); },
};

// Compose screen → resolves { statements:[3], lieIndex } already shuffled.
function compose(renderInto, name, onDone) {
  const vals = ["", "", ""];
  let lie = 0;
  const fields = [0, 1, 2].map((k) => {
    const f = el("input", { class: "field", style: "text-align:left", placeholder: `Statement ${k + 1}`, maxlength: "70",
      oninput: (e) => { vals[k] = e.target.value; refresh(); } });
    return f;
  });
  const lieSeg = el("div", { class: "seg" });
  const segBtns = [0, 1, 2].map((k) =>
    el("button", { class: k === lie ? "on" : "", onClick: () => { lie = k; segBtns.forEach((b, j) => b.classList.toggle("on", j === lie)); } }, `#${k + 1}`));
  segBtns.forEach((b) => lieSeg.append(b));
  const go = button("Lock it in ✓", { big: true, disabled: true, onClick: () => {
    // shuffle the 3 so the lie isn't always in the marked slot
    const order = shuffle([0, 1, 2]);
    const statements = order.map((o) => vals[o].trim());
    const lieIndex = order.indexOf(lie);
    onDone({ statements, lieIndex });
  } });
  function refresh() { go.disabled = vals.some((v) => v.trim() === ""); }
  renderInto(el("div", { class: "card" }, [
    el("div", { class: "pill" }, `🤥 ${name} — two truths, one lie`),
    el("p", { class: "muted tiny", style: "margin:10px 0 4px" }, "Write three statements about you:"),
    el("div", { class: "stack" }, fields),
    el("p", { class: "muted tiny", style: "margin:14px 0 6px" }, "Which one is the lie?"),
    lieSeg,
    el("div", { style: "margin-top:16px" }, go),
  ]));
  setTimeout(() => fields[0].focus(), 50);
}

// Guess screen → resolves chosen index.
function guessUI(renderInto, name, statements, onDone) {
  let sel = null;
  const draw = () => renderInto(el("div", { class: "screen" }, [
    el("div", { class: "kicker" }, `Which is ${name}'s lie?`),
    el("div", { class: "stack", style: "margin-top:12px" }, statements.map((s, k) =>
      el("button", { class: `choice ${sel === k ? "sel" : ""}`, onClick: () => { sel = k; draw(); } },
        [el("span", { class: "lead" }, k + 1), el("span", {}, s)]))),
    el("div", { class: "footer-actions" }, button("That's the lie! 🤥", { big: true, disabled: sel === null, onClick: () => onDone(sel) })),
  ]));
  draw();
}

function revealScreen(statements, lieIndex, guessIndex, name) {
  const correct = guessIndex === lieIndex;
  if (correct) celebrate();
  return el("div", { class: "screen" }, [
    el("div", { class: `verdict ${correct ? "match" : "nomatch"}` }, correct ? "🕵️ Lie detected!" : "😈 The lie got past you!"),
    el("div", { class: "stack", style: "margin-top:6px" }, statements.map((s, k) => {
      const cls = k === lieIndex ? "wrong" : "correct";
      const badge = [k === lieIndex ? "🤥 The lie" : "✓ True", k === guessIndex ? "Your pick" : null].filter(Boolean).join(" · ");
      return el("div", { class: `choice ${cls}` }, [el("span", { class: "lead" }, k + 1), el("span", {}, s), el("span", { class: "badge" }, badge)]);
    })),
  ]);
}

function online(ctx) {
  const { session } = ctx;
  const isHost = session.isHost;
  let round = 0;
  let stats = { rounds: 0, found: 0 };
  let cur = null; // { statements, lieIndex }
  const status = connectionPill();
  session.onStatus(status.set);
  const screen = (body) => render(el("div", { class: "screen" }, [gameHeader(ctx, game, status.node), body]));
  const myIdx = isHost ? 0 : 1;
  const nameOf = (i) => session.players[i];
  const tellerIdx = () => round % 2;

  function hostNewRound() {
    cur = null;
    if (tellerIdx() === 0) composeAsTeller();           // host tells
    else { session.send("ttl_yourturn", {}); waiting(`Waiting for ${session.partnerName} to write theirs…`); } // guest tells
  }
  function composeAsTeller() {
    compose(screen, "You", (data) => {
      cur = data;
      if (isHost) { session.send("ttl_guess", { statements: data.statements }); waiting(`Waiting for ${session.partnerName} to guess…`); }
      else { session.send("ttl_composed", data); waiting(`Waiting for ${session.partnerName} to guess…`); }
    });
  }
  function asGuesser(statements) {
    guessUI(screen, nameOf(tellerIdx()), statements, (idx) => {
      if (isHost) doReveal(idx);
      else { session.send("ttl_choice", { index: idx }); waiting("Checking…"); }
    });
  }
  function doReveal(guessIndex) {
    const correct = guessIndex === cur.lieIndex;
    stats.rounds++; if (correct) stats.found++;
    const payload = { statements: cur.statements, lieIndex: cur.lieIndex, guessIndex, tellerIdx: tellerIdx(), stats };
    session.send("ttl_reveal", payload);
    showReveal(payload);
  }
  function showReveal(p) {
    const body = revealScreen(p.statements, p.lieIndex, p.guessIndex, nameOf(p.tellerIdx));
    body.append(el("div", { style: "margin:12px 4px 0" }, [
      el("div", { class: "tiny muted center", style: "margin-bottom:6px" }, `Lie detector · ${p.stats.found}/${p.stats.rounds}`),
      meter(p.stats.rounds ? p.stats.found / p.stats.rounds : 0)]),
      el("div", { class: "footer-actions" }, button("Next round →", { big: true, onClick: () => isHost ? (round++, hostNewRound()) : session.send("ttl_next") })));
    screen(body);
  }
  const waiting = (msg) => screen(el("div", { class: "card" }, [el("div", { class: "waiting" }, [el("div", { class: "spinner" }), msg])]));

  // Guest handlers
  session.on("ttl_yourturn", () => composeAsTeller());
  session.on("ttl_guess", (m) => asGuesser(m.statements));
  session.on("ttl_reveal", (m) => { stats = m.stats; round = m.round ?? round; showReveal(m); });
  // Host handlers
  if (isHost) {
    session.on("ttl_composed", (m) => { cur = m; asGuesser(m.statements); });   // guest told, host guesses
    session.on("ttl_choice", (m) => doReveal(m.index));                          // guest guessed
    session.on("ttl_next", () => { round++; hostNewRound(); });
  }
  if (isHost) hostNewRound();
  else waiting(`Waiting for ${session.partnerName} to start…`);
}

function local(ctx) {
  const names = ctx.players;
  let round = 0;
  let stats = { rounds: 0, found: 0 };
  const statusEl = el("span", { class: "pill" }, "Pass & play");
  const screen = (body) => render(el("div", { class: "screen" }, [gameHeader(ctx, game, statusEl), body]));

  async function playRound() {
    const tIdx = round % 2, gIdx = 1 - tIdx;
    await passDevice(names[tIdx], "Write two truths and a lie 🤥");
    const data = await new Promise((res) => compose(screen, names[tIdx], res));
    await passDevice(names[gIdx], `Spot ${names[tIdx]}'s lie`);
    const guessIndex = await new Promise((res) => guessUI(screen, names[tIdx], data.statements, res));
    const correct = guessIndex === data.lieIndex;
    stats.rounds++; if (correct) stats.found++;
    const body = revealScreen(data.statements, data.lieIndex, guessIndex, names[tIdx]);
    body.append(el("div", { style: "margin:12px 4px 0" }, [
      el("div", { class: "tiny muted center", style: "margin-bottom:6px" }, `Lie detector · ${stats.found}/${stats.rounds}`),
      meter(stats.found / stats.rounds)]),
      el("div", { class: "footer-actions" }, button("Next round →", { big: true, onClick: () => { round++; playRound(); } })));
    screen(body);
  }
  playRound();
}

export default game;
