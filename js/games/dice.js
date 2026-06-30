// "Liar's Dice" — bluff, bid, and call bluff on hidden dice. Last cup standing wins.
// Pass the phone so nobody peeks. Works brilliantly with 2–5 players.

import { el, render, topbar, button, pill, passDevice, rulesModal, connectionPill, onlineReadyGate, scoreboard, celebrate } from "../ui.js";

const START_DICE = 5;
const FACES = [1, 2, 3, 4, 5, 6];

const game = {
  id: "dice",
  title: "Liar's Dice",
  emoji: "🎲",
  blurb: "Bid on everyone's hidden dice — then call their bluff!",
  minPlayers: 2,
  maxPlayers: 5,
  modes: ["local", "online"],
  estMinutes: 12,
  rulesHTML: `
    <p>Each player rolls dice in secret. On your turn, make a bid about <b>all dice
    on the table</b> — or call <b>Liar!</b> on the last bid.</p>
    <ol>
      <li>Bid format: <b>"Four 3s"</b> = at least four dice showing 3 (anywhere).</li>
      <li>Each bid must raise the last: more dice, or same count with a higher face.</li>
      <li>Ones are <b>wild</b> — they count as whatever face was bid.</li>
      <li>When someone calls Liar, all dice reveal. Wrong caller loses a die.</li>
      <li>Last player with dice wins! 🏆</li>
    </ol>
    <p class="muted">In an online room, every player sees only their own dice. Voice chat handles the bluffing.</p>`,
  mount(ctx) {
    if (ctx.mode === "online") onlineGame(ctx);
    else localGame(ctx);
  },
};

function header(ctx, statusEl) {
  return topbar({
    onBack: ctx.exit,
    right: el("div", { style: "display:flex; gap:8px; align-items:center" }, [
      statusEl || null,
      el("button", { class: "iconbtn", "aria-label": "Rules", onClick: () => rulesModal(game) }, "?"),
    ]),
  });
}

function roll(n) {
  return Array.from({ length: n }, () => 1 + Math.floor(Math.random() * 6));
}

function countFace(allDice, face) {
  let n = 0;
  for (const d of allDice) {
    for (const v of d) if (v === face || v === 1) n++;
  }
  return n;
}

function bidLabel(bid) {
  return `${bid.qty} × ${bid.face}${bid.qty === 1 ? "" : "s"}`;
}

function beats(a, b) {
  if (!b) return a.qty >= 1 && a.face >= 2;
  if (a.qty > b.qty) return true;
  if (a.qty === b.qty && a.face > b.face) return true;
  return false;
}

function diceRow(values, hide = false) {
  return el("div", { class: "dice-row" }, values.map((v) =>
    el("div", { class: `die ${hide ? "hidden" : ""}` }, hide ? "?" : String(v)),
  ));
}

