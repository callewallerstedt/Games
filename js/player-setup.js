// Shared player name/color setup for home hub, online lobby, and local pass-and-play.
import { el, render, button, topbar, modal, PLAYER_COLORS, normalizePlayerColor, setPlayerColors } from "./ui.js";
import { localSession } from "./session.js";

export const rememberedName = () => localStorage.getItem("together_name") || "";
export const saveName = (n) => { try { localStorage.setItem("together_name", n); } catch {} };
export const rememberedColor = () => normalizePlayerColor(localStorage.getItem("together_color"), PLAYER_COLORS[0]);
export const saveColor = (color) => { try { localStorage.setItem("together_color", normalizePlayerColor(color)); } catch {} };

let hubProfileExpanded = null;

export function hubProfileCard({ onUpdate } = {}) {
  const savedName = rememberedName().trim();
  const savedColor = rememberedColor();
  if (hubProfileExpanded === null) hubProfileExpanded = !savedName;

  const expand = () => {
    hubProfileExpanded = true;
    onUpdate?.();
  };

  if (!hubProfileExpanded) {
    return el("div", { class: "profile-card profile-card-compact" }, [
      el("div", { class: "profile-compact" }, [
        el("span", { class: "profile-compact-dot", style: `--player-color:${savedColor}` }),
        el("span", { class: "profile-compact-name" }, savedName || "Player"),
        el("button", {
          class: "profile-edit-btn",
          type: "button",
          "aria-label": "Edit name and color",
          title: "Edit name and color",
          onClick: expand,
        }, "✎"),
      ]),
    ]);
  }

  let myColor = savedColor;
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

  const collapseIfReady = () => {
    const name = nameInput.value.trim();
    if (!name) return;
    if (document.querySelector(".modal-bg")) return;
    hubProfileExpanded = false;
    onUpdate?.();
  };

  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      saveName(nameInput.value.trim());
      collapseIfReady();
    }
  });
  nameInput.addEventListener("blur", () => setTimeout(collapseIfReady, 150));
  setTimeout(() => nameInput.focus(), 30);

  return el("div", { class: "profile-card profile-card-expanded stack" }, [
    el("p", { class: "muted profile-card-label" }, "Your name (saved on this device)"),
    el("div", { class: "name-row" }, [colorControl, nameInput]),
    el("p", { class: "muted color-hint" }, "Tap the color circle to make it yours."),
  ]);
}

export function playerColorControl(label, initial, onChange) {
  let value = normalizePlayerColor(initial);
  const trigger = el("button", {
    class: "player-color-btn",
    type: "button",
    style: `--player-color:${value}`,
    "aria-label": `Choose color for ${label()}`,
  }, el("span", { "aria-hidden": "true" }));

  const apply = (next) => {
    value = normalizePlayerColor(next, value);
    trigger.style.setProperty("--player-color", value);
    trigger.setAttribute("aria-label", `Choose color for ${label()}`);
    onChange(value);
  };

  trigger.addEventListener("click", () => {
    let close;
    const custom = el("input", {
      class: "custom-color-input",
      type: "color",
      value,
      "aria-label": "Custom player color",
      oninput: (event) => apply(event.target.value),
    });
    const swatches = el("div", { class: "player-color-grid" }, PLAYER_COLORS.map((color, i) =>
      el("button", {
        class: "player-color-swatch",
        type: "button",
        style: `--player-color:${color}`,
        "aria-label": `Color option ${i + 1}`,
        onClick: () => { apply(color); close(); },
      })));
    close = modal(`Player color · ${label()}`, el("div", { class: "stack" }, [
      el("p", { class: "muted" }, "Pick a preset or choose any custom color."),
      swatches,
      el("label", { class: "custom-color-row" }, [el("span", {}, "Custom color"), custom]),
      button("Done", { onClick: () => close() }),
    ]));
  });
  return trigger;
}

