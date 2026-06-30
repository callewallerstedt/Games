// Router + home hub. Lobby & player setup in separate modules.
import { el, render, topbar, button, rulesModal, registerSW, iosInstallTip, applyTheme, themePicker } from "./ui.js";
import { GAMES, getGame } from "./games/registry.js";
import { openScanner } from "./scan.js";
import { playerColorControl, rememberedName, saveName, rememberedColor, saveColor, defaultLobbySettings } from "./player-setup.js";
import { cleanupLobby, gameLobby, hostFlow, joinFlow, startOnline, startLocal } from "./lobby.js";

const go = (hash) => { if (location.hash === hash) router(); else location.hash = hash; };
const home = () => go("#/");

function cleanup() {
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
    class: "iconbtn",
    "aria-label": "Scan QR to join",
    title: "Scan to join",
    onClick: () => openScanner((gameId, peerId) => go(`#/join/${gameId}/${peerId}`)),
  }, "📷");

  const themeBtn = el("button", { class: "iconbtn theme-fab", "aria-label": "Theme", onClick: () => themePicker(() => hub()) }, "🎨");

  const cards = GAMES.map((g, i) =>
    el("button", { class: "game-card", style: `animation-delay:${i * 0.04}s`, onClick: () => go(`#/g/${g.id}`) }, [
      el("div", { class: "emoji", style: g.color ? `background:${g.color}` : "" }, g.emoji),
      el("div", { class: "body" }, [
        el("div", { class: "title" }, g.title),
        el("div", { class: "blurb" }, g.blurb),
        el("div", { class: "meta" }, [
          el("span", {}, `👥 ${g.minPlayers === g.maxPlayers ? g.minPlayers : `${g.minPlayers}–${g.maxPlayers}`}`),
          el("span", {}, `⏱ ~${g.estMinutes} min`),
        ]),
      ]),
      el("div", { class: "chev" }, "›"),
    ]),
  );
  render([
    topbar({ right: el("div", { style: "display:flex; gap:8px" }, [scanBtn, themeBtn]) }),
    el("div", { class: "hero" }, [
      el("h1", {}, "Play together"),
      el("div", { class: "tag" }, "One phone or many — pick a game, invite friends, play. 💜"),
    ]),
    el("div", { class: "card stack", style: "margin-bottom:14px" }, [
      el("p", { class: "muted", style: "margin:0 0 8px; font-size:.9rem" }, "Your name (saved on this device)"),
      el("div", { class: "name-row" }, [colorControl, nameInput]),
      el("p", { class: "muted color-hint" }, "Tap the color circle to make it yours."),
    ]),
    el("div", { class: "game-grid" }, cards),
    iosInstallTip(),
    el("p", { class: "muted center", style: "margin-top:22px; font-size:.82rem" },
      `${GAMES.length} games · v${GAMES.length}-pack`),
  ]);
}
