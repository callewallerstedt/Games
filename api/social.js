// Social API — accounts, friends, presence, invites, favorites & stats.
// One Vercel serverless function; storage is Upstash Redis via its REST API
// (works with the Vercel KV / Upstash marketplace integration env vars).
//
// All requests: POST /api/social  { action, token?, ...params }
// Every response: { ok: true, ...data } or { ok: false, error }

import crypto from "node:crypto";

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";

const TOKEN_TTL = 60 * 60 * 24 * 120; // 120 days
const PRESENCE_TTL = 75;              // seconds; client heartbeats every ~25s
const INVITE_TTL_MS = 5 * 60 * 1000;  // invites expire after 5 minutes

// ---------- Redis over REST ----------
// Outside Vercel (local dev) with no Redis configured, fall back to a process-
// local in-memory store so the whole flow can be exercised without credentials.
const useMemory = !REDIS_URL && !process.env.VERCEL;
const mem = { map: new Map(), exp: new Map() };
function memAlive(key) {
  const at = mem.exp.get(key);
  if (at && Date.now() > at) { mem.map.delete(key); mem.exp.delete(key); return false; }
  return mem.map.has(key);
}
function memRun(cmd) {
  const [op, key, ...rest] = cmd;
  switch (op) {
    case "GET": return memAlive(key) ? mem.map.get(key) : null;
    case "SET": {
      const value = rest[0];
      const flags = rest.slice(1).map(String);
      if (flags.includes("NX") && memAlive(key)) return null;
      mem.map.set(key, value);
      const exIdx = flags.indexOf("EX");
      if (exIdx >= 0) mem.exp.set(key, Date.now() + Number(flags[exIdx + 1]) * 1000);
      else mem.exp.delete(key);
      return "OK";
    }
    case "DEL": { const had = memAlive(key); mem.map.delete(key); mem.exp.delete(key); return had ? 1 : 0; }
    case "EXPIRE": { if (!memAlive(key)) return 0; mem.exp.set(key, Date.now() + Number(rest[0]) * 1000); return 1; }
    case "EXISTS": return memAlive(key) ? 1 : 0;
    case "INCR": { const next = (Number(memAlive(key) ? mem.map.get(key) : 0) || 0) + 1; mem.map.set(key, String(next)); return next; }
    case "SCAN": {
      const matchIdx = cmd.indexOf("MATCH");
      const pattern = matchIdx >= 0 ? cmd[matchIdx + 1] : "*";
      const re = new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
      return ["0", Array.from(mem.map.keys()).filter((k) => memAlive(k) && re.test(k))];
    }
    default: throw new Error(`memory store: unsupported ${op}`);
  }
}