export function askName(g, prompt, next, { onBack } = {}) {
  let color = rememberedColor();
  const input = el("input", { class: "field", placeholder: "Your name", value: rememberedName(), maxlength: "16", enterkeyhint: "go" });
  const colorControl = playerColorControl(() => input.value.trim() || "you", color, (nextColor) => { color = nextColor; });
  const submit = () => { const v = (input.value || "").trim() || "You"; next(v, color); };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  setTimeout(() => input.focus(), 50);
  render(el("div", { class: "screen name-screen" }, [
    topbar({ onBack }),
    el("div", { class: "game-stage compact" }, [
      el("div", { class: "hero" }, [el("h1", {}, g.title), el("div", { class: "tag" }, prompt)]),
      el("div", { class: "card stack" }, [
        el("div", { class: "name-row" }, [colorControl, input]),
        el("p", { class: "muted color-hint" }, "Choose the color others will see."),
        button("Continue →", { big: true, onClick: submit }),
      ]),
    ]),
  ]));
}

export function localSetup(g, { onBack, onStart, rulesModal, settings: initialSettings }) {
  const max = g.maxPlayers;
  const min = g.minPlayers;
  let count = Math.max(min, 2);
  const settings = initialSettings || defaultLobbySettings(g);
  const names = [];
  const colors = [];
  for (let i = 0; i < max; i++) names[i] = `Player ${i + 1}`;
  for (let i = 0; i < max; i++) colors[i] = PLAYER_COLORS[i % PLAYER_COLORS.length];
  if (rememberedName()) names[0] = rememberedName();
  colors[0] = rememberedColor();

  function draw() {
    const inputs = [];
    for (let i = 0; i < count; i++) {
      const input = el("input", { class: "field", value: names[i], maxlength: "16",
        "aria-label": `Player ${i + 1} name`,
        oninput: (e) => { names[i] = e.target.value; } });
      const colorControl = playerColorControl(() => (names[i] || `Player ${i + 1}`).trim(), colors[i], (color) => {
        colors[i] = color;
        if (i === 0) saveColor(color);
      });
      inputs.push(el("div", { class: "name-row player-name-row" }, [colorControl, input]));
    }
    const counter = max > min
      ? el("div", { class: "card" }, [
          el("p", { class: "muted center" }, "How many players?"),
          el("div", { class: "counter" }, [
            el("button", { class: "btn round-btn secondary", disabled: count <= min, onClick: () => { if (count > min) { count--; draw(); } } }, "−"),
            el("span", { class: "num" }, String(count)),
            el("button", { class: "btn round-btn secondary", disabled: count >= max, onClick: () => { if (count < max) { count++; draw(); } } }, "+"),
          ]),
        ])
      : null;

    render([
      topbar({ onBack, right: el("button", { class: "iconbtn", onClick: () => rulesModal(g) }, "?") }),
      el("div", { class: "hero" }, [el("h1", {}, g.title), el("div", { class: "tag" }, g.localSetupTag || "One device - pass it around.")]),
      counter,
      el("div", { class: "card stack" }, [el("p", { class: "muted center" }, "Player names & colors"), ...inputs]),
      el("div", { class: "footer-actions" },
        button("Start →", { big: true, onClick: () => {
          const finalNames = names.slice(0, count).map((n, i) => (n || "").trim() || `Player ${i + 1}`);
          const finalColors = colors.slice(0, count).map((color, i) => normalizePlayerColor(color, PLAYER_COLORS[i % PLAYER_COLORS.length]));
          saveName(finalNames[0]);
          saveColor(finalColors[0]);
          setPlayerColors(finalNames, finalColors);
          const session = localSession(finalNames, finalColors, settings);
          onStart({ session, players: finalNames, playerColors: finalColors, settings });
        } })),
    ]);
  }
  draw();
}

/** Build default settings object from a game's lobbySettings schema. */
export function defaultLobbySettings(game) {
  const settings = { maxPlayers: game.onlineMaxPlayers ?? game.maxPlayers };
  (game.lobbySettings || []).forEach((def) => { settings[def.key] = Array.isArray(def.default) ? def.default.slice() : def.default; });
  return settings;
}

