// Companoly rules engine. Pure state machine: no DOM, no timers.
// The host owns the state and calls act(); every call returns the events it
// produced (used by clients to animate) and mutates `state` in place.
import {
  TILES, SECTORS, NEWS, DEALS, GULAG, TRANSPORT_RENT, OIL_MULT, BAIL,
  MAX_FACTORIES, MAX_HQ, DEFAULT_SETTINGS, TICKET_FEE,
} from "./data.js";

const OWNABLE = new Set(["prop", "transport", "oil"]);
export const isOwnable = (i) => OWNABLE.has(TILES[i].kind);
export const sectorTiles = (sector) => TILES.filter((t) => t.sector === sector).map((t) => t.i);
const AUCTION_MS = 12000;
const AUCTION_BUMP_MS = 7000;

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function createGame(players, settings = {}, rng = Math.random) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const state = {
    v: 1,
    settings: s,
    players: {},
    order: shuffle(players.map((p) => p.id), rng),
    turn: 0,
    round: 1,
    phase: "roll",
    props: {},
    supply: { factories: MAX_FACTORIES, hq: MAX_HQ },
    decks: { news: shuffle(NEWS.map((_, i) => i), rng), deals: shuffle(DEALS.map((_, i) => i), rng) },
    dice: null,
    rollId: 0,
    doubles: 0,
    extraRoll: false,
    pendingTile: null,
    auction: null,
    debts: [],
    trades: [],
    trends: [],
    pot: 0,
    built: 0,
    landed: [],
    card: null,
    log: [],
    winner: null,
    standings: null,
    seq: 0,
    nextId: 1,
    bankruptOrder: [],
    claims: [],        // rent waiting to be claimed (claimRent rule)
    estate: [],        // bankrupt companies queued for auction (estateAuction rule)
    estateTo: null,
    resumePhase: null,
  };
  for (const p of players) {
    state.players[p.id] = {
      id: p.id, name: p.name, token: p.token, color: p.color,
      cash: s.startCash, pos: 0, inGulag: false, gulagTries: 0,
      gulagCards: [], bankrupt: false, laps: 0,
    };
  }
  TILES.forEach((t) => { if (OWNABLE.has(t.kind)) state.props[t.i] = { owner: null, level: 0, mort: false }; });
  if (s.dealStart) {
    // Short version: everyone is dealt two random companies and pays list price.
    const deck = shuffle(Object.keys(state.props).map(Number), rng);
    for (const id of state.order) {
      for (const i of deck.splice(0, 2)) {
        state.props[i].owner = id;
        state.players[id].cash -= TILES[i].price;
      }
    }
  }
  log(state, `Market opens. ${state.order.map((id) => state.players[id].name).join(" → ")}`);
  return state;
}

// ---------- queries ----------
export const currentId = (st) => st.order[st.turn];
export const alive = (st) => st.order.filter((id) => !st.players[id].bankrupt);
export const ownedBy = (st, pid) => Object.keys(st.props).map(Number).filter((i) => st.props[i].owner === pid);

export function hasSet(st, pid, sector) {
  return sectorTiles(sector).every((i) => st.props[i].owner === pid);
}
export function sectorHasUpgrades(st, sector) {
  return sectorTiles(sector).some((i) => st.props[i].level > 0);
}
export function trendMult(st, sector) {
  let m = 1;
  for (const t of st.trends) if (t.sector === sector || t.sector === "all") m *= t.mult;
  return m;
}

export function rentFor(st, i, diceSum = 7, mode = null) {
  const t = TILES[i];
  const p = st.props[i];
  if (!p || !p.owner || p.mort) return 0;
  let rent = 0;
  if (t.kind === "prop") {
    rent = p.level > 0 ? t.rent[p.level] : t.rent[0] * (hasSet(st, p.owner, t.sector) ? 2 : 1);
  } else if (t.kind === "transport") {
    const n = sectorTiles("transport").filter((j) => st.props[j].owner === p.owner).length;
    rent = TRANSPORT_RENT[n] * (mode === "double" ? 2 : 1);
  } else if (t.kind === "oil") {
    const n = sectorTiles("oil").filter((j) => st.props[j].owner === p.owner).length;
    rent = diceSum * (mode === "ten" ? 10 : OIL_MULT[n]);
  }
  return Math.round(rent * trendMult(st, t.sector));
}

export const buildCost = (i) => SECTORS[TILES[i].sector]?.build || 0;
export const mortgageValue = (i) => Math.floor(TILES[i].price / 2);
export const unmortgageCost = (st, i) => (st.settings.mortgageInterest ? Math.ceil(mortgageValue(i) * 1.1) : mortgageValue(i));
// Factories required before the next upgrade becomes a Megacorp HQ (level 5).
export const hqAt = (st) => st.settings.hqAfter || 4;
// Upgrade money sunk into a tile (an HQ counts its factories plus itself).
export const invested = (st, i) => {
  const lv = st.props[i].level;
  return (lv === 5 ? hqAt(st) + 1 : lv) * buildCost(i);
};

