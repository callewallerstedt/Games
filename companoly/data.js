// Companoly — board, sectors, cards. Pure data (shared by browser + simulator).
// All money is in millions of dollars ($M). $1,500M start = $1.5B.

export const SECTORS = {
  food:    { name: "Fast Food",        color: "#9a6440", build: 50 },
  social:  { name: "Social Media",     color: "#38bdf8", build: 50 },
  vice:    { name: "Vice",             color: "#ec4899", build: 100 },
  pharma:  { name: "Big Pharma",       color: "#f97316", build: 100 },
  auto:    { name: "Automotive",       color: "#ef4444", build: 150 },
  tech:    { name: "Big Tech & AI",    color: "#facc15", build: 150 },
  space:   { name: "Space",            color: "#22c55e", build: 200 },
  defense: { name: "Defense",          color: "#4f6bff", build: 200 },
  transport: { name: "Travel & Freight", color: "#94a3b8" },
  oil:     { name: "Big Oil",          color: "#a8a29e" },
};

// Rent per upgrade level, scaled down from the classic curve so a single
// landing hurts but doesn't instantly end a healthy player. Tuned with
// scripts/companoly-sim.mjs. Index: [base, 1 factory, 2, 3, 4, HQ].
const LEVEL_SCALE = [1, 0.9, 0.8, 0.7, 0.65, 0.62];
const CLASSIC = {
  60:  [2, 10, 30, 90, 160, 250],
  60.1:[4, 20, 60, 180, 320, 450],
  100: [6, 30, 90, 270, 400, 550],
  120: [8, 40, 100, 300, 450, 600],
  140: [10, 50, 150, 450, 625, 750],
  160: [12, 60, 180, 500, 700, 900],
  180: [14, 70, 200, 550, 750, 950],
  200: [16, 80, 220, 600, 800, 1000],
  220: [18, 90, 250, 700, 875, 1050],
  240: [20, 100, 300, 750, 925, 1100],
  260: [22, 110, 330, 800, 975, 1150],
  280: [24, 120, 360, 850, 1025, 1200],
  300: [26, 130, 390, 900, 1100, 1275],
  320: [28, 150, 450, 1000, 1200, 1400],
  350: [35, 175, 500, 1100, 1300, 1500],
  400: [50, 200, 600, 1400, 1700, 2000],
};
const round5 = (n) => Math.max(2, Math.round(n / 5) * 5);
function rentTable(key) {
  return CLASSIC[key].map((r, i) => (i === 0 ? r : round5(r * LEVEL_SCALE[i])));
}

// `logo` is a file in companoly/logos/ (real logos, self-hosted so they never rate-limit mid-game).
const P = (name, logo, sector, price, key = price, blurb = "") =>
  ({ kind: "prop", name, logo, sector, price, rent: rentTable(key), blurb });

