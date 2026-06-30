// "JKLM BombParty" — say a word with the syllable before the bomb pops. Tap to play.

import { el, render, pill, connectionPill, gameHeader, scoreChip, haptic, celebrate, onlineReadyGate, setGameCleanup } from "../ui.js";

const SYLLABLES = [
  "ab", "ac", "ad", "al", "am", "an", "ap", "ar", "at", "be", "bi", "bo", "br",
  "ca", "ce", "ch", "co", "cr", "de", "di", "do", "dr", "el", "en", "er", "fa",
  "fi", "fo", "fr", "ga", "go", "gr", "ha", "he", "hi", "in", "jo", "la", "le",
  "li", "lo", "ma", "me", "mi", "mo", "na", "ne", "ni", "no", "or", "pa", "pe",
  "pi", "pl", "po", "pr", "ra", "re", "ri", "ro", "sa", "se", "sh", "si", "so",
  "sp", "st", "ta", "te", "th", "ti", "to", "tr", "un", "ve", "wa", "wi",
];

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

function fuseSeconds(cfg, state) {
  return fuseDurationMs(cfg, state) / 1000;
}

const game = {
  id: "bombparty",
  title: "JKLM BombParty",
  emoji: "💣",
  color: "linear-gradient(135deg,#111827,#ef4444 65%,#facc15)",
  blurb: "Say a word with the syllable before the bomb explodes — tap to pass!",
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
    <p>A syllable appears, like <b>tri</b> or <b>sp</b>. The active player says a word containing it out loud, then taps to pass the bomb.</p>
    <ol>
      <li><b>First tap</b> starts the fuse (unless per-word mode auto-started it on you).</li>
      <li><b>Second tap</b> means you said a valid word — bomb goes to the next player.</li>
      <li>If the bomb explodes on you, you lose a life.</li>
    </ol>
    <p><b>Per bomb</b> keeps one fuse burning across every handoff. <b>Per word</b> gives each player a fresh countdown.</p>
    <p>Each new bomb can start with less time if you set <b>Reduce timer by</b>.</p>`,
  mount(ctx) {
    const mode = ctx.mode || ctx.session?.mode || "local";
    mode === "online" ? online(ctx) : local(ctx);
  },
};

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
      onExpire?.();
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

function tapTurnScreen({ names, lives, active, syllable, timerNode, hint, onTap }) {
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

function tapWaitingScreen({ names, lives, active, syllable, timerNode }) {
  return el("div", { class: "screen bomb-tap-screen" }, [
    livesBar(names, lives),
    el("div", { class: "bomb-tap-card bomb-tap-waiting" }, [
      el("div", { class: "bomb-emoji" }, "💣"),
      timerNode,
      el("div", { class: "bomb-syllable" }, syllable),
      el("strong", { class: "bomb-tap-name" }, names[active]),
      el("div", { class: "waiting compact-wait" }, [el("div", { class: "spinner" }), `${names[active]}'s turn…`]),
    ]),
  ]);
}