export function propValue(st, i) {
  const p = st.props[i];
  return (p.mort ? TILES[i].price - mortgageValue(i) : TILES[i].price) + invested(st, i);
}
export function netWorth(st, pid) {
  const pl = st.players[pid];
  if (pl.bankrupt) return 0;
  return pl.cash + ownedBy(st, pid).reduce((sum, i) => sum + propValue(st, i), 0);
}
// Most cash a player could raise right now by selling every upgrade and mortgaging everything.
export function liquidity(st, pid) {
  const pl = st.players[pid];
  let total = pl.cash;
  for (const i of ownedBy(st, pid)) {
    const p = st.props[i];
    total += Math.floor(invested(st, i) / 2);
    if (!p.mort) total += mortgageValue(i);
  }
  return total;
}
// Tiles that must be built/sold evenly with `i` (depends on the house rules).
function buildPeers(st, pid, i) {
  const tiles = sectorTiles(TILES[i].sector);
  return st.settings.buildNeedsSet ? tiles : tiles.filter((j) => st.props[j].owner === pid);
}
// Can this tile's sector be mortgaged/traded? Needs no upgrades in the way.
function upgradesBlock(st, i) {
  if (TILES[i].kind !== "prop") return false;
  return st.settings.buildNeedsSet ? sectorHasUpgrades(st, TILES[i].sector) : st.props[i].level > 0;
}
export function canBuild(st, pid, i) {
  const t = TILES[i], p = st.props[i], s = st.settings;
  if (t.kind !== "prop" || p.owner !== pid) return "Not yours";
  if (s.buildNeedsSet && !hasSet(st, pid, t.sector)) return "Own the whole sector first";
  const peers = buildPeers(st, pid, i);
  if (p.mort || (s.buildNeedsSet && peers.some((j) => st.props[j].mort))) return s.buildNeedsSet ? "Unmortgage the sector first" : "Unmortgage it first";
  if (p.level >= 5) return "Already a Megacorp HQ";
  if (s.evenBuild && p.level > Math.min(...peers.map((j) => st.props[j].level))) return "Build evenly across the sector";
  if (s.buildWhere === "exact" && !st.landed.includes(i)) return `Land on ${t.name} to build there`;
  if (s.buildWhere === "sector" && !st.landed.some((j) => TILES[j].sector === t.sector)) return `Land in ${SECTORS[t.sector].name} to build there`;
  const toHq = p.level === hqAt(st);
  if (toHq ? st.supply.hq < 1 : st.supply.factories < 1) return toHq ? "No HQs left in the market" : "Factory shortage — none left";
  if (st.players[pid].cash < buildCost(i)) return "Not enough cash";
  if (st.settings.buildLimit && st.built >= st.settings.buildLimit) return `Build limit (${st.settings.buildLimit}/turn) reached`;
  return null;
}
export function canSell(st, pid, i) {
  const t = TILES[i], p = st.props[i];
  if (t.kind !== "prop" || p.owner !== pid) return "Not yours";
  if (p.level < 1) return "Nothing built";
  if (st.settings.evenBuild && p.level < Math.max(...buildPeers(st, pid, i).map((j) => st.props[j].level))) return "Sell evenly across the sector";
  if (p.level === 5 && st.supply.factories < hqAt(st)) return "Not enough factories in supply to downgrade";
  return null;
}
export function canMortgage(st, pid, i) {
  const p = st.props[i];
  if (!p || p.owner !== pid) return "Not yours";
  if (p.mort) return "Already mortgaged";
  if (upgradesBlock(st, i)) return st.settings.buildNeedsSet ? "Sell the sector's upgrades first" : "Sell its upgrades first";
  return null;
}

// ---------- internals ----------
let E = []; // events from the current act() call
const emit = (e) => E.push(e);
function log(st, text) {
  st.log.push({ n: ++st.seq, text });
  if (st.log.length > 80) st.log.splice(0, st.log.length - 80);
  E.push({ type: "log", text });
}
const nm = (st, pid) => st.players[pid]?.name || "?";
const money = (n) => (Math.abs(n) >= 1000 ? `$${(n / 1000).toFixed(2).replace(/\.?0+$/, "")}B` : `$${n}M`);
export { money };

function addCash(st, pid, amount, why) {
  st.players[pid].cash += amount;
  emit({ type: "cash", pid, amount, why });
}

// Charge `amount`. If the payer is short, a debt is queued and resolved
// (raise funds / bankruptcy) before the game continues.
function charge(st, from, to, amount, why) {
  if (amount <= 0) return;
  const pl = st.players[from];
  if (pl.cash >= amount) transfer(st, from, to, amount, why);
  else {
    st.debts.push({ id: st.nextId++, debtor: from, creditor: to, amount, why });
    log(st, `${nm(st, from)} owes ${money(amount)} (${why}) but only has ${money(pl.cash)}`);
  }
}
function transfer(st, from, to, amount, why) {
  addCash(st, from, -amount, why);
  if (to === "pot") st.pot += amount;
  else if (to !== "bank") addCash(st, to, amount, why);
  emit({ type: "pay", from, to, amount, why });
}
const toBankOrPot = (st) => (st.settings.jackpot ? "pot" : "bank");

