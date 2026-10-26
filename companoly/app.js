// Companoly client: lobby, board, animations, host networking.
// The server (api/companoly.js) runs the rules engine and stores the game; every
// browser just sends actions and polls for changes, so nobody's device is the host.
import { TILES, SECTORS, NEWS, DEALS, COLORS, PRESETS, TRANSPORT_RENT, OIL_MULT, BAIL, TICKET_FEE, CASINO_HILO, CASINO_PICK } from "./data.js";
import * as G from "./engine.js";
import { rollDice3D, preloadDice } from "./dice3d.js";
import { sfx, isMuted, setMuted, getVolume, setVolume } from "./sound.js";

const { money } = G;
const SHORT = { "Johnson & Johnson": "J&J", "Lockheed Martin": "Lockheed", "Purdue Pharma": "Purdue", "Virgin Galactic": "Virgin Galactic", "Philip Morris": "Philip Morris" };
const MAX_PLAYERS = 6;

// ---------- tiny DOM helpers ----------
const $ = (s, r = document) => r.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clone = (o) => (typeof structuredClone === "function" ? structuredClone(o) : JSON.parse(JSON.stringify(o)));
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "html") el.innerHTML = v;
    else if (k === "value") el.value = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : String(kid));
  return el;
}
const ICONS = {
  briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  news: '<path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/>',
  receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>',
  bars: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 3v18M12 3v18M16 3v18"/>',
  palm: '<path d="M13 8c0-2.76-2.46-5-5.5-5S2 5.24 2 8h2l1-1 1 1h4"/><path d="M13 7.14A5.82 5.82 0 0 1 16.5 6c3.04 0 5.5 2.24 5.5 5h-3l-1-1-1 1h-3"/><path d="M5.89 9.71c-2.15 2.15-2.3 5.47-.35 7.43l4.24-4.25.7-.7.71-.71 2.12-2.12c-1.95-1.96-5.27-1.8-7.42.35"/><path d="M11 15.5c.5 2.5-.17 4.5-1 6.5h4c2-5.5-.5-12-1-14"/>',
  siren: '<path d="M7 18v-6a5 5 0 1 1 10 0v6"/><path d="M5 21a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-1a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2z"/><path d="M21 12h1M18.5 4.5 18 5M2 12h1M12 2v1M4.93 4.93l.71.71"/>',
  crown: '<path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/>',
  arrowLeft: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  swap: '<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>',
  book: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.59 13.51 6.83 3.98M15.41 6.51l-6.82 3.98"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  volume: '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/>',
  volumeOff: '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path d="m22 9-6 6M16 9l6 6"/>',
  dice: '<rect width="12" height="12" x="2" y="10" rx="2" ry="2"/><path d="m17.92 14 3.5-3.5a2.24 2.24 0 0 0 0-3l-5-4.92a2.24 2.24 0 0 0-3 0L10 6"/><path d="M6 18h.01"/><path d="M10 14h.01"/><path d="M15 6h.01"/><path d="M18 9h.01"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
};
function icon(name, cls = "i") {
  const t = document.createElement("template");
  t.innerHTML = `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
  return t.content.firstChild;
}
function soundButton() {
  const btn = h("button", { class: "iconbtn", title: "Sound on/off" });
  const slider = h("input", { type: "range", min: "0", max: "100", value: String(Math.round(getVolume() * 100)), class: "vol", title: "Volume", "aria-label": "Volume" });
  const paint = () => {
    btn.replaceChildren(icon(isMuted() ? "volumeOff" : "volume"));
    slider.value = String(isMuted() ? 0 : Math.round(getVolume() * 100));
    slider.style.setProperty("--p", `${slider.value}%`);
  };
  btn.addEventListener("click", () => { setMuted(!isMuted()); paint(); if (!isMuted()) sfx.chime(); });
  slider.addEventListener("input", () => { setVolume(Number(slider.value) / 100); paint(); });
  slider.addEventListener("change", () => sfx.coin());
  paint();
  return h("div", { class: "volbox" }, btn, slider);
}
const brandMark = () => h("span", { html: '<svg class="brand-mark" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#151c26"/><rect x="10" y="10" width="44" height="44" rx="6" fill="none" stroke="#f5c451" stroke-width="5"/><rect x="22" y="22" width="20" height="20" rx="3" fill="#f5c451"/></svg>' }).firstChild;
const wordmark = () => h("div", { class: "wordmark" }, "COMPAN", h("b", {}, "O"), "LY");

const initials = (name) => name.replace(/[^A-Za-z0-9& ]/g, "").split(/\s+/).map((w) => w[0]).join("").slice(0, 3).toUpperCase();
function logo(t) {
  const box = h("div", { class: "logo-box" });
  const img = h("img", { class: "logo", alt: "", loading: "lazy", draggable: "false", src: `logos/${t.logo}` });
  img.addEventListener("error", () => img.replaceWith(h("span", { class: "mono" }, initials(t.name))));
  box.append(img);
  return box;
}
const pawn = (p, cls = "") => h("span", { class: `pawn ${cls}`, style: `--c:${p.color}` }, (p.name || "?").trim()[0]?.toUpperCase() || "?");

function toast(text, kind = "") {
  const el = h("div", { class: `toast ${kind}` }, text);
  $("#toasts").append(el);
  setTimeout(() => { el.style.transition = "opacity .3s"; el.style.opacity = "0"; }, 2600);
  setTimeout(() => el.remove(), 3000);
}

// ---------- identity ----------
const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const rid = (n, abc = "abcdefghijkmnpqrstuvwxyz23456789") => Array.from({ length: n }, () => abc[Math.floor(Math.random() * abc.length)]).join("");
const me = {
  cid: store.get("cmp_cid") || rid(10),
  name: store.get("cmp_name", ""),
  color: store.get("cmp_color", COLORS[Math.floor(Math.random() * COLORS.length)]),
};
store.set("cmp_cid", me.cid);
const saveMe = () => { store.set("cmp_name", me.name); store.set("cmp_color", me.color); };

// ---------- app state ----------
const app = {
  code: null, room: null, you: null, seq: 0, conn: "",
  game: null, view: null, online: {},
  queue: [], busy: false, skew: 0,
  els: null, tokenPos: {}, dispCash: {},
  modal: null, seenTrades: new Set(), turnKey: null, overShown: false,
  tick: null, cardKey: null, pick: null,
  pollOn: false, polling: false, pollTimer: null, lastBeat: 0, fails: 0, onlineKey: "",
};
const isHost = () => !!app.room && app.room.host === app.you;
const myId = () => app.you;

// ---------- routing ----------
function route() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (["g", "join", "host"].includes(parts[0]) && parts[1]) return enterRoom(parts[1].toUpperCase());
  leaveRoom();
  renderHome();
}
window.addEventListener("hashchange", route);

function leaveRoom() {
  stopPolling();
  clearInterval(app.tick);
  Object.assign(app, {
    code: null, room: null, you: null, seq: 0, conn: "", game: null, view: null, online: {},
    queue: [], busy: false, els: null, tokenPos: {}, dispCash: {}, seenTrades: new Set(),
    turnKey: null, overShown: false, pick: null, fails: 0, onlineKey: "",
  });
  closeModal();
}

// Games you've been in, newest first (the server keeps them 30 days after the last move).
function rememberGame(code) {
  const list = (store.get("cmp_games", []) || []).filter((g) => g.code !== code);
  list.unshift({ code, at: Date.now() });
  store.set("cmp_games", list.slice(0, 8));
}
const ago = (t) => {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const hrs = Math.round(m / 60);
  return hrs < 24 ? `${hrs} h ago` : `${Math.round(hrs / 24)} d ago`;
};
const inviteUrl = (code) => `${location.origin}${location.pathname}#/g/${code}`;

// ---------- server sync ----------
const API = "/api/companoly";
async function api(op, extra = {}, { retries = 0 } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 9000);
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op, cid: me.cid, code: app.code, ...extra }),
        signal: ctrl.signal,
        cache: "no-store",
      });
      clearTimeout(timer);
      const data = await res.json().catch(() => ({ ok: false, error: "Bad response from server" }));
      if (res.status >= 500 && attempt < retries) { await sleep(500 * (attempt + 1)); continue; }
      return data;
    } catch {
      if (attempt < retries) { await sleep(500 * (attempt + 1)); continue; }
      return { ok: false, offline: true, error: "Can't reach the server" };
    }
  }
}

function setConn(c) { if (app.conn !== c) { app.conn = c; renderConn(); } }

function applyView(v) {
  if (!v?.ok || v.unchanged) return;
  if (v.online) updateOnline(v.online);
  if (app.room && v.seq <= app.seq) return;
  app.room = v;
  app.you = v.you;
  app.skew = (v.now || Date.now()) - Date.now();
  const fresh = (v.batches || []).filter((b) => b.seq > app.seq);
  const firstLoad = !app.seq;
  app.seq = v.seq;
  if (v.started && v.game) {
    receiveState({ state: v.game, events: firstLoad ? [] : fresh.flatMap((b) => b.events) });
  } else {
    if (app.view) { app.game = null; app.view = null; app.els = null; app.queue = []; app.overShown = false; closeModal(); }
    renderLobby();
  }
}

function updateOnline(online) {
  const key = JSON.stringify(online);
  if (key === app.onlineKey) return;
  app.onlineKey = key;
  app.online = online;
  renderConn();
  if (app.view && app.els) { renderPlayers(); renderCenter(); }
  else document.querySelectorAll("[data-online]").forEach((el) => el.classList.toggle("off", !online[el.dataset.online]));
}

function startPolling() {
  stopPolling();
  app.pollOn = true;
  app.lastBeat = 0;
  pollLoop();
}
function stopPolling() {
  app.pollOn = false;
  clearTimeout(app.pollTimer);
}
async function pollLoop() {
  if (!app.pollOn || app.polling) return;
  clearTimeout(app.pollTimer);
  app.polling = true;
  const beat = Date.now() - app.lastBeat > 5000;
  if (beat) app.lastBeat = Date.now();
  const code = app.code;
  const r = await api("poll", { seq: app.seq, beat });
  app.polling = false;
  if (!app.pollOn || app.code !== code) return;
  if (r.ok) {
    app.fails = 0;
    setConn("connected");
    if (r.online) updateOnline(r.online);
    if (!r.unchanged) applyView(r);
  } else {
    app.fails++;
    if (app.fails > 1) setConn("reconnecting");
    if (/not found/i.test(r.error || "")) { stopPolling(); renderGone(r.error); return; }
  }
  const delay = document.hidden ? 3000 : app.fails ? Math.min(4000, 700 * app.fails) : 800;
  app.pollTimer = setTimeout(pollLoop, delay);
}
// Coming back to the tab (or the network returning) syncs immediately.
document.addEventListener("visibilitychange", () => { if (!document.hidden && app.pollOn) pollLoop(); });
window.addEventListener("online", () => { if (app.pollOn) pollLoop(); });

