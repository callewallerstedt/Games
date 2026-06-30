// "JKLM BombParty" - type a word containing the syllable before the bomb pops.

import { el, render, button, pill, connectionPill, gameHeader, scoreChip, haptic, celebrate, onlineReadyGate, setGameCleanup } from "../ui.js";

const SYLLABLES = [
  "ab", "ac", "ad", "al", "am", "an", "ap", "ar", "at", "be", "bi", "bo", "br",
  "ca", "ce", "ch", "co", "cr", "de", "di", "do", "dr", "el", "en", "er", "fa",
  "fi", "fo", "fr", "ga", "go", "gr", "ha", "he", "hi", "in", "jo", "la", "le",
  "li", "lo", "ma", "me", "mi", "mo", "na", "ne", "ni", "no", "or", "pa", "pe",
  "pi", "pl", "po", "pr", "ra", "re", "ri", "ro", "sa", "se", "sh", "si", "so",
  "sp", "st", "ta", "te", "th", "ti", "to", "tr", "un", "ve", "wa", "wi",
];

const norm = (s) => (s || "").trim().toLowerCase().replace(/[^a-z]/g, "");
const randomSyllable = () => SYLLABLES[Math.floor(Math.random() * SYLLABLES.length)];
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

function fuseConfig(settings) {
  const timerMode = settings?.timerMode || "Per bomb";
  return {
    startSec: clamp(Number(settings?.fuseSeconds) || 20, 1, 120),
    reduceSec: clamp(Number(settings?.reduceBySeconds) || 0, 0, 60),
    minSec: 3,
    timerMode,
  };
}

function fuseDurationMs(cfg, { bombRound = 0, wordsThisBomb = 0 } = {}) {
  let seconds = cfg.startSec - bombRound * cfg.reduceSec;
  if (cfg.timerMode === "Per word") seconds -= wordsThisBomb * cfg.reduceSec;
  return Math.max(cfg.minSec, seconds) * 1000;
}

const game = {
  id: "bombparty",
  title: "JKLM BombParty",
  emoji: "💣",
  color: "linear-gradient(135deg,#111827,#ef4444 65%,#facc15)",
  blurb: "Type a word containing the syllable before the bomb explodes.",
  minPlayers: 2,
  maxPlayers: 8,
  modes: ["local", "online"],
  lobbySettings: [
    { key: "fuseSeconds", label: "Starting fuse (sec)", type: "number", min: 3, max: 120, default: 20 },
    { key: "reduceBySeconds", label: "Reduce timer by (each bomb)", type: "number", min: 0, max: 30, default: 1 },
    { key: "timerMode", label: "Timer mode", type: "choice", options: ["Per bomb", "Per word"], default: "Per bomb" },
  ],
  estMinutes: 8,
  rulesHTML: `
    <p>A syllable appears, like <b>tri</b> or <b>sp</b>. The active player must type a word containing it before time runs out.</p>
    <ol>
      <li>Words must contain the syllable and be at least 3 letters.</li>
      <li>No repeated words in the same bomb.</li>
      <li>A valid word passes the bomb to the next player with a fresh syllable.</li>
      <li>If the bomb explodes on you, you lose a life.</li>
    </ol>
    <p><b>Per bomb</b> keeps one fuse burning across every handoff. <b>Per word</b> gives each player a fresh countdown.</p>
    <p>Each new bomb can start with less time if you set <b>Reduce timer by</b>. In per-word mode, that same amount is also shaved off after every valid word.</p>
    <p class="muted">On one device, tap to start the fuse, tap again when you've said a word — no typing.</p>`,
  mount(ctx) { ctx.mode === "online" ? online(ctx) : local(ctx); },
};

function validateWord(word, syllable, used) {
  const w = norm(word);
  if (w.length < 3) return "Use at least 3 letters.";
  if (!w.includes(syllable)) return `Word must contain "${syllable}".`;
  if (used.has(w)) return "That word was already used.";
  return "";
}

function livesBar(names, lives) {
  return el("div", { class: "scorebar" }, names.map((name, i) => scoreChip(lives[i], name)));
}

