const CARD_STUBS = [
  ["Buff", "Mutation Injection", "Something sharp wakes up."],
  ["Wild", "Swap & Pray", "The board blinks first."],
  ["Board", "Volcano", "A square learns anger."],
  ["Trap", "Haunting", "No one likes the quiet files."],
];

export function renderShell(state, elements) {
  renderHud(elements.whiteHud, state.players.white, "white", state.turn === "white");
  renderHud(elements.blackHud, state.players.black, "black", state.turn === "black");
  renderHands(elements.whiteHand, state.hands.white, false);
  renderHands(elements.blackHand, state.hands.black, true);
  renderSidebar(state, elements);
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
        <span>${state.capturedPieces.white.length + state.capturedPieces.black.length} captures</span>
        <span>${state.chaosEvents.length} chaos events</span>
      </div>
      <div class="end-actions">
        <button class="primary-action" type="button" data-end-action="restart">Play Again</button>
        <button class="secondary-action" type="button" data-end-action="menu">Main Menu</button>
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
  }, 1800);
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

function renderHands(container, hand, hidden) {
  const cards = hand.length ? hand : CARD_STUBS;
  container.innerHTML = cards
    .slice(0, 4)
    .map(([category, name, flavor]) => {
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
        <article class="chaos-card" tabindex="0">
          <span class="chaos-card__tag">${escapeHtml(category)}</span>
          <h3>${escapeHtml(name)}</h3>
          <p>${escapeHtml(flavor)}</p>
        </article>
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
  elements.deckStatus.textContent = `${state.deck.remaining} / ${state.deck.discarded}`;

  elements.activeEvents.innerHTML = state.activeEvents.length
    ? state.activeEvents.map((event) => `<li>${escapeHtml(event)}</li>`).join("")
    : `<li>No active chaos events.</li>`;

  elements.eventLog.innerHTML = state.log
    .slice(-20)
    .map((event) => `<li>${escapeHtml(event)}</li>`)
    .join("");
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
