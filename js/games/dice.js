// "Liar's Dice" — bluff, bid, and call bluff on hidden dice. Last cup standing wins.
// Pass the phone so nobody peeks. Works brilliantly with 2–5 players.

import { el, render, topbar, button, pill, passDevice, rulesModal } from "../ui.js";

const START_DICE = 5;
const FACES = [1, 2, 3, 4, 5, 6];

const game = {
  id: "dice",
  title: "Liar's Dice",
  emoji: "🎲",
  blurb: "Bid on everyone's hidden dice — then call their bluff!",
  minPlayers: 2,
  maxPlayers: 5,
  modes: ["local"],
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
    <p class="muted">Pure bluffing energy — stare them down through the phone.</p>`,
  mount(ctx) {
    localGame(ctx);
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

function localGame(ctx) {
  const names = ctx.players;
  const n = names.length;
  let cups = names.map(() => START_DICE);
  let dice = names.map(() => roll(START_DICE));
  let turn = 0;
  let bid = null;
  let roundStarter = 0;

  const statusEl = pill(`${n} players`);
  const screen = (body) => render(el("div", { class: "screen" }, [header(ctx, statusEl), body]));

  async function run() {
    const alive = () => cups.filter((c) => c > 0).length;

    while (alive() > 1) {
      bid = null;
      while (cups[turn] === 0) turn = (turn + 1) % n;
      roundStarter = turn;
      let roundDone = false;

      while (!roundDone) {
        while (cups[turn] === 0) turn = (turn + 1) % n;
        await passDevice(names[turn], bid ? `Beat "${bidLabel(bid)}" or call Liar!` : "You're opening the bidding");

        const action = await new Promise((resolve) => {
          let qty = bid ? bid.qty : 1;
          let face = bid ? bid.face : 2;
          const totalDice = cups.reduce((a, b) => a + b, 0);

          function drawBid() {
            const canLiar = bid && turn !== roundStarter;
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
          bid = { qty: action.qty, face: action.face };
          turn = (turn + 1) % n;
          continue;
        }

        // Liar called — reveal all dice
        const actual = countFace(dice.filter((_, i) => cups[i] > 0), bid.face);
        const bidValid = actual >= bid.qty;
        const loser = bidValid ? turn : (turn + n - 1) % n;
        cups[loser]--;
        dice = cups.map((c) => (c > 0 ? roll(c) : []));

        await new Promise((resolve) => {
          const rows = names.map((name, i) => cups[i] > 0
            ? el("div", { class: "card", style: "padding:12px" }, [
              el("div", { class: "who", style: "font-weight:700; margin-bottom:6px" }, name + (i === loser ? " 💀" : "")),
              diceRow(dice[i]),
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