function onlineGame(ctx) {
  const { session } = ctx;
  const names = session.players;
  const n = names.length;
  let cups = names.map(() => START_DICE);
  let allDice = names.map(() => []);
  let myDice = [];
  let turn = 0;
  let bid = null;
  let round = 0;
  const status = connectionPill();
  session.onStatus(status.set);
  const screen = (body) => render(el("div", { class: "screen" }, [header(ctx, status.node), body]));

  function aliveIndices() { return cups.map((count, i) => count > 0 ? i : -1).filter((i) => i >= 0); }
  function nextAlive(from) {
    let next = from;
    do { next = (next + 1) % n; } while (cups[next] <= 0);
    return next;
  }
  function publicState() {
    return { round, cups: cups.slice(), turn, bid, totalDice: cups.reduce((sum, count) => sum + count, 0) };
  }

  function startMatch() {
    cups = names.map(() => START_DICE);
    turn = 0;
    startRound();
  }

  function startRound() {
    if (!session.isHost) return;
    round++;
    bid = null;
    if (cups[turn] <= 0) turn = nextAlive(turn);
    allDice = cups.map((count) => count > 0 ? roll(count) : []);
    names.forEach((_, i) => session.sendTo(i, "dice_hand", { round, dice: allDice[i] }));
    const state = publicState();
    session.send("dice_state", state);
    showState(state);
  }

  function showState(state) {
    round = state.round; cups = state.cups; turn = state.turn; bid = state.bid;
    const active = session.myIndex === turn;
    if (!active) {
      screen(el("div", { class: "screen" }, [
        scoreboard(names, cups, { activeIndex: turn, colors: ctx.playerColors }),
        el("div", { class: "card center" }, [
          el("div", { class: "pill" }, "Your dice"), diceRow(myDice),
          bid ? el("div", { class: "verdict match" }, `Current bid: ${bidLabel(bid)}`) : el("p", { class: "muted" }, "Opening bid"),
          el("div", { class: "waiting compact-wait" }, `${names[turn]} is deciding.`),
        ]),
      ]));
      return;
    }
    let qty = bid ? bid.qty : 1;
    let face = bid ? bid.face : 2;
    const draw = () => {
      const candidate = { qty, face };
      screen(el("div", { class: "screen" }, [
        scoreboard(names, cups, { activeIndex: turn, colors: ctx.playerColors }),
        el("div", { class: "card" }, [
          el("div", { class: "pill" }, `${names[turn]} - your dice`),
          diceRow(myDice),
          bid ? el("p", { class: "center" }, ["Current bid: ", el("b", {}, bidLabel(bid))]) : null,
          el("p", { class: "muted center" }, `${state.totalDice} dice remain on the table`),
          el("div", { class: "center", style: "font-size:1.5rem;font-weight:800;margin:10px 0" }, bidLabel(candidate)),
          el("div", { class: "counter" }, [
            el("button", { class: "btn round-btn secondary", disabled: qty <= (bid ? bid.qty : 1), onClick: () => { qty--; draw(); } }, "−"),
            el("span", { class: "num" }, String(qty)),
            el("button", { class: "btn round-btn secondary", disabled: qty >= state.totalDice, onClick: () => { qty++; draw(); } }, "+"),
          ]),
          el("div", { class: "dice-pick" }, [2, 3, 4, 5, 6].map((value) => el("button", {
            class: `die pick ${face === value ? "on" : ""}`, onClick: () => { face = value; draw(); },
          }, String(value)))),
          el("div", { class: "stack", style: "margin-top:12px" }, [
            button(`Bid ${bidLabel(candidate)}`, { big: true, disabled: !beats(candidate, bid), onClick: () => submitAction({ type: "bid", qty, face }) }),
            bid ? button("Call liar", { variant: "accent", big: true, onClick: () => submitAction({ type: "liar" }) }) : null,
          ]),
        ]),
      ]));
    };
    draw();
  }

  function submitAction(action) {
    if (session.isHost) handleAction({ ...action, from: session.myIndex, round });
    else session.send("dice_action", { ...action, round });
  }

  function handleAction(message) {
    if (!session.isHost || message.round !== round || message.from !== turn) return;
    if (message.type === "bid") {
      const nextBid = { qty: Number(message.qty), face: Number(message.face), bidder: turn };
      if (!beats(nextBid, bid) || nextBid.qty > cups.reduce((sum, count) => sum + count, 0) || !FACES.includes(nextBid.face)) return;
      bid = nextBid;
      turn = nextAlive(turn);
      const state = publicState();
      session.send("dice_state", state);
      showState(state);
      return;
    }
    if (message.type !== "liar" || !bid) return;
    const actual = countFace(allDice.filter((_, i) => cups[i] > 0), bid.face);
    const bidValid = actual >= bid.qty;
    const loser = bidValid ? turn : bid.bidder;
    cups[loser]--;
    const payload = { round, cups: cups.slice(), dice: allDice, bid, actual, loser, bidValid, winner: aliveIndices().length === 1 ? aliveIndices()[0] : null };
    session.send("dice_reveal", payload);
    showReveal(payload);
  }

  function showReveal(payload) {
    cups = payload.cups;
    if (payload.winner != null) celebrate();
    const rows = names.map((name, i) => {
      const out = cups[i] <= 0 && (!payload.dice[i] || payload.dice[i].length === 0);
      const tag = i === payload.loser ? " — lost a die" : "";
      if (out) return el("div", { class: "muted center", style: "padding:6px" }, `${name} — out ☠️`);
      return el("div", { class: "card", style: "padding:12px" }, [
        el("div", { class: "who", style: "font-weight:700;margin-bottom:6px" }, `${name}${tag}`),
        diceRow(payload.dice[i]),
      ]);
    });
    screen(el("div", { class: "screen" }, [
      el("div", { class: "card center" }, [
        el("h2", {}, payload.winner != null ? `${names[payload.winner]} wins` : payload.bidValid ? "The bid was valid" : "The bluff was caught"),
        el("p", {}, `There were ${payload.actual} matching dice. ${names[payload.loser]} loses one die.`),
      ]),
      el("div", { class: "stack" }, rows),
      scoreboard(names, cups, { colors: ctx.playerColors }),
      el("div", { class: "footer-actions" }, onlineReadyGate(session, `dice:${payload.round}`, () => {
        if (!session.isHost) return;
        if (payload.winner != null) startMatch();
        else { turn = payload.loser; startRound(); }
      }, { label: payload.winner != null ? "Ready for rematch" : "Ready for next roll" })),
    ]));
  }

  session.on("dice_hand", (message) => { myDice = message.dice || []; });
  session.on("dice_state", (message) => { if (!session.isHost) showState(message); });
  session.on("dice_action", handleAction);
  session.on("dice_reveal", (message) => { if (!session.isHost) showReveal(message); });

  if (session.isHost) startMatch();
  else screen(el("div", { class: "waiting" }, [el("div", { class: "spinner" }), "Waiting for the host to roll"]));
}

