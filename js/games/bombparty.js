// "JKLM BombParty" - type a word containing the syllable before the bomb pops.

import { el, render, button, pill, connectionPill, gameHeader, passDevice, scoreChip, haptic, celebrate, onlineReadyGate, localReadyGate } from "../ui.js";

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
const randomDuration = () => 12000 + Math.floor(Math.random() * 11000);

const game = {
  id: "bombparty",
  title: "JKLM BombParty",
  emoji: "💣",
  color: "linear-gradient(135deg,#111827,#ef4444 65%,#facc15)",
  blurb: "Type a word containing the syllable before the bomb explodes.",
  minPlayers: 2,
  maxPlayers: 8,
  modes: ["local", "online"],
  estMinutes: 8,
  rulesHTML: `
    <p>A syllable appears, like <b>tri</b> or <b>sp</b>. The active player must type a word containing it before time runs out.</p>
    <ol>
      <li>Words must contain the syllable and be at least 3 letters.</li>
      <li>No repeated words in the same bomb.</li>
      <li>A valid word passes the bomb to the next player with a fresh syllable.</li>
      <li>If the bomb explodes on you, you lose a life.</li>
    </ol>`,
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
  const myIdx = isHost ? 0 : 1;
  const names = session.players;
  const status = connectionPill();
  session.onStatus(status.set);
  const screen = (body) => render(el("div", { class: "screen" }, [gameHeader(ctx, game, status.node), body]));
  let lives = [3, 3];
  let active = 0;
  let round = 0;
  let used = new Set();
  let syllable = randomSyllable();
  let deadline = Date.now();
  let phase = "turn";
  let timerToken = 0;

  function startTurn(startActive = active) {
    if (!isHost) return;
    phase = "turn";
    active = startActive;
    syllable = randomSyllable();
    deadline = Date.now() + randomDuration();
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
      else session.send("bp_invalid", { round, error: err });
      return;
    }
    used.add(clean);
    haptic(10);
    startTurn(1 - active);
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
    used = new Set();
    const alive = lives.map((life, i) => life > 0 ? i : -1).filter((i) => i >= 0);
    if (alive.length <= 1) {
      lives = [3, 3];
      active = alive[0] === 0 ? 1 : 0;
    }
    startTurn(active);
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

  if (isHost) startTurn(0);
  else screen(el("div", { class: "waiting" }, [el("div", { class: "spinner" }), `Waiting for ${session.partnerName} to start...`]));
}

function local(ctx) {
  const names = ctx.players;
  const statusEl = pill(`${names.length} players`);
  const screen = (body) => render(el("div", { class: "screen" }, [gameHeader(ctx, game, statusEl), body]));
  let lives = names.map(() => 3);
  let active = 0;
  let used = new Set();
  let syllable = randomSyllable();
  let deadline = Date.now();
  let timer = null;

  function nextAlive(from) {
    let i = from;
    do { i = (i + 1) % names.length; } while (lives[i] <= 0);
    return i;
  }
  async function showTurn(error = "") {
    if (timer?.stop) timer.stop();
    await passDevice(names[active], "The bomb is yours");
    syllable = randomSyllable();
    deadline = Date.now() + randomDuration();
    const body = turnScreen({
      names,
      lives,
      active,
      syllable,
      deadline,
      used,
      canType: true,
      error,
      onExpire: () => explode(),
      onSubmit: (word) => {
        const clean = norm(word);
        const err = validateWord(clean, syllable, used);
        if (err) { showTurn(err); return; }
        used.add(clean);
        active = nextAlive(active);
        showTurn();
      },
    });
    timer = body.querySelector(".bomb-timer");
    screen(body);
  }
  function explode() {
    if (timer?.stop) timer.stop();
    lives[active] = Math.max(0, lives[active] - 1);
    const loser = active;
    const alive = lives.map((life, i) => life > 0 ? i : -1).filter((i) => i >= 0);
    const next = alive.length <= 1
      ? localReadyGate(names, () => { lives = names.map(() => 3); used = new Set(); active = 0; showTurn(); }, { label: "ready" })
      : localReadyGate(names, () => { used = new Set(); active = nextAlive(active); showTurn(); }, { label: "ready" });
    screen(boomScreen(names, lives, loser, next));
  }
  showTurn();
}

export default game;
