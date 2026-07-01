// New Phone Who Dis? — reply to a mystery text with your funniest card, then
// everyone votes anonymously for the best reply.
//
// To change the cards, edit js/data/newphone.js (START_CARDS + REPLY_CARDS).
import {
  el, render, button, pill, connectionPill, passDevice, gameHeader, celebrate,
  haptic, onlineReadyGate, localReadyGate, scoreboard, setGameCleanup, shuffle,
} from "../ui.js";
import { START_CARDS, REPLY_CARDS } from "../data/newphone.js";

const HAND_SIZE = 5;
// Safety net: if a player's connection drops a message, don't let the round
// hang forever — force it through this long after the phase opens.
const STALL_TIMEOUT_MS = 45000;

const game = {
  id: "newphone",
  title: "New Phone Who Dis?",
  emoji: "📱",
  color: "linear-gradient(135deg,#0a84ff,#34c759)",
  blurb: "Reply to a mystery text with your most absurd card. Funniest reply wins the vote.",
  minPlayers: 3,
  maxPlayers: 10,
  modes: ["local", "online"],
  estMinutes: 15,
  lobbySettings: [
    { key: "winScore", label: "Points to win", type: "choice", options: [3, 5, 7, "Endless"], default: 5 },
  ],
  rulesHTML: `
    <p>You just got a text from an unknown number. Reply with the funniest card in your hand.</p>
    <ol>
      <li>Everyone holds <b>5 absurd reply cards</b> and plays one in response to the text.</li>
      <li>Replies are revealed <b>one at a time, anonymously</b>.</li>
      <li>Everyone votes for their favourite (you can't vote for your own).</li>
      <li>The most-voted reply scores a point. First to the target score wins.</li>
    </ol>
    <p class="muted">Tip: the cards are easy to swap out — edit <code>js/data/newphone.js</code>.</p>`,
  mount(ctx) { if (ctx.mode === "online") online(ctx); else local(ctx); },
};

// A reusable deck that deals reply cards without repeating, reshuffling the
// discard (minus cards still held in hands) once it runs dry.
function makeDeck(heldProvider) {
  let pile = shuffle(REPLY_CARDS);
  let ptr = 0;
  return function draw() {
    if (ptr >= pile.length) {
      const held = new Set(heldProvider ? heldProvider() : []);
      pile = shuffle(REPLY_CARDS.filter((c) => !held.has(c)));
      ptr = 0;
      if (!pile.length) pile = shuffle(REPLY_CARDS); // tiny deck fallback
    }
    return pile[ptr++];
  };
}

function textBubble(message) {
  return el("div", { class: "np-thread" }, [
    el("div", { class: "np-avatar" }, "?"),
    el("div", {}, [
      el("div", { class: "np-sender" }, "Unknown number"),
      el("div", { class: "np-bubble in" }, message),
    ]),
  ]);
}

// A player's hand: tappable reply cards. onPick(card).
function handPicker(prompt, hand, name, onPick) {
  let chosen = null;
  const cards = hand.map((card) => el("button", {
    class: "np-card",
    onClick: () => { chosen = card; draw(); },
  }, card));
  const submit = button("Send reply", { big: true, disabled: true, onClick: () => onPick(chosen) });
  function draw() {
    cards.forEach((node, i) => node.classList.toggle("sel", hand[i] === chosen));
    submit.disabled = chosen == null;
  }
  return el("div", { class: "screen" }, [
    el("div", { class: "np-head" }, [el("strong", {}, name), el("span", { class: "muted tiny" }, "Pick your reply")]),
    textBubble(prompt),
    el("div", { class: "np-hand" }, cards),
    el("div", { class: "footer-actions" }, submit),
  ]);
}

// Reveal replies one at a time (anonymously), then let the reply cards become
// vote buttons. myCard (if set) is disabled — you can't vote for yourself.
// onVote(card) fires when a vote is locked. Returns the screen node.
function revealAndVote(prompt, plays, myCard, voteEnabled, onVote) {
  let voted = null;
  const cards = plays.map((card) => el("button", {
    class: "np-card reply np-hidden",
    disabled: true,
    onClick: () => {
      if (voted != null || !voteEnabled) return;
      voted = card;
      cards.forEach((n, i) => { n.disabled = true; n.classList.toggle("voted", plays[i] === card); });
      status.textContent = "Vote locked. Waiting for the room…";
      onVote(card);
    },
  }, card));

  const status = el("div", { class: "muted tiny center np-vote-status" }, "Reading the replies…");
  const list = el("div", { class: "np-replies" }, cards);

  // Stagger the reveal, then unlock voting.
  cards.forEach((node, i) => {
    setTimeout(() => {
      node.classList.remove("np-hidden");
      node.classList.add("reveal-anim");
      haptic(8);
      if (i === cards.length - 1) {
        setTimeout(() => {
          if (!voteEnabled) { status.textContent = "Replies are in."; return; }
          status.textContent = "Tap your favourite reply 👇";
          cards.forEach((n, j) => {
            if (plays[j] === myCard) n.classList.add("mine"); // your own reply — can't vote
            else n.disabled = false;
          });
        }, 450);
      }
    }, 650 * i + 250);
  });

  return el("div", { class: "screen" }, [
    el("div", { class: "np-head" }, [el("strong", {}, "The replies"), el("span", { class: "muted tiny" }, "Who said what? 🤔")]),
    textBubble(prompt),
    list,
    status,
  ]);
}

