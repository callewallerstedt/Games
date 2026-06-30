// "Deep Dive" — a conversation card deck for couples, with levels that go from
// cute to deep to spicy. No scoring — just take turns drawing a card and talking.
// Inspired by "36 Questions" / "We're Not Really Strangers". Online or one phone.

import { el, render, button, connectionPill, gameHeader, segmented, shuffle, onlineReadyGate, localReadyGate } from "../ui.js";
import { DEEP } from "../data/decks.js";

const LEVELS = [
  { value: "cute", label: "💛 Cute" },
  { value: "deep", label: "💙 Deep" },
  { value: "spicy", label: "❤️‍🔥 Spicy" },
];
const levelLabel = (v) => LEVELS.find((l) => l.value === v).label;

const game = {
  id: "deep",
  title: "Deep Dive",
  emoji: "💬",
  color: "linear-gradient(135deg,#6c5ce7,#ff5e98)",
  blurb: "Conversation cards from cute to deep to spicy.",
  minPlayers: 2,
  maxPlayers: 2,
  modes: ["local", "online"],
  estMinutes: 15,
  rulesHTML: `
    <p>No points, no winners — just a deck of questions to take you somewhere real.</p>
    <ol>
      <li>Pick a level: <b>Cute</b>, <b>Deep</b>, or <b>Spicy</b>.</li>
      <li>A card appears with whose turn it is to answer.</li>
      <li>Answer honestly, talk it out, then draw the next card.</li>
    </ol>
    <p class="muted">Great over dinner, on a walk, or winding down at night. Go as slow as you like. 💞</p>`,
  mount(ctx) { ctx.mode === "online" ? online(ctx) : local(ctx); },
};

function cardView(level, text, turnName) {
  return el("div", { class: "deck-card" }, [
    el("div", { class: "lvl" }, levelLabel(level)),
    el("div", { class: "prompt" }, text),
    el("div", { class: "turn" }, `${turnName}'s turn to answer 💬`),
  ]);
}

function online(ctx) {
  const { session } = ctx;
  const isHost = session.isHost;
  let level = "cute", deck = [], di = 0, turn = 0, cardNo = 0;
  const status = connectionPill();
  session.onStatus(status.set);
  const screen = (body) => render(el("div", { class: "screen" }, [gameHeader(ctx, game, status.node), body]));
  const nameOf = (i) => session.players[i];

  function chooseLevel() {
    const seg = segmented(LEVELS, level, (v) => (level = v));
    screen(el("div", { class: "screen" }, [
      el("div", { class: "hero" }, [el("h2", {}, "Pick a vibe"), el("div", { class: "tag muted" }, "You can change it anytime by coming back here.")]),
      el("div", { class: "card" }, [el("p", { class: "muted center" }, "How deep do you want to go?"), seg.node]),
      el("div", { class: "footer-actions" }, button("Start the deck →", { big: true, onClick: () => { level = seg.get(); session.send("deep_start", { level }); startDeck(); } })),
    ]));
  }
  function startDeck() { deck = shuffle(DEEP[level]); di = 0; turn = 0; cardNo = 0; hostDraw(); }
  function hostDraw() {
    if (di >= deck.length) { deck = shuffle(DEEP[level]); di = 0; }
    const text = deck[di++];
    const cardId = cardNo++;
    session.send("deep_card", { level, text, turn, cardId });
    showCard(text, cardId);
    turn = 1 - turn;
  }
  function showCard(text, cardId) {
    screen(el("div", { class: "screen" }, [
      cardView(level, text, nameOf(turn)),
      el("div", { class: "footer-actions" }, [
        onlineReadyGate(session, `deep:${cardId}`, () => {
          if (isHost) hostDraw();
        }, { label: "Ready for next ->" }),
        button("Change vibe", { variant: "ghost", onClick: () => isHost ? chooseLevel() : session.send("deep_relevel") }),
      ]),
    ]));
  }

  session.on("deep_start", (m) => { level = m.level; });
  session.on("deep_card", (m) => { level = m.level; turn = m.turn; showCard(m.text, m.cardId); });
  if (isHost) {
    session.on("deep_relevel", () => chooseLevel());
  } else {
    session.on("deep_relevel_go", () => {}); // reserved
  }

  if (isHost) chooseLevel();
  else screen(el("div", { class: "waiting" }, [el("div", { class: "spinner" }), `Waiting for ${session.partnerName} to pick a vibe…`]));
}

function local(ctx) {
  const names = ctx.players;
  let level = "cute", deck = [], di = 0, turn = 0;
  const statusEl = el("span", { class: "pill" }, "Pass & play");
  const screen = (body) => render(el("div", { class: "screen" }, [gameHeader(ctx, game, statusEl), body]));

  function chooseLevel() {
    const seg = segmented(LEVELS, level, (v) => (level = v));
    screen(el("div", { class: "screen" }, [
      el("div", { class: "hero" }, [el("h2", {}, "Pick a vibe"), el("div", { class: "tag muted" }, "Take turns answering each card.")]),
      el("div", { class: "card" }, [el("p", { class: "muted center" }, "How deep do you want to go?"), seg.node]),
      el("div", { class: "footer-actions" }, button("Start the deck →", { big: true, onClick: () => { level = seg.get(); deck = shuffle(DEEP[level]); di = 0; turn = 0; draw(); } })),
    ]));
  }
  function draw() {
    if (di >= deck.length) { deck = shuffle(DEEP[level]); di = 0; }
    const text = deck[di++];
    screen(el("div", { class: "screen" }, [
      cardView(level, text, names[turn]),
      el("div", { class: "footer-actions" }, [
        localReadyGate(names, () => { turn = 1 - turn; draw(); }, { label: "ready" }),
        button("Change vibe", { variant: "ghost", onClick: chooseLevel }),
      ]),
    ]));
  }
  chooseLevel();
}

export default game;
