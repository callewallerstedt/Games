// "Flash Duel" — two players face each other across one phone and race the signal.

import { el, render, button, gameHeader, segmented, scoreChip, celebrate, haptic, connectionPill, onlineReadyGate, scoreboard, setGameCleanup } from "../ui.js";

const game = {
  id: "flashduel",
  title: "Flash Duel",
  emoji: "⚡",
  color: "linear-gradient(135deg,#f97316,#facc15 48%,#22c55e)",
  blurb: "Face-to-face reflex combat — wait through the fake-outs, then strike first.",
  minPlayers: 2,
  maxPlayers: 2,
  modes: ["local", "online"],
  onlineMaxPlayers: 2,
  lobbySettings: [{ key: "targetScore", label: "First to", type: "choice", options: [3, 5, 7], default: 5 }],
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
    <p class="muted">On one device, the pads face opposite directions. Online, each player gets a full-screen pad and local reaction timing keeps the comparison fair.</p>`,
  mount(ctx) { if (ctx.mode === "online") online(ctx); else local(ctx); },
};

function online(ctx) {
  const { session } = ctx;
  const names = session.players;
  const targetScore = Number(session.settings.targetScore) || 5;
  let scores = [0, 0];
  let round = 0;
  let phase = "result";
  let startedAt = 0;
  let taps = [null, null];
  let timer = null;
  setGameCleanup(() => { phase = "disposed"; clearTimeout(timer); });
  const status = connectionPill();
  session.onStatus(status.set);
  const screen = (body) => render(el("div", { class: "screen" }, [gameHeader(ctx, game, status.node), body]));

  function readyScreen(label = "Ready for the signal") {
    phase = "result";
    screen(el("div", { class: "screen" }, [
      scoreboard(names, scores, { colors: ctx.playerColors }),
      el("div", { class: "card center" }, [
        el("div", { class: "kicker" }, `Round ${round + 1}`),
        el("h2", {}, label),
        el("p", { class: "muted" }, "Keep a finger near the button. Tapping before GO loses the round."),
      ]),
      el("div", { class: "footer-actions" }, onlineReadyGate(session, `duel:ready:${round}`, armRound, { label: "Ready" })),
    ]));
  }

  function armRound() {
    if (!session.isHost) return;
    phase = "wait";
    taps = [null, null];
    session.send("duel_wait", { round });
    showPad("WAIT", "Do not tap yet", "wait");
    const delay = 1400 + Math.random() * 2600;
    timer = setTimeout(() => {
      if (phase !== "wait") return;
      phase = "go";
      session.send("duel_go", { round });
      showGo();
    }, delay);
  }

  function showPad(headline, detail, tone) {
    screen(el("div", { class: "screen" }, [
      scoreboard(names, scores, { colors: ctx.playerColors }),
      el("button", {
        class: `remote-duel-pad ${tone}`,
        onpointerdown: (event) => { event.preventDefault(); tap(); },
      }, [el("strong", {}, headline), el("span", {}, detail)]),
    ]));
  }

  function showGo() {
    phase = "go";
    startedAt = performance.now();
    haptic([18, 20, 18]);
    showPad("GO", "Tap now", "go");
    if (session.isHost) {
      clearTimeout(timer);
      timer = setTimeout(resolveTaps, 3200);
    }
  }

  function tap() {
    if (phase !== "wait" && phase !== "go") return;
    const payload = { round, falseStart: phase !== "go", reaction: phase === "go" ? Math.round(performance.now() - startedAt) : null };
    phase = "locked";
    showPad("LOCKED", "Waiting for the other player", "result");
    if (session.isHost) receiveTap({ ...payload, from: session.myIndex });
    else session.send("duel_tap", payload);
  }

  function receiveTap(message) {
    if (!session.isHost || message.round !== round || taps[message.from]) return;
    taps[message.from] = { falseStart: message.falseStart, reaction: message.reaction };
    if (message.falseStart || taps.every(Boolean)) resolveTaps();
  }

  function resolveTaps() {
    if (!session.isHost || phase === "resolved") return;
    phase = "resolved";
    clearTimeout(timer);
    let winner = null;
    let detail = "Nobody tapped in time.";
    const falseStarter = taps.findIndex((tapResult) => tapResult?.falseStart);
    if (falseStarter >= 0) {
      winner = 1 - falseStarter;
      detail = `${names[falseStarter]} tapped early.`;
    } else {
      const valid = taps.map((tapResult, i) => tapResult ? { i, reaction: tapResult.reaction } : null).filter(Boolean).sort((a, b) => a.reaction - b.reaction);
      if (valid.length) {
        winner = valid[0].i;
        detail = `${valid[0].reaction} ms local reaction time.`;
      }
    }
    if (winner != null) scores[winner]++;
    const payload = { round, scores: scores.slice(), winner, detail, matchWinner: winner != null && scores[winner] >= targetScore ? winner : null };
    session.send("duel_result", payload);
    showResult(payload);
  }

  function showResult(payload) {
    scores = payload.scores;
    phase = "result";
    if (payload.matchWinner != null) celebrate();
    screen(el("div", { class: "screen" }, [
      el("div", { class: "card center" }, [
        el("div", { class: `verdict ${payload.winner == null ? "nomatch" : "match"}` },
          payload.matchWinner != null ? `${names[payload.matchWinner]} wins the duel` : payload.winner == null ? "No point" : `${names[payload.winner]} scores`),
        el("p", { class: "muted" }, payload.detail),
      ]),
      scoreboard(names, scores, { colors: ctx.playerColors }),
      el("div", { class: "footer-actions" }, onlineReadyGate(session, `duel:result:${payload.round}`, () => {
        if (!session.isHost) return;
        if (payload.matchWinner != null) { scores = [0, 0]; round = 0; }
        else round++;
        session.send("duel_ready_screen", { round, scores });
        readyScreen(payload.matchWinner != null ? "Rematch" : "Next signal");
      }, { label: payload.matchWinner != null ? "Ready for rematch" : "Ready for next" })),
    ]));
  }

  session.on("duel_wait", (message) => { if (!session.isHost && message.round === round) { phase = "wait"; taps = [null, null]; showPad("WAIT", "Do not tap yet", "wait"); } });
  session.on("duel_go", (message) => { if (!session.isHost && message.round === round) showGo(); });
  session.on("duel_tap", receiveTap);
  session.on("duel_result", (message) => { if (!session.isHost) showResult(message); });
  session.on("duel_ready_screen", (message) => { if (!session.isHost) { round = message.round; scores = message.scores; readyScreen("Next signal"); } });

  readyScreen();
}

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
  setGameCleanup(dispose);

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