function resultView(ctx, payload, nextNode) {
  const max = Math.max(0, ...payload.entries.map((e) => e.votes));
  const cards = payload.entries
    .slice()
    .sort((a, b) => b.votes - a.votes)
    .map((e) => el("div", { class: `np-result-card ${e.votes === max && max > 0 ? "win" : ""}` }, [
      el("div", { class: "np-reply-text" }, e.card),
      el("div", { class: "np-result-meta" }, [
        el("span", { class: "np-who" }, payload.names[e.player]),
        el("span", { class: "np-votes" }, `${e.votes} vote${e.votes === 1 ? "" : "s"}`),
      ]),
    ]));
  const winnerNames = payload.winners.map((i) => payload.names[i]);
  if (payload.winners.length) celebrate();
  return el("div", { class: "screen" }, [
    el("div", { class: "verdict match" }, payload.gameOver
      ? `🏆 ${winnerNames.join(" & ")} win${winnerNames.length === 1 ? "s" : ""}!`
      : winnerNames.length ? `🏆 ${winnerNames.join(" & ")} nailed it` : "No votes this round"),
    textBubble(payload.prompt),
    el("div", { class: "np-results" }, cards),
    scoreboard(payload.names, payload.scores, { colors: ctx.playerColors }),
    el("div", { class: "footer-actions" }, nextNode),
  ]);
}

function tally(plays, votes, scores, winScore) {
  // plays: [{player, card}] in reveal order. votes: array of voted card strings.
  const entries = plays.map((p) => ({ ...p, votes: 0 }));
  const byCard = new Map(entries.map((e) => [e.card, e]));
  votes.forEach((card) => { const e = byCard.get(card); if (e) e.votes++; });
  const max = Math.max(0, ...entries.map((e) => e.votes));
  const winners = max > 0 ? entries.filter((e) => e.votes === max).map((e) => e.player) : [];
  winners.forEach((p) => { scores[p]++; });
  const target = Number(winScore);
  const gameOver = Number.isFinite(target) && scores.some((s) => s >= target);
  return { entries, winners, gameOver };
}

function winScoreOf(settings) {
  const raw = settings?.winScore;
  return raw === "Endless" ? Infinity : (Number(raw) || 5);
}

