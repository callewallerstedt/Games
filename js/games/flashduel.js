// "Flash Duel" — two players face each other across one phone and race the signal.

import { el, render, button, gameHeader, segmented, scoreChip, celebrate, haptic } from "../ui.js";

const game = {
  id: "flashduel",
  title: "Flash Duel",
  emoji: "⚡",
  color: "linear-gradient(135deg,#f97316,#facc15 48%,#22c55e)",
  blurb: "Face-to-face reflex combat — wait through the fake-outs, then strike first.",
  minPlayers: 2,
  maxPlayers: 2,
  modes: ["local"],
  localLabel: "One phone (face to face)",
  localSetupTag: "One phone — place it between you.",
  estMinutes: 5,
  rulesHTML: `
    <p>Put the phone between you. One player takes each end.</p>
    <ol>
      <li>Rest a finger near your own large tap pad.</li>
      <li>When the center says <b>WAIT</b> or <b>HOLD</b>, do not touch anything.</li>
      <li>When it flashes green and says <b>TAP!</b>, hit your pad first.</li>
      <li>A false start immediately gives the point to your opponent.</li>
    </ol>
    <p class="muted">The top player's controls are rotated so both players can read from opposite sides of the phone.</p>`,
  mount(ctx) { local(ctx); },
};

function local(ctx) {
  const names = ctx.players;
  const colors = ctx.playerColors || [];
  let targetScore = 5;
  let scores = [0, 0];
  let round = 0;
  let phase = "idle";
  let timer = null;
  let armedAt = 0;
  let resolved = false;
  let destroyed = false;

  function clearTimer() {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  function dispose() {
    destroyed = true;
    clearTimer();
  }

  const safeCtx = { ...ctx, exit: () => { dispose(); ctx.exit(); } };
  const statusEl = el("span", { class: "pill" }, "Face to face");
  const screen = (body) => { if (!destroyed) render(el("div", { class: "screen" }, [gameHeader(safeCtx, game, statusEl), body])); };

  function setup() {
    clearTimer();
    phase = "idle";
    const goal = segmented([
      { value: 3, label: "First to 3" },
      { value: 5, label: "First to 5" },
      { value: 7, label: "First to 7" },
    ], targetScore, (value) => { targetScore = value; });
    screen(el("div", { class: "screen" }, [
      el("div", { class: "hero" }, [el("h2", {}, "⚡ Flash Duel"), el("div", { class: "tag" }, "One phone. Two ends. Zero mercy.")]),
      el("div", { class: "card stack" }, [
        el("p", { class: "muted center" }, `Lay the phone flat between both players. The top pad faces ${names[0]}; the bottom pad faces ${names[1]}.`),
        goal.node,
        el("div", { class: "duel-demo" }, [el("span", {}, "WAIT"), el("b", {}, "→"), el("span", {}, "TAP!")]),
        el("p", { class: "muted center tiny" }, "Fake signals happen. Touching early loses the point."),
      ]),
      el("div", { class: "footer-actions" }, button("Start duel →", { big: true, onClick: () => {
        targetScore = goal.get();
        scores = [0, 0];
        round = 0;
        betweenRounds("Hands ready?", "The first signal is armed when you tap below.");
      } })),
    ]));
  }

  function scoreStrip() {
    return el("div", { class: "scorebar duel-scorebar" }, names.map((name, i) => scoreChip(scores[i], name, colors[i])));
  }

  function pad(player, disabled = false) {
    return el("button", {
      class: `duel-pad ${player === 0 ? "top" : "bottom"}`,
      type: "button",
      disabled,
      style: `--duel-color:${colors[player] || (player === 0 ? "#8b5cf6" : "#06b6d4")}`,
      "aria-label": `${names[player]} tap pad`,
      onpointerdown: (event) => { event.preventDefault(); onTap(player); },
      onClick: (event) => { if (event.detail === 0) onTap(player); },
    }, el("span", { class: "duel-player" }, [
      el("small", {}, names[player]),
      el("b", {}, phase === "go" ? "TAP" : "READY"),
      el("strong", {}, String(scores[player])),
    ]));
  }

  function arena(headline, detail, tone = "wait", action = null) {
    screen(el("div", { class: "screen duel-screen" }, [
      el("div", { class: "duel-round" }, `Round ${round + 1} · first to ${targetScore}`),
      el("div", { class: `duel-arena ${tone}` }, [
        pad(0, tone === "result"),
        el("div", { class: `duel-signal ${tone}` }, [
          el("b", {}, headline),
          el("span", {}, detail),
        ]),
        pad(1, tone === "result"),
      ]),
      scoreStrip(),
      action ? el("div", { class: "footer-actions" }, action) : null,
    ]));
  }

  function betweenRounds(headline, detail) {
    phase = "idle";
    resolved = false;
    arena(headline, detail, "result", button("Arm next signal", { big: true, onClick: armRound }));
  }

  function armRound() {
    clearTimer();
    resolved = false;
    phase = "waiting";
    arena("WAIT", "Do not tap early", "wait");
    const firstDelay = 1200 + Math.random() * 1800;
    timer = setTimeout(() => {
      if (destroyed || resolved) return;
      if (Math.random() < 0.62) showDecoy();
      else showGo();
    }, firstDelay);
  }

  function showDecoy() {
    phase = "decoy";
    haptic(10);
    arena("HOLD!", "Fake signal — stay still", "hold");
    timer = setTimeout(() => {
      if (destroyed || resolved) return;
      phase = "waiting";
      arena("WAIT", "The real flash is still coming", "wait");
      timer = setTimeout(showGo, 700 + Math.random() * 1400);
    }, 650);
  }

  function showGo() {
    if (destroyed || resolved) return;
    phase = "go";
    armedAt = performance.now();
    haptic([18, 20, 18]);
    arena("TAP!", "Strike your pad now", "go");
    timer = setTimeout(() => {
      if (!resolved && !destroyed) {
        resolved = true;
        phase = "idle";
        betweenRounds("Too slow", "Nobody scored — reset and focus.");
      }
    }, 3000);
  }

  function onTap(player) {
    if (destroyed || resolved || phase === "idle") return;
    if (phase !== "go") {
      const winner = 1 - player;
      resolveRound(winner, `${names[player]} false-started`, "Point awarded to the opponent");
      return;
    }
    const reaction = Math.max(0, Math.round(performance.now() - armedAt));
    resolveRound(player, `${names[player]} strikes first!`, `${reaction} ms reaction`);
  }

  function resolveRound(winner, headline, detail) {
    if (resolved) return;
    resolved = true;
    clearTimer();
    phase = "idle";
    scores[winner]++;
    haptic([12, 25, 12]);

    if (scores[winner] >= targetScore) {
      celebrate();
      screen(el("div", { class: "screen" }, [
        el("div", { class: "card center duel-winner" }, [
          el("div", { class: "duel-bolt" }, "⚡"),
          el("div", { class: "verdict match" }, `${names[winner]} wins the duel!`),
          el("p", { class: "muted" }, `${scores[0]}–${scores[1]} final score`),
        ]),
        scoreStrip(),
        el("div", { class: "footer-actions" }, [
          button("Rematch", { big: true, onClick: () => {
            scores = [0, 0]; round = 0; betweenRounds("Rematch ready", "Arm the first signal when both players are set.");
          } }),
          button("Change goal", { variant: "ghost", onClick: setup }),
        ]),
      ]));
      return;
    }

    arena(headline, detail, "result", button("Next round →", { big: true, onClick: () => {
      round++;
      armRound();
    } }));
  }

  setup();
}

export default game;