function autoBoomScreen(names, lives, loser) {
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
  let syllable = randomSyllable();
  let phase = "turn";
  let timerToken = 0;
  let bombDeadline = 0;
  let turnDeadline = 0;
  let wordCount = 0;
  let bombRound = 0;
  let fuseStarted = false;
  setGameCleanup(() => { timerToken++; phase = "disposed"; });

  function nextAlive(from) {
    let next = from;
    do { next = (next + 1) % names.length; } while (lives[next] <= 0);
    return next;
  }

  function currentDeadline() {
    return cfg.timerMode === "Per bomb" ? bombDeadline : turnDeadline;
  }

  function scheduleExplode() {
    if (!isHost || !fuseStarted) return;
    timerToken++;
    const token = timerToken;
    const ms = Math.max(0, currentDeadline() - Date.now());
    setTimeout(() => {
      if (token === timerToken && phase === "turn" && fuseStarted) explode(active);
    }, ms + 80);
  }

  function publishTurn() {
    const duration = fuseStarted
      ? Math.max(0, currentDeadline() - Date.now())
      : fuseDurationMs(cfg, { bombRound, wordsThisBomb: wordCount });
    session.send("bp_turn", {
      round,
      active,
      syllable,
      lives,
      bombRound,
      wordCount,
      fuseStarted,
      duration,
    });
    showTurn(duration);
    if (isHost) scheduleExplode();
  }

  function showTurn(duration = fuseStarted ? Math.max(0, currentDeadline() - Date.now()) : fuseDurationMs(cfg, { bombRound, wordsThisBomb: wordCount })) {
    const running = fuseStarted;
    const timerNode = running
      ? bombTimer(Date.now() + duration, () => {})
      : bombTimerStatic(fuseSeconds(cfg, { bombRound, wordsThisBomb: wordCount }));
    const hint = running ? "Tap when you've said a word" : "Tap to start the fuse";
    if (active === myIdx) {
      screen(tapTurnScreen({
        names, lives, active, syllable, timerNode, hint,
        onTap: () => {
          if (isHost) handleTap({ round, player: myIdx });
          else session.send("bp_tap", { round, player: myIdx });
        },
      }));
      return;
    }
    screen(tapWaitingScreen({ names, lives, active, syllable, timerNode }));
  }

  function startBomb(startActive = active) {
    if (!isHost) return;
    wordCount = 0;
    fuseStarted = false;
    bombDeadline = 0;
    turnDeadline = 0;
    active = startActive;
    syllable = randomSyllable();
    round++;
    phase = "turn";
    publishTurn();
  }

  function handleTap(m) {
    if (!isHost || phase !== "turn" || m.round !== round || m.player !== active) return;
    if (!fuseStarted) {
      fuseStarted = true;
      if (cfg.timerMode === "Per bomb") {
        bombDeadline = Date.now() + fuseDurationMs(cfg, { bombRound });
      } else {
        turnDeadline = Date.now() + fuseDurationMs(cfg, { bombRound, wordsThisBomb: wordCount });
      }
      publishTurn();
      return;
    }
    wordCount++;
    haptic(10);
    active = nextAlive(active);
    syllable = randomSyllable();
    if (cfg.timerMode === "Per bomb") {
      if (Date.now() >= bombDeadline) {
        explode(m.player);
        return;
      }
    } else {
      fuseStarted = true;
      turnDeadline = Date.now() + fuseDurationMs(cfg, { bombRound, wordsThisBomb: wordCount });
    }
    round++;
    publishTurn();
  }

  function explode(loser) {
    if (!isHost || phase !== "turn") return;
    phase = "boom";
    timerToken++;
    fuseStarted = false;
    lives[loser] = Math.max(0, lives[loser] - 1);
    const payload = { round, loser, lives };
    session.send("bp_boom", payload);
    showBoom(payload);
  }

  function nextAfterBoom() {
    const alive = lives.map((life, i) => life > 0 ? i : -1).filter((i) => i >= 0);
    if (alive.length <= 1) {
      lives = names.map(() => 3);
      bombRound = 0;
      startBomb(((alive[0] ?? 0) + 1) % names.length);
    } else {
      bombRound++;
      startBomb(nextAlive(active));
    }
  }

  function showBoom(p) {
    lives = p.lives;
    phase = "boom";
    fuseStarted = false;
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
    lives = m.lives;
    bombRound = m.bombRound ?? bombRound;
    wordCount = m.wordCount ?? 0;
    fuseStarted = !!m.fuseStarted;
    if (fuseStarted && cfg.timerMode === "Per bomb") bombDeadline = Date.now() + m.duration;
    if (fuseStarted && cfg.timerMode === "Per word") turnDeadline = Date.now() + m.duration;
    showTurn(m.duration);
  });
  session.on("bp_tap", handleTap);
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
      : bombTimerStatic(fuseSeconds(cfg, { bombRound, wordsThisBomb: wordCount }));
    if (timerNode.stop) timer = timerNode;
    const hint = running ? "Tap when you've said a word" : "Tap to start the fuse";
    screen(tapTurnScreen({
      names, lives, active, syllable, timerNode, hint, onTap: handleTap,
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
    wordCount++;
    haptic(10);
    active = nextAlive(active);
    syllable = randomSyllable();
    if (cfg.timerMode === "Per bomb") {
      if (Date.now() >= bombDeadline) {
        explode();
        return;
      }
    } else {
      fuseStarted = true;
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
    screen(autoBoomScreen(names, lives, loser));
    boomTimer = setTimeout(() => continueAfterBoom(loser), 2200);
  }

  startBomb(0);
}

export default game;
