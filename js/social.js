// Accounts, friends, presence and invites — talks to /api/social (Vercel).
// Fully optional: when the API is unreachable (e.g. GitHub Pages build) the
// hub simply hides the social UI and everything else works as before.
import { el, modal, toast, button } from "./ui.js";

const TOKEN_KEY = "party_account_token";
const NAME_KEY = "party_account_name";
const API_BASE_KEY = "party_api_base"; // optional override, e.g. when hosted off-Vercel
const STATS_KEY = "party_game_stats";
const FAVORITES_KEY = "party_game_favorites";

const HEARTBEAT_MS = 25_000;

function apiUrl() {
  try {
    const override = localStorage.getItem(API_BASE_KEY);
    if (override) return `${override.replace(/\/$/, "")}/api/social`;
  } catch {}
  return "api/social";
}

export const state = {
  available: null,        // null = unknown, false = no API, true = live
  token: null,
  username: null,
  friends: [],
  requests: [],
  invites: [],
  data: { favorites: [], stats: {} },
  lastError: null,
};
try {
  state.token = localStorage.getItem(TOKEN_KEY) || null;
  state.username = localStorage.getItem(NAME_KEY) || null;
} catch {}

const listeners = new Set();
export function onSocialChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { listeners.forEach((fn) => { try { fn(state); } catch {} }); }

async function call(action, params = {}) {
  const res = await fetch(apiUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, token: state.token, ...params }),
  });
  const body = await res.json().catch(() => ({ ok: false, error: "Bad response" }));
  if (body.error === "signed_out") signOutLocal();
  return body;
}

function absorb(body) {
  if (!body?.ok) return;
  if (body.friends) state.friends = body.friends;
  if (body.requests) state.requests = body.requests;
  if (body.invites) state.invites = body.invites;
  if (body.data) {
    state.data = body.data;
    mergeServerData(body.data);
  }
  emit();
}

function signOutLocal() {
  state.token = null;
  state.username = null;
  state.friends = [];
  state.requests = [];
  state.invites = [];
  try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(NAME_KEY); } catch {}
  stopHeartbeat();
  emit();
}

export const isSignedIn = () => !!state.token && state.available !== false;

// ---------- boot: probe API, restore session ----------
let probePromise = null;
export function probe() {
  if (probePromise) return probePromise;
  probePromise = (async () => {
    try {
      const res = await fetch(apiUrl(), { method: "GET" });
      state.available = res.ok;
    } catch { state.available = false; }
    if (state.available && state.token) {
      const body = await call("me");
      if (body.ok) { absorb(body); startHeartbeat(); }
    }
    emit();
    return state.available;
  })();
  return probePromise;
}

// ---------- auth ----------
export async function register(username, password) {
  const body = await call("register", { username, password });
  if (body.ok) finishSignIn(body);
  return body;
}
export async function login(username, password) {
  const body = await call("login", { username, password });
  if (body.ok) finishSignIn(body);
  return body;
}
function finishSignIn(body) {
  state.token = body.token;
  state.username = body.username;
  try {
    localStorage.setItem(TOKEN_KEY, body.token);
    localStorage.setItem(NAME_KEY, body.username);
    // Your account name is your identity in games too — adopt it as the player
    // name the hub, lobby and every game read from ("together_name").
    localStorage.setItem("together_name", body.username);
  } catch {}
  absorb(body);
  startHeartbeat();
  syncNow(); // push local favorites/stats up right away
}
export async function signOut() {
  const token = state.token;
  signOutLocal();
  if (token) call("logout", { token }).catch(() => {});
}

// ---------- presence ----------
let presenceContext = { status: "online" };
let heartbeatTimer = null;

export function setPresenceContext(ctx) {
  const next = { status: "online", ...ctx };
  if (JSON.stringify(next) === JSON.stringify(presenceContext)) return; // no spam on re-renders
  presenceContext = next;
  if (isSignedIn()) beat();
}
async function beat() {
  if (!isSignedIn()) return;
  const body = await call("presence", presenceContext).catch(() => null);
  if (body) absorb(body);
}
function startHeartbeat() {
  stopHeartbeat();
  beat();
  heartbeatTimer = setInterval(beat, HEARTBEAT_MS);
  document.addEventListener("visibilitychange", onVisibility);
}
function stopHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  document.removeEventListener("visibilitychange", onVisibility);
}
function onVisibility() { if (!document.hidden) beat(); }

