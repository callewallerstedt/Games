// "Would You Rather" — you both tap A or B, then it reveals at the same time.
// Match = compatibility points; either way it sparks a fun debate.
// Online = 2 phones (simultaneous reveal). Local = pass the phone.

import { el, render, button, connectionPill, passDevice, gameHeader, meter, shuffle, celebrate, onlineReadyGate, localReadyGate, scoreboard } from "../ui.js";
import { WOULD_YOU_RATHER } from "../data/decks.js";

const game = {
  id: "wyr",
  title: "Would You Rather",
  emoji: "🤔",
  color: "linear-gradient(135deg,#ff5e98,#ff9a5b)",
  blurb: "Everyone picks A or B in secret, then the room reveals together.",
  minPlayers: 2,
  maxPlayers: 10,
  modes: ["local", "online"],
  estMinutes: 8,
  rulesHTML: `
    <p>An impossible little choice pops up. You both secretly pick — then it reveals together.</p>
    <ol>
      <li>Tap <b>A</b> or <b>B</b>.</li>
      <li>When you've both chosen, your picks flip over at the same time.</li>
      <li>Same pick = <b>+1 compatibility</b>. Different = the fun part — argue your case! 😄</li>
    </ol>
    <p class="muted">Two phones: choose in secret on your own screen. One phone: pass it and no peeking!</p>`,
  mount(ctx) { ctx.mode === "online" ? online(ctx) : local(ctx); },
};

const choice = (letter, text, opts = {}) =>
  el("button", { class: `choice ${opts.cls || ""}`.trim(), disabled: !!opts.disabled, onClick: opts.onClick }, [
    el("span", { class: "lead" }, letter),
    el("span", {}, text),
    opts.badge ? el("span", { class: "badge" }, opts.badge) : null,
  ]);

function online(ctx) {
  const { session } = ctx;
  const names = session.players;
  let deck = shuffle(WOULD_YOU_RATHER);
  let i = 0;
  let round = 0;
  let prompt = null;
  let picks = names.map(() => null);
  const scores = names.map(() => 0);

  const status = connectionPill();
  session.onStatus(status.set);
  const screen = (body) => render(el("div", { class: "screen" }, [header(), body]));
  const header = () => gameHeader(ctx, game, status.node);

  function hostNewRound() {
    if (!session.isHost) return;
    if (i >= deck.length) { deck = shuffle(WOULD_YOU_RATHER); i = 0; }
    prompt = deck[i++];
    picks = names.map(() => null);
    round++;
    session.send("wyr_round", { prompt, round });
    showPick(prompt);
  }
  function hostTryReveal() {
    if (!session.isHost || picks.some((pick) => pick == null)) return;
    const aCount = picks.filter((pick) => pick === "a").length;
    const bCount = picks.length - aCount;
    const majority = aCount === bCount ? null : aCount > bCount ? "a" : "b";
    if (majority) picks.forEach((pick, index) => { if (pick === majority) scores[index]++; });
    const payload = { prompt, picks: picks.slice(), scores: scores.slice(), aCount, bCount, majority, round };
    session.send("wyr_reveal", payload);
    showReveal(payload);
  }

  function showPick(p) {
    let picked = false;
    const pick = (which) => {
      if (picked) return; picked = true;
      picks[session.myIndex] = which;
      if (session.isHost) hostTryReveal(); else session.send("wyr_choice", { choice: which, round });
      showWaiting(p, which);
    };
    screen(el("div", { class: "screen" }, [
      el("div", { class: "kicker" }, "Would you rather…"),
      el("div", { class: "q-big", style: "margin-bottom:10px" }, "Pick one 👇"),
      el("div", { class: "stack" }, [
        choice("A", p.a, { onClick: () => pick("a") }),
        el("div", { class: "divider" }, "or"),
        choice("B", p.b, { onClick: () => pick("b") }),
      ]),
    ]));
  }
  function showWaiting(p, which) {
    screen(el("div", { class: "screen" }, [
      el("div", { class: "kicker" }, "Would you rather…"),
      el("div", { class: "stack", style: "margin-top:8px" }, [
        choice("A", p.a, { disabled: true, cls: which === "a" ? "sel" : "" }),
        choice("B", p.b, { disabled: true, cls: which === "b" ? "sel" : "" }),
      ]),
      el("div", { class: "waiting" }, [el("div", { class: "spinner" }), "Locked in. Waiting for the room."]),
    ]));
  }
  function showReveal(p) {
    if (p.majority) celebrate();
    const frac = Math.max(p.aCount, p.bCount) / names.length;
    screen(el("div", { class: "screen" }, [
      el("div", { class: "kicker" }, "Would you rather…"),
      el("div", { class: "stack", style: "margin-top:8px" }, [
        choice("A", p.prompt.a, { disabled: true, cls: p.aCount ? "sel" : "", badge: names.filter((_, index) => p.picks[index] === "a").join(", ") || null }),
        choice("B", p.prompt.b, { disabled: true, cls: p.bCount ? "sel" : "", badge: names.filter((_, index) => p.picks[index] === "b").join(", ") || null }),
      ]),
      el("div", { class: `verdict ${p.majority ? "match" : "nomatch"}` }, p.majority ? `${Math.max(p.aCount, p.bCount)} in the majority` : "The room is evenly split"),
      el("div", { style: "margin:10px 4px 0" }, [
        el("div", { class: "tiny muted center", style: "margin-bottom:6px" }, `Room alignment · ${Math.round(frac * 100)}%`),
        meter(frac),
      ]),
      scoreboard(names, p.scores, { colors: ctx.playerColors }),
      el("div", { class: "footer-actions" }, onlineReadyGate(session, `wyr:${p.round}`, hostNewRound, { label: "Ready for next" })),
    ]));
  }

  session.on("wyr_round", (m) => { if (!session.isHost) { round = m.round; prompt = m.prompt; picks = names.map(() => null); showPick(m.prompt); } });
  session.on("wyr_reveal", (m) => { if (!session.isHost) showReveal(m); });
  session.on("wyr_choice", (m) => { if (session.isHost && m.round === round) { picks[m.from] = m.choice; hostTryReveal(); } });
  if (session.isHost) hostNewRound();
  else screen(el("div", { class: "waiting" }, [el("div", { class: "spinner" }), "Waiting for the host to start"]));
}