async function enterRoom(code) {
  if (app.code === code && app.room) return;
  leaveRoom();
  app.code = code;
  if (!me.name) return renderJoinForm(code);
  renderConnecting();
  const r = await api("join", { name: me.name, color: me.color }, { retries: 4 });
  if (app.code !== code) return;
  if (!r.ok) return renderGone(r.error);
  store.set("cmp_last", { code });
  rememberGame(code);
  setConn("connected");
  applyView(r);
  startPolling();
}

async function createRoom() {
  const r = await api("create", { name: me.name, color: me.color }, { retries: 2 });
  if (!r.ok) return toast(r.error || "Couldn't create a game", "err");
  leaveRoom();
  app.code = r.code;
  store.set("cmp_last", { code: r.code });
  rememberGame(r.code);
  applyView(r);
  startPolling();
  history.replaceState(null, "", `#/g/${r.code}`);
}

// Lobby/host requests: apply the returned room right away.
async function roomOp(op, extra = {}) {
  const r = await api(op, { ...extra, seq: app.seq }, { retries: 3 });
  if (!r.ok) return toast(r.error || "Something went wrong", "err");
  applyView(r);
}

let sending = 0;
async function send(action) {
  sending++;
  const r = await api("act", { action, aid: rid(10), seq: app.seq }, { retries: 4 });
  sending--;
  if (!r.ok) { toast(r.offline ? "Connection problem — retrying won't double your move, try again" : r.error, "err"); return; }
  applyView(r);
}

// ---------- state pipeline & animation ----------
function receiveState(msg) {
  app.skew = (msg.now || Date.now()) - Date.now();
  app.game = msg.state;
  app.queue.push(msg);
  pump();
}
async function pump() {
  if (app.busy) return;
  app.busy = true;
  try {
    while (app.queue.length) {
      const msg = app.queue.shift();
      if (!app.els || !$(".board")) {
        app.view = msg.state;
        resetDisplay();
        renderGame();
        continue;
      }
      const fast = app.queue.length > 2 || document.hidden;
      if (!fast) await animate(msg.events || []);
      app.view = msg.state;
      resetDisplay();
      updateGame();
      afterUpdate();
    }
  } catch (e) { console.error(e); }
  app.busy = false;
}
function resetDisplay() {
  const st = app.view;
  if (!st) return;
  for (const p of Object.values(st.players)) { app.tokenPos[p.id] = p.pos; app.dispCash[p.id] = p.cash; }
}

async function animate(events) {
  const mine = myId();
  for (const e of events) {
    if (e.type === "roll") { await rollDice(e.dice); if (e.dice[0] === e.dice[1]) sfx.sparkle(); }
    else if (e.type === "move") await animateMove(e.pid, e.from, e.to, e.kind);
    else if (e.type === "card") { sfx.card(); showCardNow(e.deck, e.id); await sleep(900); }
    else if (e.type === "cash") { floatCash(e.pid, e.amount); sfx.cash(e.amount, e.pid === mine); }
    else if (e.type === "buy") { flashTile(e.tile, app.game.players[e.pid]?.color); sfx.register(); }
    else if (e.type === "build") sfx.build();
    else if (e.type === "auction") sfx.gavel();
    else if (e.type === "bid") sfx.tick();
    else if (e.type === "trend") sfx.sting(e.mult >= 1);
    else if (e.type === "tradeOffer" && e.to === mine) sfx.alert();
    else if (e.type === "tradeClosed" && e.accepted) sfx.register();
    else if (e.type === "over") sfx.fanfare();
    else if (e.type === "casino") await casinoRoll(e);
    else if (e.type === "gulag") { sfx.clang(); flashTile(10, "#ef4444"); await sleep(250); }
    else if (e.type === "bankrupt") { sfx.sad(); await sleep(300); }
    else if (e.type === "claimable" && e.to === myId()) { sfx.alert(); toast(`Claim your ${money(e.amount)} rent before the next roll!`, "turn"); }
  }
}

function setDie(el, n) {
  const map = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  [...el.children].forEach((pip, k) => pip.classList.toggle("on", map[n]?.includes(k)));
}
async function casinoRoll(e) {
  const p = app.game.players[e.pid];
  const bet = e.game === "hilo" ? `${e.pick === "high" ? "High" : "Low"}` : `number ${e.pick}`;
  if (app.els?.center && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    try {
      sfx.shake();
      await Promise.race([rollDice3D(app.els.center, [e.die], { onHit: (v, kind) => sfx.diceHit(v, kind) }), sleep(7000)]);
    } catch { sfx.rattle(); await sleep(600); }
  }
  if (e.win) sfx.win(); else sfx.lose();
  toast(`${p?.name || "?"} bet ${bet}, rolled ${e.die}: ${e.win ? `WINS ${money(e.net)}!` : "loses"}`, e.win ? "turn" : "err");
}

// Real physics dice in the board centre; falls back to the flat dice if WebGL/CDN fails.
async function rollDice(dice) {
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (app.els?.center && !reduce) {
    try {
      app.els.dice.style.visibility = "hidden";
      // Never let a slow CDN or GPU hiccup hold up the game.
      sfx.shake();
      await Promise.race([rollDice3D(app.els.center, dice, { onHit: (v, kind) => sfx.diceHit(v, kind) }), sleep(7000)]);
      [...app.els.dice.children].forEach((d, k) => setDie(d, dice[k]));
      app.els.dice.classList.toggle("dbl", dice[0] === dice[1]);
      return;
    } catch (err) {
      console.warn("3D dice unavailable", err);
    } finally {
      if (app.els?.dice) app.els.dice.style.visibility = "";
    }
  }
  sfx.rattle();
  await animateDice(dice);
}
async function animateDice(dice) {
  const dies = app.els?.dice ? [...app.els.dice.children] : [];
  if (!dies.length) return;
  app.els.dice.classList.remove("dbl");
  dies.forEach((d) => { d.classList.remove("roll"); void d.offsetWidth; d.classList.add("roll"); });
  for (let k = 0; k < 8; k++) { dies.forEach((d) => setDie(d, 1 + Math.floor(Math.random() * 6))); await sleep(70); }
  dies.forEach((d, k) => setDie(d, dice[k]));
  app.els.dice.classList.toggle("dbl", dice[0] === dice[1]);
  await sleep(220);
}
async function animateMove(pid, from, to, kind) {
  const tok = app.els?.tokens[pid];
  if (!tok) return;
  if (kind === "jump") {
    sfx.whoosh();
    tok.classList.add("jump");
    app.tokenPos[pid] = to;
    layoutTokens();
    await sleep(600);
    tok.classList.remove("jump");
    return;
  }
  const step = kind === "back" ? -1 : 1;
  let p = from;
  let guard = 0;
  while (p !== to && guard++ < 40) {
    p = (p + step + 40) % 40;
    app.tokenPos[pid] = p;
    tok.classList.remove("hop"); void tok.offsetWidth; tok.classList.add("hop");
    sfx.step(guard);
    layoutTokens();
    await sleep(150);
  }
  const tileEl = app.els.tiles[to];
  tileEl.classList.remove("landed"); void tileEl.offsetWidth; tileEl.classList.add("landed");
  sfx.land();
  await sleep(120);
}
function flashTile(i, color) {
  const el = app.els?.tiles[i];
  if (!el) return;
  if (color) el.style.setProperty("--own", color);
  el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
}
function floatCash(pid, amount) {
  if (!amount) return;
  app.dispCash[pid] = (app.dispCash[pid] || 0) + amount;
  const row = app.els?.players?.querySelector(`[data-pid="${pid}"]`);
  if (!row) return;
  const c = row.querySelector(".cash");
  if (c) c.textContent = money(app.dispCash[pid]);
  const f = h("div", { class: `float ${amount > 0 ? "plus" : "minus"}` }, `${amount > 0 ? "+" : "−"}${money(Math.abs(amount))}`);
  row.append(f);
  setTimeout(() => f.remove(), 1700);
}
function showCardNow(deck, id) {
  const dyn = app.els?.dyn;
  if (!dyn) return;
  app.cardKey = `${deck}:${id}:${Date.now()}`;
  dyn.replaceChildren(cardEl(deck, id, true));
}
function cardEl(deck, id, animateIn) {
  const c = (deck === "news" ? NEWS : DEALS)[id];
  return h("div", { class: `c-card ${deck}`, style: animateIn ? "" : "animation:none" },
    h("div", { class: "deck" }, icon(deck === "news" ? "news" : "briefcase"), deck === "news" ? "Breaking News" : "Shady Deal"),
    h("div", { class: "ct" }, c.title),
    h("div", { class: "cx" }, c.text));
}

// ---------- render dispatch ----------
function renderConnecting() {
  $("#app").replaceChildren(h("div", { class: "shell" }, lobbyTop(),
    h("div", { class: "panel", style: "margin-top:28px;text-align:center;padding:48px" },
      h("div", { class: "code-big" }, app.code), h("p", { style: "color:var(--soft)" }, "Joining…"))));
}
function renderGone(error) {
  $("#app").replaceChildren(h("div", { class: "shell", style: "max-width:520px" },
    h("div", { class: "brand" }, brandMark(), wordmark()),
    h("div", { class: "panel stack", style: "margin-top:28px" },
      h("h3", {}, "Couldn't open this game"),
      h("p", { style: "margin:0;color:var(--soft)" }, error || "Unknown error"),
      h("div", { class: "row" },
        h("button", { class: "btn primary", onclick: () => { const c = app.code; leaveRoom(); enterRoom(c); } }, "Try again"),
        h("button", { class: "btn ghost", onclick: () => { location.hash = ""; } }, "Home")))));
}

// ---------- home ----------
function profileFields(onChange) {
  const name = h("input", { class: "field", maxlength: "16", placeholder: "Your name", value: me.name, autocomplete: "off",
    oninput: (e) => { me.name = e.target.value.trim(); saveMe(); onChange?.(); } });
  const sw = h("div", { class: "swatches" }, COLORS.map((c) => h("button", {
    class: `swatch${me.color === c ? " on" : ""}`, style: `background:${c}`, "aria-label": "Pick colour",
    onclick: (e) => { me.color = c; saveMe(); sw.querySelectorAll(".swatch").forEach((b) => b.classList.remove("on")); e.currentTarget.classList.add("on"); onChange?.(); },
  })));
  return { name, sw };
}