export const TILES = [
  { kind: "go", name: "Payday", blurb: "Collect your $200M quarterly dividend every time you pass." },
  P("McDonald's", "mcdonalds.jpg", "food", 60, 60, "Billions served. Arteries not included."),
  { kind: "deal", name: "Shady Deal" },
  P("KFC", "kfc.png", "food", 60, 60.1, "Finger lickin' cholesterol."),
  { kind: "tax", name: "Corporate Tax", amount: 200, blurb: "Your accountants tried their best." },
  { kind: "transport", name: "Boeing", logo: "boeing.jpg", sector: "transport", price: 200, blurb: "Doors sold separately." },
  P("Meta", "meta.jpg", "social", 100, 100, "Connecting you with your worst relatives."),
  { kind: "news", name: "Breaking News" },
  P("TikTok", "tiktok.jpg", "social", 100, 100, "Your attention span, monetized."),
  P("X", "x.png", "social", 120, 120, "Formerly a bird. Now mostly bots."),
  { kind: "gulag", name: "Gulag", blurb: "Just visiting. Wave at the inmates." },
  P("Philip Morris", "philipmorris.png", "vice", 140, 140, "Doctors used to recommend us."),
  { kind: "oil", name: "ExxonMobil", logo: "exxon.png", sector: "oil", price: 150, blurb: "Knew about climate change in 1977. Kept drilling." },
  P("Juul", "juul.png", "vice", 140, 140, "Mango-flavoured lung clouds."),
  P("DraftKings", "draftkings.png", "vice", 160, 160, "The house always wins. You are the house."),
  { kind: "transport", name: "Ryanair", logo: "ryanair.png", sector: "transport", price: 200, blurb: "Seats extra. Oxygen extra. Dignity not available." },
  P("Purdue Pharma", "purdue.png", "pharma", 180, 180, "Family owned. Families destroyed."),
  { kind: "deal", name: "Shady Deal" },
  P("Johnson & Johnson", "jnj.png", "pharma", 180, 180, "Gentle enough for babies. Allegedly."),
  P("Pfizer", "pfizer.png", "pharma", 200, 200, "Side effects may include profit."),
  { kind: "haven", name: "Casino", blurb: "The offshore casino. Bet $200M on higher or lower, or $100M on a single number for a 6x payout. Or just walk away." },
  P("Volkswagen", "vw.png", "auto", 220, 220, "Emissions tests are more of a suggestion."),
  { kind: "news", name: "Breaking News" },
  P("Ford", "ford.jpg", "auto", 220, 220, "Built Ford tough. Recalled Ford often."),
  P("Tesla", "tesla.png", "auto", 240, 240, "Full self-driving*. *Not really."),
  { kind: "transport", name: "Maersk", logo: "maersk.png", sector: "transport", price: 200, blurb: "Your container is somewhere near the Suez Canal." },
  P("Google", "google.png", "tech", 260, 260, "Don't be evil (offer expired)."),
  P("Nvidia", "nvidia.png", "tech", 260, 260, "Sells the shovels in the AI gold rush."),
  { kind: "oil", name: "Shell", logo: "shell.png", sector: "oil", price: 150, blurb: "Net zero by 2050. Pinky promise." },
  P("Palantir", "palantir.png", "tech", 280, 280, "Knows where you are right now."),
  { kind: "toGulag", name: "Sent to the Gulag", blurb: "Do not pass Payday. Do not collect $200M." },
  P("Virgin Galactic", "virgingalactic.png", "space", 300, 300, "Space tourism for the very bored."),
  P("Blue Origin", "blueorigin.png", "space", 300, 300, "Shaped like a rocket. Allegedly."),
  { kind: "deal", name: "Shady Deal" },
  P("SpaceX", "spacex.png", "space", 320, 320, "Rapid unscheduled disassembly specialists."),
  { kind: "transport", name: "Uber", logo: "uber.png", sector: "transport", price: 200, blurb: "Your driver gave you one star." },
  { kind: "news", name: "Breaking News" },
  P("Anduril", "anduril.jpg", "defense", 350, 350, "Autonomous weapons, now with an app."),
  { kind: "tax", name: "Carbon Tax", amount: 100, blurb: "A rounding error for the planet." },
  P("Lockheed Martin", "lockheed.png", "defense", 400, 400, "The most expensive war machines on Earth."),
].map((t, i) => ({ ...t, i }));

export const GULAG = 10;
export const TRANSPORT_RENT = [0, 25, 50, 100, 200];
export const OIL_MULT = [0, 4, 10];
export const BAIL = 50;
export const MAX_FACTORIES = 32;
export const MAX_HQ = 12;

export const COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#eab308", "#a855f7", "#f97316"];

