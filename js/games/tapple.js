// "Letter Rush" — Tapple-style category + A–Z race against the clock.
import { el, render, button, gameHeader, passDevice, segmented, scoreChip, shuffle, celebrate, haptic, localReadyGate, onlineReadyGate, connectionPill, scoreboard, setGameCleanup } from "../ui.js";
import { TAPPLE_THEMES, LETTERS } from "../data/tapple-themes.js";

const game = {
  id: "tapple",
  title: "Letter Rush",
  emoji: "⏱️",
  color: "linear-gradient(135deg,#ff9a3c,#ff5e62)",
  blurb: "Name things in a category — tap a letter before time runs out!",
  minPlayers: 2,
  maxPlayers: 8,
  modes: ["local", "online"],
  lobbySettings: [{ key: "timer", label: "Seconds per turn", type: "choice", options: [8, 10, 15, 20], default: 10 }],
  estMinutes: 15,
  rulesHTML: `
    <p>A category appears (e.g. <b>Animals</b>). Letters A–Z stay on the board.</p>
    <ol>
      <li>On your turn, <b>say out loud</b> something in the category for a letter.</li>
      <li><b>Tap that letter</b> — it disappears and the next player's turn starts.</li>
      <li>Run out of time? You lose a life ☠️</li>
      <li>Three strikes and you're out. Last player standing wins the round!</li>
    </ol>
    <p class="muted">No typing — just shout it and tap. Pick your timer speed before you start.</p>`,
  mount(ctx) { if (ctx.mode === "online") online(ctx); else local(ctx); },
};

