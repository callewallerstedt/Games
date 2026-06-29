// "Sync Clues" — inspired by Just One. Everyone sees the secret word except the
// guesser, writes ONE clue, duplicates cancel out, then the guesser deduces it.
// Co-op team score — pure wordplay brain burn.

import { el, render, topbar, button, pill, passDevice, rulesModal, scoreChip, shuffle } from "../ui.js";
import { SYNC_WORDS } from "../data/sync-words.js";

const norm = (s) => (s || "").trim().toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ");

const game = {
  id: "sync",
  title: "Sync Clues",
  emoji: "🕵️",
  blurb: "One-word clues — duplicates vanish. Can the guesser crack it?",
  minPlayers: 3,
  maxPlayers: 6,
  modes: ["local"],
  estMinutes: 15,
  rulesHTML: `
    <p>A co-op word deduction game. Can your crew get the guesser there with
    almost no information?</p>
    <ol>
      <li>One player is the <b>Guesser</b> — they don't see the secret word.</li>
      <li>Everyone else sees it and writes <b>exactly one word</b> as a clue.</li>
      <li>If two clues match, they <b>both cancel</b> — too obvious!</li>
      <li>The Guesser sees what's left and takes one shot.</li>
      <li>Correct = +1 team point. Then someone else guesses next round.</li>
    </ol>
    <p class="muted">No made-up words, no rhymes with the answer, no dirty tricks. 😇</p>`,
  mount(ctx) {
    localGame(ctx);
  },
};

function header(ctx, statusEl) {
  return topbar({
    onBack: ctx.exit,
    right: el("div", { style: "display:flex; gap:8px; align-items:center" }, [
      statusEl || null,
      el("button", { class: "iconbtn", "aria-label": "Rules", onClick: () => rulesModal(game) }, "?"),
    ]),
  });
}

function oneWordInput(onDone, placeholder = "One word only…") {
  const input = el("input", { class: "field", type: "text", placeholder, autocomplete: "off",
    enterkeyhint: "done", maxlength: "20" });
  const btn = button("Lock clue ✓", { big: true, disabled: true, onClick: () => onDone(input.value) });
  input.addEventListener("input", () => {
    const parts = input.value.trim().split(/\s+/).filter(Boolean);
    btn.disabled = parts.length !== 1 || parts[0].length < 2;
    if (parts.length > 1) input.value = parts[0];
  });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !btn.disabled) onDone(input.value); });
  setTimeout(() => input.focus(), 50);
  return el("div", { class: "stack" }, [input, btn]);
}

async function localGame(ctx) {
  const names = ctx.players;
  const deck = shuffle(SYNC_WORDS);
  let qi = 0;
  let team = { score: 0, rounds: 0 };
  let guesserIdx = 0;

  const statusEl = pill(`${names.length} players · co-op`);
  const screen = (body) => render(el("div", { class: "screen" }, [header(ctx, statusEl), body]));

  async function round() {
    if (qi >= deck.length) qi = 0;
    const word = deck[qi++];
    const clueGivers = names.map((_, i) => i).filter((i) => i !== guesserIdx);
    const clues = [];

    await passDevice(names[guesserIdx], "Look away — you're guessing this round!");
    screen(el("div", { class: "card center waiting" }, [
      el("div", { class: "pill" }, `${names[guesserIdx]} is guessing`),
      el("p", { class: "muted" }, "Clue-givers are writing…"),
      el("div", { class: "spinner" }),
    ]));

    for (const i of clueGivers) {
      await passDevice(names[i], "Don't let the guesser peek!");
      await new Promise((resolve) => {
        screen(el("div", { class: "card" }, [
          el("div", { class: "pill" }, `${names[i]} — your clue`),
          el("div", { class: "secret-word" }, word),
          el("p", { class: "muted center" }, "One word. No part of the answer!"),
          oneWordInput((val) => { clues[i] = val.trim(); resolve(); }),
        ]));
      });
    }

    // Cancel duplicates among clue givers
    const byNorm = {};
    clueGivers.forEach((i) => {
      const k = norm(clues[i]);
      (byNorm[k] ||= []).push(i);
    });
    const cancelled = new Set();
    Object.values(byNorm).forEach((group) => { if (group.length > 1) group.forEach((i) => cancelled.add(i)); });
    const surviving = clueGivers.filter((i) => !cancelled.has(i));

    await passDevice(names[guesserIdx], surviving.length ? "Your clues are ready!" : "Uh oh — every clue cancelled…");

    const guess = await new Promise((resolve) => {
      const input = el("input", { class: "field", type: "text", placeholder: "Your guess…", autocomplete: "off", enterkeyhint: "done" });
      const btn = button("Lock in guess 🎯", { big: true, disabled: true, onClick: () => resolve(input.value.trim()) });
      input.addEventListener("input", () => { btn.disabled = !input.value.trim(); });
      input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !btn.disabled) resolve(input.value.trim()); });
      setTimeout(() => input.focus(), 50);

      const clueCards = clueGivers.map((i) => {
        const dead = cancelled.has(i);
        return el("div", { class: `clue-card ${dead ? "cancelled" : ""}` }, [
          el("span", { class: "who" }, names[i]),
          el("span", { class: "val" }, dead ? "✕ cancelled" : clues[i]),
        ]);
      });

      screen(el("div", { class: "screen" }, [
        el("div", { class: "card" }, [
          el("p", { class: "muted center" }, "Available clues"),
          el("div", { class: "stack", style: "margin:12px 0" }, clueCards.length ? clueCards : [
            el("p", { class: "center muted" }, "Every clue was too obvious — nothing left!"),
          ]),
          input,
        ]),
        el("div", { class: "footer-actions" }, btn),
      ]));
    });

    team.rounds++;
    const correct = norm(guess) === norm(word);
    if (correct) team.score++;

    screen(el("div", { class: "screen" }, [
      el("div", { class: "card center" }, [
        el("div", { class: "secret-word", style: "margin-bottom:12px" }, word),
        el("div", { class: `verdict ${correct ? "match" : "nomatch"}` },
          correct ? "🎯 Nailed it!" : `Not quite — it was "${word}"`),
        el("p", { class: "muted" }, `Guesser said: "${guess || "…"}"`),
      ]),
      el("div", { class: "scorebar" }, [
        scoreChip(team.score, "team score"),
        scoreChip(team.rounds, "rounds"),
      ]),
      el("div", { class: "footer-actions" }, button("Next round ↻", {
        big: true,
        onClick: () => { guesserIdx = (guesserIdx + 1) % names.length; round(); },
      })),
    ]));
  }

  round();
}

export default game;