function renderHome() {
  closeModal();
  const { name, sw } = profileFields();
  const codeIn = h("input", { class: "field", placeholder: "CODE", maxlength: "5", style: "text-transform:uppercase;letter-spacing:.2em;font-weight:700" });
  const need = () => { if (!me.name) { toast("Enter your name first", "err"); name.focus(); return false; } return true; };
  const last = store.get("cmp_last");
  const savedGames = store.get("cmp_games", []) || [];
  if (last?.code && !savedGames.some((g) => g.code === last.code)) savedGames.unshift({ code: last.code, at: Date.now() });
  const companies = TILES.filter((t) => t.logo);
  $("#app").replaceChildren(h("div", { class: "shell" },
    h("div", { class: "brand" }, brandMark(), wordmark(), h("div", { style: "flex:1" }),
      h("button", { class: "btn ghost sm", onclick: openRules }, icon("book"), "Rules")),
    h("div", { class: "hero" },
      h("div", {},
        h("h1", {}, "Buy the world.", h("br"), h("span", {}, "Bankrupt your friends.")),
        h("p", { class: "lead" }, "Trade real companies — from McDonald's to Lockheed Martin — in a darkly funny take on the classic property game. 2–6 players, online, no sign-up."),
        h("div", { class: "panel stack" },
          h("div", {}, h("label", { class: "label" }, "Name"), name),
          h("div", {}, h("label", { class: "label" }, "Colour"), sw),
          h("button", { class: "btn primary block", onclick: (e) => { if (!need()) return; e.currentTarget.disabled = true; createRoom().finally(() => { e.target.disabled = false; }); } }, "Create a game"),
          h("div", { class: "row" }, codeIn,
            h("button", { class: "btn", onclick: () => { const c = codeIn.value.trim().toUpperCase(); if (!c) return codeIn.focus(); if (need()) location.hash = `#/g/${c}`; } }, "Join")),
          savedGames.length ? h("div", { class: "saved" },
            h("div", { class: "label" }, "Your saved games (kept 30 days)"),
            savedGames.map((g) => h("button", { class: "saved-row", onclick: () => { if (need()) location.hash = `#/g/${g.code}`; } },
              h("b", {}, g.code), h("span", {}, `last opened ${ago(g.at)}`), h("span", { class: "go" }, "Continue ›")))) : null)),
      h("div", { class: "logo-wall" }, companies.map((t, k) => { const l = logo(t); l.style.animationDelay = `${(k % 7) * -0.8}s`; l.title = t.name; return l; }))),
    h("div", { class: "features" },
      h("div", { class: "feature" }, h("b", {}, "28 real companies"), h("span", {}, "Fast food, social media, vice, big pharma, cars, big tech, space, defense, surveillance and big oil.")),
      h("div", { class: "feature" }, h("b", {}, "Balanced by simulation"), h("span", {}, "Rents and rules tuned across thousands of simulated games so one lucky set doesn't end it on the spot.")),
      h("div", { class: "feature" }, h("b", {}, "Your house rules"), h("span", {}, "Göteborg style (build only where you land), classic, or balanced. Pick game length and build limits."))),
  ));
}

function renderJoinForm(code) {
  const { name, sw } = profileFields();
  $("#app").replaceChildren(h("div", { class: "shell", style: "max-width:460px" },
    h("div", { class: "brand" }, brandMark(), wordmark()),
    h("div", { class: "panel stack", style: "margin-top:28px" },
      h("h3", {}, `Join game ${code}`),
      h("div", {}, h("label", { class: "label" }, "Name"), name),
      h("div", {}, h("label", { class: "label" }, "Colour"), sw),
      h("button", { class: "btn primary block", onclick: () => { if (!me.name) return name.focus(); app.code = null; enterRoom(code); } }, "Join game"))));
  setTimeout(() => name.focus(), 50);
}

// ---------- lobby ----------
const SETTING_GROUPS = [
  ["Game", [
    { key: "maxRounds", title: "Game length (rounds)", sub: "At the closing bell the highest net worth wins.", opts: [[20, "20"], [30, "30"], [45, "45"], [60, "60"], [0, "No limit"]] },
    { key: "endAfterBankrupt", title: "End after bankruptcies", sub: "Stop the game once this many players are bankrupt.", opts: [[0, "Off"], [1, "1"], [2, "2"]] },
    { key: "startCash", title: "Starting cash", opts: [[1000, "$1B"], [1500, "$1.5B"], [2000, "$2B"]] },
    { key: "goSalary", title: "Payday", sub: "Collected every time you pass.", opts: [[150, "$150M"], [200, "$200M"], [250, "$250M"], [300, "$300M"]] },
    { key: "firstLapNoBuy", title: "No buying on the first lap", sub: "Pass Payday once before you can buy.", opts: [[false, "Off"], [true, "On"]] },
    { key: "dealStart", title: "Deal 2 companies at start", sub: "Everyone gets two random companies and pays for them.", opts: [[false, "Off"], [true, "On"]] },
  ]],
  ["Building", [
    { key: "buildLimit", title: "Upgrades per turn", opts: [[1, "1"], [2, "2"], [3, "3"], [5, "5"], [0, "No limit"]] },
    { key: "buildWhere", title: "Build only where you land", sub: "You must be standing on it this turn.", opts: [["any", "Off"], ["sector", "Same sector"], ["exact", "Exact company"]] },
    { key: "buildNeedsSet", title: "Need the whole sector", sub: "Off: build on any company you own.", opts: [[true, "On"], [false, "Off"]] },
    { key: "evenBuild", title: "Build evenly", opts: [[true, "On"], [false, "Off"]] },
    { key: "hqAfter", title: "HQ after", opts: [[4, "4 factories"], [3, "3 factories"]] },
  ]],
  ["Money & rules", [
    { key: "auctions", title: "Auctions", sub: "Companies nobody buys go to auction.", opts: [[true, "On"], [false, "Off"]] },
    { key: "claimRent", title: "Claim your own rent", sub: "Owners must claim before the next roll, or it's lost.", opts: [[false, "Off"], [true, "On"]] },
    { key: "tickets", title: "Travel tickets", sub: `Cash in a Travel & Freight company + ${money(TICKET_FEE)} to fly anywhere.`, opts: [[false, "Off"], [true, "On"]] },
    { key: "estateAuction", title: "Estate auctions", sub: "Bankrupt companies are auctioned; the creditor gets the cash.", opts: [[false, "Off"], [true, "On"]] },
    { key: "noJailTrade", title: "No trading from the Gulag", opts: [[false, "Off"], [true, "On"]] },
    { key: "mortgageInterest", title: "Mortgage interest", sub: "Redeeming a mortgage costs 10% extra.", opts: [[true, "10%"], [false, "None"]] },
    { key: "jackpot", title: "Tax Haven jackpot", sub: "Taxes and fines pile up for whoever lands there.", opts: [[false, "Off"], [true, "On"]] },
  ]],
];

function seg(opts, value, onPick, disabled) {
  return h("div", { class: "seg" }, opts.map(([v, label]) =>
    h("button", { class: v === value ? "on" : "", disabled: disabled || null, onclick: () => onPick(v) }, label)));
}

function renderLobby() {
  if (!app.room) return;
  const room = app.room;
  const host = isHost();
  // Keep focus/caret if the player is typing their name while the room updates.
  const focused = document.activeElement?.dataset?.keep;
  const caret = document.activeElement?.selectionStart;
  const url = inviteUrl(app.code);
  const qr = h("div", { class: "qr" });
  try { new window.QRCode(qr, { text: url, width: 256, height: 256, correctLevel: window.QRCode.CorrectLevel.M }); } catch {}
  const s = room.settings;
  const pushSettings = (settings, preset) => {
    room.settings = settings;
    room.preset = preset;
    renderLobby();
    roomOp("settings", { settings, preset });
  };
  const setSetting = (key, v) => {
    const next = { ...room.settings, [key]: v };
    const preset = Object.entries(PRESETS).find(([, p]) => Object.keys(p.settings).every((k) => p.settings[k] === next[k]))?.[0] || "custom";
    pushSettings(next, preset);
  };
  const { name, sw } = profileFields(() => {});
  name.dataset.keep = "name";
  name.addEventListener("change", () => roomOp("profile", { name: me.name, color: me.color }));
  sw.addEventListener("click", () => roomOp("profile", { name: me.name, color: me.color }));
  const n = room.players.length;
  const mins = s.maxRounds ? Math.max(15, Math.round((n * s.maxRounds * 22) / 60 / 5) * 5) : 0;
  const est = s.maxRounds ? `About ${mins >= 90 ? `${(mins / 60).toFixed(1)} hours` : `${mins} min`} with ${n} players` : "No round limit: can run 2+ hours";
  const inGame = room.players.some((p) => p.id === app.you);

  $("#app").replaceChildren(h("div", { class: "shell wide" }, lobbyTop(),
    h("div", { class: "lobby" },
      h("div", { class: "stack" },
        h("div", { class: "panel" },
          h("h3", {}, "Invite friends"),
          h("div", { class: "invite" }, qr,
            h("div", { class: "stack", style: "gap:10px;min-width:0" },
              h("div", { class: "code-big" }, app.code),
              h("div", { class: "row", style: "flex-wrap:wrap" },
                h("button", { class: "btn sm", onclick: () => copyInvite() }, icon("copy"), "Copy invite link")),
              h("div", { style: "font-size:12px;color:var(--soft);word-break:break-all" }, url)))),
        h("div", { class: "panel" },
          h("h3", {}, `Players ${n}/${MAX_PLAYERS}`),
          h("div", { class: "plist" }, room.players.map((p) => h("div", { class: "prow" },
            pawn(p), h("div", { class: "name" }, p.name),
            p.id === room.host ? h("span", { class: "tag gold" }, "Host") : null,
            p.id === app.you ? h("span", { class: "tag" }, "You") : null,
            h("span", { class: `dot${app.online[p.id] || p.id === app.you ? "" : " off"}`, "data-online": p.id }),
            host && p.id !== app.you ? h("button", { class: "iconbtn", style: "width:30px;height:30px", title: "Remove", onclick: () => roomOp("kick", { target: p.id }) }, icon("x")) : null))),
          !inGame ? h("p", { style: "color:var(--bad);font-size:13px;margin:12px 0 0" }, "This game is full.") : null,
          n < 2 ? h("p", { style: "color:var(--soft);font-size:13px;margin:12px 0 0" }, "Waiting for at least one more player…") : null),
        h("div", { class: "panel stack" },
          h("h3", {}, "You"),
          h("div", {}, h("label", { class: "label" }, "Name"), name),
          h("div", {}, h("label", { class: "label" }, "Colour"), sw)),
        h("div", { class: "panel stack" },
          h("div", { style: "font-size:13px;color:var(--soft);text-align:center" }, est),
          host
            ? h("button", { class: "btn primary block", disabled: n < 2 || null, onclick: () => roomOp("start") }, "Start game")
            : h("div", { class: "btn ghost block", style: "cursor:default" }, "Waiting for the host to start…"))),
      h("div", { class: "panel" },
        h("h3", {}, host ? "Rules" : "Rules (set by the host)"),
        h("div", { class: "presets" },
          Object.entries(PRESETS).map(([k, p]) => h("button", {
            class: `preset${room.preset === k ? " on" : ""}`, disabled: !host || null,
            onclick: () => pushSettings({ ...p.settings }, k),
          }, h("b", {}, p.label), h("span", {}, p.desc)))),
        room.preset === "custom" ? h("div", { class: "tag", style: "display:inline-block;margin:10px 0 0" }, "Custom rules") : null,
        SETTING_GROUPS.map(([title, rows]) => h("div", { class: "sgroup" },
          h("div", { class: "sgroup-h" }, title),
          rows.map((r) => h("div", { class: "setting" },
            h("div", {}, h("div", { class: "s-title" }, r.title), r.sub ? h("div", { class: "s-sub" }, r.sub) : null),
            seg(r.opts, s[r.key], (v) => setSetting(r.key, v), !host)))))))));
  if (focused) {
    const el = document.querySelector(`[data-keep="${focused}"]`);
    if (el) { el.focus(); try { el.setSelectionRange(caret, caret); } catch {} }
  }
}