function local(ctx) {
  const names = ctx.players;
  const deck = shuffle(WOULD_YOU_RATHER);
  let i = 0;
  const scores = names.map(() => 0);
  const statusEl = el("span", { class: "pill" }, "Pass & play");
  const screen = (body) => render(el("div", { class: "screen" }, [gameHeader(ctx, game, statusEl), body]));

  async function round() {
    if (i >= deck.length) i = 0;
    const p = deck[i++];
    const picks = [];
    for (let n = 0; n < names.length; n++) {
      await passDevice(names[n], "Pick in secret — no peeking!");
      await new Promise((res) => {
        const pick = (w) => { picks[n] = w; res(); };
        screen(el("div", { class: "screen" }, [
          el("div", { class: "kicker" }, `${names[n]} — would you rather…`),
          el("div", { class: "stack", style: "margin-top:10px" }, [
            choice("A", p.a, { onClick: () => pick("a") }),
            el("div", { class: "divider" }, "or"),
            choice("B", p.b, { onClick: () => pick("b") }),
          ]),
        ]));
      });
    }
    const aCount = picks.filter((pick) => pick === "a").length;
    const bCount = names.length - aCount;
    const majority = aCount === bCount ? null : aCount > bCount ? "a" : "b";
    if (majority) { picks.forEach((pick, index) => { if (pick === majority) scores[index]++; }); celebrate(); }
    const frac = Math.max(aCount, bCount) / names.length;
    screen(el("div", { class: "screen" }, [
      el("div", { class: "kicker" }, "Would you rather…"),
      el("div", { class: "stack", style: "margin-top:8px" }, [
        choice("A", p.a, { disabled: true, cls: picks.includes("a") ? "sel" : "",
          badge: names.filter((_, k) => picks[k] === "a").join(" + ") || null }),
        choice("B", p.b, { disabled: true, cls: picks.includes("b") ? "sel" : "",
          badge: names.filter((_, k) => picks[k] === "b").join(" + ") || null }),
      ]),
      el("div", { class: `verdict ${majority ? "match" : "nomatch"}` }, majority ? `${Math.max(aCount, bCount)} in the majority` : "The room is evenly split"),
      el("div", { style: "margin:10px 4px 0" }, [
        el("div", { class: "tiny muted center", style: "margin-bottom:6px" }, `Room alignment · ${Math.round(frac * 100)}%`),
        meter(frac),
      ]),
      scoreboard(names, scores, { colors: ctx.playerColors }),
      el("div", { class: "footer-actions" }, localReadyGate(names, round, { label: "ready" })),
    ]));
  }
  round();
}

export default game;