function bombTimer(deadline, onExpire) {
  const fill = el("i");
  const text = el("b", {}, "");
  const node = el("div", { class: "bomb-timer" }, [fill, text]);
  let done = false;
  const duration = Math.max(1, deadline - Date.now());
  const tick = () => {
    const left = Math.max(0, deadline - Date.now());
    fill.style.width = `${Math.max(0, Math.min(100, (left / duration) * 100))}%`;
    text.textContent = `${Math.ceil(left / 1000)}s`;
    if (left <= 0 && !done) {
      done = true;
      clearInterval(id);
      onExpire && onExpire();
    }
  };
  const id = setInterval(tick, 100);
  tick();
  node.stop = () => clearInterval(id);
  return node;
}

function bombTimerStatic(seconds) {
  const label = el("b", {}, `${Math.max(1, Math.ceil(seconds))}s`);
  return el("div", { class: "bomb-timer paused" }, [el("i", { style: "width:100%" }), label]);
}

function localTapScreen({ names, lives, active, syllable, timerNode, hint, onTap }) {
  return el("div", { class: "screen bomb-tap-screen" }, [
    livesBar(names, lives),
    el("button", { class: "bomb-tap-card", type: "button", onClick: onTap }, [
      el("div", { class: "bomb-emoji" }, "💣"),
      timerNode,
      el("div", { class: "bomb-syllable" }, syllable),
      el("strong", { class: "bomb-tap-name" }, names[active]),
      el("span", { class: "bomb-tap-hint" }, hint),
    ]),
  ]);
}

function localBoomScreen(names, lives, loser) {
  haptic([20, 50, 20]);
  const alive = lives.map((life, i) => life > 0 ? i : -1).filter((i) => i >= 0);
  if (alive.length === 1) celebrate();
  return el("div", { class: "screen" }, [
    livesBar(names, lives),
    el("div", { class: "bomb-card exploded" }, [
      el("div", { class: "bomb-emoji" }, "💥"),
      el("div", { class: "verdict nomatch" }, `${names[loser]} lost a life`),
      alive.length === 1 ? el("div", { class: "verdict match" }, `${names[alive[0]]} wins!`) : null,
      el("p", { class: "muted center tiny" }, "Next bomb starting…"),
    ]),
  ]);
}

function turnScreen({ names, lives, active, syllable, deadline, used, canType, onSubmit, onExpire, error }) {
  const input = el("input", {
    class: "field bomb-input",
    placeholder: `word with ${syllable}`,
    autocomplete: "off",
    autocapitalize: "none",
    spellcheck: "false",
    maxlength: "32",
  });
  const submit = () => onSubmit(input.value);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  setTimeout(() => { if (canType) input.focus(); }, 40);
  return el("div", { class: "screen" }, [
    livesBar(names, lives),
    el("div", { class: "bomb-card" }, [
      el("div", { class: "bomb-emoji" }, "💣"),
      bombTimer(deadline, onExpire),
      el("div", { class: "bomb-syllable" }, syllable),
      el("p", { class: "muted center" }, `${names[active]}'s turn`),
      canType ? el("div", { class: "stack" }, [
        input,
        error ? el("div", { class: "verdict nomatch" }, error) : null,
        button("Submit word", { big: true, onClick: submit }),
      ]) : el("div", { class: "waiting" }, [el("div", { class: "spinner" }), "Bomb is on the other phone..."]),
    ]),
    used.size ? el("p", { class: "muted center tiny" }, `${used.size} words used this bomb`) : null,
  ]);
}

function boomScreen(names, lives, loser, nextNode) {
  haptic([20, 50, 20]);
  const alive = lives.map((life, i) => life > 0 ? i : -1).filter((i) => i >= 0);
  if (alive.length === 1) celebrate();
  return el("div", { class: "screen" }, [
    livesBar(names, lives),
    el("div", { class: "bomb-card exploded" }, [
      el("div", { class: "bomb-emoji" }, "💥"),
      el("div", { class: "verdict nomatch" }, `${names[loser]} lost a life`),
      alive.length === 1 ? el("div", { class: "verdict match" }, `${names[alive[0]]} wins!`) : null,
    ]),
    el("div", { class: "footer-actions" }, nextNode),
  ]);
}

