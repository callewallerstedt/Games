// Router + home hub. Lobby & player setup in separate modules.
import { el, render, topbar, registerSW, iosInstallTip, applyTheme, themePicker, disposeActiveGame } from "./ui.js";
import { GAMES, getGame } from "./games/registry.js";
import { openScanner } from "./scan.js";
import { fakeMiniQrIcon } from "./qr.js";
import { playerColorControl, rememberedName, saveName, rememberedColor, saveColor } from "./player-setup.js";
import { cleanupLobby, gameLobby, hostFlow, joinFlow, startOnline, startLocal } from "./lobby.js";

const go = (hash) => { if (location.hash === hash) router(); else location.hash = hash; };
const home = () => go("#/");

function cleanup() {
  disposeActiveGame();
  cleanupLobby();
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

const FAVORITES_KEY = "party_game_favorites";
function favoriteIds() {
  try { return new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]")); }
  catch { return new Set(); }
}
function saveFavorites(ids) {
  try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(ids))); } catch {}
}

function hub() {
  let myColor = rememberedColor();
  const nameInput = el("input", {
    class: "field",
    placeholder: "Your name",
    value: rememberedName(),
    maxlength: "16",
    enterkeyhint: "done",
    style: "text-align:left",
    oninput: (e) => saveName(e.target.value.trim()),
    onchange: (e) => saveName(e.target.value.trim()),
  });
  const colorControl = playerColorControl(() => nameInput.value.trim() || "you", myColor, (color) => {
    myColor = color;
    saveColor(color);
  });

  const scanBtn = el("button", {
    class: "iconbtn scan-btn",
    "aria-label": "Scan QR to join",
    title: "Scan to join",
    onClick: () => openScanner((gameId, peerId) => go(`#/join/${gameId}/${peerId}`)),
  }, fakeMiniQrIcon());

  const themeBtn = el("button", { class: "iconbtn theme-fab", "aria-label": "Appearance", title: "Appearance", onClick: () => themePicker(() => hub()) }, "◐");

  const favorites = favoriteIds();
  const gameCard = (g, i) => {
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
        el("div", { class: "title" }, g.title),
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
  const favoriteGames = GAMES.filter((g) => favorites.has(g.id));
  const otherGames = GAMES.filter((g) => !favorites.has(g.id));
  const sections = [
    favoriteGames.length ? el("section", { class: "game-section" }, [
      el("h2", { class: "section-title" }, "Favorites"),
      el("div", { class: "game-grid" }, favoriteGames.map(gameCard)),
    ]) : null,
    el("section", { class: "game-section" }, [
      el("h2", { class: "section-title" }, favoriteGames.length ? "All games" : "Games"),
      el("div", { class: "game-grid" }, otherGames.map(gameCard)),
    ]),
  ];
  render([
    topbar({ right: el("div", { style: "display:flex; gap:8px" }, [scanBtn, themeBtn]) }),
    el("div", { class: "hero" }, [
      el("h1", {}, "Games for the room"),
      el("div", { class: "tag" }, "Play on one device or host a room for friends."),
    ]),
    el("div", { class: "card stack", style: "margin-bottom:14px" }, [
      el("p", { class: "muted", style: "margin:0 0 8px; font-size:.9rem" }, "Your name (saved on this device)"),
      el("div", { class: "name-row" }, [colorControl, nameInput]),
      el("p", { class: "muted color-hint" }, "Tap the color circle to make it yours."),
    ]),
    ...sections,
    iosInstallTip(),
    el("p", { class: "muted center", style: "margin-top:22px; font-size:.82rem" },
      `${GAMES.length} games · v${GAMES.length}-pack`),
  ]);
}