// ---------- friends ----------
export async function searchUsers(q) {
  const body = await call("search", { q });
  return body.ok ? body.results : [];
}
export async function sendFriendRequest(to) {
  const body = await call("friend_request", { to });
  if (body.ok) { absorb(body); toast(body.friends ? `You and ${to} are now friends` : "Request sent"); }
  else toast(body.error || "Could not send request");
  return body;
}
export const acceptFriend = (from) => call("friend_accept", { from }).then((b) => { absorb(b); return b; });
export const declineFriend = (from) => call("friend_decline", { from }).then((b) => { absorb(b); return b; });
export const removeFriend = (username) => call("friend_remove", { username }).then((b) => { absorb(b); return b; });
export async function inviteFriend(to, { gameId, gameTitle, joinUrl }) {
  const body = await call("invite", { to, gameId, gameTitle, joinUrl });
  toast(body.ok ? `Invite sent to ${to}` : (body.error || "Invite failed"));
  return body;
}

// ---------- favorites & stats (local-first, synced when signed in) ----------
export function localFavorites() {
  try { return JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]"); } catch { return []; }
}
export function localStats() {
  try { return JSON.parse(localStorage.getItem(STATS_KEY) || "{}"); } catch { return {}; }
}
function saveLocalStats(stats) {
  try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch {}
}

// Called on login/me: fold server data into local storage (union favorites,
// max counters) so a new device inherits the account's history.
function mergeServerData(data) {
  try {
    const favorites = new Set(localFavorites());
    (data.favorites || []).forEach((f) => favorites.add(f));
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]));
    const stats = localStats();
    for (const [gameId, s] of Object.entries(data.stats || {})) {
      const cur = stats[gameId] || {};
      for (const [k, v] of Object.entries(s)) cur[k] = Math.max(cur[k] || 0, v);
      stats[gameId] = cur;
    }
    saveLocalStats(stats);
  } catch {}
}

let syncTimer = null;
export function scheduleSync() {
  if (!isSignedIn()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncNow, 1500);
}
export async function syncNow() {
  if (!isSignedIn()) return;
  const body = await call("sync", { favorites: localFavorites(), stats: localStats() }).catch(() => null);
  if (body?.ok && body.data) state.data = body.data;
}

/** Record that a game was played (and optionally won). */
export function recordPlay(gameId, { won = false, mode = "local" } = {}) {
  const stats = localStats();
  const s = stats[gameId] || {};
  s.plays = (s.plays || 0) + 1;
  if (won) s.wins = (s.wins || 0) + 1;
  if (mode === "online") s.online = (s.online || 0) + 1;
  s.last = Date.now();
  stats[gameId] = s;
  saveLocalStats(stats);
  scheduleSync();
}

// ---------- UI ----------
const presenceLabel = (p) => {
  if (!p) return { text: "Offline", cls: "off" };
  if (p.status === "lobby") return { text: p.gameTitle ? `In lobby · ${p.gameTitle}` : "In a lobby", cls: "lobby" };
  if (p.status === "ingame") return { text: p.gameTitle ? `Playing ${p.gameTitle}` : "In a game", cls: "ingame" };
  return { text: "Online", cls: "on" };
};

export function friendsBadgeCount() {
  return state.requests.length + state.invites.length;
}

/** Topbar friends button with a notification badge. Hidden when API is down. */
export function friendsButton() {
  if (state.available === false) return null;
  const badge = friendsBadgeCount();
  return el("button", {
    class: "iconbtn friends-btn",
    "aria-label": "Friends",
    title: "Friends",
    onClick: () => friendsPanel(),
  }, [
    "👥",
    badge ? el("span", { class: "friends-badge" }, String(badge)) : null,
  ]);
}

