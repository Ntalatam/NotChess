import { CARD_DEFINITIONS } from "./chaos.js";
import { CONFIG } from "./state.js";

const CARD_STUBS = [
  ["Buff", "Mutation Injection", "Something sharp wakes up."],
  ["Wild", "Swap & Pray", "The board blinks first."],
  ["Board", "Volcano", "A square learns anger."],
  ["Trap", "Haunting", "No one likes the quiet files."],
];

export function renderShell(state, elements) {
  renderHud(elements.whiteHud, state.players.white, "white", state.turn === "white");
  renderHud(elements.blackHud, state.players.black, "black", state.turn === "black");
  renderHands(elements.whiteHand, state.hands.white, state.turn !== "white", "white", state);
  renderHands(elements.blackHand, state.hands.black, state.settings.aiOpponent || state.turn !== "black", "black", state);
  renderSidebar(state, elements);
  renderMoveHistory(elements.moveHistory, state.moveHistory);
  renderUndoButton(elements.undoButton, state);
  renderStats(elements.statsStrip, state.stats);
}

export function renderEndOverlay(container, state) {
  if (!state.gameOver) {
    container.hidden = true;
    container.innerHTML = "";
    return;
  }

  const title = state.winner ? `${capitalize(state.winner)} wins` : "Draw";
  container.hidden = false;
  container.innerHTML = `
    <section class="end-panel">
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(state.gameOverReason)}</p>
      <div class="end-summary">
        <span>Turn ${state.turnCount}</span>
        <span>${state.majorChaosCount} major chaos</span>
        <span>${state.cardsPlayed} cards played</span>
      </div>
      <div class="end-actions">
        <button class="btn btn--primary" type="button" data-end-action="restart">Play Again</button>
        <button class="btn btn--ghost" type="button" data-end-action="swap">Swap &amp; Rematch</button>
        <button class="btn btn--ghost" type="button" data-end-action="menu">Main Menu</button>
      </div>
    </section>
  `;
}

export function showAnnouncement(elements, message, tone = "info") {
  elements.announcement.textContent = message;
  elements.announcement.dataset.tone = tone;
  elements.announcement.classList.add("is-visible");
  window.clearTimeout(showAnnouncement.timer);
  showAnnouncement.timer = window.setTimeout(() => {
    elements.announcement.classList.remove("is-visible");
  }, CONFIG.announcementMs);
}

function renderHud(container, player, color, active) {
  container.classList.toggle("is-active", active);
  container.innerHTML = `
    <div class="player-name">${escapeHtml(player.name)}</div>
    <div class="hud-stat-row">
      <span class="hud-chip">Captured ${player.captured}</span>
      <span class="hud-chip">Mutations ${player.mutations}</span>
      <span class="hud-chip">Frozen ${player.frozen}</span>
    </div>
    <div class="hud-clock">${player.clock}</div>
  `;
  container.dataset.color = color;
}

function renderHands(container, hand, hidden, color, state) {
  const cards = hand.length ? hand : CARD_STUBS;
  container.innerHTML = cards
    .slice(0, 4)
    .map((card, index) => {
      const definition = Array.isArray(card)
        ? { category: card[0], name: card[1], flavor: card[2], text: card[2] }
        : CARD_DEFINITIONS[card.id];

      if (hidden) {
        return `
          <article class="chaos-card chaos-card--back" aria-label="Hidden chaos card">
            <span class="chaos-card__tag">Chaos</span>
            <h3>Face Down</h3>
            <p>Awaiting disaster.</p>
          </article>
        `;
      }

      return `
        <button class="chaos-card chaos-card--button" type="button" data-card-color="${color}" data-hand-index="${index}" ${state.turnActions.cardsPlayed >= 2 || (!state.turnActions.moveMade && state.turnActions.cardsPlayed >= 1) ? "disabled" : ""}>
          <span class="chaos-card__tag">${escapeHtml(definition.category)}</span>
          <h3>${escapeHtml(definition.name)}</h3>
          <p>${escapeHtml(definition.text)}</p>
          <em>${escapeHtml(definition.flavor)}</em>
        </button>
      `;
    })
    .join("");
}

function renderSidebar(state, elements) {
  elements.turnStatus.textContent = `Turn ${state.turnCount} - ${capitalize(state.turn)}`;
  elements.roundStatus.textContent = state.status;
  elements.chaosCountdown.textContent = `${Math.max(0, 10 - Math.ceil(state.chaosMeter / 10))} turns`;
  elements.chaosMeterFill.style.width = `${state.chaosMeter}%`;
  elements.chaosMeterFill.parentElement.setAttribute("aria-valuenow", String(state.chaosMeter));
  elements.chaosMeterFill.parentElement.classList.toggle("is-critical", state.chaosMeter >= CONFIG.chaosCriticalThreshold);
  elements.deckStatus.textContent = `${state.deck.remaining} / ${state.deck.discarded}`;

  const activeEvents = [
    ...state.chaosEvents.map((event) => `${event.name} (${event.turnsLeft})`),
    ...state.specialTiles.map((tile) => `${tile.type.replaceAll("_", " ")} (${tile.turnsLeft ?? "armed"})`),
  ];

  elements.activeEvents.innerHTML = activeEvents.length
    ? activeEvents.map((event) => `<li>${escapeHtml(event)}</li>`).join("")
    : `<li>No active chaos events.</li>`;

  elements.eventLog.innerHTML = state.log
    .slice(-20)
    .map((event) => `<li>${escapeHtml(event)}</li>`)
    .join("");
}

function renderMoveHistory(container, history) {
  if (!container) return;
  if (!history.length) {
    container.innerHTML = `<li class="move-history__empty">No moves yet.</li>`;
    return;
  }

  const rows = [];
  for (let i = 0; i < history.length; i += 2) {
    const white = history[i];
    const black = history[i + 1];
    const number = Math.floor(i / 2) + 1;
    rows.push(`
      <li class="move-row">
        <span class="move-row__num">${number}.</span>
        <span class="move-row__white">${escapeHtml(white.san)}</span>
        <span class="move-row__black">${black ? escapeHtml(black.san) : ""}</span>
      </li>
    `);
  }

  container.innerHTML = rows.join("");
  container.scrollTop = container.scrollHeight;
}

function renderUndoButton(button, state) {
  if (!button) return;
  button.disabled = state.undoStack.length === 0 || state.gameOver;
}

function renderStats(container, stats) {
  container.innerHTML = [
    ["Games", stats.gamesPlayed],
    ["White", stats.whiteWins],
    ["Black", stats.blackWins],
    ["Draws", stats.draws],
  ]
    .map(([label, value]) => `<div class="stat-tile"><strong>${value}</strong><span>${label}</span></div>`)
    .join("");
}

function capitalize(value) {
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