function rollDice(rng) {
  return [1 + Math.floor(rng() * 6), 1 + Math.floor(rng() * 6)];
}

function moveTo(st, pid, to, { passGo = true, kind = "walk" } = {}) {
  const pl = st.players[pid];
  const from = pl.pos;
  pl.pos = to;
  if (!st.landed.includes(to)) st.landed.push(to);
  emit({ type: "move", pid, from, to, kind });
  if (passGo && kind !== "back" && to < from) {
    pl.laps = (pl.laps || 0) + 1;
    addCash(st, pid, st.settings.goSalary, "Payday");
    log(st, `${nm(st, pid)} passed Payday (+${money(st.settings.goSalary)})`);
  }
}

function sendToGulag(st, pid) {
  const pl = st.players[pid];
  const from = pl.pos;
  pl.pos = GULAG;
  pl.inGulag = true;
  pl.gulagTries = 0;
  st.doubles = 0;
  st.extraRoll = false;
  emit({ type: "move", pid, from, to: GULAG, kind: "jump" });
  emit({ type: "gulag", pid });
  log(st, `${nm(st, pid)} was sent to the Gulag`);
}

function land(st, pid, ctx, mode = null) {
  const pl = st.players[pid];
  const t = TILES[pl.pos];
  const sum = st.dice ? st.dice[0] + st.dice[1] : 7;
  switch (t.kind) {
    case "prop": case "transport": case "oil": {
      const p = st.props[t.i];
      if (!p.owner) {
        if (st.settings.firstLapNoBuy && !pl.laps) { log(st, `${nm(st, pid)} can't buy until they've passed Payday once`); return; }
        st.pendingTile = t.i;
        return;
      }
      if (p.owner === pid) return;
      if (p.mort) { log(st, `${t.name} is mortgaged — no rent`); return; }
      if (st.players[p.owner].bankrupt) return;
      const rent = rentFor(st, t.i, sum, mode);
      if (st.settings.claimRent) {
        st.claims = st.claims.filter((c) => c.to !== p.owner || c.from !== pid);
        st.claims.push({ id: st.nextId++, from: pid, to: p.owner, amount: rent, tile: t.i });
        emit({ type: "claimable", from: pid, to: p.owner, amount: rent, tile: t.i });
        log(st, `${nm(st, pid)} landed on ${nm(st, p.owner)}'s ${t.name}: ${money(rent)} rent, if they claim it before the next roll!`);
        return;
      }
      log(st, `${nm(st, pid)} pays ${money(rent)} rent to ${nm(st, p.owner)} for ${t.name}`);
      charge(st, pid, p.owner, rent, `Rent: ${t.name}`);
      return;
    }
    case "tax":
      log(st, `${nm(st, pid)} pays ${t.name} ${money(t.amount)}`);
      charge(st, pid, toBankOrPot(st), t.amount, t.name);
      return;
    case "toGulag":
      sendToGulag(st, pid);
      return;
    case "haven":
      if (st.settings.jackpot && st.pot > 0) {
        const pot = st.pot;
        st.pot = 0;
        addCash(st, pid, pot, "Tax Haven jackpot");
        log(st, `${nm(st, pid)} hits the Tax Haven jackpot: +${money(pot)}`);
      }
      return;
    case "news": case "deal":
      drawCard(st, pid, t.kind === "news" ? "news" : "deals", ctx);
      return;
    default:
  }
}

function drawCard(st, pid, deck, ctx) {
  const id = st.decks[deck].shift();
  const card = (deck === "news" ? NEWS : DEALS)[id];
  st.card = { deck, id, pid, n: st.seq + 1 };
  emit({ type: "card", deck, id, pid });
  log(st, `${nm(st, pid)} drew ${deck === "news" ? "Breaking News" : "Shady Deal"}: ${card.title} — ${card.text}`);
  if (card.fx.type === "gulagFree") st.players[pid].gulagCards.push(deck);
  else st.decks[deck].push(id);
  applyCard(st, pid, card.fx, ctx);
}