// ----- Cards -----
// fx types: money, moveTo, moveBy, nearest, gulag, gulagFree, repairs,
// collectEach, payEach, trend, sectorPayout, windfall, bailout, stimulus, cashPct
export const NEWS = [
  { title: "War Breaks Out", text: "Somewhere nobody can find on a map. Defense rents +50% for 3 rounds.", fx: { type: "trend", sector: "defense", mult: 1.5, rounds: 3 } },
  { title: "Global Pandemic", text: "Big Pharma rents are doubled for 2 rounds.", fx: { type: "trend", sector: "pharma", mult: 2, rounds: 2 } },
  { title: "Oil Spill", text: "A protected reef is now black. Big Oil rents halved for 3 rounds.", fx: { type: "trend", sector: "oil", mult: 0.5, rounds: 3 } },
  { title: "Data Leak Scandal", text: "Everyone's DMs are public. Social Media rents halved for 2 rounds.", fx: { type: "trend", sector: "social", mult: 0.5, rounds: 2 } },
  { title: "Moon Rush", text: "Billionaires race to plant flags. Space rents +50% for 3 rounds.", fx: { type: "trend", sector: "space", mult: 1.5, rounds: 3 } },
  { title: "Emissions Scandal", text: "Turns out the cars lied. Automotive rents halved for 2 rounds.", fx: { type: "trend", sector: "auto", mult: 0.5, rounds: 2 } },
  { title: "AI Bubble", text: "Everything is 'AI-powered' now. Big Tech rents +50% for 3 rounds.", fx: { type: "trend", sector: "tech", mult: 1.5, rounds: 3 } },
  { title: "Recession", text: "Consumers stop spending. ALL rents −25% for 2 rounds.", fx: { type: "trend", sector: "all", mult: 0.75, rounds: 2 } },
  { title: "Advance to Payday", text: "Collect your $200M dividend.", fx: { type: "moveTo", to: 0 } },
  { title: "Hostile Takeover Tour", text: "Advance to Lockheed Martin.", fx: { type: "moveTo", to: 39 } },
  { title: "Launch Party", text: "Advance to SpaceX. Collect $200M if you pass Payday.", fx: { type: "moveTo", to: 34 } },
  { title: "Car Show", text: "Advance to Tesla. Collect $200M if you pass Payday.", fx: { type: "moveTo", to: 24 } },
  { title: "Urgent Business Trip", text: "Advance to the nearest Travel & Freight company. If owned, pay double rent.", fx: { type: "nearest", kind: "transport" } },
  { title: "Coup in Progress", text: "Flee the country! Advance to the nearest Travel & Freight company. If owned, pay double rent.", fx: { type: "nearest", kind: "transport" } },
  { title: "Energy Crisis", text: "Advance to the nearest Big Oil company. If owned, pay 10× your dice roll.", fx: { type: "nearest", kind: "oil" } },
  { title: "Bad Press", text: "Lay low. Go back 3 spaces.", fx: { type: "moveBy", n: -3 } },
  { title: "Insider Trading", text: "The SEC finally noticed. Go directly to the Gulag.", fx: { type: "gulag" } },
  { title: "Your Lawyer Is a Wizard", text: "Get out of the Gulag free. Keep this card until needed.", fx: { type: "gulagFree" } },
  { title: "Antitrust Investigation", text: "Pay $25M per factory and $100M per HQ you own.", fx: { type: "repairs", factory: 25, hq: 100 } },
  { title: "Chairman of the Board", text: "Everyone wants a bonus. Pay each player $50M.", fx: { type: "payEach", amount: 50 } },
  { title: "Your Crypto Went Up", text: "Somehow. Collect $150M.", fx: { type: "money", amount: 150 } },
  { title: "Windfall Tax", text: "The richest player pays $150M to the poorest player.", fx: { type: "windfall", amount: 150 } },
  { title: "Government Contract", text: "Defense companies' owners collect $50M per Defense company they own.", fx: { type: "sectorPayout", sector: "defense", amount: 50 } },
  { title: "Private Jet Speeding Ticket", text: "Pay $15M.", fx: { type: "money", amount: -15 } },
  { title: "Bull Market", text: "Stocks only go up. Collect $100M.", fx: { type: "money", amount: 100 } },
  { title: "Opioid Lawsuit", text: "Big Pharma rents halved for 2 rounds while the lawyers argue.", fx: { type: "trend", sector: "pharma", mult: 0.5, rounds: 2 } },
  { title: "Stimulus Checks", text: "Helicopter money! Every player collects $50M.", fx: { type: "stimulus", amount: 50 } },
  { title: "Travel Boom", text: "Everyone wants to get away. Travel & Freight rents doubled for 2 rounds.", fx: { type: "trend", sector: "transport", mult: 2, rounds: 2 } },
  { title: "Davos Summit", text: "Fly private to lecture everyone about climate change, then hit the tables. Advance to the Casino.", fx: { type: "moveTo", to: 20 } },
  { title: "Silicon Valley Roadshow", text: "Pitch deck ready. Advance to Google. Collect $200M if you pass Payday.", fx: { type: "moveTo", to: 26 } },
  { title: "Detroit Factory Tour", text: "Hard hat, photo op, leave early. Advance to Ford.", fx: { type: "moveTo", to: 23 } },
  { title: "Market Rally", text: "Momentum is on your side. Move forward 4 spaces.", fx: { type: "moveBy", n: 4 } },
  { title: "Fast Food Price War", text: "Dollar menus everywhere. Fast Food rents +50% for 3 rounds.", fx: { type: "trend", sector: "food", mult: 1.5, rounds: 3 } },
  { title: "Vape Ban", text: "Regulators finally woke up. Vice rents halved for 2 rounds.", fx: { type: "trend", sector: "vice", mult: 0.5, rounds: 2 } },
];