function lobbyTop() {
  return h("div", { class: "brand" }, brandMark(), wordmark(), h("div", { style: "flex:1" }),
    app.code ? h("span", { class: "pill conn-pill" }, connText()) : null,
    h("button", { class: "btn ghost sm", onclick: openRules }, icon("book"), "Rules"),
    h("button", { class: "btn ghost sm", onclick: () => { if (app.room && !app.room.started) api("leave"); location.hash = ""; } }, icon("logout"), "Leave"));
}
function connText() {
  if (app.conn !== "connected") return "Reconnecting…";
  const online = Object.values(app.online || {}).filter(Boolean).length;
  return `Live · ${online} online`;
}
function renderConn() { document.querySelectorAll(".conn-pill").forEach((el) => { el.textContent = connText(); }); }
function copyInvite() {
  const url = inviteUrl(app.code);
  navigator.clipboard?.writeText(url).then(() => toast("Invite link copied")).catch(() => toast(url));
}

// ---------- game screen ----------
function gridPos(i) {
  if (i <= 10) return [11, 11 - i];
  if (i <= 20) return [11 - (i - 10), 1];
  if (i <= 30) return [1, 1 + (i - 20)];
  return [1 + (i - 30), 11];
}
function sideOf(i) {
  if (i % 10 === 0) return "n";
  if (i < 10) return "b";
  if (i < 20) return "l";
  if (i < 30) return "t";
  return "r";
}
const CORNER_CLASS = { 0: "corner-br", 10: "corner-bl", 20: "corner-tl", 30: "corner-tr" };
const SPECIAL = {
  go: ["arrowLeft", "Payday", "Collect $200M"],
  gulag: ["bars", "Gulag", ""],
  haven: ["dice", "Casino", "Feeling lucky?"],
  toGulag: ["siren", "Go to Gulag", ""],
  news: ["news", "Breaking News"],
  deal: ["briefcase", "Shady Deal"],
};

function tileEl(t) {
  const side = sideOf(t.i);
  const [r, c] = gridPos(t.i);
  const sc = t.sector ? SECTORS[t.sector].color : "";
  const el = h("div", {
    class: `tile side-${side} k-${t.kind} ${CORNER_CLASS[t.i] || ""} ${side === "n" ? "corner" : ""}`,
    style: `grid-area:${r}/${c};${sc ? `--sc:${sc}` : ""}`,
    onclick: () => (app.pick ? pickDestination(t.i) : openTile(t.i)),
  });
  if (t.sector) el.append(h("div", { class: "band" }));
  const body = h("div", { class: "t-body" });
  if (t.logo) {
    body.append(logo(t), h("div", { class: "t-text" }, h("div", { class: "t-name" }, SHORT[t.name] || t.name), h("div", { class: "t-price" }, money(t.price))));
  } else if (t.kind === "gulag") {
    el.append(h("div", { class: "cell" }, h("span", {}, "GULAG")), h("div", { class: "visit" }, "Just visiting"));
  } else if (t.kind === "tax") {
    body.append(h("div", { class: "t-ico" }, icon("receipt")), h("div", { class: "t-label" }, t.name), h("div", { class: "t-price" }, money(t.amount)));
  } else {
    const [ic, label, sub] = SPECIAL[t.kind];
    body.append(...[h("div", { class: "t-ico" }, icon(ic)), h("div", { class: "t-label" }, label), sub ? h("div", { class: "t-sub" }, sub) : null].filter(Boolean));
  }
  if (t.kind !== "gulag") el.append(body);
  return el;
}

function renderGame() {
  const st = app.view;
  if (!st) return renderLobby();
  const board = h("div", { class: "board" });
  const tiles = TILES.map((t) => { const el = tileEl(t); board.append(el); return el; });
  const dice = h("div", { class: "dice" }, [0, 1].map(() => h("div", { class: "die" }, Array.from({ length: 9 }, () => h("i")))));
  const dyn = h("div", { style: "display:flex;flex-direction:column;align-items:center;gap:inherit;width:100%" });
  const trends = h("div", { class: "c-trends" });
  const center = h("div", { class: "center" }, h("div", { class: "c-mark" }, "COMPAN", h("b", {}, "O"), "LY"), dice, dyn, trends);
  board.append(center);
  const owners = h("div", { class: "owners" });
  board.append(owners);
  const tokLayer = h("div", { class: "tokens" });
  const tokens = {};
  for (const p of Object.values(st.players)) {
    tokens[p.id] = h("div", { class: "token" }, pawn(p));
    tokLayer.append(tokens[p.id]);
  }
  board.append(tokLayer);
  const players = h("div", { class: "players" });
  const port = h("div", { class: "port" });
  const trades = h("div", {});
  const market = h("div", {});
  const log = h("div", { class: "log" });
  const round = h("span", { class: "pill" });
  app.els = { board, tiles, dice, dyn, trends, center, tokens, players, port, trades, market, log, round, owners };

  $("#app").replaceChildren(
    h("div", { class: "topbar" }, brandMark(), wordmark(), h("div", { class: "spacer" }),
      round, h("span", { class: "pill conn-pill" }, connText()),
      soundButton(),
      h("button", { class: "iconbtn", title: "Invite", onclick: openInvite }, icon("share")),
      h("button", { class: "iconbtn", title: "Rules", onclick: openRules }, icon("book")),
      h("button", { class: "iconbtn host-only", title: "Host controls", onclick: openHostMenu, style: isHost() ? "" : "display:none" }, icon("bell")),
      h("button", { class: "iconbtn", title: "Leave", onclick: () => { if (confirm("Leave the game? You can rejoin from the home screen.")) location.hash = ""; } }, icon("logout"))),
    h("div", { class: "game" },
      h("div", { class: "board-wrap" }, board),
      h("div", { class: "side" },
        h("div", { class: "card" }, h("div", { class: "card-h" }, h("h4", {}, "Players")), players),
        h("div", { class: "card" }, h("div", { class: "card-h" }, h("h4", {}, "Your portfolio"),
          h("button", { class: "btn xs", onclick: () => openTrade() }, icon("swap"), "Trade")), port),
        trades,
        h("div", { class: "card" }, h("div", { class: "card-h" }, h("h4", {}, "Market")), market),
        h("div", { class: "card" }, h("div", { class: "card-h" }, h("h4", {}, "Ticker")), log))));
  resetDisplay();
  preloadDice();
  const last = st.dice || [5, 2];
  [...dice.children].forEach((d, k) => setDie(d, last[k]));
  dice.classList.toggle("dbl", !!st.dice && st.dice[0] === st.dice[1]);
  updateGame();
  requestAnimationFrame(() => layoutTokens());
  afterUpdate();
}

let resizeRaf = 0;
window.addEventListener("resize", () => { cancelAnimationFrame(resizeRaf); resizeRaf = requestAnimationFrame(() => { layoutTokens(); layoutOwners(); }); });

// Coloured flags on the outer edge of every owned company, so ownership reads at a glance.
function layoutOwners() {
  const els = app.els, st = app.view;
  if (!els?.owners || !st) return;
  const T = Math.max(7, Math.round(els.board.offsetWidth * 0.011));
  const flags = [];
  for (const t of TILES) {
    const p = st.props[t.i];
    if (!p?.owner) continue;
    const owner = st.players[p.owner];
    const el = els.tiles[t.i];
    const side = sideOf(t.i);
    const x = el.offsetLeft, y = el.offsetTop, w = el.offsetWidth, hh = el.offsetHeight;
    const g = 3;
    const box = side === "b" ? [x, y + hh + g, w, T] : side === "t" ? [x, y - g - T, w, T]
      : side === "l" ? [x - g - T, y, T, hh] : [x + w + g, y, T, hh];
    flags.push(h("div", {
      class: `oflag${p.mort ? " mort" : ""}`,
      title: `${t.name}: ${owner.name}${p.mort ? " (mortgaged)" : ""}`,
      style: `left:${box[0]}px;top:${box[1]}px;width:${box[2]}px;height:${box[3]}px;--own:${owner.color}`,
    }));
  }
  els.owners.replaceChildren(...flags);
}

function layoutTokens() {
  const els = app.els;
  const st = app.view;
  if (!els || !st) return;
  const groups = {};
  for (const p of Object.values(st.players)) {
    if (p.bankrupt) { els.tokens[p.id].style.display = "none"; continue; }
    const pos = app.tokenPos[p.id] ?? p.pos;
    const key = pos === 10 && p.inGulag && pos === p.pos ? "jail" : String(pos);
    (groups[key] ||= []).push(p.id);
  }
  const cur = G.currentId(st);
  for (const [key, ids] of Object.entries(groups)) {
    const i = key === "jail" ? 10 : Number(key);
    const el = els.tiles[i];
    let cx = el.offsetLeft + el.offsetWidth / 2;
    let cy = el.offsetTop + el.offsetHeight / 2;
    const w = el.offsetWidth, hgt = el.offsetHeight;
    if (i === 10) { if (key === "jail") { cx += w * 0.19; cy -= hgt * 0.19; } else { cx -= w * 0.22; cy += hgt * 0.22; } }
    const r = Math.min(w, hgt) * (ids.length > 1 ? 0.2 : 0);
    ids.forEach((id, k) => {
      const a = (k / ids.length) * Math.PI * 2 - Math.PI / 2;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      const tok = els.tokens[id];
      tok.style.display = "";
      tok.style.transform = `translate(${x}px, ${y}px)`;
      tok.classList.toggle("active", id === cur && st.phase !== "over");
      tok.classList.toggle("jailed", key === "jail");
    });
  }
}