function applyCard(st, pid, fx, ctx) {
  const pl = st.players[pid];
  const others = alive(st).filter((id) => id !== pid);
  switch (fx.type) {
    case "money":
      if (fx.amount > 0) addCash(st, pid, fx.amount, "Card");
      else charge(st, pid, toBankOrPot(st), -fx.amount, "Card");
      return;
    case "moveTo":
      moveTo(st, pid, fx.to);
      land(st, pid, ctx);
      return;
    case "moveBy": {
      const to = (pl.pos + fx.n + 40) % 40;
      moveTo(st, pid, to, { passGo: false, kind: fx.n < 0 ? "back" : "walk" });
      land(st, pid, ctx);
      return;
    }
    case "nearest": {
      let to = pl.pos;
      do { to = (to + 1) % 40; } while (TILES[to].kind !== fx.kind);
      moveTo(st, pid, to);
      land(st, pid, ctx, fx.kind === "transport" ? "double" : "ten");
      return;
    }
    case "gulag":
      sendToGulag(st, pid);
      return;
    case "gulagFree":
      return;
    case "repairs": {
      let f = 0, h = 0;
      for (const i of ownedBy(st, pid)) {
        const lv = st.props[i].level;
        if (lv === 5) h++; else f += lv;
      }
      const total = f * fx.factory + h * fx.hq;
      if (total > 0) charge(st, pid, toBankOrPot(st), total, "Card");
      else log(st, `${nm(st, pid)} has nothing built — no charge`);
      return;
    }
    case "payEach":
      for (const o of others) charge(st, pid, o, fx.amount, "Card");
      return;
    case "collectEach":
      for (const o of others) charge(st, o, pid, fx.amount, "Card");
      return;
    case "stimulus":
      for (const o of alive(st)) addCash(st, o, fx.amount, "Stimulus");
      return;
    case "trend": {
      st.trends = st.trends.filter((t) => t.sector !== fx.sector);
      st.trends.push({ sector: fx.sector, mult: fx.mult, rounds: fx.rounds });
      emit({ type: "trend", sector: fx.sector, mult: fx.mult });
      return;
    }
    case "sectorPayout":
      for (const id of alive(st)) {
        const n = sectorTiles(fx.sector).filter((i) => st.props[i].owner === id).length;
        if (n) addCash(st, id, n * fx.amount, "Card");
      }
      return;
    case "windfall": {
      const ranked = alive(st).sort((a, b) => netWorth(st, b) - netWorth(st, a));
      const rich = ranked[0], poor = ranked[ranked.length - 1];
      if (rich !== poor) {
        log(st, `${nm(st, rich)} pays ${money(fx.amount)} windfall tax to ${nm(st, poor)}`);
        charge(st, rich, poor, fx.amount, "Windfall tax");
      }
      return;
    }
    case "bailout": {
      const poorest = alive(st).sort((a, b) => netWorth(st, a) - netWorth(st, b))[0];
      addCash(st, pid, poorest === pid ? fx.poor : fx.other, "Bailout");
      return;
    }
    default:
  }
}

// After a move resolves, decide what the current player does next.
function settle(st) {
  if (st.phase === "over") return;
  const pid = currentId(st);
  if (st.players[pid].bankrupt) return;
  if (st.pendingTile != null) { st.phase = "buy"; return; }
  st.phase = st.extraRoll ? "roll" : "end";
}

function nextTurn(st) {
  st.card = null;
  st.pendingTile = null;
  st.doubles = 0;
  st.extraRoll = false;
  st.built = 0;
  st.landed = [];
  if (checkWinner(st)) return;
  const n = st.order.length;
  let i = st.turn;
  for (let k = 0; k < n; k++) {
    i = (i + 1) % n;
    if (i === 0) newRound(st);
    if (st.phase === "over") return;
    if (!st.players[st.order[i]].bankrupt) break;
  }
  st.turn = i;
  st.phase = "roll";
  emit({ type: "turn", pid: currentId(st) });
}

function newRound(st) {
  st.round++;
  st.trends = st.trends.map((t) => ({ ...t, rounds: t.rounds - 1 })).filter((t) => t.rounds > 0);
  if (st.settings.maxRounds && st.round > st.settings.maxRounds) {
    log(st, `Closing bell! ${st.settings.maxRounds} rounds are up.`);
    endGame(st);
  }
}

function checkWinner(st) {
  const n = st.settings.endAfterBankrupt;
  if (alive(st).length <= 1 || (n && st.bankruptOrder.length >= n)) {
    if (n && alive(st).length > 1) log(st, `${n} players are bankrupt. Counting the money...`);
    endGame(st);
    return true;
  }
  return false;
}

function endGame(st) {
  const standing = alive(st).sort((a, b) => netWorth(st, b) - netWorth(st, a))
    .map((id) => ({ id, worth: netWorth(st, id) }));
  const out = st.bankruptOrder.slice().reverse().map((id) => ({ id, worth: 0, bankrupt: true }));
  st.standings = [...standing, ...out];
  st.winner = standing[0]?.id || null;
  st.phase = "over";
  st.auction = null;
  st.debts = [];
  st.trades = [];
  st.claims = [];
  st.estate = [];
  emit({ type: "over", winner: st.winner });
  log(st, `${nm(st, st.winner)} wins with a net worth of ${money(standing[0]?.worth || 0)}`);
}

