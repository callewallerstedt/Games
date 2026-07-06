// Router + home hub. Lobby & player setup in separate modules.
import {
  el, render, topbar, registerSW, iosInstallTip, applyTheme, themePicker,
  disposeActiveGame, bindReactionSession, maybeShowWelcome, showWelcomeGuide,
  suggestGameModal, matchesGameSearch,
} from "./ui.js";
import { GAMES, getGame } from "./games/registry.js";
import { openScanner } from "./scan.js";
import { qrScanIcon } from "./qr.js";
import { hubProfileCard } from "./player-setup.js";
import { cleanupLobby, gameLobby, hostFlow, joinFlow, startOnline, startLocal } from "./lobby.js";
import { probe as probeSocial, friendsButton, onSocialChange, friendsBadgeCount, scheduleSync, setPresenceContext } from "./social.js";

const go = (hash) => { if (location.hash === hash) router(); else location.hash = hash; };
const home = () => go("#/");

const FAVORITES_KEY = "party_game_favorites";
let hubSearchQuery = "";

function cleanup() {
  disposeActiveGame();
  bindReactionSession(null);
  cleanupLobby();
  document.body.classList.remove("hub-menu");
  document.querySelectorAll(".pass, .modal-bg, .toast").forEach((n) => n.remove());
}

function router() {
  cleanup();
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[0] === "g" && getGame(parts[1])) {
    const g = getGame(parts[1]);
    return gameLobby(g, {
      home,
      onLocal: (settings) => startLocal(g, home, { onBack: () => go(`#/g/${g.id}`), settings }),
      onHost: () => hostFlow(g, {
        home,
        startOnline: (game, transport, opts) => startOnline(game, transport, { ...opts, exit: home }),
        onLocalFallback: () => startLocal(g, home, { onBack: () => go(`#/g/${g.id}`) }),
      }),
    });
  }
  if (parts[0] === "join" && parts[1] && parts[2]) {
    return joinFlow(parts[1], parts[2], {
      home,
      getGame,
      startOnline: (game, transport, opts) => startOnline(game, transport, { ...opts, exit: home }),
    });
  }
  return hub();
}
window.addEventListener("hashchange", router);
window.addEventListener("DOMContentLoaded", router);
if (document.readyState !== "loading") router();
applyTheme();
registerSW();
probeSocial().then((available) => { if (available && isOnHub()) hub(); });

const isOnHub = () => !location.hash || location.hash === "#/" || location.hash === "#";
// Keep the friends badge (and the hub's shown name) fresh without re-rendering
// and stealing focus from the hub.
onSocialChange(() => {
  const btn = document.querySelector(".friends-btn");
  if (btn) {
    const count = friendsBadgeCount();
    let badge = btn.querySelector(".friends-badge");
    if (!count) { badge?.remove(); }
    else {
      if (!badge) { badge = el("span", { class: "friends-badge" }); btn.append(badge); }
      badge.textContent = String(count);
    }
  }
  // Signing in adopts the username as the player name — reflect it in the hub's
  // compact profile chip immediately (skip while the edit field is focused).
  const name = localStorage.getItem("together_name");
  const chip = document.querySelector(".profile-compact-name");
  if (chip && name && document.activeElement?.tagName !== "INPUT") chip.textContent = name;
});

function favoriteIds() {
  try { return new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]")); }
  catch { return new Set(); }
}
function saveFavorites(ids) {
  try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(ids))); } catch {}
  scheduleSync();
}