function updateGame() {
  if (!app.els || !app.view) return;
  requestAnimationFrame(layoutOwners);
  document.querySelectorAll(".host-only").forEach((el) => { el.style.display = isHost() ? "" : "none"; });
  app.els.board.classList.toggle("picking", !!app.pick);
  updateTiles();
  layoutTokens();
  renderCenter();
  renderPlayers();
  renderPortfolio();
  renderTrades();
  renderMarket();
  renderLog();
  const st = app.view;
  app.els.round.replaceChildren("Round ", h("b", {}, String(Math.min(st.round, st.settings.maxRounds || st.round))), st.settings.maxRounds ? ` / ${st.settings.maxRounds}` : "");
  refreshModal();
}

function updateTiles() {
  const st = app.view;
  for (const t of TILES) {
    const p = st.props[t.i];
    if (!p) continue;
    const el = app.els.tiles[t.i];
    const owner = p.owner ? st.players[p.owner] : null;
    el.classList.toggle("owned", !!owner);
    el.classList.toggle("mort", !!p.mort);
    if (owner) el.style.setProperty("--own", owner.color); else el.style.removeProperty("--own");
    const price = el.querySelector(".t-price");
    if (price) price.textContent = owner && !p.mort ? money(G.rentFor(st, t.i)) : money(t.price);
    const band = el.querySelector(".band");
    if (band && t.kind === "prop") {
      const key = String(p.level);
      if (band.dataset.lv !== key) {
        band.dataset.lv = key;
        band.replaceChildren(...(p.level === 5 ? [h("span", { class: "hq" }, "HQ")] : Array.from({ length: p.level }, () => h("i", { class: "pip" }))));
      }
    }
  }
}

// ---------- center panel ----------
function renderCenter() {
  const els = app.els, st = app.view;
  if (!els || !st) return;
  clearInterval(app.tick);
  const cur = G.currentId(st);
  const curP = st.players[cur];
  const mine = cur === myId();
  const meP = st.players[myId()];
  const iAmIn = meP && !meP.bankrupt;
  const kids = [];
  const status = (who, what) => h("div", { class: "status" }, h("div", { class: "who" }, who), what ? h("div", { class: "what" }, what) : null);
  const whoEl = (p, text) => [pawn(p), text];

  if (st.phase === "over") {
    const w = st.players[st.winner];
    kids.push(icon("crown", "crown"), status(w ? whoEl(w, `${w.name} wins`) : "Game over", `Net worth ${money(st.standings?.[0]?.worth || 0)}`),
      h("div", { class: "actions" }, h("button", { class: "btn primary", onclick: openResults }, "See results"),
        isHost() ? h("button", { class: "btn", onclick: () => roomOp("lobby") }, "New game") : null));
  } else if (st.debts.length) {
    const d = st.debts[0];
    const debtor = st.players[d.debtor];
    const cred = d.creditor === "bank" ? "the bank" : d.creditor === "pot" ? "Tax Haven" : st.players[d.creditor]?.name;
    if (d.debtor === myId()) {
      const short = d.amount - meP.cash;
      kids.push(status(`You owe ${money(d.amount)}`, `${d.why} → ${cred}. You have ${money(meP.cash)}${short > 0 ? `; raise ${money(short)} by mortgaging or selling upgrades in your portfolio` : ""}.`),
        h("div", { class: "actions" },
          h("button", { class: "btn primary", disabled: meP.cash < d.amount || null, onclick: () => send({ type: "payDebt" }) }, `Pay ${money(d.amount)}`),
          h("button", { class: "btn danger", onclick: () => confirmBox("Declare bankruptcy?", `All your assets go to ${cred}. You're out of the game.`, "Declare bankruptcy", () => send({ type: "bankrupt" })) }, "Go bankrupt")),
        h("div", { style: "font-size:12px;color:var(--soft)" }, `Max you can raise: ${money(G.liquidity(st, myId()))}`));
    } else {
      kids.push(status(whoEl(debtor, `${debtor.name} is raising cash`), `Owes ${money(d.amount)} to ${cred} (${d.why})`));
    }
  } else if (st.auction) {
    const a = st.auction;
    const t = TILES[a.tile];
    const top = a.bidder ? st.players[a.bidder] : null;
    const canBid = iAmIn && !a.out.includes(myId()) && a.bidder !== myId();
    const bar = h("i");
    const secs = h("span", {});
    kids.push(offerEl(t, `Auction · list price ${money(t.price)}`),
      h("div", { class: "status" },
        h("div", { class: "bidline" }, a.bidder ? money(a.high) : "No bids yet"),
        h("div", { class: "what" }, top ? ["Top bid: ", h("b", { style: `color:${top.color}` }, top.id === myId() ? "you" : top.name), " · "] : "", secs),
        h("div", { class: "auction-bar" }, bar)),
      canBid ? h("div", { class: "actions" },
        [10, 50, 100].map((inc) => {
          const amt = Math.max(a.high + inc, inc);
          return h("button", { class: "btn sm", disabled: amt > meP.cash || null, onclick: () => send({ type: "bid", amount: amt }) }, `${money(amt)}`);
        }),
        h("button", { class: "btn sm ghost", onclick: () => send({ type: "auctionPass" }) }, "Drop out"))
        : h("div", { style: "font-size:13px;color:var(--soft)" }, a.bidder === myId() ? "You're winning — hold tight." : iAmIn ? "You dropped out." : ""));
    const tickFn = () => {
      const left = Math.max(0, a.endsAt - (Date.now() + app.skew));
      bar.style.width = `${Math.min(100, (left / 12000) * 100)}%`;
      secs.textContent = `${Math.ceil(left / 1000)}s left`;
    };
    tickFn();
    app.tick = setInterval(tickFn, 100);
  } else if (st.phase === "buy") {
    const t = TILES[st.pendingTile];
    kids.push(offerEl(t, `For sale · ${money(t.price)}`));
    if (mine) {
      kids.push(h("div", { class: "actions" },
        h("button", { class: "btn primary", disabled: meP.cash < t.price || null, onclick: () => send({ type: "buy" }) }, `Buy ${money(t.price)}`),
        h("button", { class: "btn", onclick: () => send({ type: "decline" }) }, st.settings.auctions ? "Auction it" : "Pass")));
      if (meP.cash < t.price) kids.push(h("div", { style: "font-size:12px;color:var(--soft)" }, "Not enough cash — mortgage something to buy it, or send it to auction."));
    } else kids.push(status(whoEl(curP, `${curP.name} is deciding`), null));
  } else if (st.phase === "roll") {
    if (mine) {
      if (meP.inGulag) {
        kids.push(status("You're in the Gulag", `Attempt ${meP.gulagTries + 1} of 3 — roll doubles to escape, or bribe the guards.`),
          h("div", { class: "actions" },
            h("button", { class: "btn primary", onclick: () => send({ type: "roll" }) }, "Roll for doubles"),
            h("button", { class: "btn", disabled: meP.cash < BAIL || null, onclick: () => send({ type: "payBail" }) }, `Bribe ${money(BAIL)}`),
            meP.gulagCards.length ? h("button", { class: "btn", onclick: () => send({ type: "useCard" }) }, "Use card") : null));
      } else if (app.pick) {
        kids.push(status("Where to?", `Click any square on the board to fly there with your ${TILES[app.pick.tile].name} ticket.`),
          h("div", { class: "actions" }, h("button", { class: "btn ghost", onclick: () => { app.pick = null; updateGame(); } }, "Cancel")));
      } else {
        const tickets = st.settings.tickets && !st.extraRoll ? G.ownedBy(st, myId()).filter((i) => TILES[i].kind === "transport") : [];
        kids.push(status(st.extraRoll ? "Doubles! Roll again" : "Your turn", null),
          h("div", { class: "actions" }, h("button", { class: "btn primary", onclick: () => send({ type: "roll" }) }, "Roll dice"),
            tickets.length ? h("button", { class: "btn", disabled: meP.cash < TICKET_FEE || null, title: `Give ${TILES[tickets[0]].name} back to the bank, pay ${money(TICKET_FEE)} and fly anywhere`,
              onclick: () => { app.pick = { tile: tickets[0] }; updateGame(); } }, `Fly (${money(TICKET_FEE)})`) : null));
      }
    } else kids.push(status(whoEl(curP, `${curP.name}'s turn`), curP.inGulag ? "Stuck in the Gulag" : app.online[cur] === false ? "Offline…" : "Rolling…"));
  } else if (st.phase === "casino") {
    if (mine) {
      kids.push(h("div", { class: "casino" },
        h("div", { class: "casino-h" }, icon("dice"), "Casino"),
        h("div", { class: "casino-game" },
          h("div", { class: "cg-t" }, `Higher or lower · bet ${money(CASINO_HILO)}, win ${money(CASINO_HILO)}`),
          h("div", { class: "row" },
            h("button", { class: "btn", disabled: meP.cash < CASINO_HILO || null, onclick: () => send({ type: "gamble", game: "hilo", pick: "low" }) }, "Low (1-3)"),
            h("button", { class: "btn", disabled: meP.cash < CASINO_HILO || null, onclick: () => send({ type: "gamble", game: "hilo", pick: "high" }) }, "High (4-6)"))),
        h("div", { class: "casino-game" },
          h("div", { class: "cg-t" }, `Pick a number · bet ${money(CASINO_PICK)}, hit pays ${money(CASINO_PICK * 6)}`),
          h("div", { class: "nums" }, [1, 2, 3, 4, 5, 6].map((n) => h("button", { class: "btn num", disabled: meP.cash < CASINO_PICK || null, onclick: () => send({ type: "gamble", game: "number", pick: n }) }, String(n))))),
        h("button", { class: "btn ghost sm", onclick: () => send({ type: "leaveCasino" }) }, "Walk away")));
    } else kids.push(status(whoEl(curP, `${curP.name} is at the Casino`), "Placing a bet…"));
  } else if (st.phase === "end") {
    if (mine) {
      const s = st.settings;
      const hint = s.buildWhere === "exact" ? "You can build on companies you landed on this turn."
        : s.buildWhere === "sector" ? "You can build in sectors you landed in this turn."
        : "Build, mortgage or trade before you end your turn.";
      kids.push(status("Your move", hint), h("div", { class: "actions" }, h("button", { class: "btn primary", onclick: () => send({ type: "endTurn" }) }, "End turn")));
    } else kids.push(status(whoEl(curP, `${curP.name}'s turn`), app.online[cur] === false ? "Offline…" : "Making moves…"));
  }

  const myClaims = (st.claims || []).filter((c) => c.to === myId());
  if (myClaims.length && st.phase !== "over") {
    kids.unshift(h("div", { class: "claims" }, myClaims.map((c) => h("button", { class: "btn claim", onclick: () => send({ type: "claimRent", id: c.id }) },
      `Claim ${money(c.amount)} from ${st.players[c.from].name}`))));
  }
  if (st.card && st.card.pid === cur && st.phase !== "over" && !st.auction) {
    const key = `${st.card.deck}:${st.card.id}:${st.card.n}`;
    const fresh = app.cardKey !== key && !app.cardKey?.startsWith(`${st.card.deck}:${st.card.id}:`);
    app.cardKey = key;
    kids.push(cardEl(st.card.deck, st.card.id, fresh));
  } else if (!st.card) app.cardKey = null;

  if (isHost() && app.online[cur] === false && cur !== myId() && st.phase !== "over") {
    kids.push(h("button", { class: "btn xs danger", onclick: () => confirmBox(`Remove ${curP.name}?`, "Their companies go back on the market and the game continues.", "Remove", () => send({ type: "forfeit", pid: cur })) }, `Remove ${curP.name} (offline)`));
  }
  els.dyn.replaceChildren(...kids);
  els.trends.replaceChildren(...st.trends.map((t) => {
    const name = t.sector === "all" ? "All sectors" : SECTORS[t.sector].name;
    return h("span", { class: `trend ${t.mult >= 1 ? "up" : "down"}`, style: `--sc:${t.sector === "all" ? "#fff" : SECTORS[t.sector].color}` },
      h("i"), `${name} ${t.mult >= 1 ? "+" : "−"}${Math.round(Math.abs(t.mult - 1) * 100)}% · ${t.rounds}r`);
  }));
}

