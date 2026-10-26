// Companoly game server. The authoritative game state lives in Redis, so no
// player's device is "the host": anyone can drop out, reload or switch networks
// and the game carries on. Clients POST actions and poll for changes.
//
// POST /api/companoly { op, cid, code?, ... }  →  { ok, ...view } | { ok: false, error }
// cid is the client's private id; the public player id is a hash of it.

import crypto from "node:crypto";
import * as G from "../companoly/engine.js";
import { DEFAULT_SETTINGS, COLORS, PRESETS } from "../companoly/data.js";

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
const TTL = 60 * 60 * 24 * 30;  // games are kept 30 days after the last move
const ONLINE_MS = 16000;        // a player is online if they polled within this window
const MAX_PLAYERS = 6;
const CODE_ABC = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

// ---------- Redis (Upstash REST) with an in-memory fallback for local dev ----------
const useMemory = !REDIS_URL && !process.env.VERCEL;
const mem = (globalThis.__companolyMem ||= new Map());
function memGet(key) {
  const e = mem.get(key);
  if (!e) return null;
  if (e.exp && Date.now() > e.exp) { mem.delete(key); return null; }
  return e.v;
}
function memCmd([op, key, ...rest]) {
  switch (op) {
    case "GET": { const v = memGet(key); return typeof v === "string" ? v : null; }
    case "SET": {
      const flags = rest.slice(1).map(String);
      if (flags.includes("NX") && memGet(key) != null) return null;
      const ex = flags.indexOf("EX"), px = flags.indexOf("PX");
      const exp = ex >= 0 ? Date.now() + Number(flags[ex + 1]) * 1000 : px >= 0 ? Date.now() + Number(flags[px + 1]) : 0;
      mem.set(key, { v: String(rest[0]), exp });
      return "OK";
    }
    case "DEL": return mem.delete(key) ? 1 : 0;
    case "HSET": { const h = memGet(key) || {}; h[rest[0]] = String(rest[1]); mem.set(key, { v: h, exp: mem.get(key)?.exp || 0 }); return 1; }
    case "HGETALL": { const h = memGet(key) || {}; return Object.entries(h).flat(); }
    case "EXPIRE": { const e = mem.get(key); if (e) e.exp = Date.now() + Number(rest[0]) * 1000; return e ? 1 : 0; }
    default: throw new Error(`memory store: unsupported ${op}`);
  }
}
async function pipe(cmds) {
  if (useMemory) return cmds.map(memCmd);
  if (!REDIS_URL) throw new Error("NO_STORE");
  const res = await fetch(`${REDIS_URL}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmds),
  });
  const body = await res.json();
  if (!Array.isArray(body)) throw new Error(`redis: ${body?.error || "bad response"}`);
  return body.map((r) => { if (r.error) throw new Error(`redis: ${r.error}`); return r.result; });
}
const one = async (...cmd) => (await pipe([cmd]))[0];
const K = (code) => ({ room: `cmp:${code}:room`, meta: `cmp:${code}:meta`, seen: `cmp:${code}:seen`, lock: `cmp:${code}:lock` });

// ---------- helpers ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const idOf = (cid) => crypto.createHash("sha256").update(`companoly:${cid}`).digest("hex").slice(0, 12);
const cleanName = (n) => String(n || "").replace(/\s+/g, " ").trim().slice(0, 16) || "Player";
const cleanCode = (c) => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
class Fail extends Error {}

function onlineMap(seenFlat) {
  const out = {};
  const now = Date.now();
  for (let k = 0; k + 1 < (seenFlat || []).length; k += 2) out[seenFlat[k]] = now - Number(seenFlat[k + 1]) < ONLINE_MS;
  return out;
}
// The host is whoever created the room, unless they're offline; then the first online player.
function effectiveHost(room, online) {
  if (online[room.host]) return room.host;
  return room.players.find((p) => online[p.id])?.id || room.host;
}

function upsertPlayer(room, id, name, color) {
  const list = room.players;
  const existing = list.find((p) => p.id === id);
  const taken = (c) => list.some((p) => p.id !== id && p.color === c);
  let col = COLORS.includes(color) && !taken(color) ? color : existing?.color;
  if (!col || taken(col)) col = COLORS.find((c) => !taken(c));
  if (existing) { existing.name = cleanName(name); existing.color = col; return true; }
  if (list.length >= MAX_PLAYERS) return false;
  list.push({ id, name: cleanName(name), color: col });
  return true;
}

function sanitizeSettings(input) {
  const out = { ...DEFAULT_SETTINGS };
  for (const [k, def] of Object.entries(DEFAULT_SETTINGS)) {
    const v = input?.[k];
    if (v === undefined) continue;
    if (typeof def === "boolean") out[k] = !!v;
    else if (typeof def === "number") out[k] = Math.max(0, Math.min(5000, Math.floor(Number(v) || 0)));
    else if (k === "buildWhere") out[k] = ["any", "sector", "exact"].includes(v) ? v : def;
  }
  out.hqAfter = out.hqAfter === 3 ? 3 : 4;
  return out;
}

function view(room, id, online, sinceSeq = 0) {
  return {
    ok: true,
    code: room.code,
    you: id,
    host: effectiveHost(room, online),
    players: room.players,
    settings: room.settings,
    preset: room.preset,
    started: room.started,
    seq: room.seq,
    game: room.game,
    batches: (room.batches || []).filter((b) => b.seq > sinceSeq),
    online,
    now: Date.now(),
  };
}

// Run `fn(room)` under a short lock and persist the result.
async function mutate(code, fn) {
  const k = K(code);
  const token = crypto.randomBytes(6).toString("hex");
  let got = false;
  for (let i = 0; i < 60 && !got; i++) {
    got = (await one("SET", k.lock, token, "NX", "PX", "4000")) === "OK";
    if (!got) await sleep(60);
  }
  if (!got) throw new Fail("The server is busy, try again");
  try {
    const [raw, seenFlat] = await pipe([["GET", k.room], ["HGETALL", k.seen]]);
    if (!raw) throw new Fail("Game not found. It may have expired.");
    const room = JSON.parse(raw);
    const online = onlineMap(seenFlat);
    const changed = fn(room, online);
    if (changed !== false) {
      room.seq++;
      const auctionEnds = room.game?.auction?.endsAt || 0;
      await pipe([
        ["SET", k.room, JSON.stringify(room), "EX", String(TTL)],
        ["SET", k.meta, JSON.stringify({ seq: room.seq, auctionEnds }), "EX", String(TTL)],
        ["EXPIRE", k.seen, String(TTL)],
      ]);
    }
    return { room, online };
  } finally {
    const cur = await one("GET", k.lock).catch(() => null);
    if (cur === token) await one("DEL", k.lock).catch(() => {});
  }
}

function applyGameAction(room, pid, action, online) {
  if (!room.started || !room.game) throw new Fail("The game hasn't started");
  const hostOnly = action.type === "forfeit" || action.type === "endNow";
  let actor = pid;
  if (hostOnly) {
    if (effectiveHost(room, online) !== pid) throw new Fail("Only the host can do that");
    actor = "system";
  }
  if (action.type === "auctionTimeout" || action.type === "setBot") throw new Fail("Not allowed");
  const r = G.act(room.game, actor, action, { now: Date.now() });
  if (!r.ok) throw new Fail(r.err);
  room.batches = [...(room.batches || []), { seq: room.seq + 1, events: r.events }].slice(-12);
}

// ---------- handler ----------
export default async function handler(req, res) {
  if (req.method === "GET") return res.status(200).json({ ok: true, service: "companoly", store: useMemory ? "memory" : REDIS_URL ? "redis" : "none" });
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const op = String(body.op || "");
  const cid = String(body.cid || "");
  if (cid.length < 8) return res.status(400).json({ ok: false, error: "Missing client id" });
  const id = idOf(cid);
  const code = cleanCode(body.code);
  const k = K(code);
  try {
    if (op === "create") {
      for (let attempt = 0; attempt < 8; attempt++) {
        const c = Array.from({ length: 5 }, () => CODE_ABC[crypto.randomInt(CODE_ABC.length)]).join("");
        const room = {
          code: c, host: id, players: [], settings: { ...DEFAULT_SETTINGS }, preset: "balanced",
          started: false, game: null, batches: [], seq: 1, aids: {}, created: Date.now(),
        };
        upsertPlayer(room, id, body.name, body.color);
        const kk = K(c);
        const ok = await one("SET", kk.room, JSON.stringify(room), "NX", "EX", String(TTL));
        if (ok !== "OK") continue;
        await pipe([["SET", kk.meta, JSON.stringify({ seq: 1, auctionEnds: 0 }), "EX", String(TTL)], ["HSET", kk.seen, id, String(Date.now())], ["EXPIRE", kk.seen, String(TTL)]]);
        return res.status(200).json(view(room, id, { [id]: true }));
      }
      throw new Fail("Couldn't create a room, try again");
    }
    if (!code) throw new Fail("Missing game code");

    if (op === "poll") {
      const since = Number(body.seq) || 0;
      const cmds = [["GET", k.meta]];
      if (body.beat) cmds.push(["HSET", k.seen, id, String(Date.now())], ["HGETALL", k.seen]);
      const out = await pipe(cmds);
      const meta = out[0] ? JSON.parse(out[0]) : null;
      if (!meta) throw new Fail("Game not found. It may have expired.");
      let online = body.beat ? onlineMap(out[2]) : null;
      // Auctions end lazily: the first poll after the deadline closes it.
      if (meta.auctionEnds && Date.now() >= meta.auctionEnds) {
        const r = await mutate(code, (room) => {
          if (!room.game?.auction || Date.now() < room.game.auction.endsAt) return false;
          const a = G.act(room.game, "system", { type: "auctionTimeout" }, { now: Date.now() });
          if (!a.ok) return false;
          room.batches = [...(room.batches || []), { seq: room.seq + 1, events: a.events }].slice(-12);
          return true;
        });
        return res.status(200).json(view(r.room, id, online || r.online, since));
      }
      if (meta.seq > since || body.full) {
        const [raw, seenFlat] = await pipe([["GET", k.room], ["HGETALL", k.seen]]);
        if (!raw) throw new Fail("Game not found. It may have expired.");
        return res.status(200).json(view(JSON.parse(raw), id, online || onlineMap(seenFlat), since));
      }
      return res.status(200).json({ ok: true, seq: meta.seq, online, now: Date.now(), unchanged: true });
    }

    const { room, online } = await mutate(code, (room, onl) => {
      onl[id] = true;
      const isHost = effectiveHost(room, onl) === id;
      switch (op) {
        case "join":
        case "profile":
          if (!room.started) {
            if (!upsertPlayer(room, id, body.name, body.color) && op === "join") return false;
            return true;
          }
          return false;
        case "leave":
          if (room.started) return false;
          room.players = room.players.filter((p) => p.id !== id);
          if (room.host === id && room.players[0]) room.host = room.players[0].id;
          return true;
        case "settings":
          if (!isHost) throw new Fail("Only the host can change the rules");
          if (room.started) throw new Fail("The game already started");
          room.settings = sanitizeSettings(body.settings);
          room.preset = PRESETS[body.preset] ? body.preset : "custom";
          return true;
        case "kick":
          if (!isHost) throw new Fail("Only the host can do that");
          if (room.started) throw new Fail("The game already started");
          room.players = room.players.filter((p) => p.id !== body.target || p.id === id);
          return true;
        case "start": {
          if (!isHost) throw new Fail("Only the host can start");
          if (room.started) return false;
          if (room.players.length < 2) throw new Fail("Need at least 2 players");
          room.game = G.createGame(room.players.map((p) => ({ id: p.id, name: p.name, color: p.color })), room.settings);
          room.started = true;
          room.batches = [];
          return true;
        }
        case "lobby":
          if (!isHost) throw new Fail("Only the host can do that");
          room.started = false;
          room.game = null;
          room.batches = [];
          return true;
        case "act": {
          const action = body.action;
          if (!action || typeof action.type !== "string") throw new Fail("Bad action");
          // Idempotency: a retried request with the same action id is applied once.
          room.aids ||= {};
          if (body.aid && room.aids[id] === body.aid) return false;
          applyGameAction(room, id, action, onl);
          if (body.aid) room.aids[id] = body.aid;
          return true;
        }
        default:
          throw new Fail("Unknown request");
      }
    });
    await pipe([["HSET", k.seen, id, String(Date.now())]]).catch(() => {});
    return res.status(200).json(view(room, id, { ...online, [id]: true }, Number(body.seq) || 0));
  } catch (err) {
    if (err instanceof Fail) return res.status(200).json({ ok: false, error: err.message });
    if (String(err.message) === "NO_STORE") return res.status(503).json({ ok: false, error: "Game server storage isn't set up yet." });
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server hiccup, retrying…" });
  }
}