async function redis(...cmd) {
  if (useMemory) return memRun(cmd);
  const res = await fetch(REDIS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  const body = await res.json();
  if (body.error) throw new Error(`redis: ${body.error}`);
  return body.result;
}
async function redisPipeline(cmds) {
  if (!cmds.length) return [];
  if (useMemory) return cmds.map(memRun);
  const res = await fetch(`${REDIS_URL}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmds),
  });
  const body = await res.json();
  return body.map((r) => r.result);
}

const jget = async (key) => { const raw = await redis("GET", key); return raw ? JSON.parse(raw) : null; };
const jset = (key, value, ...extra) => redis("SET", key, JSON.stringify(value), ...extra);

// ---------- helpers ----------
const USERNAME_RE = /^[a-z0-9][a-z0-9_-]{2,15}$/;
const normName = (u) => String(u || "").trim().toLowerCase();

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const check = crypto.scryptSync(password, salt, 32).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(check, "hex"));
}
const newToken = () => crypto.randomBytes(24).toString("hex");

async function authedUser(token) {
  if (!token) return null;
  const username = await redis("GET", `token:${token}`);
  if (username) await redis("EXPIRE", `token:${token}`, TOKEN_TTL); // sliding expiry
  return username || null;
}

async function presenceOf(usernames) {
  if (!usernames.length) return {};
  const results = await redisPipeline(usernames.map((u) => ["GET", `presence:${u}`]));
  const map = {};
  usernames.forEach((u, i) => {
    try { map[u] = results[i] ? JSON.parse(results[i]) : null; } catch { map[u] = null; }
  });
  return map;
}

async function friendsPayload(me) {
  const [friends, requests, invitesRaw, data] = await Promise.all([
    jget(`friends:${me}`).then((v) => v || []),
    jget(`freq:${me}`).then((v) => v || []),
    jget(`inv:${me}`).then((v) => v || []),
    jget(`data:${me}`),
  ]);
  const now = Date.now();
  const invites = invitesRaw.filter((i) => now - i.ts < INVITE_TTL_MS);
  if (invites.length !== invitesRaw.length) await jset(`inv:${me}`, invites, "EX", 600);
  const presence = await presenceOf(friends);
  return {
    friends: friends.map((u) => ({ username: u, presence: presence[u] || null })),
    requests,
    invites,
    data: data || { favorites: [], stats: {} },
  };
}

// naive per-IP rate limit: 120 requests / minute
async function rateLimited(ip) {
  const key = `rate:${ip}:${Math.floor(Date.now() / 60000)}`;
  const [count] = await redisPipeline([["INCR", key], ["EXPIRE", key, 65]]);
  return count > 120;
}

// ---------- actions ----------
const actions = {
  async register({ username, password, displayName }) {
    const uname = normName(username);
    if (!USERNAME_RE.test(uname)) return { error: "Username: 3–16 chars, letters/numbers/_/-, starts with a letter or number." };
    if (!password || String(password).length < 4) return { error: "Password must be at least 4 characters." };
    const created = await redis("SET", `user:${uname}`, JSON.stringify({
      username: uname,
      displayName: String(displayName || username).slice(0, 24),
      pass: hashPassword(String(password)),
      created: Date.now(),
    }), "NX");
    if (created === null) return { error: "That username is taken." };
    const token = newToken();
    await redis("SET", `token:${token}`, uname, "EX", TOKEN_TTL);
    return { token, username: uname, ...(await friendsPayload(uname)) };
  },

  async login({ username, password }) {
    const uname = normName(username);
    const user = await jget(`user:${uname}`);
    if (!user || !verifyPassword(String(password || ""), user.pass)) return { error: "Wrong username or password." };
    const token = newToken();
    await redis("SET", `token:${token}`, uname, "EX", TOKEN_TTL);
    return { token, username: uname, displayName: user.displayName, ...(await friendsPayload(uname)) };
  },

  async logout({ token }) {
    if (token) await redis("DEL", `token:${token}`);
    return {};
  },

  async me({ _user }) {
    return { username: _user, ...(await friendsPayload(_user)) };
  },

  async search({ _user, q }) {
    const query = normName(q).replace(/[^a-z0-9_-]/g, "");
    if (query.length < 2) return { results: [] };
    let cursor = "0";
    const found = [];
    for (let i = 0; i < 8 && found.length < 12; i++) {
      const [next, keys] = await redis("SCAN", cursor, "MATCH", `user:${query}*`, "COUNT", 200);
      keys.forEach((k) => found.push(k.slice(5)));
      cursor = next;
      if (cursor === "0") break;
    }
    const friends = (await jget(`friends:${_user}`)) || [];
    const presence = await presenceOf(found);
    return {
      results: found.filter((u) => u !== _user).slice(0, 12).map((u) => ({
        username: u,
        isFriend: friends.includes(u),
        online: !!presence[u],
      })),
    };
  },

  async friend_request({ _user, to }) {
    const target = normName(to);
    if (target === _user) return { error: "That's you." };
    const exists = await redis("EXISTS", `user:${target}`);
    if (!exists) return { error: "No such user." };
    const myFriends = (await jget(`friends:${_user}`)) || [];
    if (myFriends.includes(target)) return { error: "Already friends." };
    // If they already requested me, this acts as an accept.
    const myRequests = (await jget(`freq:${_user}`)) || [];
    if (myRequests.includes(target)) return actions.friend_accept({ _user, from: target });
    const theirRequests = (await jget(`freq:${target}`)) || [];
    if (!theirRequests.includes(_user)) {
      theirRequests.push(_user);
      await jset(`freq:${target}`, theirRequests.slice(-50));
    }
    return { sent: true };
  },

  async friend_accept({ _user, from }) {
    const other = normName(from);
    const myRequests = (await jget(`freq:${_user}`)) || [];
    if (!myRequests.includes(other)) return { error: "No request from that user." };
    const [mine, theirs] = await Promise.all([jget(`friends:${_user}`), jget(`friends:${other}`)]);
    const myFriends = mine || [], theirFriends = theirs || [];
    if (!myFriends.includes(other)) myFriends.push(other);
    if (!theirFriends.includes(_user)) theirFriends.push(_user);
    await Promise.all([
      jset(`friends:${_user}`, myFriends),
      jset(`friends:${other}`, theirFriends),
      jset(`freq:${_user}`, myRequests.filter((u) => u !== other)),
    ]);
    return await friendsPayload(_user);
  },

  async friend_decline({ _user, from }) {
    const other = normName(from);
    const myRequests = (await jget(`freq:${_user}`)) || [];
    await jset(`freq:${_user}`, myRequests.filter((u) => u !== other));
    return await friendsPayload(_user);
  },

  async friend_remove({ _user, username }) {
    const other = normName(username);
    const [mine, theirs] = await Promise.all([jget(`friends:${_user}`), jget(`friends:${other}`)]);
    await Promise.all([
      jset(`friends:${_user}`, (mine || []).filter((u) => u !== other)),
      jset(`friends:${other}`, (theirs || []).filter((u) => u !== _user)),
    ]);
    return await friendsPayload(_user);
  },

  // Heartbeat. status: "online" | "lobby" | "ingame"; joinUrl lets friends hop in.
  async presence({ _user, status, gameId, gameTitle, joinUrl, canJoin }) {
    const clean = {
      status: ["online", "lobby", "ingame"].includes(status) ? status : "online",
      gameId: gameId ? String(gameId).slice(0, 40) : null,
      gameTitle: gameTitle ? String(gameTitle).slice(0, 60) : null,
      joinUrl: joinUrl ? String(joinUrl).slice(0, 400) : null,
      canJoin: !!canJoin,
      updated: Date.now(),
    };
    await jset(`presence:${_user}`, clean, "EX", PRESENCE_TTL);
    return await friendsPayload(_user); // piggyback: heartbeat doubles as friends refresh
  },

  async offline({ _user }) {
    await redis("DEL", `presence:${_user}`);
    return {};
  },

  async invite({ _user, to, gameId, gameTitle, joinUrl }) {
    const target = normName(to);
    const friends = (await jget(`friends:${_user}`)) || [];
    if (!friends.includes(target)) return { error: "You can only invite friends." };
    const now = Date.now();
    const invites = ((await jget(`inv:${target}`)) || [])
      .filter((i) => now - i.ts < INVITE_TTL_MS && i.from !== _user);
    invites.push({
      from: _user,
      gameId: String(gameId || "").slice(0, 40),
      gameTitle: String(gameTitle || "").slice(0, 60),
      joinUrl: String(joinUrl || "").slice(0, 400),
      ts: now,
    });
    await jset(`inv:${target}`, invites.slice(-20), "EX", 600);
    return { sent: true };
  },

  async invite_clear({ _user }) {
    await redis("DEL", `inv:${_user}`);
    return {};
  },

  // Merge favorites + stats from the client. Stats are additive counters, so we
  // take the max of server/client per counter (client is source of truth for its
  // own increments; max survives out-of-order syncs from one device).
  async sync({ _user, favorites, stats }) {
    const data = (await jget(`data:${_user}`)) || { favorites: [], stats: {} };
    if (Array.isArray(favorites)) data.favorites = favorites.filter((f) => typeof f === "string").slice(0, 100);
    if (stats && typeof stats === "object") {
      for (const [gameId, s] of Object.entries(stats)) {
        if (!s || typeof s !== "object") continue;
        const cur = data.stats[gameId] || {};
        for (const [k, v] of Object.entries(s)) {
          if (typeof v === "number" && Number.isFinite(v)) cur[k] = Math.max(cur[k] || 0, v);
        }
        data.stats[gameId] = cur;
      }
    }
    await jset(`data:${_user}`, data);
    return { data };
  },
};

// ---------- handler ----------
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (!useMemory && (!REDIS_URL || !REDIS_TOKEN)) {
    return res.status(503).json({ ok: false, error: "Storage not configured. Add an Upstash Redis (KV) integration in Vercel." });
  }
  if (req.method === "GET") return res.status(200).json({ ok: true, service: "social" });
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  const action = actions[body.action];
  if (!action) return res.status(400).json({ ok: false, error: "Unknown action" });

  try {
    const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
    if (await rateLimited(ip)) return res.status(429).json({ ok: false, error: "Slow down a little." });

    const publicActions = ["register", "login", "logout"];
    if (!publicActions.includes(body.action)) {
      const user = await authedUser(body.token);
      if (!user) return res.status(401).json({ ok: false, error: "signed_out" });
      body._user = user;
    }
    const result = await action(body);
    if (result?.error) return res.status(200).json({ ok: false, error: result.error });
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server hiccup — try again." });
  }
}