function localGame(ctx) {
  const names = ctx.players;
  const n = names.length;
  let cups = names.map(() => START_DICE);
  let dice = names.map(() => roll(START_DICE));
  let turn = 0;
  let bid = null;

  const statusEl = pill(`${n} players`);
  const screen = (body) => render(el("div", { class: "screen" }, [header(ctx, statusEl), body]));

  async function run() {
    const alive = () => cups.filter((c) => c > 0).length;

    while (alive() > 1) {
      bid = null;
      while (cups[turn] === 0) turn = (turn + 1) % n;
      let roundDone = false;

      while (!roundDone) {
        while (cups[turn] === 0) turn = (turn + 1) % n;
        await passDevice(names[turn], bid ? `Beat "${bidLabel(bid)}" or call Liar!` : "You're opening the bidding");

        const action = await new Promise((resolve) => {
          let qty = bid ? bid.qty : 1;
          let face = bid ? bid.face : 2;
          const totalDice = cups.reduce((a, b) => a + b, 0);

          function drawBid() {
            const canLiar = !!bid;
            const canBid = beats({ qty, face }, bid);
            render(el("div", { class: "screen" }, [
              header(ctx, statusEl),
              el("div", { class: "card" }, [
                el("div", { class: "pill" }, `${names[turn]} — your dice`),
                diceRow(dice[turn]),
                bid ? el("p", { class: "center" }, ["Table bid: ", el("b", {}, bidLabel(bid))]) : null,
                el("p", { class: "muted center" }, `${totalDice} dice hidden on the table`),
                el("div", { class: "center", style: "font-size:1.5rem; font-weight:800; margin:10px 0" }, bidLabel({ qty, face })),
                el("div", { class: "counter" }, [
                  el("button", { class: "btn round-btn secondary", disabled: qty <= (bid ? bid.qty : 1),
                    onClick: () => { qty--; drawBid(); } }, "−"),
                  el("span", { class: "num" }, String(qty)),
                  el("button", { class: "btn round-btn secondary", disabled: qty >= totalDice,
                    onClick: () => { qty++; drawBid(); } }, "+"),
                ]),
                el("div", { class: "dice-pick" }, [2, 3, 4, 5, 6].map((f) =>
                  el("button", { class: `die pick ${face === f ? "on" : ""}`, onClick: () => { face = f; drawBid(); } }, String(f)),
                )),
                el("div", { class: "stack", style: "margin-top:12px" }, [
                  button(`Bid "${bidLabel({ qty, face })}"`, { big: true, disabled: !canBid,
                    onClick: () => resolve({ type: "bid", qty, face }) }),
                  canLiar ? button("🚨 Liar!", { variant: "accent", big: true, onClick: () => resolve({ type: "liar" }) }) : null,
                ]),
              ]),
            ]));
          }
          drawBid();
        });

        if (action.type === "bid") {
          bid = { qty: action.qty, face: action.face, bidder: turn };
          turn = (turn + 1) % n;
          continue;
        }

        // Liar called — reveal all dice
        const actual = countFace(dice.filter((_, i) => cups[i] > 0), bid.face);
        const bidValid = actual >= bid.qty;
        const loser = bidValid ? turn : bid.bidder;
        const revealedDice = dice.map((values) => values.slice());
        cups[loser]--;

        await new Promise((resolve) => {
          const rows = names.map((name, i) => revealedDice[i].length
            ? el("div", { class: "card", style: "padding:12px" }, [
              el("div", { class: "who", style: "font-weight:700; margin-bottom:6px" }, name + (i === loser ? " 💀" : "")),
              diceRow(revealedDice[i]),
            ])
            : el("div", { class: "muted center" }, `${name} — out ☠️`));

          render(el("div", { class: "screen" }, [
            header(ctx, statusEl),
            el("div", { class: "card" }, [
              el("h2", { class: "center" }, bidValid ? "Bid was legit!" : "Caught bluffing!"),
              el("p", { class: "center" }, [
                `Actual count: ${actual} × ${bid.face}. `,
                el("b", {}, `${names[loser]} loses a die.`),
              ]),
            ]),
            el("div", { class: "stack" }, rows),
            el("div", { class: "footer-actions" }, button("Continue →", { big: true, onClick: resolve })),
          ]));
        });

        dice = cups.map((c) => (c > 0 ? roll(c) : []));
        roundDone = true;
        turn = loser;
      }
    }

    const winner = names[cups.findIndex((c) => c > 0)];
    screen(el("div", { class: "card center" }, [
      el("div", { style: "font-size:3rem" }, "🏆"),
      el("h2", {}, `${winner} wins!`),
      el("div", { class: "footer-actions" }, button("Back to menu", { big: true, onClick: ctx.exit })),
    ]));
  }

  run();
}

export default game;