function online(ctx) {
  const { session } = ctx;
  const names = session.players;
  const scores = names.map(() => 0);
  const timerSec = Number(session.settings.timer) || 10;
  const strikesMax = 3;
  let themes = shuffle(TAPPLE_THEMES);
  let themeIndex = 0;
  let round = 0;
  let theme = "";
  let strikes = names.map(() => 0);
  let alive = names.map((_, i) => i);
  let letters = LETTERS.slice();
  let active = 0;
  let deadline = 0;
  let token = 0;
  setGameCleanup(() => { token++; });
  const status = connectionPill();
  session.onStatus(status.set);
  const screen = (body) => render(el("div", { class: "screen" }, [gameHeader(ctx, game, status.node), body]));

  function state() {
    return { round, theme, strikes: strikes.slice(), alive: alive.slice(), letters: letters.slice(), active, duration: Math.max(0, deadline - Date.now()), scores: scores.slice() };
  }

  function nextAlive(current) {
    const position = alive.indexOf(current);
    return alive[(position + 1 + alive.length) % alive.length];
  }

  function startRound() {
    if (!session.isHost) return;
    if (themeIndex >= themes.length) { themes = shuffle(TAPPLE_THEMES); themeIndex = 0; }
    round++;
    theme = themes[themeIndex++];
    strikes = names.map(() => 0);
    alive = names.map((_, i) => i);
    letters = LETTERS.slice();
    active = (round - 1) % names.length;
    startTurn();
  }

  function startTurn() {
    if (!session.isHost) return;
    deadline = Date.now() + timerSec * 1000;
    const myToken = ++token;
    const payload = state();
    session.send("tapple_state", payload);
    showState(payload);
    setTimeout(() => { if (myToken === token) bust(active); }, timerSec * 1000 + 80);
  }

  function useLetter(letter, player) {
    if (!session.isHost || player !== active || !letters.includes(letter)) return;
    token++;
    letters = letters.filter((item) => item !== letter);
    haptic(10);
    if (!letters.length) return endRound(active, true);
    active = nextAlive(active);
    startTurn();
  }

  function bust(player) {
    if (!session.isHost || player !== active) return;
    token++;
    strikes[player]++;
    if (strikes[player] >= strikesMax) alive = alive.filter((index) => index !== player);
    if (alive.length <= 1) return endRound(alive[0] ?? -1, false);
    active = alive.includes(player) ? nextAlive(player) : alive[0];
    startTurn();
  }

  function endRound(winner, cleared) {
    token++;
    if (winner >= 0) scores[winner]++;
    const payload = { ...state(), winner, cleared };
    session.send("tapple_end", payload);
    showEnd(payload);
  }

  function timerNode(duration) {
    const number = el("div", { class: "timer-num" }, String(Math.ceil(duration / 1000)));
    const fill = el("i", { style: "width:100%" });
    const bar = el("div", { class: "timer-bar" }, fill);
    const started = Date.now();
    const id = setInterval(() => {
      if (!number.isConnected) { clearInterval(id); return; }
      const left = Math.max(0, duration - (Date.now() - started));
      number.textContent = String(Math.ceil(left / 1000));
      fill.style.width = `${(left / duration) * 100}%`;
      if (!left) clearInterval(id);
    }, 100);
    return el("div", {}, [number, bar]);
  }

  function showState(payload) {
    round = payload.round; theme = payload.theme; strikes = payload.strikes; alive = payload.alive;
    letters = payload.letters; active = payload.active; deadline = Date.now() + payload.duration;
    const canPlay = session.myIndex === active;
    screen(el("div", { class: "screen" }, [
      scoreboard(names, payload.scores, { activeIndex: active, colors: ctx.playerColors }),
      el("div", { class: "card" }, [
        el("div", { class: "kicker" }, "Category"),
        el("div", { class: "q-big" }, theme),
        el("div", { class: "pill center" }, `${names[active]}'s turn`),
        timerNode(payload.duration),
        el("div", { class: "letter-grid" }, letters.map((letter) => el("button", {
          class: "letter-cell", type: "button", disabled: !canPlay,
          onClick: () => { if (session.isHost) useLetter(letter, session.myIndex); else session.send("tapple_letter", { round, letter }); },
        }, letter))),
      ]),
      el("p", { class: "muted center tiny" }, canPlay ? "Say an answer aloud, then tap its letter." : `${names[active]} has the board.`),
    ]));
  }

  function showEnd(payload) {
    if (payload.winner >= 0) celebrate();
    screen(el("div", { class: "screen" }, [
      el("div", { class: "card center" }, [
        el("div", { class: "verdict match" }, payload.cleared ? "Board cleared" : "Round over"),
        el("p", {}, payload.winner >= 0 ? `${names[payload.winner]} wins the round.` : "Nobody survived the round."),
        el("p", { class: "muted" }, `Category: ${payload.theme}`),
      ]),
      scoreboard(names, payload.scores, { colors: ctx.playerColors }),
      el("div", { class: "footer-actions" }, onlineReadyGate(session, `tapple:${payload.round}`, startRound, { label: "Ready for next" })),
    ]));
  }

  session.on("tapple_state", (message) => { if (!session.isHost) showState(message); });
  session.on("tapple_letter", (message) => { if (session.isHost && message.round === round) useLetter(message.letter, message.from); });
  session.on("tapple_end", (message) => { if (!session.isHost) showEnd(message); });

  if (session.isHost) startRound();
  else screen(el("div", { class: "waiting" }, [el("div", { class: "spinner" }), "Waiting for the host to start"]));
}

