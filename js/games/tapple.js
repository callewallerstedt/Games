// "Letter Rush" — Tapple-style category + A–Z race against the clock.
import { el, render, button, gameHeader, passDevice, segmented, scoreChip, shuffle, celebrate, haptic } from "../ui.js";
import { TAPPLE_THEMES, LETTERS } from "../data/tapple-themes.js";

const game = {
  id: "tapple",
  title: "Letter Rush",
  emoji: "⏱️",
  color: "linear-gradient(135deg,#ff9a3c,#ff5e62)",
  blurb: "Name things in a category — tap a letter before time runs out!",
  minPlayers: 2,
  maxPlayers: 8,
  modes: ["local"],
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
  mount(ctx) { local(ctx); },
};

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
        scores[p]++;
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
          button("Next round ↻", { big: true, onClick: playRound }),
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
