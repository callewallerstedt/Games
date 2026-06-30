# 🎲 Together

Quick, silly games to play with someone — on **one phone** (pass it back and forth)
or on **two phones** (your partner joins by scanning a QR code or opening a link).

No app server, no sign-up, no build step. It's a plain static website. When you play on
two phones the connection is **peer-to-peer** (WebRTC via [PeerJS](https://peerjs.com));
only the brief "let's find each other" handshake touches PeerJS's free public service, and
the game data then flows directly between the two phones.

## Games

| Game | What it is |
| --- | --- |
| 🤔 **Would You Rather** | You both tap A or B at the same time, then it reveals together. Match = compatibility points; differ = fun debate. |
| 💌 **How Well Do You Know Me?** | Newlywed-style: one answers about themselves, the other guesses, then the answerer judges it. Co-op "how well you know each other" score. |
| 🤥 **Two Truths & a Lie** | Write two truths and a lie about yourself; your partner hunts the lie. Swap roles. |
| 💬 **Deep Dive** | A conversation card deck with levels — Cute → Deep → Spicy. No points, just real talk. |
| 🕵️ **Impostor** | 3–10 players, one phone. Everyone answers the same question except one secret impostor with a different one. Discuss and vote who's the odd one out. |
| 🐮 **Think Alike** | You both secretly answer the same simple question, then it reveals at the same time. Match = you think alike! (One phone supports 2–8 players with the classic Pink Cow 🐷.) |
| 🎨 **Color Clue** | One person sees a secret colour and gives a 1–2 word clue; the other taps it on the spectrum. The closer the guess, the more points. Co-op — swap roles and beat your high score. |
| ⚓ **Fleet Strike** | Place five ships, then trade coordinate shots. Separate attack and defence boards keep every hit, miss, and sunk ship clear. |
| 🎲 **Liar's Dice** | Bid on all hidden dice, raise the stakes, or call the previous player's bluff. |
| ⏱️ **Letter Rush** | Shout an answer in the category, tap its first letter, and pass the turn before time expires. |
| 📏 **Closest Guess** | Secretly estimate surprising quantities; the closest answer scores. |
| 🤯 **Crazy True or False** | Make a secret call on wild facts, reveal the explanation, and score correct answers. |
| 📐 **Triangle Lines** | Connect neighboring dots, claim completed triangles, and take another turn when you score. |
| 🔎 **Case Files** | Reveal evidence together, discuss the suspects, then make secret accusations. |
| 🔐 **Neon Code** | Create a hidden four-symbol sequence, then use exact and near-match clues to crack it in eight guesses. |
| ⚡ **Flash Duel** | Face each other across one phone, survive the fake signals, and race to tap first when the screen flashes. |
| 📱 **New Phone Who Dis?** | Reply to a mystery text with the funniest of your 5 absurd cards. Replies reveal anonymously, everyone votes, the best one scores. Edit the cards in `js/data/newphone.js`. |

Installable as a home-screen app (PWA): on iPhone, open in Safari → Share → **Add to Home
Screen** for a full-screen, offline-capable experience.

**Themes:** tap 🎨 on the home screen to switch between Default, 🌸 Cute (pink), and 🌙 Dark.

**Reconnecting (two phones):** the host's room stays open, so if a phone drops, just reopen
the link or scan the QR again (tap the connection pill mid-game to re-show it) — you'll be
dropped back into the current round.

More games can be added easily — see below.

## Play it locally

It's just static files, so any static server works:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

To try **two phones** on your computer, open the home page in one browser window, choose a
game → **Two phones**, then copy the join link into a second window (or an incognito/private
window). On real phones, just scan the QR with the camera.

## Deploy to GitHub Pages (free)

A workflow at `.github/workflows/pages.yml` deploys the site automatically on every push.
One-time setup in the repo:

1. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
2. Push to `main` (or the working branch) — the workflow publishes the site.
3. Your URL will be `https://<your-username>.github.io/<repo>/`.

Everything uses relative paths and hash-based routing, so it works under that sub-path and
survives page refreshes.

## Adding a new game

1. Create `js/games/<your-game>.js` exporting a game module:

   ```js
   export default {
     id, title, emoji, blurb,
     minPlayers, maxPlayers,
     modes: ["local", "online"],   // which ways it can be played
     estMinutes, rulesHTML,
     mount(ctx) { /* ctx: { mode, isHost, session, players, exit } */ },
   };
   ```

2. Import and add it to the array in `js/games/registry.js`.

The home hub, lobby, rules modal, and connection handling are all shared — your game just
renders screens and (for online) sends/receives messages via `session.send(type, payload)`
and `session.on(type, handler)`.

## Project layout

```
index.html            app shell
styles.css            design system (mobile-first, light/dark)
js/
  main.js             router + home hub + lobby (host/join/local setup)
  net.js              PeerJS wrapper (host/join, reconnect)
  session.js          uniform interface games talk to (local or online)
  ui.js               shared DOM + UI helpers
  qr.js               QR code generation
  games/
    registry.js       the game catalogue
    herd.js           Think Alike
    hues.js           Color Clue
  data/
    herd-questions.js question bank
vendor/               peerjs.min.js, qrcode.min.js (vendored, no CDN at runtime)
```
