// "Word Duel" — pick a secret word, crack your opponent's with Wordle-style clues.
import { el, render, button, connectionPill, passDevice, gameHeader, celebrate, haptic, onlineReadyGate } from "../ui.js";
import { scoreGuess } from "../data/words.js";

const acceptWord = (word, wordLen) => /^[a-z]+$/.test(word) && word.length === wordLen;

const game = {
  id: "wordduel",
  title: "Word Duel",
  emoji: "🟩",
  color: "linear-gradient(135deg,#6aaa64,#c9b458 55%,#787c7e)",
  blurb: "Pick a secret word. Crack theirs before they crack yours!",
  minPlayers: 2,
  maxPlayers: 2,
  onlineMaxPlayers: 2,
  modes: ["local", "online"],
  estMinutes: 10,
  lobbySettings: [
    { key: "wordLength", label: "Letters", type: "choice", options: [4, 5, 6], default: 5 },
    { key: "maxGuesses", label: "Guesses each", type: "choice", options: [4, 5, 6, 7, 8], default: 6 },
  ],
  rulesHTML: `
    <p>Each player secretly picks a word. Then you take turns guessing each other's word.</p>
    <ol>
      <li>After each guess: <b>green</b> = right spot, <b>yellow</b> = wrong spot, <b>gray</b> = not in word.</li>
      <li>First to guess the opponent's word wins!</li>
      <li>Host sets word length and max guesses in the lobby.</li>
    </ol>`,
  mount(ctx) {
    if (ctx.mode === "online") online(ctx);
    else local(ctx);
  },
};

const header = (ctx, statusEl) => gameHeader(ctx, game, statusEl);

function tile(letter, state) {
  return el("div", { class: `wd-tile ${state || ""}` }, (letter || "").toUpperCase());
}

function board(rows, wordLen) {
  const padded = rows.slice();
  while (padded.length < 1 && wordLen) padded.push({});
  return el("div", { class: "wd-board" },
    (rows.length ? rows : [{ letters: [], feedback: [] }]).map((row) => el("div", { class: "wd-row" },
      Array.from({ length: wordLen }, (_, i) => tile(row.letters?.[i], row.feedback?.[i])))));
}

function secretInput(wordLen, label, onDone) {
  const input = el("input", {
    class: "field wd-secret-input",
    type: "text",
    maxlength: String(wordLen),
    placeholder: `${wordLen}-letter word…`,
    autocomplete: "off",
    autocapitalize: "characters",
    spellcheck: "false",
    enterkeyhint: "done",
  });
  const btn = button("Lock secret word 🔒", { big: true, disabled: true, onClick: () => {
    const w = input.value.trim().toLowerCase();
    if (acceptWord(w, wordLen)) onDone(w);
  } });
  input.addEventListener("input", () => {
    btn.disabled = !acceptWord(input.value.trim().toLowerCase(), wordLen);
  });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !btn.disabled) btn.click(); });
  setTimeout(() => input.focus(), 40);
  return el("div", { class: "card stack" }, [
    el("div", { class: "pill" }, label),
    el("p", { class: "muted center" }, `Pick any ${wordLen}-letter word.`),
    input,
    btn,
  ]);
}

function guessForm(wordLen, label, onDone) {
  const input = el("input", {
    class: "field wd-secret-input",
    type: "text",
    maxlength: String(wordLen),
    placeholder: "Your guess…",
    autocomplete: "off",
    autocapitalize: "characters",
    spellcheck: "false",
    enterkeyhint: "go",
  });
  const btn = button("Submit guess", { big: true, disabled: true, onClick: () => {
    const w = input.value.trim().toLowerCase();
    if (acceptWord(w, wordLen)) onDone(w);
  } });
  input.addEventListener("input", () => {
    btn.disabled = !acceptWord(input.value.trim().toLowerCase(), wordLen);
  });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !btn.disabled) btn.click(); });
  setTimeout(() => input.focus(), 40);
  return el("div", { class: "card stack" }, [el("div", { class: "pill" }, label), input, btn]);
}