function goBankrupt(st, pid, creditor) {
  const pl = st.players[pid];
  // Liquidate upgrades back to the bank at half price.
  for (const i of ownedBy(st, pid)) {
    const p = st.props[i];
    if (p.level) {
      pl.cash += Math.floor(invested(st, i) / 2);
      if (p.level === 5) st.supply.hq++; else st.supply.factories += p.level;
      p.level = 0;
    }
  }
  const toPlayer = creditor && creditor !== "bank" && creditor !== "pot" && !st.players[creditor]?.bankrupt;
  if (st.settings.estateAuction && ownedBy(st, pid).length && alive(st).length > 2) {
    // Göteborgs Auktionsverk: the creditor only gets the cash; the companies are auctioned one by one.
    if (toPlayer && pl.cash > 0) addCash(st, creditor, pl.cash, "Bankruptcy");
    else if (creditor === "pot" && pl.cash > 0) st.pot += pl.cash;
    for (const i of ownedBy(st, pid)) { st.props[i] = { owner: null, level: 0, mort: false }; st.estate.push(i); }
    st.estateTo = toPlayer ? creditor : null;
    for (const d of pl.gulagCards) st.decks[d].push((d === "news" ? NEWS : DEALS).findIndex((c) => c.fx.type === "gulagFree"));
  } else if (toPlayer) {
    if (pl.cash > 0) addCash(st, creditor, pl.cash, "Bankruptcy");
    for (const i of ownedBy(st, pid)) st.props[i].owner = creditor;
    st.players[creditor].gulagCards.push(...pl.gulagCards);
  } else {
    if (creditor === "pot" && pl.cash > 0) st.pot += pl.cash;
    for (const i of ownedBy(st, pid)) st.props[i] = { owner: null, level: 0, mort: false };
    for (const d of pl.gulagCards) st.decks[d].push((d === "news" ? NEWS : DEALS).findIndex((c) => c.fx.type === "gulagFree"));
  }
  pl.cash = 0;
  pl.gulagCards = [];
  pl.bankrupt = true;
  pl.inGulag = false;
  st.bankruptOrder.push(pid);
  st.debts = st.debts.filter((d) => d.debtor !== pid);
  st.debts.forEach((d) => { if (d.creditor === pid) d.creditor = "bank"; });
  st.trades = st.trades.filter((t) => t.from !== pid && t.to !== pid);
  st.claims = st.claims.filter((c) => c.from !== pid && c.to !== pid);
  if (st.auction) {
    if (st.auction.bidder === pid) { st.auction.bidder = null; st.auction.high = 0; }
    st.auction.out = st.auction.out.filter((x) => x !== pid);
  }
  emit({ type: "bankrupt", pid, to: toPlayer ? creditor : "bank" });
  log(st, `${nm(st, pid)} is BANKRUPT${toPlayer ? ` — everything goes to ${nm(st, creditor)}` : ""}`);
}

// After debts clear (or a bankruptcy), continue the interrupted flow.
function afterDebts(st, ctx) {
  if (st.debts.length || st.phase === "over") return;
  if (checkWinner(st)) return;
  if (st.estate.length && !st.auction) {
    st.resumePhase = st.phase;
    startAuction(st, st.estate.shift(), ctx, true);
    return;
  }
  const pid = currentId(st);
  if (st.players[pid].bankrupt) { nextTurn(st); return; }
  if (st.auction) return;
  if (st.phase === "roll" || st.phase === "end" || st.phase === "buy") settle(st);
}

function startAuction(st, i, ctx, estate = false) {
  st.auction = {
    id: st.nextId++, tile: i, high: 0, bidder: null, out: [], estate,
    endsAt: (ctx.now || 0) + AUCTION_MS,
  };
  st.phase = "auction";
  if (!estate) st.pendingTile = null;
  emit({ type: "auction", tile: i });
  log(st, estate ? `The auction house sells ${TILES[i].name} from the bankrupt estate` : `${TILES[i].name} goes to auction`);
}

function resolveAuction(st, ctx = {}) {
  const a = st.auction;
  st.auction = null;
  if (a.bidder && !st.players[a.bidder].bankrupt) {
    const t = TILES[a.tile];
    addCash(st, a.bidder, -a.high, `Auction: ${t.name}`);
    st.props[a.tile].owner = a.bidder;
    emit({ type: "buy", pid: a.bidder, tile: a.tile, price: a.high });
    log(st, `${nm(st, a.bidder)} wins ${t.name} for ${money(a.high)}`);
  } else if (a.estate && st.estateTo && !st.players[st.estateTo].bankrupt) {
    st.props[a.tile].owner = st.estateTo;
    log(st, `No bids. ${TILES[a.tile].name} goes to ${nm(st, st.estateTo)}`);
  } else {
    log(st, `No bids. ${TILES[a.tile].name} stays on the market`);
  }
  if (a.estate) {
    if (st.estate.length) { startAuction(st, st.estate.shift(), ctx, true); return; }
    st.estateTo = null;
    st.phase = st.resumePhase || "end";
    afterDebts(st, ctx);
    return;
  }
  st.phase = "end";
  settle(st);
}

function auctionDone(st) {
  const a = st.auction;
  const active = alive(st).filter((id) => !a.out.includes(id));
  return active.length === 0 || (a.bidder && active.length === 1 && active[0] === a.bidder);
}

function validAssets(st, pid, side) {
  const pl = st.players[pid];
  if (!side) return "Bad offer";
  const cash = Math.floor(side.cash || 0);
  if (cash < 0 || cash > pl.cash) return `${pl.name} doesn't have ${money(cash)}`;
  for (const i of side.tiles || []) {
    const p = st.props[i];
    if (!p || p.owner !== pid) return `${TILES[i]?.name || "Tile"} isn't ${pl.name}'s`;
    if (upgradesBlock(st, i)) return `Sell the upgrades on ${TILES[i].name} before trading it`;
  }
  if ((side.cards || 0) > pl.gulagCards.length) return "Not enough Gulag cards";
  return null;
}