export const DEALS = [
  { title: "Bank Error", text: "In your favour, obviously. Collect $200M.", fx: { type: "money", amount: 200 } },
  { title: "Offshore Fees", text: "Your Panama lawyer sends an invoice. Pay $50M.", fx: { type: "money", amount: -50 } },
  { title: "Lobbyist Came Through", text: "Tax refund! Collect $100M.", fx: { type: "money", amount: 100 } },
  { title: "Friends in High Places", text: "Get out of the Gulag free. Keep this card until needed.", fx: { type: "gulagFree" } },
  { title: "Tax Evasion", text: "Go directly to the Gulag. Do not pass Payday.", fx: { type: "gulag" } },
  { title: "Advance to Payday", text: "Collect $200M.", fx: { type: "moveTo", to: 0 } },
  { title: "Consulting Contract", text: "You did nothing. Collect $50M.", fx: { type: "money", amount: 50 } },
  { title: "Lawsuit Settlement", text: "Pay $100M. Admit no wrongdoing.", fx: { type: "money", amount: -100 } },
  { title: "Hush Money", text: "Pay $50M. You know why.", fx: { type: "money", amount: -50 } },
  { title: "Yacht Party", text: "Everyone chips in for the champagne. Collect $20M from every player.", fx: { type: "collectEach", amount: 20 } },
  { title: "Inherited a Shell Company", text: "Collect $100M.", fx: { type: "money", amount: 100 } },
  { title: "Golden Parachute", text: "Fired upwards. Collect $100M.", fx: { type: "money", amount: 100 } },
  { title: "Whistleblower Leak", text: "Damage control: pay $40M per factory and $115M per HQ.", fx: { type: "repairs", factory: 40, hq: 115 } },
  { title: "Sold User Data", text: "To the highest bidder. Collect $45M.", fx: { type: "money", amount: 45 } },
  { title: "Bribed a Senator", text: "Pay $50M. Worth every cent.", fx: { type: "money", amount: -50 } },
  { title: "Cayman Interest", text: "Collect $20M.", fx: { type: "money", amount: 20 } },
  { title: "Stock Buyback", text: "Pumped your own shares. Collect $100M.", fx: { type: "money", amount: 100 } },
  { title: "Union Strike", text: "Pay $25M per factory you own.", fx: { type: "repairs", factory: 25, hq: 25 } },
  { title: "Too Big to Fail", text: "Government bailout! If you're the poorest player collect $200M, otherwise $25M.", fx: { type: "bailout", poor: 200, other: 25 } },
  { title: "Crypto Rug Pull", text: "Your coin went to zero. Pay $75M.", fx: { type: "money", amount: -75 } },
  { title: "Key-Man Insurance", text: "Your CEO 'fell' off a yacht. Collect $100M.", fx: { type: "money", amount: 100 } },
  { title: "Ethics Award", text: "You paid for it, but still. Collect $10M.", fx: { type: "money", amount: 10 } },
  { title: "Patent Troll", text: "Someone patented the colour blue. Pay $50M.", fx: { type: "money", amount: -50 } },
  { title: "Sweatshop Exposé", text: "PR crisis. Pay $25M to every player to keep them quiet.", fx: { type: "payEach", amount: 25 } },
  { title: "Tax Loophole", text: "Your accountant found one. Collect $150M.", fx: { type: "money", amount: 150 } },
  { title: "Most Inspiring Keynote", text: "You received an award for the most inspiring speech at a conference you sponsored. Collect $200M.", fx: { type: "money", amount: 200 } },
  { title: "Weekend in Monaco", text: "Lost big at the casino. Pay $100M.", fx: { type: "money", amount: -100 } },
  { title: "Drive-Thru Inspection", text: "Surprise visit to the franchise. Advance to McDonald's. Collect $200M if you pass Payday.", fx: { type: "moveTo", to: 1 } },
  { title: "Charity Gala", text: "A tax-deductible photo op. Pay $30M.", fx: { type: "money", amount: -30 } },
  { title: "Podcast Sponsorship", text: "Your hustle-culture podcast got a sponsor. Collect $40M.", fx: { type: "money", amount: 40 } },
  { title: "Office Party Disaster", text: "Pay each player $10M to delete the videos.", fx: { type: "payEach", amount: 10 } },
  { title: "Space Tourism", text: "Eleven minutes in zero gravity. Advance to Blue Origin.", fx: { type: "moveTo", to: 32 } },
  { title: "Live TV Meltdown", text: "Walked off a news interview. Go back 2 spaces.", fx: { type: "moveBy", n: -2 } },
  { title: "IPO Day", text: "Everyone buys in at the top. Collect $25M from every player.", fx: { type: "collectEach", amount: 25 } },
];