/** Render lobby settings — editable for host, read-only for guests. */
export function renderLobbySettings(game, settings, { editable, onChange, showMaxPlayers = true }) {
  const rows = [];

  if (showMaxPlayers && (game.onlineMaxPlayers ?? game.maxPlayers) > game.minPlayers) {
    const cap = game.onlineMaxPlayers ?? game.maxPlayers;
    const min = game.minPlayers;
    rows.push(el("div", { class: `lobby-setting${editable ? "" : " readonly"}` }, [
      el("span", { class: "lobby-setting-label" }, "Max players"),
      editable
        ? el("div", { class: "setting-choices" }, [
            el("button", { class: "btn round-btn secondary", disabled: settings.maxPlayers <= min, onClick: () => onChange("maxPlayers", settings.maxPlayers - 1) }, "−"),
            el("span", { class: "setting-num" }, String(settings.maxPlayers)),
            el("button", { class: "btn round-btn secondary", disabled: settings.maxPlayers >= cap, onClick: () => onChange("maxPlayers", settings.maxPlayers + 1) }, "+"),
          ])
        : el("span", { class: "setting-value" }, String(settings.maxPlayers)),
    ]));
  }

  (game.lobbySettings || []).forEach((def) => {
    if (def.type === "choice") {
      rows.push(el("div", { class: `lobby-setting${editable ? "" : " readonly"}` }, [
        el("span", { class: "lobby-setting-label" }, def.label),
        editable
          ? el("div", { class: "setting-choices" }, def.options.map((opt) =>
              el("button", {
                class: `setting-chip${settings[def.key] === opt ? " active" : ""}`,
                type: "button",
                onClick: () => onChange(def.key, opt),
              }, String(opt))))
          : el("span", { class: "setting-value" }, String(settings[def.key])),
      ]));
    }
    if (def.type === "multiselect") {
      const selected = Array.isArray(settings[def.key]) ? settings[def.key] : [];
      rows.push(el("div", { class: `lobby-setting multiselect${editable ? "" : " readonly"}` }, [
        el("span", { class: "lobby-setting-label" }, def.label),
        editable
          ? el("div", { class: "setting-choices" }, def.options.map((option) => {
              const active = selected.includes(option);
              return el("button", {
                class: `setting-chip${active ? " active" : ""}`,
                type: "button",
                "aria-pressed": active ? "true" : "false",
                onClick: () => {
                  const next = active ? selected.filter((value) => value !== option) : [...selected, option];
                  if (next.length >= (def.minSelected || 1)) onChange(def.key, next);
                },
              }, String(option));
            }))
          : el("span", { class: "setting-value" }, selected.join(", ")),
      ]));
    }
  });

  if (!rows.length) return null;

  return el("div", { class: "lobby-settings card stack" }, [
    el("p", { class: "muted center", style: "margin:0" }, editable ? "Game settings (only you can change)" : "Game settings"),
    ...rows,
  ]);
}

/** Player roster chips in the lobby. */
export function renderPlayerRoster(roster, { hostIndex = 0, maxPlayers }) {
  const slots = [];
  for (let i = 0; i < maxPlayers; i++) {
    const p = roster[i];
    slots.push(el("div", {
      class: `lobby-player${p ? " joined" : " empty"}`,
      style: p ? `--player-color:${p.color}` : "",
    }, [
      el("span", { class: "lobby-player-dot" }),
      el("span", { class: "lobby-player-name" }, p ? p.name + (i === hostIndex ? " (host)" : "") : "Waiting…"),
    ]));
  }
  return el("div", { class: "lobby-roster stack" }, [
    el("p", { class: "muted center", style: "margin:0" }, `Players (${roster.filter(Boolean).length}/${maxPlayers})`),
    ...slots,
  ]);
}
