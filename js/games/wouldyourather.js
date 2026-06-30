// "Would You Rather" — you both tap A or B, then it reveals at the same time.
// Match = compatibility points; either way it sparks a fun debate.
// Online = 2 phones (simultaneous reveal). Local = pass the phone.

import { el, render, button, connectionPill, passDevice, gameHeader, scoreChip, meter, shuffle, celebrate, onlineReadyGate, localReadyGate } from "../ui.js";
import { WOULD_YOU_RATHER } from "../data/decks.js";

const game = {
  id: "wyr",
  title: "Would You Rather",
  emoji: "🤔",
  color: "linear-gradient(135deg,#ff5e98,#ff9a5b)",
  blurb: "Pick A or B at the same time — how aligned are you two?",
  minPlayers: 2,
  maxPlayers: 2,
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
  const isHost = session.isHost;
  const deck = shuffle(WOULD_YOU_RATHER);
  let i = 0;
  let stats = { rounds: 0, matches: 0, streak: 0 };
  let prompt = null;
  let pending = { a: null, b: null }; // a = host pick, b = guest pick

  const status = connectionPill();
  session.onStatus(status.set);
  const screen = (body) => render(el("div", { class: "screen" }, [header(), body]));
  const header = () => gameHeader(ctx, game, status.node);

  function hostNewRound() {
    if (i >= deck.length) i = 0;
    prompt = deck[i++];
    pending = { a: null, b: null };
    session.send("wyr_round", { prompt });
    showPick(prompt);
  }
  function hostTryReveal() {
    if (pending.a == null || pending.b == null) return;
    const match = pending.a === pending.b;
    stats.rounds++; if (match) { stats.matches++; stats.streak++; } else stats.streak = 0;
    const payload = { prompt, c1: pending.a, c2: pending.b, match, stats };
    session.send("wyr_reveal", payload);
    showReveal(payload);
  }

  function showPick(p) {
    let picked = false;
    const pick = (which) => {
      if (picked) return; picked = true;
      if (isHost) pending.a = which; else session.send("wyr_choice", { choice: which });
      showWaiting(p, which);
      if (isHost) hostTryReveal();
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
      el("div", { class: "waiting" }, [el("div", { class: "spinner" }), `Locked in! Waiting for ${session.partnerName}…`]),
    ]));
  }
  function showReveal(p) {
    if (p.match) celebrate();
    const mine = isHost ? p.c1 : p.c2;
    const theirs = isHost ? p.c2 : p.c1;
    const tag = (which) => which === "a" ? "A" : "B";
    const frac = p.stats.rounds ? p.stats.matches / p.stats.rounds : 0;
    screen(el("div", { class: "screen" }, [
      el("div", { class: "kicker" }, "Would you rather…"),
      el("div", { class: "stack", style: "margin-top:8px" }, [
        choice("A", p.prompt.a, { disabled: true, cls: p.c1 === "a" || p.c2 === "a" ? "sel" : "",
          badge: [mine === "a" ? "You" : null, theirs === "a" ? session.partnerName : null].filter(Boolean).join(" + ") || null }),
        choice("B", p.prompt.b, { disabled: true, cls: p.c1 === "b" || p.c2 === "b" ? "sel" : "",
          badge: [mine === "b" ? "You" : null, theirs === "b" ? session.partnerName : null].filter(Boolean).join(" + ") || null }),
      ]),
      el("div", { class: `verdict ${p.match ? "match" : "nomatch"}` }, p.match ? "💞 Same wavelength!" : "🤷 You two differ — debate time!"),
      p.stats.streak > 1 ? el("div", { class: "streak" }, `🔥 ${p.stats.streak} matches in a row!`) : null,
      el("div", { style: "margin:10px 4px 0" }, [
        el("div", { class: "tiny muted center", style: "margin-bottom:6px" }, `Compatibility · ${p.stats.matches}/${p.stats.rounds}`),
        meter(frac),
      ]),
      el("div", { class: "footer-actions" }, onlineReadyGate(session, `wyr:${p.stats.rounds}`, () => {
        if (isHost) hostNewRound();
      }, { label: "Ready for next ->" })),
    ]));
  }

  session.on("wyr_round", (m) => { prompt = m.prompt; showPick(m.prompt); });
  session.on("wyr_reveal", (m) => { stats = m.stats; prompt = m.prompt; showReveal(m); });
  if (isHost) {
    session.on("wyr_choice", (m) => { pending.b = m.choice; hostTryReveal(); });
  }
  if (isHost) hostNewRound();
  else screen(el("div", { class: "waiting" }, [el("div", { class: "spinner" }), `Waiting for ${session.partnerName} to start…`]));
}

function local(ctx) {
  const names = ctx.players;
  const deck = shuffle(WOULD_YOU_RATHER);
  let i = 0;
  let stats = { rounds: 0, matches: 0, streak: 0 };
  const statusEl = el("span", { class: "pill" }, "Pass & play");
  const screen = (body) => render(el("div", { class: "screen" }, [gameHeader(ctx, game, statusEl), body]));

  async function round() {
    if (i >= deck.length) i = 0;
    const p = deck[i++];
    const picks = [];
    for (let n = 0; n < 2; n++) {
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
    const match = picks[0] === picks[1];
    stats.rounds++; if (match) { stats.matches++; stats.streak++; celebrate(); } else stats.streak = 0;
    const frac = stats.matches / stats.rounds;
    screen(el("div", { class: "screen" }, [
      el("div", { class: "kicker" }, "Would you rather…"),
      el("div", { class: "stack", style: "margin-top:8px" }, [
        choice("A", p.a, { disabled: true, cls: picks.includes("a") ? "sel" : "",
          badge: names.filter((_, k) => picks[k] === "a").join(" + ") || null }),
        choice("B", p.b, { disabled: true, cls: picks.includes("b") ? "sel" : "",
          badge: names.filter((_, k) => picks[k] === "b").join(" + ") || null }),
      ]),
      el("div", { class: `verdict ${match ? "match" : "nomatch"}` }, match ? "💞 Same wavelength!" : "🤷 You differ — debate time!"),
      el("div", { style: "margin:10px 4px 0" }, [
        el("div", { class: "tiny muted center", style: "margin-bottom:6px" }, `Compatibility · ${stats.matches}/${stats.rounds}`),
        meter(frac),
      ]),
      el("div", { class: "footer-actions" }, localReadyGate(names, round, { label: "ready" })),
    ]));
  }
  round();
}

export default game;
