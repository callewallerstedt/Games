// "Impostor" — 3–10 players, one phone.
// Everyone gets the SAME question except one random impostor, who gets a
// related-but-different question. Pass the phone so each reads (and optionally
// answers) in secret. Then the group discusses and votes who the impostor is.

import { el, render, button, gameHeader, passDevice, segmented, scoreChip, shuffle, celebrate, haptic } from "../ui.js";
import { IMPOSTOR } from "../data/decks.js";

const game = {
  id: "impostor",
  title: "Impostor",
  emoji: "🕵️",
  color: "linear-gradient(135deg,#5b6cff,#9d6bff)",
  blurb: "One player got a different question. Sniff out the impostor!",
  minPlayers: 3,
  maxPlayers: 10,
  modes: ["local"],
  estMinutes: 12,
  rulesHTML: `
    <p>One phone, 3+ players. Everyone answers a question — but <b>one secret impostor</b>
    gets a slightly different question and has to blend in.</p>
    <ol>
      <li>Pass the phone around — each player privately sees their question and (optionally)
      types an answer.</li>
      <li>Share answers out loud and <b>discuss</b> — who seems off?</li>
      <li>The group votes for the impostor. Catch them and the group scores; if they slip
      through, the impostor scores!</li>
    </ol>
    <p class="muted">Tip: the questions overlap, so a good impostor sounds just like everyone else. 😏</p>`,
  mount(ctx) { local(ctx); },
};

function local(ctx) {
  const names = ctx.players;
  let answerMode = "type";
  let deck = shuffle(IMPOSTOR), di = 0;
  const score = { group: 0, impostor: 0 };
  const statusEl = el("span", { class: "pill" }, `${names.length} players`);
  const screen = (b) => render(el("div", { class: "screen" }, [gameHeader(ctx, game, statusEl), b]));

  function chooseMode() {
    const seg = segmented(
      [{ value: "type", label: "⌨️ Type & reveal" }, { value: "say", label: "🗣️ Say out loud" }],
      answerMode, (v) => (answerMode = v));
    screen(el("div", { class: "screen" }, [
      el("div", { class: "hero" }, [el("h2", {}, "🕵️ Impostor"), el("div", { class: "tag muted" }, "One of you gets a different question. Blend in!")]),
      el("div", { class: "card" }, [el("p", { class: "muted center" }, "How will you answer each round?"), seg.node]),
      el("div", { class: "footer-actions" }, button("Start round →", { big: true, onClick: () => { answerMode = seg.get(); playRound(); } })),
    ]));
  }

  async function playRound() {
    if (di >= deck.length) { deck = shuffle(IMPOSTOR); di = 0; }
    const pair = deck[di++];
    const impostor = Math.floor(Math.random() * names.length);
    const answers = [];
    for (let i = 0; i < names.length; i++) {
      await passDevice(names[i], "Your secret question — don't show anyone!");
      const q = i === impostor ? pair.impostor : pair.main;
      await new Promise((res) => {
        if (answerMode === "type") {
          const f = el("input", { class: "field", style: "text-align:left", placeholder: "Your answer…", maxlength: "40" });
          const b = button("Lock in ✓", { big: true, disabled: true, onClick: () => { answers[i] = f.value.trim(); res(); } });
          f.addEventListener("input", () => { b.disabled = f.value.trim() === ""; });
          f.addEventListener("keydown", (e) => { if (e.key === "Enter" && !b.disabled) { answers[i] = f.value.trim(); res(); } });
          setTimeout(() => f.focus(), 50);
          screen(el("div", { class: "card" }, [el("div", { class: "pill" }, `${names[i]} — your question`), el("div", { class: "q-big" }, q), el("div", { class: "stack" }, [f, b])]));
        } else {
          screen(el("div", { class: "card" }, [
            el("div", { class: "pill" }, `${names[i]} — your question`),
            el("div", { class: "q-big" }, q),
            el("p", { class: "muted center" }, "Remember it — you'll say your answer out loud. Don't read your question aloud!"),
            button("Got it — hide 🙈", { big: true, onClick: () => res() }),
          ]));
        }
      });
    }
    discuss(pair, impostor, answers);
  }

  function discuss(pair, impostor, answers) {
    const rows = answerMode === "type"
      ? answers.map((a, i) => el("div", { class: "answer-card reveal-anim" }, [el("span", { class: "who" }, names[i]), el("span", { class: "val" }, a)]))
      : [];
    screen(el("div", { class: "screen" }, [
      el("div", { class: "kicker" }, "Everyone gather round"),
      el("h2", { class: "center", style: "margin:8px 0" }, "Who's the impostor? 🕵️"),
      el("p", { class: "muted center" }, answerMode === "type" ? "Here's what everyone wrote — discuss!" : "Go round and say your answers, then discuss."),
      rows.length ? el("div", { class: "stack" }, rows) : null,
      el("div", { class: "footer-actions" }, button("Ready to vote →", { big: true, onClick: () => vote(pair, impostor) })),
    ]));
  }

  function vote(pair, impostor) {
    let sel = null;
    const draw = () => screen(el("div", { class: "screen" }, [
      el("div", { class: "kicker" }, "Group vote"),
      el("h2", { class: "center", style: "margin:8px 0 14px" }, "Tap the impostor"),
      el("div", { class: "stack" }, names.map((n, i) =>
        el("button", { class: `choice ${sel === i ? "sel" : ""}`, onClick: () => { sel = i; draw(); } },
          [el("span", { class: "lead" }, (n[0] || "?").toUpperCase()), el("span", {}, n)]))),
      el("div", { class: "footer-actions" }, button("Reveal! 🎭", { big: true, disabled: sel === null, onClick: () => reveal(pair, impostor, sel) })),
    ]));
    draw();
  }

  function reveal(pair, impostor, sel) {
    const caught = sel === impostor;
    if (caught) { score.group++; celebrate(); } else { score.impostor++; haptic([10, 40, 10, 40]); }
    screen(el("div", { class: "screen" }, [
      el("div", { class: `verdict ${caught ? "match" : "nomatch"}` }, caught ? "🕵️ Impostor caught!" : "🎭 The impostor escaped!"),
      el("div", { class: "card stack" }, [
        el("div", { class: "answer-card me" }, [el("span", { class: "who" }, "The impostor was"), el("span", { class: "val" }, names[impostor])]),
        el("div", { class: "answer-card" }, [el("span", { class: "who" }, "Everyone's question"), el("span", { class: "val", style: "font-size:.98rem" }, pair.main)]),
        el("div", { class: "answer-card" }, [el("span", { class: "who" }, "Impostor's question"), el("span", { class: "val", style: "font-size:.98rem" }, pair.impostor)]),
      ]),
      el("div", { class: "scorebar" }, [scoreChip(score.group, "group wins"), scoreChip(score.impostor, "impostor wins")]),
      el("div", { class: "footer-actions" }, button("Next round →", { big: true, onClick: playRound })),
    ]));
  }

  chooseMode();
}

export default game;