function waiting(msg) {
  return el("div", { class: "waiting card center" }, [el("div", { class: "spinner" }), msg]);
}

function online(ctx) {
  const { session } = ctx;
  const wordLen = session.settings?.wordLength || 5;
  const maxGuesses = session.settings?.maxGuesses || 6;
  const names = session.players;
  const myIndex = session.myIndex;
  const isHost = session.isHost;

  const secrets = [null, null];
  const histories = [[], []];
  const guessCounts = [0, 0];
  let turn = 0;
  let round = 0;

  const status = connectionPill();
  session.onStatus(status.set);
  const screen = (body) => render(el("div", { class: "screen" }, [header(ctx, status.node), body]));
  const opponent = (i) => 1 - i;

  function tryStart() {
    if (!isHost || !secrets[0] || !secrets[1]) return;
    turn = 0;
    secrets.forEach((word, index) => session.sendTo(index, "wd_restore_secret", { word, round }));
    session.send("wd_start", { turn });
    showTurn();
  }

  function showResult(msg, revealedSecrets = secrets) {
    celebrate();
    screen(el("div", { class: "stack" }, [
      el("div", { class: "card center" }, [
        el("div", { class: "verdict match" }, msg),
        el("p", { class: "muted" }, `${names[0]}: "${revealedSecrets[0]}" · ${names[1]}: "${revealedSecrets[1]}"`),
      ]),
      el("div", { class: "card" }, [el("p", { class: "muted center" }, `${names[0]}'s board`), board(histories[0], wordLen)]),
      el("div", { class: "card" }, [el("p", { class: "muted center" }, `${names[1]}'s board`), board(histories[1], wordLen)]),
      el("div", { class: "footer-actions" }, onlineReadyGate(session, `wd:${round}`, resetRound, { label: "Ready for rematch" })),
    ]));
  }

  function resetRound() {
    if (!isHost) return;
    round++;
    secrets[0] = null; secrets[1] = null;
    histories[0] = []; histories[1] = [];
    guessCounts[0] = 0; guessCounts[1] = 0;
    session.send("wd_reset", { round });
    showSecretForm();
  }

  function afterGuess(player, word, feedback) {
    histories[player].push({ letters: word.split(""), feedback });
    guessCounts[player]++;
    if (word === secrets[opponent(player)]) {
      session.send("wd_turn", { turn, histories, guessCounts, winner: player, secrets, round, msg: `${names[player]} cracked it!` });
      showResult(`${names[player]} cracked it!`, secrets);
      return;
    }
    if (guessCounts[0] >= maxGuesses && guessCounts[1] >= maxGuesses) {
      session.send("wd_turn", { turn, histories, guessCounts, winner: -1, secrets, round, msg: "Both ran out of guesses - draw" });
      showResult("Both ran out of guesses - draw", secrets);
      return;
    }
    turn = opponent(player);
    session.send("wd_turn", { turn, histories, guessCounts, winner: null });
    showTurn();
  }

  function showTurn() {
    if (turn !== myIndex) {
      screen(el("div", { class: "stack" }, [
        waiting(`${names[turn]}'s turn…`),
        el("div", { class: "card" }, [el("p", { class: "muted center" }, "Your guesses"), board(histories[myIndex], wordLen)]),
      ]));
      return;
    }
    screen(el("div", { class: "stack" }, [
      board(histories[myIndex], wordLen),
      guessForm(wordLen, `Guess ${names[opponent(myIndex)]}'s word (${guessCounts[myIndex] + 1}/${maxGuesses})`, (word) => {
        haptic(8);
        if (isHost) {
          afterGuess(myIndex, word, scoreGuess(secrets[opponent(myIndex)], word));
        } else {
          session.send("wd_guess", { word });
          screen(waiting("Checking guess…"));
        }
      }),
    ]));
  }

  session.on("wd_secret", (m) => {
    if (!isHost) return;
    secrets[m.from] = m.word;
    tryStart();
  });
  session.on("wd_guess", (m) => {
    if (!isHost) return;
    const feedback = scoreGuess(secrets[opponent(m.from)], m.word);
    afterGuess(m.from, m.word, feedback);
  });
  session.on("wd_start", () => showTurn());
  session.on("wd_turn", (m) => {
    turn = m.turn;
    histories[0] = m.histories[0];
    histories[1] = m.histories[1];
    guessCounts[0] = m.guessCounts[0];
    guessCounts[1] = m.guessCounts[1];
    if (m.winner != null) { round = m.round; showResult(m.msg || "Game over", m.secrets); }
    else showTurn();
  });
  session.on("wd_restore_secret", (m) => { secrets[myIndex] = m.word; round = m.round; });
  session.on("wd_reset", (m) => {
    if (isHost) return;
    round = m.round;
    secrets[0] = null; secrets[1] = null;
    histories[0] = []; histories[1] = [];
    guessCounts[0] = 0; guessCounts[1] = 0;
    showSecretForm();
  });

  function showSecretForm() {
    screen(secretInput(wordLen, `${names[myIndex]} — your secret word`, (word) => {
      secrets[myIndex] = word;
      if (isHost) {
        if (secrets[1]) tryStart();
        else screen(waiting(`Waiting for ${names[1]}'s secret word…`));
      } else {
        session.send("wd_secret", { word });
        screen(waiting(`Waiting for ${names[opponent(myIndex)]}…`));
      }
    }));
  }

  showSecretForm();
}