// ---------------------------------------------------------------------------
function online(ctx) {
  const { session } = ctx;
  const names = session.players;
  const winScore = winScoreOf(session.settings);
  const scores = names.map(() => 0);
  const hands = names.map(() => []);
  const draw = makeDeck(() => hands.flat());
  let round = 0;
  let prompt = "";
  let promptDeck = shuffle(START_CARDS);
  let promptPtr = 0;
  let plays = [];           // host: [{player, card}] once revealed (shuffled order)
  let pending = names.map(() => null); // host: card each player sent
  let votes = names.map(() => null);
  let myHand = [];
  let myCard = null;
  let disposed = false;
  let stallTimeout = null;
  setGameCleanup(() => { disposed = true; clearTimeout(stallTimeout); });

  const status = connectionPill();
  session.onStatus(status.set);
  const screen = (body) => { if (!disposed) render(el("div", { class: "screen" }, [gameHeader(ctx, game, status.node), body])); };
  const wait = (text) => screen(el("div", { class: "card center" }, [el("div", { class: "spinner" }), el("p", { class: "muted" }, text)]));

  function nextPrompt() {
    if (promptPtr >= promptDeck.length) { promptDeck = shuffle(START_CARDS); promptPtr = 0; }
    return promptDeck[promptPtr++];
  }

  function startRound() {
    if (!session.isHost) return;
    round++;
    prompt = nextPrompt();
    pending = names.map(() => null);
    votes = names.map(() => null);
    plays = [];
    names.forEach((_, i) => {
      while (hands[i].length < HAND_SIZE) hands[i].push(draw());
      session.sendTo(i, "np_deal", { round, prompt, hand: hands[i].slice() });
    });
    clearTimeout(stallTimeout);
    stallTimeout = setTimeout(() => revealPhase(true), STALL_TIMEOUT_MS);
  }

  function showHand() {
    screen(handPicker(prompt, myHand, names[session.myIndex], (card) => {
      myCard = card;
      myHand = myHand.filter((c) => c !== card);
      if (session.isHost) recordPlay(session.myIndex, card);
      else session.send("np_play", { round, card });
      wait("Reply sent. Waiting for everyone to answer…");
    }));
  }

  function recordPlay(player, card) {
    if (!session.isHost || pending[player] != null) return;
    pending[player] = card;
    hands[player] = hands[player].filter((c) => c !== card);
    if (pending.every((c) => c != null)) revealPhase();
  }

  function revealPhase(force = false) {
    if (!session.isHost || disposed) return;
    if (!force && !pending.every((c) => c != null)) return;
    clearTimeout(stallTimeout);
    // A player whose connection dropped never sent a card — auto-play one
    // from their hand rather than hanging the round forever.
    pending = pending.map((card, i) => card != null ? card : (hands[i].shift() ?? draw()));
    plays = shuffle(names.map((_, i) => ({ player: i, card: pending[i] })));
    session.send("np_reveal", { round, prompt, plays });
    showReveal({ round, prompt, plays });
    stallTimeout = setTimeout(() => finishRound(true), STALL_TIMEOUT_MS);
  }

  function showReveal(payload) {
    plays = payload.plays;
    const cards = payload.plays.map((p) => p.card);
    screen(revealAndVote(payload.prompt, cards, myCard, true, (card) => {
      if (session.isHost) recordVote(session.myIndex, card);
      else session.send("np_vote", { round: payload.round, card });
    }));
  }

  function recordVote(voter, card) {
    if (!session.isHost || votes[voter] != null) return;
    votes[voter] = card;
    if (votes.every((v) => v != null)) finishRound();
  }

  function finishRound(force = false) {
    if (!session.isHost || disposed) return;
    if (!force && !votes.every((v) => v != null)) return;
    clearTimeout(stallTimeout);
    // Missing votes (dropped connection) are simply excluded from the tally below.
    const { entries, winners, gameOver } = tally(plays, votes.filter(Boolean), scores, winScore);
    const payload = { round, prompt, entries, winners, scores: scores.slice(), names, gameOver };
    session.send("np_result", payload);
    showResult(payload);
  }

  function showResult(payload) {
    const next = payload.gameOver
      ? button("Back to room", { big: true, onClick: () => { setGameCleanup(null); ctx.exit(); } })
      : onlineReadyGate(session, `np:${payload.round}`, startRound, { label: "Next text" });
    screen(resultView(ctx, payload, next));
  }

  session.on("np_deal", (m) => { round = m.round; prompt = m.prompt; myHand = m.hand.slice(); myCard = null; showHand(); });
  session.on("np_play", (m) => { if (session.isHost && m.round === round) recordPlay(m.from, m.card); });
  session.on("np_reveal", (m) => { if (!session.isHost) showReveal(m); });
  session.on("np_vote", (m) => { if (session.isHost && m.round === round) recordVote(m.from, m.card); });
  session.on("np_result", (m) => { if (!session.isHost) showResult(m); });

  if (session.isHost) startRound();
  else wait("Waiting for the host to deal cards…");
}

// ---------------------------------------------------------------------------
function local(ctx) {
  const names = ctx.players;
  const winScore = winScoreOf(ctx.settings);
  const scores = names.map(() => 0);
  const hands = names.map(() => []);
  const draw = makeDeck(() => hands.flat());
  let round = 0;
  let promptDeck = shuffle(START_CARDS);
  let promptPtr = 0;
  let disposed = false;
  setGameCleanup(() => { disposed = true; });
  const status = pill("One device");
  const screen = (body) => { if (!disposed) render(el("div", { class: "screen" }, [gameHeader(ctx, game, status), body])); };

  function nextPrompt() {
    if (promptPtr >= promptDeck.length) { promptDeck = shuffle(START_CARDS); promptPtr = 0; }
    return promptDeck[promptPtr++];
  }

  async function playRound() {
    round++;
    const prompt = nextPrompt();
    names.forEach((_, i) => { while (hands[i].length < HAND_SIZE) hands[i].push(draw()); });

    // 1) Each player privately picks a reply.
    const picks = [];
    for (let i = 0; i < names.length; i++) {
      await passDevice(names[i], "Pick your reply — keep it secret!");
      if (disposed) return;
      const card = await new Promise((resolve) => screen(handPicker(prompt, hands[i], names[i], resolve)));
      if (disposed) return;
      picks[i] = card;
      hands[i] = hands[i].filter((c) => c !== card);
    }

    // 2) Reveal anonymously, then each player votes privately.
    const plays = shuffle(names.map((_, i) => ({ player: i, card: picks[i] })));
    const cards = plays.map((p) => p.card);
    const votes = [];
    for (let i = 0; i < names.length; i++) {
      await passDevice(names[i], "Vote for the funniest reply");
      if (disposed) return;
      const vote = await new Promise((resolve) =>
        screen(revealAndVote(prompt, cards, picks[i], true, resolve)));
      if (disposed) return;
      votes[i] = vote;
    }

    // 3) Tally + results.
    const { entries, winners, gameOver } = tally(plays, votes.filter(Boolean), scores, winScore);
    const payload = { round, prompt, entries, winners, scores: scores.slice(), names, gameOver };
    const next = gameOver
      ? button("Back to games", { big: true, onClick: () => { setGameCleanup(null); ctx.exit(); } })
      : localReadyGate(names, playRound, { label: "Next text" });
    screen(resultView(ctx, payload, next));
  }

  playRound();
}

export default game;