function local(ctx) {
  const names = ctx.players;
  let timerSec = 10;
  const strikesMax = 3;
  let themes = shuffle(TAPPLE_THEMES);
  let ti = 0;
  const scores = names.map(() => 0);
  const statusEl = el("span", { class: "pill" }, `${names.length} players`);
  const screen = (b) => render(el("div", { class: "screen" }, [gameHeader(ctx, game, statusEl), b]));

  function setup() {
    const timerSeg = segmented(
      [{ value: 8, label: "8 sec" }, { value: 10, label: "10 sec" }, { value: 15, label: "15 sec" }, { value: 20, label: "20 sec" }],
      timerSec, (v) => { timerSec = v; });
    screen(el("div", { class: "screen" }, [
      el("div", { class: "hero" }, [el("h2", {}, "⏱️ Letter Rush"), el("div", { class: "tag muted" }, "Category + alphabet chaos")]),
      el("div", { class: "card stack" }, [
        el("p", { class: "muted center" }, "Seconds per turn"),
        timerSeg.node,
        el("p", { class: "muted center tiny" }, `${strikesMax} strikes and you're out`),
      ]),
      el("div", { class: "footer-actions" }, button("Start game →", { big: true, onClick: () => { timerSec = timerSeg.get(); playRound(); } })),
    ]));
  }

  async function playRound() {
    if (ti >= themes.length) { themes = shuffle(TAPPLE_THEMES); ti = 0; }
    const theme = themes[ti++];
    let alive = names.map((_, i) => i);
    let strikes = names.map(() => 0);
    let left = LETTERS.slice();
    let turnIdx = 0;
    let timerId = null;
    let leftSec = timerSec;

    function clearTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }
    setGameCleanup(clearTimer);

    function bust() {
      clearTimer();
      haptic([30, 40, 30]);
      const p = alive[turnIdx % alive.length];
      strikes[p]++;
      if (strikes[p] >= strikesMax) {
        alive = alive.filter((i) => i !== p);
        if (alive.length <= 1) return endRound(alive[0] ?? -1);
        turnIdx = turnIdx % alive.length;
      } else {
        turnIdx = (turnIdx + 1) % alive.length;
      }
      drawPlay();
    }

    function useLetter(L) {
      if (!left.includes(L)) return;
      clearTimer();
      haptic(12);
      left = left.filter((x) => x !== L);
      const p = alive[turnIdx % alive.length];
      if (left.length === 0) {
        celebrate();
        return endRound(p, true);
      }
      turnIdx = (turnIdx + 1) % alive.length;
      drawPlay();
    }

    function drawPlay() {
      clearTimer();
      if (alive.length <= 1) return endRound(alive[0] ?? -1);
      const p = alive[turnIdx % alive.length];
      leftSec = timerSec;

      const timerBar = el("div", { class: "timer-bar" }, el("i", { style: "width:100%" }));
      const timerNum = el("div", { class: "timer-num" }, String(leftSec));

      const letterGrid = el("div", { class: "letter-grid" });
      left.forEach((L) => {
        letterGrid.append(el("button", {
          class: "letter-cell",
          type: "button",
          onClick: () => useLetter(L),
        }, L));
      });

      timerId = setInterval(() => {
        leftSec--;
        timerNum.textContent = String(leftSec);
        timerBar.firstChild.style.width = `${(leftSec / timerSec) * 100}%`;
        if (leftSec <= 0) bust();
      }, 1000);

      screen(el("div", { class: "screen" }, [
        el("div", { class: "card" }, [
          el("div", { class: "kicker" }, "Category"),
          el("div", { class: "q-big" }, theme),
          el("div", { class: "pill center", style: "margin:8px 0" }, `${names[p]} — say it, then tap`),
          timerNum,
          timerBar,
          letterGrid,
        ]),
        el("p", { class: "muted center tiny" }, `${left.length} letters left · ${alive.length} players in`),
      ]));
    }

    function endRound(winnerIdx, cleared) {
      clearTimer();
      if (winnerIdx >= 0) scores[winnerIdx]++;
      screen(el("div", { class: "screen" }, [
        el("div", { class: "card center" }, [
          el("div", { class: "verdict match" }, cleared ? "🎯 Board cleared!" : "🏆 Round over"),
          el("p", {}, winnerIdx >= 0 ? `${names[winnerIdx]} wins the round!` : "Everyone busted out!"),
          el("p", { class: "muted" }, `Category was: ${theme}`),
        ]),
        el("div", { class: "scorebar" }, names.map((n, i) => scoreChip(scores[i], n))),
        el("div", { class: "footer-actions" }, [
          localReadyGate(names, playRound, { label: "ready" }),
          button("New settings", { variant: "ghost", onClick: setup }),
        ]),
      ]));
    }

    await passDevice(names[alive[0]], `Category: "${theme}" — ${names[alive[0]]} starts!`);
    drawPlay();
  }

  setup();
}

export default game;