function local(ctx) {
  const settings = ctx.settings || ctx.session?.settings || {};
  const wordLen = settings.wordLength || 5;
  const maxGuesses = settings.maxGuesses || 6;
  const names = ctx.players;
  const statusEl = el("span", { class: "pill" }, "2 players");
  const screen = (body) => render(el("div", { class: "screen" }, [header(ctx, statusEl), body]));

  const secrets = [null, null];
  const histories = [[], []];
  const guessCounts = [0, 0];
  let turn = 0;
  const opponent = (i) => 1 - i;

  function showResult(msg) {
    celebrate();
    screen(el("div", { class: "stack" }, [
      el("div", { class: "card center" }, [el("div", { class: "verdict match" }, msg)]),
      el("div", { class: "card" }, [el("p", { class: "muted center" }, `${names[0]}'s board`), board(histories[0], wordLen)]),
      el("div", { class: "card" }, [el("p", { class: "muted center" }, `${names[1]}'s board`), board(histories[1], wordLen)]),
      el("div", { class: "footer-actions" }, button("Play again ↻", { big: true, onClick: run })),
    ]));
  }

  function afterGuess(player, word, feedback) {
    histories[player].push({ letters: word.split(""), feedback });
    guessCounts[player]++;
    if (word === secrets[opponent(player)]) { showResult(`${names[player]} cracked it! 🎯`); return; }
    if (guessCounts[0] >= maxGuesses && guessCounts[1] >= maxGuesses) { showResult("Draw! 🤝"); return; }
    turn = opponent(player);
    showTurn();
  }

  function showTurn() {
    passDevice(names[turn], `Your turn — guess ${names[opponent(turn)]}'s word!`).then(() => {
      screen(el("div", { class: "stack" }, [
        board(histories[turn], wordLen),
        guessForm(wordLen, `${names[turn]} (${guessCounts[turn] + 1}/${maxGuesses})`, (word) => {
          haptic(8);
          afterGuess(turn, word, scoreGuess(secrets[opponent(turn)], word));
        }),
      ]));
    });
  }

  async function run() {
    for (let i = 0; i < 2; i++) {
      await passDevice(names[i], "Pick your secret word!");
      await new Promise((res) => {
        screen(secretInput(wordLen, `${names[i]} — secret word`, (word) => { secrets[i] = word; res(); }));
      });
    }
    turn = 0;
    showTurn();
  }

  run();
}

export default game;