function offerEl(t, sub) {
  const sc = t.sector ? SECTORS[t.sector].color : "#888";
  return h("div", { class: "offer", style: `--sc:${sc}`, onclick: () => openTile(t.i) },
    h("div", { class: "o-band" }), logo(t),
    h("div", { style: "min-width:0" }, h("div", { class: "o-name" }, t.name), h("div", { class: "o-sub" }, sub),
      h("div", { class: "o-sub" }, t.kind === "prop" ? `${SECTORS[t.sector].name} · rent ${money(t.rent[0])}` : t.kind === "transport" ? "Travel & Freight · rent $25M–$200M" : "Big Oil · rent 4× or 10× dice")));
}

// ---------- sidebar ----------
function renderPlayers() {
  const els = app.els, st = app.view;
  if (!els || !st) return;
  const cur = G.currentId(st);
  const iAmIn = st.players[myId()] && !st.players[myId()].bankrupt;
  els.players.replaceChildren(...st.order.map((id) => {
    const p = st.players[id];
    const owned = G.ownedBy(st, id);
    const offline = id !== myId() && app.online[id] === false;
    return h("div", { class: `player${id === cur && st.phase !== "over" ? " turn" : ""}${p.bankrupt ? " out" : ""}`, "data-pid": id },
      pawn(p),
      h("div", { style: "min-width:0" },
        h("div", { class: "pn" }, h("span", { class: "n" }, p.name),
          id === myId() ? h("span", { class: "tag" }, "You") : null,
          p.bankrupt ? h("span", { class: "tag red" }, "Bankrupt") : null,
          p.inGulag ? h("span", { class: "tag red" }, "Gulag") : null,
          p.gulagCards.length ? h("span", { class: "tag green", title: "Get out of Gulag free" }, `${p.gulagCards.length} pass`) : null,
          offline && !p.bankrupt ? h("span", { class: "tag" }, "Offline") : null),
        h("div", { class: "minis" }, owned.sort((a, b) => a - b).map((i) => h("i", { class: st.props[i].mort ? "m" : "", style: `--sc:${SECTORS[TILES[i].sector].color}`, title: TILES[i].name }))),
        !p.bankrupt && id !== myId() && iAmIn && st.phase !== "over" ? h("div", { style: "margin-top:6px;display:flex;gap:6px" },
          h("button", { class: "btn xs ghost", onclick: () => openTrade(id) }, "Trade"),
          isHost() && offline ? h("button", { class: "btn xs danger", onclick: () => confirmBox(`Remove ${p.name}?`, "Their companies go back on the market.", "Remove", () => send({ type: "forfeit", pid: id })) }, "Remove") : null) : null),
      h("div", {}, h("div", { class: "cash" }, p.bankrupt ? "—" : money(app.dispCash[id] ?? p.cash)),
        h("div", { class: "worth" }, p.bankrupt ? "" : `Net ${money(G.netWorth(st, id))}`)));
  }));
}

function assetButtons(st, i) {
  const p = st.props[i];
  const t = TILES[i];
  const out = [];
  if (t.kind === "prop") {
    const buildable = !st.settings.buildNeedsSet || G.hasSet(st, myId(), t.sector);
    if (buildable && p.level < 5) {
      const why = G.canBuild(st, myId(), i) || (G.currentId(st) !== myId() ? "Build on your own turn" : null);
      out.push(h("button", { class: "btn xs", disabled: why || null, title: why || `Build for ${money(G.buildCost(i))}`, onclick: () => send({ type: "build", tile: i }) }, `+ ${money(G.buildCost(i))}`));
    }
    if (p.level > 0) {
      const why = G.canSell(st, myId(), i);
      out.push(h("button", { class: "btn xs ghost", disabled: why || null, title: why || `Sell for ${money(Math.floor(G.buildCost(i) / 2))}`, onclick: () => send({ type: "sell", tile: i }) }, "Sell"));
    }
  }
  if (p.mort) out.push(h("button", { class: "btn xs ghost", disabled: st.players[myId()].cash < G.unmortgageCost(st, i) || null, title: `Pay ${money(G.unmortgageCost(st, i))}`, onclick: () => send({ type: "unmortgage", tile: i }) }, "Redeem"));
  else if (p.level === 0) {
    const why = G.canMortgage(st, myId(), i);
    out.push(h("button", { class: "btn xs ghost", disabled: why || null, title: why || `Get ${money(G.mortgageValue(i))}`, onclick: () => send({ type: "mortgage", tile: i }) }, "Mortgage"));
  }
  return out;
}

function levelPips(level) {
  if (level === 5) return h("span", { class: "lvl" }, h("b", {}, "HQ"));
  return h("span", { class: "lvl" }, [1, 2, 3, 4].map((k) => h("i", { class: k <= level ? "on" : "" })));
}

function renderPortfolio() {
  const els = app.els, st = app.view;
  if (!els || !st) return;
  const meP = st.players[myId()];
  if (!meP) { els.port.replaceChildren(h("div", { class: "empty" }, "You're watching this game.")); return; }
  const owned = G.ownedBy(st, myId()).sort((a, b) => a - b);
  if (!owned.length) { els.port.replaceChildren(h("div", { class: "empty" }, meP.bankrupt ? "Bankrupt. Better luck next IPO." : "No companies yet. Land on one to buy it.")); return; }
  const bySector = {};
  for (const i of owned) (bySector[TILES[i].sector] ||= []).push(i);
  els.port.replaceChildren(...Object.entries(bySector).map(([sec, list]) => {
    const total = G.sectorTiles(sec).length;
    return h("div", { class: "group", style: `--sc:${SECTORS[sec].color}` },
      h("div", { class: "group-h" }, h("i"), SECTORS[sec].name, h("span", { class: "full" }, list.length === total ? "Full sector" : `${list.length}/${total}`)),
      list.map((i) => {
        const p = st.props[i];
        return h("div", { class: "asset" }, logo(TILES[i]),
          h("div", { style: "min-width:0" },
            h("div", { class: "an", onclick: () => openTile(i) }, TILES[i].name),
            h("div", { class: "as" }, p.mort ? h("span", { class: "tag red" }, "Mortgaged") : `Rent ${money(G.rentFor(st, i))}`, TILES[i].kind === "prop" ? levelPips(p.level) : null)),
          h("div", { class: "ab" }, assetButtons(st, i)));
      }));
  }));
}

// "You get" / "You give" from the viewer's point of view.
function tradeBlock(st, t) {
  const me = myId();
  const involved = t.from === me || t.to === me;
  const fromP = st.players[t.from], toP = st.players[t.to];
  const getsTitle = (p) => (p.id === me ? "You get" : `${p.name} gets`);
  return h("div", { class: "tsplit" },
    h("div", { class: `tside ${involved ? (t.to === me ? "plus" : "minus") : ""}` },
      h("div", { class: "tside-h" }, pawn(toP), getsTitle(toP)), sideDesc(st, t.give)),
    h("div", { class: "tarrow" }, icon("swap")),
    h("div", { class: `tside ${involved ? (t.from === me ? "plus" : "minus") : ""}` },
      h("div", { class: "tside-h" }, pawn(fromP), getsTitle(fromP)), sideDesc(st, t.get)));
}

function sideDesc(st, side) {
  const parts = [];
  if (side.cash) parts.push(h("span", { class: "chip on", style: "padding-left:9px" }, money(side.cash)));
  for (const i of side.tiles) parts.push(h("span", { class: "chip", style: `--sc:${TILES[i].sector ? SECTORS[TILES[i].sector].color : "#888"}` }, logo(TILES[i]), TILES[i].name));
  if (side.cards) parts.push(h("span", { class: "chip", style: "padding-left:9px" }, `${side.cards} Gulag pass`));
  return parts.length ? h("div", { class: "chips", style: "margin:0" }, parts) : h("span", { class: "tl" }, "nothing");
}

function renderTrades() {
  const els = app.els, st = app.view;
  if (!els || !st) return;
  const mineT = st.trades.filter((t) => t.to === myId() || t.from === myId());
  if (!mineT.length) { els.trades.replaceChildren(); return; }
  els.trades.replaceChildren(h("div", { class: "card" }, h("div", { class: "card-h" }, h("h4", {}, "Trade offers")),
    mineT.map((t) => {
      const incoming = t.to === myId();
      const other = st.players[incoming ? t.from : t.to];
      return h("div", { class: "trade-item" },
        h("div", { class: "row" }, pawn(other), h("b", {}, incoming ? `Offer from ${other.name}` : `Your offer to ${other.name}`)),
        tradeBlock(st, t),
        h("div", { class: "row" }, incoming
          ? [h("button", { class: "btn xs good", onclick: () => send({ type: "acceptTrade", id: t.id }) }, "Accept"),
            h("button", { class: "btn xs", onclick: () => openTrade(t.from, { give: t.get, get: t.give, replaces: t.id }) }, "Counter"),
            h("button", { class: "btn xs ghost", onclick: () => send({ type: "cancelTrade", id: t.id }) }, "Decline")]
          : h("button", { class: "btn xs ghost", onclick: () => send({ type: "cancelTrade", id: t.id }) }, "Withdraw")));
    })));
}

