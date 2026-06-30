// "Case Files" — cooperative detective stories; uncover clues, then accuse.
import { el, render, button, gameHeader, passDevice, scoreChip, shuffle, celebrate, haptic, localReadyGate } from "../ui.js";
import { CRIME_CASES } from "../data/crime-cases.js";

const game = {
  id: "crime",
  title: "Case Files",
  emoji: "🔎",
  color: "linear-gradient(135deg,#2d3436,#636e72)",
  blurb: "Read the case, dig up clues, solve the mystery together.",
  minPlayers: 2,
  maxPlayers: 6,
  modes: ["local"],
  estMinutes: 20,
  rulesHTML: `
    <p>A crime mystery with hidden clues. Work together — but score individually on the final accusation.</p>
    <ol>
      <li>Read the case intro aloud.</li>
      <li>Take turns revealing <b>one clue</b> each (pass the phone).</li>
      <li>When ready, everyone makes a secret accusation: who dunnit?</li>
      <li>Correct accusations score. We explain the full solution. 🕵️</li>
    </ol>
    <p class="muted">Talk it out between clues — the best detectives connect dots early.</p>`,
  mount(ctx) { local(ctx); },
};

function norm(s) {
  return (s || "").trim().toLowerCase();
}

function checkAnswer(guess, caseData) {
  const g = norm(guess);
  if (!g) return false;
  if (norm(caseData.solution) === g) return true;
  return caseData.keywords.some((k) => g.includes(k));
}

function local(ctx) {
  const names = ctx.players;
  let deck = shuffle(CRIME_CASES);
  let ci = 0;
  const scores = names.map(() => 0);
  const statusEl = el("span", { class: "pill" }, "Detective mode");
  const screen = (b) => render(el("div", { class: "screen" }, [gameHeader(ctx, game, statusEl), b]));

  async function playCase() {
    if (ci >= deck.length) { deck = shuffle(CRIME_CASES); ci = 0; }
    const c = deck[ci++];
    const revealed = new Set();
    let clueRound = 0;
    const maxClues = Math.min(names.length * 2, c.clues.length);

    await new Promise((res) => {
      screen(el("div", { class: "screen" }, [
        el("div", { class: "card" }, [
          el("div", { class: "kicker" }, "New case"),
          el("h2", { class: "center" }, c.title),
          el("p", { style: "line-height:1.5" }, c.intro),
          el("p", { class: "muted center tiny" }, `${c.clues.length} clues to investigate · ${c.suspects.length} suspects`),
        ]),
        el("div", { class: "footer-actions" }, button("Open case →", { big: true, onClick: res })),
      ]));
    });

    while (revealed.size < maxClues) {
      const pi = clueRound % names.length;
      await passDevice(names[pi], "Pick a clue to reveal to the group");
      await new Promise((res) => {
        const list = el("div", { class: "stack" });
        c.clues.forEach((cl, i) => {
          if (revealed.has(i)) return;
          list.append(button(cl.label, {
            variant: "secondary",
            onClick: () => {
              revealed.add(i);
              res();
            },
          }));
        });
        if (!list.childNodes.length) { res(); return; }
        screen(el("div", { class: "card" }, [
          el("div", { class: "pill" }, `${names[pi]} — investigate`),
          el("p", { class: "muted center" }, "Choose one clue to read aloud"),
          list,
        ]));
      });
      clueRound++;

      const board = el("div", { class: "stack" });
      [...revealed].sort((a, b) => a - b).forEach((i) => {
        const cl = c.clues[i];
        board.append(el("div", { class: "crime-clue reveal-anim" }, [
          el("div", { class: "who" }, cl.label),
          el("p", {}, cl.text),
        ]));
      });

      if (revealed.size < maxClues) {
        await new Promise((res) => {
          screen(el("div", { class: "screen" }, [
            el("div", { class: "card stack" }, board.children.length ? [...board.children] : [el("p", { class: "muted" }, "…")]),
            el("div", { class: "footer-actions" }, button("Continue investigation →", { big: true, onClick: res })),
          ]));
        });
      }
    }

    const clueBoard = el("div", { class: "stack" });
    [...revealed].sort((a, b) => a - b).forEach((i) => {
      const cl = c.clues[i];
      clueBoard.append(el("div", { class: "crime-clue" }, [
        el("div", { class: "who" }, cl.label),
        el("p", {}, cl.text),
      ]));
    });

    await new Promise((res) => {
      screen(el("div", { class: "screen" }, [
        el("div", { class: "card" }, [
          el("h2", { class: "center", style: "font-size:1.2rem" }, "Evidence board"),
          el("p", { class: "muted center tiny" }, "Discuss before you accuse!"),
        ]),
        clueBoard,
        el("div", { class: "footer-actions" }, button("Make accusations →", { big: true, onClick: res })),
      ]));
    });

    const accusations = [];

    for (let i = 0; i < names.length; i++) {
      await passDevice(names[i], "Who do you think did it?");
      await new Promise((res) => {
        const btns = c.suspects.map((s) =>
          button(s, { variant: "secondary", onClick: () => { accusations[i] = s; res(); } }),
        );
        const custom = el("input", { class: "field", style: "text-align:left", placeholder: "Or type a name…", maxlength: "40" });
        const go = button("Accuse ✓", { big: true, disabled: true, onClick: () => {
          accusations[i] = custom.value.trim() || accusations[i];
          res();
        } });
        custom.addEventListener("input", () => { go.disabled = !custom.value.trim() && !accusations[i]; });
        screen(el("div", { class: "card stack" }, [
          el("div", { class: "pill" }, `${names[i]} — your accusation`),
          ...btns,
          el("div", { class: "divider" }, "or type it"),
          custom,
          go,
        ]));
      });
    }

    accusations.forEach((a, i) => { if (checkAnswer(a, c)) scores[i]++; });
    const solvers = accusations.map((a, i) => checkAnswer(a, c) ? i : -1).filter((i) => i >= 0);
    if (solvers.length) celebrate();

    const rows = names.map((n, i) => el("div", { class: `answer-card ${solvers.includes(i) ? "me" : ""}` }, [
      el("span", { class: "who" }, n),
      el("span", { class: "val" }, accusations[i] + (solvers.includes(i) ? " ✓" : " ✗")),
    ]));

    screen(el("div", { class: "screen" }, [
      el("div", { class: "card" }, [
        el("h2", { class: "center" }, "🔓 Solution"),
        el("div", { class: "verdict match" }, c.solution),
        el("p", {}, c.explain),
      ]),
      el("h3", { class: "center", style: "margin:12px 0 8px;font-size:.95rem" }, "Clues you found"),
      clueBoard,
      el("h3", { class: "center", style: "margin:16px 0 8px;font-size:.95rem" }, "Accusations"),
      el("div", { class: "stack" }, rows),
      el("div", { class: "scorebar" }, names.map((n, i) => scoreChip(scores[i], n))),
      el("div", { class: "footer-actions" }, localReadyGate(names, playCase, { label: "ready" })),
    ]));
    haptic(12);
  }

  screen(el("div", { class: "card center" }, [
    el("h2", {}, "🔎 Case Files"),
    el("p", { class: "muted" }, `${deck.length} mysteries loaded.`),
    el("div", { class: "footer-actions" }, button("Open first case →", { big: true, onClick: playCase })),
  ]));
}

export default game;