export const TICKET_FEE = 150;
export const CASINO_HILO = 200;  // higher/lower stake, even money
export const CASINO_PICK = 100;  // pick-a-number stake, pays 6x

export const DEFAULT_SETTINGS = {
  startCash: 1500,
  maxRounds: 30,         // 0 = no round limit
  auctions: true,
  buildLimit: 3,         // upgrades per turn, 0 = unlimited
  buildNeedsSet: true,   // must own the whole sector to build
  buildWhere: "any",     // "any" | "sector" (landed in it this turn) | "exact" (landed on that company)
  evenBuild: true,       // build/sell evenly across the sector
  jackpot: false,        // taxes & fines pile up for whoever lands on the Casino
  goSalary: 200,
  claimRent: false,      // owners must claim rent before the next roll
  tickets: false,        // cash in a Travel & Freight deed to fly anywhere
  estateAuction: false,  // bankrupt companies are auctioned; creditor gets the cash
  noJailTrade: false,    // no trading while in the Gulag
  mortgageInterest: true,// redeeming costs +10%
  dealStart: false,      // deal 2 random companies to everyone at the start (paid)
  hqAfter: 4,            // factories needed before an HQ
  endAfterBankrupt: 0,   // end when this many players are bankrupt (0 = off)
  firstLapNoBuy: false,  // no buying until you've passed Payday once
};

// One-tap rule sets for the lobby.
export const PRESETS = {
  balanced: { label: "Companoly", desc: "Balanced and tuned by simulation. About an hour.", settings: { ...DEFAULT_SETTINGS } },
  goteborg: {
    label: "Göteborg",
    desc: "Göteborg – Spelet om din stad: claim your own rent, travel tickets, estate auctions, and you build only where you land. A long game.",
    settings: { ...DEFAULT_SETTINGS, maxRounds: 60, buildLimit: 1, buildWhere: "exact", goSalary: 250, claimRent: true, tickets: true, estateAuction: true, noJailTrade: true, mortgageInterest: false },
  },
  goteborgShort: {
    label: "Göteborg short",
    desc: "The rulebook's short version: 2 companies dealt to each player, HQ after 3 factories, ends when 2 players are bankrupt.",
    settings: { ...DEFAULT_SETTINGS, maxRounds: 0, buildLimit: 0, goSalary: 250, claimRent: true, tickets: true, estateAuction: true, noJailTrade: true, mortgageInterest: false, dealStart: true, hqAfter: 3, endAfterBankrupt: 2 },
  },
  classic: {
    label: "Classic",
    desc: "Full sets, build anywhere, no limits, last one standing.",
    settings: { ...DEFAULT_SETTINGS, maxRounds: 0, buildLimit: 0 },
  },
};