function hub() {
  document.body.classList.add("hub-menu");
  setPresenceContext({ status: "online" });
  const scanBtn = el("button", {
    class: "iconbtn scan-btn",
    "aria-label": "Scan QR to join",
    title: "Scan to join",
    onClick: () => openScanner((gameId, peerId) => go(`#/join/${gameId}/${peerId}`)),
  }, qrScanIcon());

  const themeBtn = el("button", { class: "iconbtn theme-fab", "aria-label": "Appearance", title: "Appearance", onClick: () => themePicker(() => hub()) }, "◐");

  const favorites = favoriteIds();
  let cardIndex = 0;
  const gameCard = (g) => {
    const i = cardIndex++;
    const isFavorite = favorites.has(g.id);
    const favoriteButton = el("button", {
      class: `favorite-btn${isFavorite ? " active" : ""}`,
      "aria-label": `${isFavorite ? "Remove" : "Add"} ${g.title} ${isFavorite ? "from" : "to"} favorites`,
      title: isFavorite ? "Remove favorite" : "Add favorite",
      onClick: () => {
        if (favorites.has(g.id)) favorites.delete(g.id); else favorites.add(g.id);
        saveFavorites(favorites);
        hub();
      },
    }, isFavorite ? "★" : "☆");
    const openButton = el("button", { class: "game-card", style: `animation-delay:${i * 0.025}s`, onClick: () => go(`#/g/${g.id}`) }, [
      el("div", { class: "game-mark", style: g.color ? `--game-color:${g.color}` : "" }, g.title.slice(0, 2).toUpperCase()),
      el("div", { class: "body" }, [
        el("div", { class: "title" }, [g.emoji ? el("span", { class: "game-card-emoji", "aria-hidden": "true" }, `${g.emoji} `) : null, g.title]),
        el("div", { class: "blurb" }, g.blurb),
        el("div", { class: "meta" }, [
          el("span", {}, `${g.minPlayers === g.maxPlayers ? g.minPlayers : `${g.minPlayers}–${g.maxPlayers}`} players`),
          el("span", {}, `~${g.estMinutes} min`),
        ]),
      ]),
      el("div", { class: "chev" }, "›"),
    ]);
    return el("div", { class: "game-card-wrap" }, [openButton, favoriteButton]);
  };

  const filterGames = (list) => list.filter((g) => matchesGameSearch(g, hubSearchQuery));
  const favoriteGames = filterGames(GAMES.filter((g) => favorites.has(g.id)));
  const otherGames = filterGames(GAMES.filter((g) => !favorites.has(g.id)));
  const totalVisible = favoriteGames.length + otherGames.length;
  const searching = hubSearchQuery.trim().length > 0;

  const searchInput = el("input", {
    class: "field hub-search",
    type: "search",
    placeholder: "Search games…",
    value: hubSearchQuery,
    "aria-label": "Search games",
    autocomplete: "off",
    oninput: (event) => {
      hubSearchQuery = event.target.value;
      hub();
    },
  });
  if (searching) {
    queueMicrotask(() => {
      const input = document.querySelector(".hub-search");
      if (!input) return;
      input.focus();
      const end = input.value.length;
      input.setSelectionRange(end, end);
    });
  }

  const sections = totalVisible ? [
    favoriteGames.length ? el("section", { class: "game-section" }, [
      el("h2", { class: "section-title" }, "Favorites"),
      el("div", { class: "game-grid" }, favoriteGames.map(gameCard)),
    ]) : null,
    otherGames.length ? el("section", { class: "game-section" }, [
      el("h2", { class: "section-title" }, favoriteGames.length ? "All games" : "Games"),
      el("div", { class: "game-grid" }, otherGames.map(gameCard)),
    ]) : null,
  ] : [
    el("div", { class: "card center hub-empty" }, [
      el("p", { class: "muted" }, `No games match “${hubSearchQuery.trim()}”.`),
      button("Clear search", { onClick: () => { hubSearchQuery = ""; hub(); } }),
    ]),
  ];

  render([
    topbar({ right: el("div", { style: "display:flex; gap:8px" }, [friendsButton(), scanBtn, themeBtn]) }),
    el("div", { class: "hero" }, [
      el("h1", {}, "Games for the room"),
      el("div", { class: "hero-actions" }, [
        el("div", { class: "tag" }, "Play on one device or host a room for friends."),
        el("button", {
          class: "btn ghost welcome-link",
          type: "button",
          onClick: () => showWelcomeGuide({ force: true }),
        }, "How it works"),
      ]),
    ]),
    el("div", { class: "card", style: "margin-bottom:14px" }, [
      hubProfileCard({ onUpdate: hub }),
    ]),
    el("div", { class: "hub-toolbar card" }, [
      searchInput,
      el("div", { class: "hub-toolbar-actions" }, [
        searching && hubSearchQuery.trim()
          ? el("button", {
            class: "btn ghost hub-clear-search",
            type: "button",
            onClick: () => { hubSearchQuery = ""; hub(); },
          }, "Clear")
          : null,
        el("button", {
          class: "btn secondary hub-suggest-btn",
          type: "button",
          onClick: () => suggestGameModal(),
        }, "Suggest a game"),
      ]),
    ]),
    ...sections,
    iosInstallTip(),
    el("p", { class: "muted center hub-footnote" }, `${GAMES.length} games · v${GAMES.length}-pack`),
  ]);
  maybeShowWelcome();
}