function renderMarket() {
  const els = app.els, st = app.view;
  if (!els || !st) return;
  const s = st.settings;
  const rules = [
    s.maxRounds ? `${s.maxRounds} rounds` : "Last one standing",
    s.buildNeedsSet ? "Full sector to build" : "Build on any company",
    s.buildWhere === "exact" ? "Build where you land" : s.buildWhere === "sector" ? "Build in sector you land" : null,
    s.buildLimit ? `${s.buildLimit} upgrade${s.buildLimit > 1 ? "s" : ""}/turn` : "Unlimited building",
    s.auctions ? "Auctions" : null,
  ].filter(Boolean);
  els.market.replaceChildren(
    h("div", { class: "market-stats" },
      h("span", { class: "tag" }, `Factories ${st.supply.factories}/32`),
      h("span", { class: "tag" }, `HQs ${st.supply.hq}/12`),
      s.jackpot ? h("span", { class: "tag gold" }, `Jackpot ${money(st.pot)}`) : null,
      ...st.trends.map((t) => h("span", { class: `tag ${t.mult >= 1 ? "green" : "red"}` }, `${t.sector === "all" ? "All" : SECTORS[t.sector].name} ×${t.mult} (${t.rounds}r)`))),
    h("div", { class: "market-stats", style: "padding-top:0" }, rules.map((r) => h("span", { class: "tag" }, r))));
}

function renderLog() {
  const els = app.els, st = app.view;
  if (!els || !st) return;
  const atBottom = els.log.scrollHeight - els.log.scrollTop - els.log.clientHeight < 30;
  els.log.replaceChildren(...st.log.slice(-40).map((l) => h("div", {}, l.text)));
  if (atBottom || !els.log.dataset.init) { els.log.scrollTop = els.log.scrollHeight; els.log.dataset.init = "1"; }
}

function afterUpdate() {
  const st = app.view;
  if (!st) return;
  // Your-turn nudge.
  const cur = G.currentId(st);
  const key = `${st.round}:${st.turn}`;
  if (cur === myId() && st.phase === "roll" && app.turnKey !== key && st.players[myId()] && !st.debts.length) {
    if (app.turnKey) { toast("Your turn!", "turn"); sfx.chime(); try { navigator.vibrate?.(60); } catch {} }
    app.turnKey = key;
  }
  document.title = st.phase !== "over" && cur === myId() ? "Your turn · Companoly" : "Companoly";
  // New incoming trade offers pop up.
  for (const t of st.trades) {
    if (t.to === myId() && !app.seenTrades.has(t.id)) {
      app.seenTrades.add(t.id);
      if (!app.modal) openIncoming(t.id); else toast(`New trade offer from ${st.players[t.from].name}`);
    }
  }
  if (st.phase === "over" && !app.overShown) { app.overShown = true; setTimeout(openResults, 600); }
}

// ---------- modals ----------
function closeModal() { $("#modal-root") && $("#modal-root").replaceChildren(); app.modal = null; }
function modal(title, body, { wide = false, kind = null, args = null, top = null } = {}) {
  const still = !!kind && app.modal?.kind === kind && app.modal?.args === args && !!$(".modal");
  const bg = h("div", { class: `modal-bg${still ? " still" : ""}`, onclick: (e) => { if (e.target === bg) closeModal(); } },
    h("div", { class: `modal${wide ? " wide" : ""}` }, top,
      h("div", { class: "modal-h" }, h("h2", {}, title), h("button", { class: "iconbtn", onclick: closeModal, "aria-label": "Close" }, icon("x"))),
      h("div", { class: "modal-b" }, body)));
  $("#modal-root").replaceChildren(bg);
  app.modal = { kind, args };
}
function refreshModal() {
  if (!app.modal) return;
  if (app.modal.kind === "tile") openTile(app.modal.args, true);
  else if (app.modal.kind === "incoming") {
    if (!app.view.trades.some((t) => t.id === app.modal.args)) closeModal();
  }
}
function confirmBox(title, text, okLabel, onOk) {
  modal(title, h("div", { class: "stack" }, h("p", { style: "margin:0;color:var(--soft)" }, text),
    h("div", { class: "row" }, h("button", { class: "btn danger", onclick: () => { closeModal(); onOk(); } }, okLabel), h("button", { class: "btn ghost", onclick: closeModal }, "Cancel"))));
}

function openTile(i, refresh = false) {
  const t = TILES[i];
  const st = app.view;
  if (refresh && $(".modal")) { /* rebuild in place */ }
  const p = st?.props[i];
  const sc = t.sector ? SECTORS[t.sector].color : "#5d6a7d";
  const owner = p?.owner ? st.players[p.owner] : null;
  const body = [];
  if (t.logo) {
    body.push(h("div", { class: "deed-head", style: `--sc:${sc}` }, logo(t),
      h("div", {}, h("div", { class: "sec" }, SECTORS[t.sector].name), h("h2", {}, t.name))));
    body.push(h("p", { class: "blurb" }, t.blurb));
    const rows = [];
    const curLevel = p ? p.level : -1;
    if (t.kind === "prop") {
      const setOwned = owner && G.hasSet(st, owner.id, t.sector);
      rows.push(["Rent", t.rent[0], curLevel === 0 && !setOwned]);
      rows.push(["With the full sector", t.rent[0] * 2, curLevel === 0 && setOwned]);
      for (let k = 1; k <= 4; k++) rows.push([`With ${k} factor${k > 1 ? "ies" : "y"}`, t.rent[k], curLevel === k]);
      rows.push(["Megacorp HQ", t.rent[5], curLevel === 5]);
    } else if (t.kind === "transport") {
      const n = owner ? G.sectorTiles("transport").filter((j) => st.props[j].owner === owner.id).length : 0;
      for (let k = 1; k <= 4; k++) rows.push([`If ${k} Travel & Freight owned`, TRANSPORT_RENT[k], n === k]);
    } else {
      const n = owner ? G.sectorTiles("oil").filter((j) => st.props[j].owner === owner.id).length : 0;
      rows.push(["If 1 Big Oil owned", `${OIL_MULT[1]}× dice`, n === 1], ["If both owned", `${OIL_MULT[2]}× dice`, n === 2]);
    }
    body.push(h("table", { class: "rents" }, rows.map(([label, v, now]) => h("tr", { class: now ? "now" : "" }, h("td", {}, label), h("td", {}, typeof v === "number" ? money(v) : v)))));
    const mult = st ? G.trendMult(st, t.sector) : 1;
    if (mult !== 1) body.push(h("p", { style: `color:${mult > 1 ? "var(--good)" : "var(--bad)"};font-size:13px;margin:10px 0 0` }, `Market trend: rents ×${mult} right now`));
    body.push(h("div", { class: "kv" },
      h("div", {}, h("span", {}, "Price"), h("b", {}, money(t.price))),
      t.kind === "prop" ? h("div", {}, h("span", {}, "Per upgrade"), h("b", {}, money(G.buildCost(i)))) : null,
      h("div", {}, h("span", {}, "Mortgage"), h("b", {}, money(G.mortgageValue(i)))),
      h("div", {}, h("span", {}, "Owner"), h("b", { style: owner ? `color:${owner.color}` : "" }, owner ? owner.name : "Bank")),
      owner && !p.mort ? h("div", {}, h("span", {}, "Rent now"), h("b", {}, money(G.rentFor(st, i)))) : null));
    if (owner?.id === myId() && st.phase !== "over") body.push(h("div", { class: "row", style: "margin-top:14px;flex-wrap:wrap" }, assetButtons(st, i)));
    else if (owner && st.players[myId()] && !st.players[myId()].bankrupt && st.phase !== "over") {
      body.push(h("div", { style: "margin-top:14px" }, h("button", { class: "btn sm", onclick: () => openTrade(owner.id, { get: { tiles: [i] } }) }, icon("swap"), `Make ${owner.name} an offer`)));
    }
  } else {
    const desc = {
      go: `Collect ${money(st?.settings.goSalary || 200)} every time you pass or land here.`,
      news: "Draw a blue Breaking News card: market shocks, sector booms and busts, and business trips.",
      deal: "Draw a yellow Shady Deal card: bribes, bonuses, lawsuits and lucky breaks.",
      tax: `Pay ${money(t.amount || 0)} to the ${st?.settings.jackpot ? "Tax Haven jackpot" : "bank"}.`,
      gulag: `Just visiting, unless you were sent here. To get out: roll doubles, bribe the guards ${money(BAIL)}, or use a pass. After 3 failed tries you pay and walk.`,
      haven: `Optional bets: higher or lower for ${money(CASINO_HILO)} (even money), or pick a number for ${money(CASINO_PICK)} (a hit pays ${money(CASINO_PICK * 6)}).${st?.settings.jackpot ? ` Jackpot right now: ${money(st.pot)}.` : ""}`,
      toGulag: "Go directly to the Gulag. Do not pass Payday.",
    }[t.kind];
    body.push(h("p", { style: "color:var(--soft);line-height:1.55;margin:0" }, t.blurb || "", t.blurb ? h("br") : null, desc));
  }
  modal(t.name, body, { kind: "tile", args: i, top: t.sector ? h("div", { class: "deed-top", style: `--sc:${sc}` }) : null });
}

function openIncoming(id) {
  const st = app.view;
  const t = st.trades.find((x) => x.id === id);
  if (!t) return;
  const from = st.players[t.from];
  modal(`Trade offer from ${from.name}`, h("div", { class: "stack" },
    tradeBlock(st, t),
    h("div", { class: "row", style: "flex-wrap:wrap" },
      h("button", { class: "btn good", onclick: () => { send({ type: "acceptTrade", id }); closeModal(); } }, "Accept"),
      h("button", { class: "btn", onclick: () => openTrade(t.from, { give: t.get, get: t.give, replaces: id }) }, "Counter"),
      h("button", { class: "btn ghost", onclick: () => { send({ type: "cancelTrade", id }); closeModal(); } }, "Decline"))), { kind: "incoming", args: id });
}