/** The main friends/account sheet. */
export function friendsPanel({ inviteContext = null } = {}) {
  let close = null;
  let mode = state.token ? "friends" : "signin";
  let busy = false;
  let searchResults = null;
  let searchQuery = "";

  const body = el("div", { class: "stack friends-panel" });

  const rerender = () => {
    body.replaceChildren(...build());
  };
  const unsub = onSocialChange(() => {
    if (!body.isConnected) { unsub(); return; } // sheet was closed via ✕/backdrop
    if (mode === "friends") rerender();
  });

  function authForm(kind) {
    const user = el("input", { class: "field", placeholder: "Username", autocomplete: "username", maxlength: "16", value: state.username || "" });
    const pass = el("input", { class: "field", placeholder: "Password", type: "password", autocomplete: kind === "signin" ? "current-password" : "new-password" });
    const err = el("p", { class: "bad tiny center", style: "display:none; margin:0" });
    const submit = async () => {
      if (busy) return;
      busy = true;
      err.style.display = "none";
      const fn = kind === "signin" ? login : register;
      const res = await fn(user.value.trim(), pass.value).catch(() => ({ error: "Network problem — try again." }));
      busy = false;
      if (res?.ok) { toast(kind === "signin" ? `Welcome back, ${state.username}!` : `Account created — hi ${state.username}!`); mode = "friends"; rerender(); }
      else { err.textContent = res?.error || "Something went wrong."; err.style.display = ""; }
    };
    pass.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
    return el("div", { class: "stack" }, [
      el("p", { class: "muted center", style: "margin:0" }, kind === "signin"
        ? "Sign in to see friends, invites and your stats on any device."
        : "Pick a username friends can find you by."),
      user, pass,
      button(kind === "signin" ? "Sign in" : "Create account", { big: true, onClick: submit }),
      el("button", { class: "btn ghost", onClick: () => { mode = kind === "signin" ? "signup" : "signin"; rerender(); } },
        kind === "signin" ? "New here? Create an account" : "Have an account? Sign in"),
    ]);
  }

  function friendRow(f) {
    const p = presenceLabel(f.presence);
    const actions = [];
    if (inviteContext && f.presence) {
      actions.push(el("button", {
        class: "btn small accent",
        onClick: () => inviteFriend(f.username, inviteContext),
      }, "Invite"));
    }
    if (f.presence?.canJoin && f.presence.joinUrl && !inviteContext) {
      actions.push(el("button", {
        class: "btn small accent",
        onClick: () => { close?.(); location.href = f.presence.joinUrl; },
      }, f.presence.status === "ingame" ? "Join game" : "Join lobby"));
    }
    actions.push(el("button", {
      class: "iconbtn friend-remove",
      "aria-label": `Remove ${f.username}`,
      title: "Remove friend",
      onClick: async () => { if (confirm(`Remove ${f.username} from your friends?`)) { await removeFriend(f.username); rerender(); } },
    }, "✕"));
    return el("div", { class: "friend-row" }, [
      el("span", { class: `presence-dot ${p.cls}` }),
      el("div", { class: "friend-info" }, [
        el("span", { class: "friend-name" }, f.username),
        el("span", { class: `friend-status ${p.cls}` }, p.text),
      ]),
      el("div", { class: "friend-actions" }, actions),
    ]);
  }

  function inviteRow(inv) {
    return el("div", { class: "friend-row invite-row" }, [
      el("span", { class: "presence-dot lobby" }),
      el("div", { class: "friend-info" }, [
        el("span", { class: "friend-name" }, `${inv.from} invited you`),
        el("span", { class: "friend-status lobby" }, inv.gameTitle || "Party room"),
      ]),
      el("div", { class: "friend-actions" }, [
        el("button", { class: "btn small accent", onClick: () => { call("invite_clear").catch(() => {}); close?.(); location.href = inv.joinUrl; } }, "Join"),
      ]),
    ]);
  }

  function requestRow(username) {
    return el("div", { class: "friend-row" }, [
      el("span", { class: "presence-dot req" }),
      el("div", { class: "friend-info" }, [
        el("span", { class: "friend-name" }, username),
        el("span", { class: "friend-status" }, "Wants to be friends"),
      ]),
      el("div", { class: "friend-actions" }, [
        el("button", { class: "btn small accent", onClick: async () => { await acceptFriend(username); rerender(); } }, "Accept"),
        el("button", { class: "btn small ghost", onClick: async () => { await declineFriend(username); rerender(); } }, "Decline"),
      ]),
    ]);
  }

  function searchBlock() {
    let timer = null;
    const results = el("div", { class: "stack search-results" });
    const renderResults = () => {
      results.replaceChildren();
      if (searchResults == null) return;
      if (!searchResults.length) {
        results.append(el("p", { class: "muted tiny center", style: "margin:0" }, "No players found."));
        return;
      }
      searchResults.forEach((r) => results.append(el("div", { class: "friend-row" }, [
        el("span", { class: `presence-dot ${r.online ? "on" : "off"}` }),
        el("div", { class: "friend-info" }, [el("span", { class: "friend-name" }, r.username)]),
        el("div", { class: "friend-actions" }, [
          r.isFriend
            ? el("span", { class: "muted tiny" }, "Friends ✓")
            : el("button", { class: "btn small secondary", onClick: async (e) => {
                e.currentTarget.disabled = true;
                await sendFriendRequest(r.username);
                const found = searchResults.find((x) => x.username === r.username);
                if (found) found.isFriend = true;
                renderResults();
              } }, "Add friend"),
        ]),
      ])));
    };
    const input = el("input", {
      class: "field",
      type: "search",
      placeholder: "Find players by username…",
      value: searchQuery,
      oninput: (e) => {
        searchQuery = e.target.value;
        clearTimeout(timer);
        if (searchQuery.trim().length < 2) { searchResults = null; renderResults(); return; }
        timer = setTimeout(async () => {
          searchResults = await searchUsers(searchQuery.trim());
          renderResults();
        }, 350);
      },
    });
    queueMicrotask(renderResults);
    return el("div", { class: "stack" }, [input, results]);
  }

  function statsBlock() {
    const stats = localStats();
    const entries = Object.entries(stats)
      .filter(([, s]) => s.plays)
      .sort((a, b) => (b[1].plays || 0) - (a[1].plays || 0))
      .slice(0, 5);
    if (!entries.length) return null;
    const total = Object.values(stats).reduce((n, s) => n + (s.plays || 0), 0);
    return el("details", { class: "friends-stats" }, [
      el("summary", {}, `Your stats · ${total} game${total === 1 ? "" : "s"} played`),
      el("div", { class: "stack", style: "margin-top:8px" },
        entries.map(([gameId, s]) => el("div", { class: "stat-row" }, [
          el("span", { class: "stat-game" }, gameId.replace(/-/g, " ")),
          el("span", { class: "muted tiny" }, `${s.plays} played${s.wins ? ` · ${s.wins} won` : ""}`),
        ]))),
    ]);
  }

  function build() {
    if (state.available === false) {
      return [el("p", { class: "muted center" }, "Friends need the online service — it isn't reachable right now.")];
    }
    if (mode === "signin" || mode === "signup") return [authForm(mode)];
    const sections = [];
    if (inviteContext) sections.push(el("p", { class: "muted center", style: "margin:0" }, "Tap Invite to send friends a one-tap link to this room."));
    if (state.invites.length) sections.push(el("div", { class: "friends-section" }, [
      el("h3", { class: "friends-heading" }, "Invites"),
      ...state.invites.map(inviteRow),
    ]));
    if (state.requests.length) sections.push(el("div", { class: "friends-section" }, [
      el("h3", { class: "friends-heading" }, "Friend requests"),
      ...state.requests.map(requestRow),
    ]));
    sections.push(el("div", { class: "friends-section" }, [
      el("h3", { class: "friends-heading" }, `Friends${state.friends.length ? ` · ${state.friends.length}` : ""}`),
      state.friends.length
        ? el("div", { class: "stack" }, state.friends
            .slice()
            .sort((a, b) => (b.presence ? 1 : 0) - (a.presence ? 1 : 0))
            .map(friendRow))
        : el("p", { class: "muted tiny center" }, "No friends yet — search below to add some."),
    ]));
    sections.push(el("div", { class: "friends-section" }, [
      el("h3", { class: "friends-heading" }, "Add friends"),
      searchBlock(),
    ]));
    const stats = statsBlock();
    if (stats) sections.push(stats);
    sections.push(el("div", { class: "friends-footer" }, [
      el("span", { class: "muted tiny" }, `Signed in as ${state.username}`),
      el("button", { class: "btn ghost small", onClick: () => { signOut(); mode = "signin"; rerender(); } }, "Sign out"),
    ]));
    return sections;
  }

  rerender();
  const closeFn = modal(inviteContext ? "Invite friends" : "Friends", body);
  close = () => { unsub(); closeFn(); };
  // refresh presence as the sheet opens
  if (isSignedIn()) beat();
  return close;
}