function online(ctx) {
  const { session } = ctx;
  const isHost = session.isHost;
  const myIdx = session.myIndex;
  const names = session.players;
  const cfg = fuseConfig(session.settings);
  const status = connectionPill();
  session.onStatus(status.set);
  const screen = (body) => render(el("div", { class: "screen" }, [gameHeader(ctx, game, status.node), body]));
  let lives = names.map(() => 3);
  let active = 0;
  let round = 0;
  let used = new Set();
  let syllable = randomSyllable();
  let deadline = Date.now();
  let phase = "turn";
  let timerToken = 0;
  let bombDeadline = 0;
  let wordCount = 0;
  let bombRound = 0;
  setGameCleanup(() => { timerToken++; phase = "disposed"; });

  function nextAlive(from) {
    let next = from;
    do { next = (next + 1) % names.length; } while (lives[next] <= 0);
    return next;
  }

  function startBomb(startActive = active) {
    used = new Set();
    wordCount = 0;
    active = startActive;
    bombDeadline = cfg.timerMode === "Per bomb"
      ? Date.now() + fuseDurationMs(cfg, { bombRound })
      : 0;
    startTurn(active);
  }

  function startTurn(startActive = active) {
    if (!isHost) return;
    phase = "turn";
    active = lives[startActive] > 0 ? startActive : nextAlive(startActive);
    syllable = randomSyllable();
    deadline = cfg.timerMode === "Per bomb"
      ? bombDeadline
      : Date.now() + fuseDurationMs(cfg, { bombRound, wordsThisBomb: wordCount });
    round++;
    timerToken++;
    const token = timerToken;
    session.send("bp_turn", { round, active, syllable, duration: deadline - Date.now(), lives, used: Array.from(used) });
    showTurn();
    setTimeout(() => {
      if (token === timerToken && phase === "turn") explode(active);
    }, deadline - Date.now() + 80);
  }

  function showTurn(error = "") {
    screen(turnScreen({
      names,
      lives,
      active,
      syllable,
      deadline,
      used,
      canType: active === myIdx,
      error,
      onExpire: () => {},
      onSubmit: (word) => {
        if (isHost) handleSubmit({ round, player: myIdx, word });
        else session.send("bp_submit", { round, player: myIdx, word });
      },
    }));
  }

  function handleSubmit(m) {
    if (!isHost || phase !== "turn" || m.round !== round || m.player !== active) return;
    const clean = norm(m.word);
    const err = validateWord(clean, syllable, used);
    if (err) {
      if (m.player === 0) showTurn(err);
      else session.sendTo(m.player, "bp_invalid", { round, error: err });
      return;
    }
    used.add(clean);
    wordCount++;
    haptic(10);
    startTurn(nextAlive(active));
  }

  function explode(loser) {
    if (!isHost || phase !== "turn") return;
    phase = "boom";
    timerToken++;
    lives[loser] = Math.max(0, lives[loser] - 1);
    const payload = { round, loser, lives };
    session.send("bp_boom", payload);
    showBoom(payload);
  }

  function nextAfterBoom() {
    const alive = lives.map((life, i) => life > 0 ? i : -1).filter((i) => i >= 0);
    if (alive.length <= 1) {
      const winner = alive[0] ?? 0;
      lives = names.map(() => 3);
      active = (winner + 1) % names.length;
      bombRound = 0;
    } else {
      active = nextAlive(active);
      bombRound++;
    }
    startBomb(active);
  }

  function showBoom(p) {
    lives = p.lives;
    phase = "boom";
    const ready = onlineReadyGate(session, `bp:${p.round}`, () => {
      if (isHost) nextAfterBoom();
    }, { label: "Ready ->" });
    screen(boomScreen(names, lives, p.loser, ready));
  }

  session.on("bp_turn", (m) => {
    phase = "turn";
    round = m.round;
    active = m.active;
    syllable = m.syllable;
    deadline = Date.now() + m.duration;
    lives = m.lives;
    used = new Set(m.used || []);
    showTurn();
  });
  session.on("bp_invalid", (m) => { if (m.round === round) showTurn(m.error); });
  session.on("bp_submit", handleSubmit);
  session.on("bp_boom", showBoom);

  if (isHost) startBomb(0);
  else screen(el("div", { class: "waiting" }, [el("div", { class: "spinner" }), "Waiting for the host to start..."]));
}