function swapAssets(st, from, to, side) {
  const cash = Math.floor(side.cash || 0);
  if (cash) { addCash(st, from, -cash, "Trade"); addCash(st, to, cash, "Trade"); }
  for (const i of side.tiles || []) st.props[i].owner = to;
  for (let k = 0; k < (side.cards || 0); k++) st.players[to].gulagCards.push(st.players[from].gulagCards.pop());
}

// ---------- the one entry point ----------
// ctx: { rng, now }. pid "system" is used by the host for timers.
export function act(st, pid, action, ctx = {}) {
  E = [];
  ctx = { rng: Math.random, now: Date.now(), ...ctx };
  let err = null;
  try { err = handle(st, pid, action, ctx); }
  catch (e) { err = String(e?.message || e); }
  const events = E;
  E = [];
  if (!err) st.seq++;
  return { ok: !err, err, events };
}

function handle(st, pid, a, ctx) {
  if (st.phase === "over") return "Game over";
  const pl = st.players[pid];
  const isSystem = pid === "system";
  if (!isSystem && (!pl || pl.bankrupt)) return "You're not in the game";
  const mine = currentId(st) === pid;
  const debt = st.debts[0];

  switch (a.type) {
    // ----- asset management (allowed any time for your own stuff) -----
    case "mortgage": {
      const why = canMortgage(st, pid, a.tile);
      if (why) return why;
      st.props[a.tile].mort = true;
      addCash(st, pid, mortgageValue(a.tile), "Mortgage");
      log(st, `${pl.name} mortgaged ${TILES[a.tile].name} (+${money(mortgageValue(a.tile))})`);
      return null;
    }
    case "unmortgage": {
      const p = st.props[a.tile];
      if (!p || p.owner !== pid || !p.mort) return "Can't unmortgage that";
      const cost = unmortgageCost(st, a.tile);
      if (pl.cash < cost) return "Not enough cash";
      p.mort = false;
      addCash(st, pid, -cost, "Unmortgage");
      log(st, `${pl.name} unmortgaged ${TILES[a.tile].name} (−${money(cost)})`);
      return null;
    }
    case "sell": {
      const why = canSell(st, pid, a.tile);
      if (why) return why;
      const p = st.props[a.tile];
      if (p.level === 5) { st.supply.hq++; st.supply.factories -= hqAt(st); p.level = hqAt(st); }
      else { st.supply.factories++; p.level--; }
      addCash(st, pid, Math.floor(buildCost(a.tile) / 2), "Sold upgrade");
      emit({ type: "build", tile: a.tile, level: p.level });
      log(st, `${pl.name} sold an upgrade on ${TILES[a.tile].name}`);
      return null;
    }
    case "build": {
      if (!mine) return "Build on your own turn";
      if (st.debts.length || st.auction || st.phase === "buy") return "Finish the current step first";
      const why = canBuild(st, pid, a.tile);
      if (why) return why;
      const p = st.props[a.tile];
      if (p.level === hqAt(st)) { st.supply.hq--; st.supply.factories += hqAt(st); p.level = 5; }
      else { st.supply.factories--; p.level++; }
      st.built++;
      addCash(st, pid, -buildCost(a.tile), "Build");
      emit({ type: "build", tile: a.tile, level: p.level });
      log(st, `${pl.name} built ${p.level === 5 ? "a Megacorp HQ" : `factory #${p.level}`} on ${TILES[a.tile].name}`);
      return null;
    }

    // ----- claim rent (claimRent rule): any time before the next roll -----
    case "claimRent": {
      const c = st.claims.find((x) => x.id === a.id && x.to === pid);
      if (!c) return "Too late, that rent has expired";
      st.claims = st.claims.filter((x) => x !== c);
      if (st.players[c.from].bankrupt) return null;
      log(st, `${pl.name} claims ${money(c.amount)} rent from ${nm(st, c.from)}`);
      charge(st, c.from, pid, c.amount, `Rent: ${TILES[c.tile].name}`);
      afterDebts(st, ctx);
      return null;
    }

    // ----- debts -----
    case "payDebt": {
      if (!debt || debt.debtor !== pid) return "No debt to pay";
      if (pl.cash < debt.amount) return `You need ${money(debt.amount - pl.cash)} more — mortgage or sell first`;
      st.debts.shift();
      transfer(st, pid, debt.creditor, debt.amount, debt.why);
      log(st, `${pl.name} paid off ${money(debt.amount)}`);
      afterDebts(st, ctx);
      return null;
    }
    case "bankrupt": {
      const d = st.debts.find((x) => x.debtor === pid);
      if (!d) return "You can only declare bankruptcy when you owe money";
      goBankrupt(st, pid, d.creditor);
      afterDebts(st, ctx);
      return null;
    }

    // ----- trading -----
    case "proposeTrade": {
      if (st.auction) return "Wait for the auction to finish";
      const to = st.players[a.to];
      if (!to || to.bankrupt || a.to === pid) return "Pick another player";
      if (st.settings.noJailTrade && (pl.inGulag || to.inGulag)) return "No trading with anyone in the Gulag";
      const give = { cash: a.give?.cash || 0, tiles: a.give?.tiles || [], cards: a.give?.cards || 0 };
      const get = { cash: a.get?.cash || 0, tiles: a.get?.tiles || [], cards: a.get?.cards || 0 };
      if (!give.cash && !give.tiles.length && !give.cards && !get.cash && !get.tiles.length && !get.cards) return "Empty offer";
      const e1 = validAssets(st, pid, give) || validAssets(st, a.to, { ...get, cash: Math.min(get.cash, to.cash) });
      if (e1) return e1;
      st.trades = st.trades.filter((t) => !(t.from === pid && t.to === a.to));
      st.trades.push({ id: st.nextId++, from: pid, to: a.to, give, get });
      log(st, `${pl.name} sent ${to.name} a trade offer`);
      emit({ type: "tradeOffer", from: pid, to: a.to });
      return null;
    }
    case "cancelTrade": {
      const t = st.trades.find((x) => x.id === a.id);
      if (!t || (t.from !== pid && t.to !== pid)) return "No such offer";
      st.trades = st.trades.filter((x) => x.id !== a.id);
      if (t.to === pid) log(st, `${pl.name} declined ${nm(st, t.from)}'s offer`);
      emit({ type: "tradeClosed", id: t.id, accepted: false });
      return null;
    }
    case "acceptTrade": {
      if (st.auction) return "Wait for the auction to finish";
      const t = st.trades.find((x) => x.id === a.id);
      if (!t || t.to !== pid) return "No such offer";
      if (st.settings.noJailTrade && (pl.inGulag || st.players[t.from].inGulag)) return "No trading with anyone in the Gulag";
      const e1 = validAssets(st, t.from, t.give) || validAssets(st, t.to, t.get);
      if (e1) { st.trades = st.trades.filter((x) => x.id !== a.id); return `Offer no longer valid: ${e1}`; }
      swapAssets(st, t.from, t.to, t.give);
      swapAssets(st, t.to, t.from, t.get);
      st.trades = st.trades.filter((x) => x.id !== a.id && !(x.give.tiles.concat(x.get.tiles).some((i) => t.give.tiles.includes(i) || t.get.tiles.includes(i))));
      const desc = (side) => [side.cash ? money(side.cash) : null, ...side.tiles.map((i) => TILES[i].name), side.cards ? `${side.cards} Gulag card` : null].filter(Boolean).join(", ") || "nothing";
      log(st, `Trade: ${nm(st, t.from)} gives ${desc(t.give)} ⇄ ${nm(st, t.to)} gives ${desc(t.get)}`);
      emit({ type: "tradeClosed", id: t.id, accepted: true, from: t.from, to: t.to });
      return null;
    }

    // ----- auction -----
    case "bid": {
      const au = st.auction;
      if (!au) return "No auction running";
      if (au.out.includes(pid)) return "You dropped out";
      const amount = Math.floor(a.amount);
      if (amount <= au.high) return `Bid more than ${money(au.high)}`;
      if (amount > pl.cash) return "You can't afford that bid";
      au.high = amount;
      au.bidder = pid;
      au.endsAt = Math.max(au.endsAt, ctx.now + AUCTION_BUMP_MS);
      emit({ type: "bid", pid, amount });
      if (auctionDone(st)) resolveAuction(st, ctx);
      return null;
    }
    case "auctionPass": {
      const au = st.auction;
      if (!au) return "No auction running";
      if (au.bidder === pid) return "You're the top bidder";
      if (!au.out.includes(pid)) au.out.push(pid);
      if (auctionDone(st)) resolveAuction(st, ctx);
      return null;
    }
    case "auctionTimeout": {
      if (!isSystem) return "Only the host clock can end auctions";
      if (!st.auction || ctx.now < st.auction.endsAt) return "Not yet";
      resolveAuction(st, ctx);
      return null;
    }
    case "forfeit": {
      // Host removes a player who left for good; their companies return to the market.
      if (!isSystem) return "Host only";
      const target = st.players[a.pid];
      if (!target || target.bankrupt) return "Not in the game";
      const wasCurrent = currentId(st) === a.pid;
      if (st.auction && alive(st).length > 2 && !st.auction.out.includes(a.pid)) st.auction.out.push(a.pid);
      log(st, `${target.name} left the market`);
      goBankrupt(st, a.pid, "bank");
      if (st.auction && auctionDone(st)) resolveAuction(st, ctx);
      if (checkWinner(st)) return null;
      if (wasCurrent) { st.auction = null; st.debts = st.debts.filter((d) => d.debtor !== a.pid); nextTurn(st); }
      else afterDebts(st, ctx);
      return null;
    }
    case "endNow": {
      if (!isSystem) return "Host only";
      log(st, "The host rang the closing bell early.");
      endGame(st);
      return null;
    }
    default:
  }

  // ----- turn actions: current player only, and only with no debts pending -----
  if (!mine) return "Not your turn";
  if (debt) return `${nm(st, debt.debtor)} must settle a debt first`;

  switch (a.type) {
    case "roll": {
      if (st.phase !== "roll") return "You can't roll now";
      if (st.claims.some((c) => c.from !== pid)) {
        for (const c of st.claims.filter((x) => x.from !== pid)) log(st, `${nm(st, c.to)} forgot to claim ${money(c.amount)}. Too late!`);
        st.claims = st.claims.filter((c) => c.from === pid);
      }
      const dice = rollDice(ctx.rng);
      st.dice = dice;
      st.rollId++;
      st.card = null;
      const sum = dice[0] + dice[1];
      const dbl = dice[0] === dice[1];
      emit({ type: "roll", pid, dice });
      if (pl.inGulag) {
        if (dbl) {
          pl.inGulag = false;
          pl.gulagTries = 0;
          log(st, `${pl.name} rolled doubles and escaped the Gulag!`);
          st.extraRoll = false;
        } else {
          pl.gulagTries++;
          if (pl.gulagTries < 3) {
            log(st, `${pl.name} rolled ${dice.join("+")} — still in the Gulag (${pl.gulagTries}/3)`);
            st.phase = "end";
            return null;
          }
          log(st, `${pl.name} served their time and pays ${money(BAIL)} bail`);
          pl.inGulag = false;
          pl.gulagTries = 0;
          charge(st, pid, toBankOrPot(st), BAIL, "Bail");
          st.extraRoll = false;
        }
      } else if (dbl) {
        st.doubles++;
        if (st.doubles >= 3) {
          log(st, `${pl.name} rolled three doubles in a row — suspicious.`);
          sendToGulag(st, pid);
          st.phase = "end";
          return null;
        }
        st.extraRoll = true;
      } else st.extraRoll = false;
      moveTo(st, pid, (pl.pos + sum) % 40);
      land(st, pid, ctx);
      if (pl.inGulag) st.extraRoll = false;
      if (st.phase !== "over" && !pl.bankrupt) settle(st);
      if (pl.bankrupt) afterDebts(st, ctx);
      return null;
    }
    case "ticket": {
      // Travel ticket: hand a Travel & Freight deed back to the bank, pay the fee, fly anywhere.
      if (!st.settings.tickets) return "Tickets are off in this game";
      if (st.phase !== "roll" || st.extraRoll) return "Use a ticket instead of rolling, at the start of your turn";
      if (pl.inGulag) return "No flights out of the Gulag";
      const p = st.props[a.tile];
      if (!p || TILES[a.tile].kind !== "transport" || p.owner !== pid) return "You need a Travel & Freight company to use as a ticket";
      const dest = Math.floor(a.to);
      if (!(dest >= 0 && dest < 40) || dest === pl.pos) return "Pick a destination";
      if (pl.cash < TICKET_FEE) return `The ticket costs ${money(TICKET_FEE)}`;
      transfer(st, pid, toBankOrPot(st), TICKET_FEE, "Travel ticket");
      st.props[a.tile] = { owner: null, level: 0, mort: false };
      st.card = null;
      st.extraRoll = false;
      log(st, `${pl.name} cashes in ${TILES[a.tile].name} as a ticket and flies to ${TILES[dest].name}`);
      moveTo(st, pid, dest, { passGo: false, kind: "jump" });
      land(st, pid, ctx);
      if (!pl.bankrupt) settle(st);
      return null;
    }
    case "payBail": {
      if (st.phase !== "roll" || !pl.inGulag) return "You're not in the Gulag";
      if (pl.cash < BAIL) return "Not enough cash for bail";
      transfer(st, pid, toBankOrPot(st), BAIL, "Bail");
      pl.inGulag = false;
      pl.gulagTries = 0;
      log(st, `${pl.name} bribed their way out of the Gulag (${money(BAIL)})`);
      return null;
    }
    case "useCard": {
      if (st.phase !== "roll" || !pl.inGulag || !pl.gulagCards.length) return "No card to use";
      const deck = pl.gulagCards.pop();
      st.decks[deck].push((deck === "news" ? NEWS : DEALS).findIndex((c) => c.fx.type === "gulagFree"));
      pl.inGulag = false;
      pl.gulagTries = 0;
      log(st, `${pl.name} used a Get-out-of-Gulag card`);
      return null;
    }
    case "buy": {
      if (st.phase !== "buy" || st.pendingTile == null) return "Nothing to buy";
      const i = st.pendingTile;
      const price = TILES[i].price;
      if (pl.cash < price) return "Not enough cash — mortgage something or auction it";
      addCash(st, pid, -price, `Bought ${TILES[i].name}`);
      st.props[i].owner = pid;
      st.pendingTile = null;
      emit({ type: "buy", pid, tile: i, price });
      log(st, `${pl.name} bought ${TILES[i].name} for ${money(price)}`);
      settle(st);
      return null;
    }
    case "decline": {
      if (st.phase !== "buy" || st.pendingTile == null) return "Nothing to decline";
      const i = st.pendingTile;
      if (st.settings.auctions && alive(st).length > 1) startAuction(st, i, ctx);
      else { st.pendingTile = null; log(st, `${pl.name} passed on ${TILES[i].name}`); settle(st); }
      return null;
    }
    case "endTurn": {
      if (st.phase !== "end") return st.phase === "roll" ? "Roll first" : "Finish this step first";
      nextTurn(st);
      return null;
    }
    default:
      return "Unknown action";
  }
}