function tradable(st, i) {
  if (TILES[i].kind !== "prop") return true;
  return st.settings.buildNeedsSet ? !G.sectorHasUpgrades(st, TILES[i].sector) : st.props[i].level === 0;
}

function openTrade(withId = null, preset = {}) {
  const st = app.view;
  const meP = st?.players[myId()];
  if (!meP || meP.bankrupt || st.phase === "over") return toast("You're not in this game", "err");
  const others = st.order.filter((id) => id !== myId() && !st.players[id].bankrupt);
  if (!others.length) return;
  const draft = {
    to: withId && others.includes(withId) ? withId : others[0],
    give: { tiles: new Set(preset.give?.tiles || []), cash: preset.give?.cash || 0, cards: preset.give?.cards || 0 },
    get: { tiles: new Set(preset.get?.tiles || []), cash: preset.get?.cash || 0, cards: preset.get?.cards || 0 },
  };
  const body = h("div", {});
  const draw = () => {
    const them = st.players[draft.to];
    const col = (title, who, side) => {
      const owned = G.ownedBy(st, who.id).sort((a, b) => a - b);
      const cashIn = h("input", { class: "field", type: "number", min: "0", step: "10", max: String(who.cash), value: side.cash || "", placeholder: "0",
        oninput: (e) => { side.cash = Math.max(0, Math.min(who.cash, Math.floor(Number(e.target.value) || 0))); } });
      return h("div", { class: "trade-col" },
        h("h5", {}, pawn(who), title),
        owned.length ? h("div", { class: "chips" }, owned.map((i) => h("button", {
          class: `chip${side.tiles.has(i) ? " on" : ""}`, disabled: !tradable(st, i) || null,
          title: tradable(st, i) ? TILES[i].name : "Sell the upgrades first",
          onclick: () => { if (side.tiles.has(i)) side.tiles.delete(i); else side.tiles.add(i); draw(); },
        }, h("i", { class: "sc", style: `--sc:${SECTORS[TILES[i].sector].color}` }), logo(TILES[i]), SHORT[TILES[i].name] || TILES[i].name, st.props[i].mort ? " (M)" : ""))) : h("p", { style: "color:var(--soft);font-size:13px;margin:0 0 10px" }, "No companies."),
        h("label", { class: "label" }, `Cash (has ${money(who.cash)})`),
        h("div", { class: "cash-in" }, h("span", { style: "color:var(--soft)" }, "$"), cashIn, h("span", { style: "color:var(--soft)" }, "M")),
        who.gulagCards.length ? h("label", { class: "row", style: "margin-top:10px;font-size:13px" },
          h("input", { type: "checkbox", checked: side.cards ? true : null, onchange: (e) => { side.cards = e.target.checked ? 1 : 0; } }), "Include a Gulag pass") : null);
    };
    body.replaceChildren(
      h("div", { class: "row", style: "flex-wrap:wrap;margin-bottom:14px" }, h("span", { class: "label", style: "margin:0" }, "Trade with"),
        others.map((id) => h("button", { class: `btn sm ${id === draft.to ? "primary" : "ghost"}`, onclick: () => { if (draft.to !== id) { draft.to = id; draft.get = { tiles: new Set(), cash: 0, cards: 0 }; draw(); } } }, pawn(st.players[id]), st.players[id].name))),
      h("div", { class: "trade-cols" }, col(`You give ${them.name}`, meP, draft.give), col(`You get from ${them.name}`, them, draft.get)),
      h("div", { class: "row", style: "margin-top:16px" },
        h("button", { class: "btn primary", onclick: () => {
          const pack = (s) => ({ tiles: [...s.tiles], cash: s.cash || 0, cards: s.cards || 0 });
          if (preset.replaces) send({ type: "cancelTrade", id: preset.replaces });
          send({ type: "proposeTrade", to: draft.to, give: pack(draft.give), get: pack(draft.get) });
          closeModal();
        } }, "Send offer"),
        h("button", { class: "btn ghost", onclick: closeModal }, "Cancel")));
  };
  draw();
  modal(preset.replaces ? "Counter-offer" : "Propose a trade", body, { wide: true, kind: "trade" });
}

function openInvite() {
  const url = inviteUrl(app.code);
  const qr = h("div", { class: "qr", style: "width:180px;height:180px;margin:0 auto" });
  try { new window.QRCode(qr, { text: url, width: 256, height: 256, correctLevel: window.QRCode.CorrectLevel.M }); } catch {}
  modal("Invite", h("div", { class: "stack", style: "text-align:center" }, qr, h("div", { class: "code-big" }, app.code),
    h("p", { style: "color:var(--soft);font-size:13px;margin:0" }, "Anyone who drops out can rejoin with this link and pick up where they left off. New people can watch."),
    h("button", { class: "btn", onclick: copyInvite }, icon("copy"), "Copy link")));
}

function openHostMenu() {
  modal("Host controls", h("div", { class: "stack" },
    h("p", { style: "margin:0;color:var(--soft);font-size:14px" }, "Ring the closing bell now: the richest player by net worth wins."),
    h("button", { class: "btn danger", onclick: () => confirmBox("End the game now?", "Net worth decides the winner.", "End game", () => send({ type: "endNow" })) }, icon("bell"), "End game now"),
    h("button", { class: "btn ghost", onclick: () => confirmBox("Back to lobby?", "This abandons the current game for everyone.", "Abandon game", () => roomOp("lobby")) }, "Abandon & return to lobby")));
}

function openResults() {
  const st = app.view;
  if (!st?.standings) return;
  const top = Math.max(1, st.standings[0]?.worth || 1);
  modal("Final standings", h("div", {},
    icon("crown", "crown"),
    h("div", { class: "standings" }, st.standings.map((s, k) => {
      const p = st.players[s.id];
      return h("div", { class: `stand${k === 0 ? " first" : ""}`, style: `animation-delay:${k * 0.08}s` },
        h("div", { class: "rk" }, String(k + 1)), pawn(p, "lg"),
        h("div", {}, h("div", { style: "font-weight:700" }, p.name), h("div", { class: "bar" }, h("i", { style: `width:${(s.worth / top) * 100}%;background:${p.color}` }))),
        h("div", { style: "font-family:var(--display);font-weight:700" }, s.bankrupt ? "Bankrupt" : money(s.worth)));
    })),
    st.standings.length > 1 ? h("p", { class: "forfeit" }, FORFEITS[(st.seq + st.round) % FORFEITS.length]) : null,
    h("div", { class: "row", style: "margin-top:16px" },
      isHost() ? h("button", { class: "btn primary", onclick: () => { closeModal(); roomOp("lobby"); } }, "New game, same players") : h("span", { style: "color:var(--soft);font-size:13px" }, "The host can start a new game."),
      h("button", { class: "btn ghost", onclick: closeModal }, "Close"))));
}

function openRules() {
  modal("How to play", h("div", { class: "rules" },
    h("p", {}, "Buy companies, collect rent, build factories, and squeeze your friends. Pass Payday to collect $200M."),
    h("h4", {}, "Your turn"),
    h("ul", {}, h("li", {}, "Roll and move. Doubles roll again; three doubles in a row sends you to the Gulag."),
      h("li", {}, "Land on an unowned company: buy it at list price, or it goes to auction (everyone bids, highest wins)."),
      h("li", {}, "Land on someone's company: pay rent. Full sectors double the base rent; factories and HQs raise it a lot.")),
    h("h4", {}, "Building"),
    h("ul", {}, h("li", {}, "Factories (1–4), then a Megacorp HQ. The market only has 32 factories and 12 HQs."),
      h("li", {}, "Depending on the house rules: you may need the whole sector, have to build evenly, and may only be allowed to build where you landed this turn (Göteborg style)."),
      h("li", {}, "There's a cap on upgrades per turn so nobody builds an empire in one go.")),
    h("h4", {}, "Cards"),
    h("ul", {}, h("li", {}, "Blue Breaking News: market shocks that boost or crash whole sectors for a few rounds, trips around the board, windfall taxes."),
      h("li", {}, "Yellow Shady Deals: bonuses, bribes, lawsuits, IPO days and Gulag passes.")),
    h("h4", {}, "The Gulag"),
    h("p", {}, `Roll doubles, bribe the guards ${money(BAIL)}, or use a pass. After three failed attempts you pay and walk out. You still collect rent while inside.`),
    h("h4", {}, "Money trouble"),
    h("p", {}, "If you can't pay, mortgage companies (half price) or sell upgrades (half cost) to raise cash. Redeeming a mortgage costs 10% interest. If you still can't pay, you're bankrupt and your assets go to whoever you owed."),
    h("h4", {}, "Trading"),
    h("p", {}, "Trade companies, cash and Gulag passes with anyone at any time (except during auctions). Companies with upgrades must be sold down first."),
    h("h4", {}, "Winning"),
    h("p", {}, "Last player standing wins, or when the closing bell rings after the set number of rounds, the highest net worth (cash + companies + upgrades) wins."),
    h("h4", {}, "House rules"),
    h("p", {}, "The host can switch on Göteborg rules: claim your own rent before the next roll, travel tickets (cash in a Travel & Freight company to fly anywhere), estate auctions when someone goes bankrupt, no trading from the Gulag, interest-free mortgages, and building only where you land. Other options: no buying on the first lap, two companies dealt at the start, HQ after 3 factories, and ending after a set number of bankruptcies."),
    h("h4", {}, "Why it's balanced"),
    h("p", {}, "Rents are flatter than the classic game, there's a per-turn building cap, a limited supply of factories, and catch-up cards like windfall taxes and bailouts. Thousands of simulated games keep seat order fair and stop a single lucky landing from ending the game.")), { wide: true });
}

function pickDestination(i) {
  const pick = app.pick;
  app.pick = null;
  updateGame();
  if (!pick) return;
  confirmBox(`Fly to ${TILES[i].name}?`, `${TILES[pick.tile].name} goes back to the bank and you pay ${money(TICKET_FEE)}.`, "Fly", () => send({ type: "ticket", tile: pick.tile, to: i }));
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (app.pick) { app.pick = null; updateGame(); } else closeModal();
  }
});

// Losers' forfeits, straight from the spirit of the Göteborg rulebook.
const FORFEITS = [
  "Last place does the dishes for a week.",
  "Last place buys the winner a kebab.",
  "Last place changes their profile picture to whatever the winner picks, for 24 hours.",
  "Last place has to call the winner 'Chairman of the Board' until the next game.",
  "Last place owes everyone a round next time you're out.",
  "Last place writes the winner a LinkedIn recommendation.",
  "Last place sets up the next game night.",
  "Last place has to post 'I am bad at business' in the group chat.",
];

// ---------- boot ----------
route();
