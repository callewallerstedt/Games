// Balance simulator for Companoly. Plays many games with simple scripted
// players and reports game length, comeback rate, and "one-hit KO" frequency.
// Run: node scripts/companoly-sim.mjs [games] [players] [maxRounds]
import {
  createGame, act, currentId, alive, ownedBy, hasSet, sectorTiles, netWorth,
  canBuild, canSell, canMortgage, rentFor, buildCost,
} from "../companoly/engine.js";
import { TILES, PRESETS } from "../companoly/data.js";

const GAMES = Number(process.argv[2] || 400);
const N = Number(process.argv[3] || 4);
const MAX_ROUNDS = Number(process.argv[4] ?? 0);
const BUILD_LIMIT = Number(process.argv[5] ?? 3);
const PRESET = process.argv[6] || "";

function mulberry(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- scripted player ---
function tileValue(st, pid, i) {
  const t = TILES[i];
  if (!t.sector) return t.price;
  const tiles = sectorTiles(t.sector);
  const mine = tiles.filter((j) => j !== i && st.props[j].owner === pid).length;
  const others = tiles.filter((j) => j !== i).length;
  if (mine === others) return t.price * 2.2;
  if (mine > 0) return t.price * 1.3;
  const owners = new Set(tiles.filter((j) => j !== i).map((j) => st.props[j].owner));
  if (owners.size === 1 && [...owners][0] && [...owners][0] !== pid) return t.price * 1.4;
  return t.price;
}
function reserve(st) {
  const rents = Object.keys(st.props).map(Number).map((i) => rentFor(st, i)).sort((a, b) => b - a);
  return Math.min(400, Math.max(60, Math.round((rents[0] || 0) * 0.6)));
}
function decide(st, pid, rng) {
  const pl = st.players[pid];
  const d = st.debts[0];
  if (d) {
    if (d.debtor !== pid) return null;
    if (pl.cash >= d.amount) return { type: "payDebt" };
    const mine = ownedBy(st, pid);
    const sell = mine.find((i) => !canSell(st, pid, i));
    if (sell != null) return { type: "sell", tile: sell };
    const mort = mine.filter((i) => !canMortgage(st, pid, i)).sort((a, b) => TILES[a].price - TILES[b].price)[0];
    if (mort != null) return { type: "mortgage", tile: mort };
    return { type: "bankrupt" };
  }
  const claim = st.claims.find((c) => c.to === pid);
  if (claim) return { type: "claimRent", id: claim.id };
  if (st.auction) {
    const a = st.auction;
    if (a.out.includes(pid) || a.bidder === pid) return null;
    const v = Math.min(tileValue(st, pid, a.tile) * (0.85 + rng() * 0.3), pl.cash - 50);
    const next = a.high + (a.high < 100 ? 10 : 20);
    return next <= v ? { type: "bid", amount: next } : { type: "auctionPass" };
  }
  const offer = st.trades.find((t) => t.to === pid);
  if (offer) {
    const gain = offer.give.tiles.reduce((s, i) => s + tileValue(st, pid, i), 0) + offer.give.cash;
    const loss = offer.get.tiles.reduce((s, i) => s + TILES[i].price * (tileValue(st, offer.from, i) > TILES[i].price * 2 ? 1.6 : 1.1), 0) + offer.get.cash;
    return gain >= loss ? { type: "acceptTrade", id: offer.id } : { type: "cancelTrade", id: offer.id };
  }
  if (currentId(st) !== pid) return null;
  if (st.phase === "roll") {
    if (pl.inGulag) {
      const unowned = Object.values(st.props).filter((p) => !p.owner).length;
      if (unowned > 8 && pl.gulagCards.length) return { type: "useCard" };
      if (unowned > 8 && pl.cash > 300) return { type: "payBail" };
    }
    return { type: "roll" };
  }
  if (st.phase === "buy") {
    const i = st.pendingTile;
    const v = tileValue(st, pid, i);
    const ok = pl.cash >= TILES[i].price && (pl.cash - TILES[i].price >= (st.round < 8 ? 0 : reserve(st) * 0.5) || v > TILES[i].price * 1.2);
    return ok ? { type: "buy" } : { type: "decline" };
  }
  if (st.phase === "end") {
    const res = reserve(st);
    const mine = ownedBy(st, pid);
    const unm = mine.find((i) => st.props[i].mort && pl.cash > res * 2 + TILES[i].price);
    if (unm != null) return { type: "unmortgage", tile: unm };
    const b = mine.filter((i) => !canBuild(st, pid, i)).sort((x, y) => st.props[x].level - st.props[y].level)[0];
    if (b != null && pl.cash - buildCost(b) >= res) return { type: "build", tile: b };
    // Trade for a missing piece now and then.
    if (rng() < 0.35) {
      for (const sector of ["food", "social", "vice", "pharma", "auto", "tech", "space", "defense"]) {
        const tiles = sectorTiles(sector);
        const have = tiles.filter((i) => st.props[i].owner === pid);
        const missing = tiles.filter((i) => st.props[i].owner !== pid);
        if (!have.length || have.length < tiles.length - 1 || missing.length !== 1) continue;
        const owner = st.props[missing[0]].owner;
        if (!owner || st.props[missing[0]].level) continue;
        // Prefer a set-for-set swap if the owner is also missing one of ours.
        const swap = ownedBy(st, pid).find((i) => TILES[i].kind === "prop" && TILES[i].sector !== sector && !st.props[i].level
          && sectorTiles(TILES[i].sector).filter((j) => j !== i).every((j) => st.props[j].owner === owner));
        if (swap != null) return { type: "proposeTrade", to: owner, give: { tiles: [swap] }, get: { tiles: missing } };
        const cash = Math.min(Math.round(TILES[missing[0]].price * (1.5 + rng() * 0.8)), pl.cash - 100);
        if (cash < TILES[missing[0]].price) continue;
        return { type: "proposeTrade", to: owner, give: { cash }, get: { tiles: missing } };
      }
    }
    return { type: "endTurn" };
  }
  return null;
}

// --- run ---
const stats = { rounds: [], timeout: 0, firstSetWins: 0, firstSetGames: 0, oneHitKOs: 0, bigHits: 0, rentHits: 0, leaderAt10Wins: 0, endingByBell: 0, maxRent: [], setRounds: [], busts: [], seatWins: Array(N).fill(0), worthSpread: [] };
for (let g = 0; g < GAMES; g++) {
  const rng = mulberry(1000 + g);
  const players = Array.from({ length: N }, (_, k) => ({ id: `p${k}`, name: `P${k}`, token: "x", color: "#fff" }));
  const st = createGame(players, PRESET ? { ...PRESETS[PRESET].settings, ...(MAX_ROUNDS >= 0 ? { maxRounds: MAX_ROUNDS } : {}) } : { maxRounds: MAX_ROUNDS, buildLimit: BUILD_LIMIT }, rng);
  let firstSet = null;
  let leaderAt10 = null;
  let firstSetRound = null;
  let now = 0;
  let steps = 0;
  while (st.phase !== "over" && steps < 60000) {
    steps++;
    now += 500;
    let acted = false;
    // Owners claim rent first (real players watch the board), then whoever is up.
    const queue = alive(st).sort((x, y) => Number(st.claims.some((c) => c.to === y)) - Number(st.claims.some((c) => c.to === x)));
    for (const pid of queue) {
      const a = decide(st, pid, rng);
      if (!a) continue;
      const before = netWorth(st, pid);
      const r = act(st, pid, a, { rng, now });
      for (const e of r.events) {
        if (e.type === "pay" && typeof e.why === "string" && e.why.startsWith("Rent")) {
          stats.rentHits++;
          stats.maxRent.push(e.amount);
          if (e.amount > before * 0.5) stats.bigHits++;
        }
      }
      acted = true;
      break;
    }
    if (!acted && st.auction) { now = st.auction.endsAt; act(st, "system", { type: "auctionTimeout" }, { rng, now }); }
    if (!firstSet) {
      for (const pid of alive(st)) {
        if (["food", "social", "vice", "pharma", "auto", "tech", "space", "defense"].some((s) => hasSet(st, pid, s))) { firstSet = pid; firstSetRound = st.round; break; }
      }
    }
    if (st.round === 10 && !leaderAt10) leaderAt10 = alive(st).sort((a, b) => netWorth(st, b) - netWorth(st, a))[0];
  }
  if (st.phase !== "over") { stats.timeout++; continue; }
  stats.rounds.push(st.round);
  stats.busts.push(st.bankruptOrder.length);
  stats.seatWins[st.order.indexOf(st.winner)]++;
  const w = st.standings.map((x) => x.worth);
  if (w.length > 1) stats.worthSpread.push(w[1] / Math.max(1, w[0]));
  if (st.settings.maxRounds && st.round > st.settings.maxRounds) stats.endingByBell++;
  if (firstSet) { stats.setRounds.push(firstSetRound); stats.firstSetGames++; if (st.winner === firstSet) stats.firstSetWins++; }
  if (leaderAt10 && st.winner === leaderAt10) stats.leaderAt10Wins++;
}
const r = stats.rounds.sort((a, b) => a - b);
const pct = (x) => `${((x / Math.max(1, r.length)) * 100).toFixed(0)}%`;
const mr = stats.maxRent.sort((a, b) => a - b);
console.log(`games=${GAMES} players=${N} maxRounds=${MAX_ROUNDS || "∞"} finished=${r.length} stuck=${stats.timeout}`);
console.log(`rounds: median ${r[r.length >> 1]}  p10 ${r[Math.floor(r.length * 0.1)]}  p90 ${r[Math.floor(r.length * 0.9)]}`);
console.log(`ended by closing bell: ${pct(stats.endingByBell)}`);
console.log(`first-set owner wins: ${((stats.firstSetWins / Math.max(1, stats.firstSetGames)) * 100).toFixed(0)}% (fair share ${(100 / N).toFixed(0)}%)`);
console.log(`leader at round 10 wins: ${pct(stats.leaderAt10Wins)}`);
console.log(`rent hits >50% of payer's net worth: ${((stats.bigHits / Math.max(1, stats.rentHits)) * 100).toFixed(2)}% of ${stats.rentHits}`);
const sr = stats.setRounds.sort((a, b) => a - b);
console.log(`first set formed: median round ${sr[sr.length >> 1]}; avg bankruptcies ${(stats.busts.reduce((a, b) => a + b, 0) / Math.max(1, stats.busts.length)).toFixed(2)}`);
console.log(`rent p50 ${mr[mr.length >> 1]}  p95 ${mr[Math.floor(mr.length * 0.95)]}  max ${mr[mr.length - 1]}`);
console.log(`win rate by seat: ${stats.seatWins.map((x) => ((x / Math.max(1, r.length)) * 100).toFixed(0) + "%").join(" ")}`);
const ws = stats.worthSpread.sort((a, b) => a - b);
if (ws.length) console.log(`runner-up net worth as % of winner: median ${(ws[ws.length >> 1] * 100).toFixed(0)}%`);
