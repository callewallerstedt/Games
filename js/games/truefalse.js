// "Crazy True or False" — bonkers facts; race to call them right.
import { el, render, button, gameHeader, passDevice, scoreChip, shuffle, celebrate, haptic, localReadyGate } from "../ui.js";
import { TRUEFALSE_FACTS } from "../data/truefalse-facts.js";

const game = {
  id: "truefalse",
  title: "Crazy True or False",
  emoji: "🤯",
  color: "linear-gradient(135deg,#a855f7,#ff5e98)",
  blurb: "Wild claims — who's fastest to spot the truth?",
  minPlayers: 2,
  maxPlayers: 10,
  modes: ["local"],
  estMinutes: 10,
  rulesHTML: `
    <p>We read a crazy-sounding statement. Everyone picks <b>True</b> or <b>False</b> in secret.</p>
    <ol>
      <li>Pass the phone — tap your call before peeking at others' picks.</li>
      <li>Big reveal: the real answer + why it's wild.</li>
      <li>Correct guesses score a point. Most points after you've had enough wins!</li>
    </ol>
    <p class="muted">Some are unbelievable because they're true. Some are believable because they're lies. 😈</p>`,
  mount(ctx) { local(ctx); },
};

function local(ctx) {
  const names = ctx.players;
  let deck = shuffle(TRUEFALSE_FACTS);
  let qi = 0;
  const scores = names.map(() => 0);
  const statusEl = el("span", { class: "pill" }, `${names.length} players`);
  const screen = (b) => render(el("div", { class: "screen" }, [gameHeader(ctx, game, statusEl), b]));

  async function round() {
    if (qi >= deck.length) { deck = shuffle(TRUEFALSE_FACTS); qi = 0; }
    const fact = deck[qi++];
    const picks = [];

    for (let i = 0; i < names.length; i++) {
      await passDevice(names[i], "True or False — make your call!");
      await new Promise((res) => {
        const pick = (v) => { picks[i] = v; res(); };
        screen(el("div", { class: "card" }, [
          el("div", { class: "pill" }, names[i]),
          el("div", { class: "q-big", style: "font-size:1.35rem" }, fact.statement),
          el("div", { class: "btn-row", style: "margin-top:14px" }, [
            button("✅ True", { big: true, onClick: () => pick(true) }),
            button("❌ False", { variant: "secondary", big: true, onClick: () => pick(false) }),
          ]),
        ]));
      });
    }

    picks.forEach((p, i) => { if (p === fact.answer) scores[i]++; });
    const correctCount = picks.filter((p) => p === fact.answer).length;
    if (correctCount === 1) celebrate();

    const rows = names.map((n, i) => {
      const ok = picks[i] === fact.answer;
      return el("div", { class: `answer-card reveal-anim ${ok ? "me" : ""}` }, [
        el("span", { class: "who" }, n),
        el("span", { class: "val" }, [
          picks[i] ? "True" : "False",
          ok ? " ✓" : " ✗",
        ]),
      ]);
    });

    screen(el("div", { class: "screen" }, [
      el("div", { class: "card" }, [
        el("div", { class: "q-big", style: "font-size:1.25rem" }, fact.statement),
        el("div", { class: `verdict ${fact.answer ? "match" : "nomatch"}`, style: "font-size:1.6rem" },
          fact.answer ? "✅ TRUE!" : "❌ FALSE!"),
        el("p", { class: "muted center" }, fact.explain),
      ]),
      el("div", { class: "stack" }, rows),
      el("div", { class: "scorebar" }, names.map((n, i) => scoreChip(scores[i], n))),
      el("div", { class: "footer-actions" }, localReadyGate(names, round, { label: "ready" })),
    ]));
    haptic(12);
  }

  screen(el("div", { class: "card center" }, [
    el("h2", {}, "🤯 Crazy True or False"),
    el("p", { class: "muted" }, `${deck.length} mind-bending facts loaded.`),
    el("div", { class: "footer-actions" }, button("Start →", { big: true, onClick: round })),
  ]));
}

export default game;