function local(ctx) {
  const names = ctx.players;
  const cfg = fuseConfig(ctx.settings || ctx.session?.settings);
  const statusEl = pill(`${names.length} players · tap`);
  const screen = (body) => render(el("div", { class: "screen" }, [gameHeader(ctx, game, statusEl), body]));
  let lives = names.map(() => 3);
  let active = 0;
  let syllable = randomSyllable();
  let timer = null;
  let turnDeadline = 0;
  let bombDeadline = 0;
  let wordCount = 0;
  let bombRound = 0;
  let fuseStarted = false;
  let boomTimer = null;

  function nextAlive(from) {
    let i = from;
    do { i = (i + 1) % names.length; } while (lives[i] <= 0);
    return i;
  }
  function stopTimer() {
    if (timer?.stop) timer.stop();
    timer = null;
  }
  function turnFuseSec() {
    return Math.max(cfg.minSec, fuseDurationMs(cfg, { bombRound, wordsThisBomb: wordCount }) / 1000);
  }
  function clearBoomTimer() {
    if (boomTimer) clearTimeout(boomTimer);
    boomTimer = null;
  }
  setGameCleanup(() => { stopTimer(); clearBoomTimer(); });

  function showTurn() {
    stopTimer();
    const running = fuseStarted;
    const deadline = cfg.timerMode === "Per bomb" ? bombDeadline : turnDeadline;
    const timerNode = running
      ? bombTimer(deadline, explode)
      : bombTimerStatic(turnFuseSec());
    if (timerNode.stop) timer = timerNode;
    const hint = running
      ? "Tap when you've said a word"
      : "Tap to start the fuse";
    screen(localTapScreen({
      names,
      lives,
      active,
      syllable,
      timerNode,
      hint,
      onTap: handleTap,
    }));
  }

  function handleTap() {
    if (!fuseStarted) {
      fuseStarted = true;
      if (cfg.timerMode === "Per bomb") {
        bombDeadline = Date.now() + fuseDurationMs(cfg, { bombRound });
      } else {
        turnDeadline = Date.now() + fuseDurationMs(cfg, { bombRound, wordsThisBomb: wordCount });
      }
      showTurn();
      return;
    }
    passTurn();
  }

  function passTurn() {
    wordCount++;
    active = nextAlive(active);
    syllable = randomSyllable();
    if (cfg.timerMode === "Per bomb") {
      if (Date.now() >= bombDeadline) {
        explode();
        return;
      }
    } else {
      turnDeadline = Date.now() + fuseDurationMs(cfg, { bombRound, wordsThisBomb: wordCount });
    }
    showTurn();
  }

  function startBomb(startActive = active) {
    clearBoomTimer();
    stopTimer();
    active = startActive;
    wordCount = 0;
    fuseStarted = false;
    bombDeadline = 0;
    turnDeadline = 0;
    syllable = randomSyllable();
    showTurn();
  }

  function continueAfterBoom(loser) {
    clearBoomTimer();
    const alive = lives.map((life, i) => life > 0 ? i : -1).filter((i) => i >= 0);
    if (alive.length <= 1) {
      lives = names.map(() => 3);
      bombRound = 0;
      startBomb((loser + 1) % names.length);
      return;
    }
    bombRound++;
    startBomb(nextAlive(active));
  }

  function explode() {
    stopTimer();
    lives[active] = Math.max(0, lives[active] - 1);
    const loser = active;
    screen(localBoomScreen(names, lives, loser));
    boomTimer = setTimeout(() => continueAfterBoom(loser), 2200);
  }

  startBomb(0);
}

export default game;
