import { initAudioToggle, playTone } from "./audio.js";
import { chooseAiCardPlay, chooseAiMove } from "./ai.js";
import { createBoardMetrics, drawBoard, pointToSquare } from "./board.js";
import {
  canPlayCard,
  getCardDefinition,
  getCardTargetSquares,
  getTargetCount,
  playCard,
  setupChaosDeck,
  startTurn,
} from "./chaos.js";
import { drawPieces, getPieceAt } from "./pieces.js";
import {
  describeMutations,
  getMutationTitle,
} from "./mutations.js";
import {
  getDisplayMoves,
  getLegalMoves,
  getPromotionChoices,
  isPlayersPiece,
  requestMove,
} from "./rules.js";
import {
  CONFIG,
  checkTimeout,
  createInitialState,
  flushActiveClock,
  formatClock,
  getRemainingMs,
  isUnlimited,
  pauseClock,
  resumeClock,
  startClock,
  syncHudStats,
} from "./state.js";
import { drawTiles } from "./tiles.js";
import { renderEndOverlay, renderShell, showAnnouncement } from "./ui.js";

const STORAGE_KEY = "wacko-chess-settings-v1";
const STATS_KEY = "wacko-chess-stats-v1";

const elements = {
  appShell: document.querySelector("#appShell"),
  boardCanvas: document.querySelector("#boardCanvas"),
  menuCanvas: document.querySelector("#menuCanvas"),
  menuOverlay: document.querySelector("#menuOverlay"),
  startForm: document.querySelector("#startForm"),
  whiteNameInput: document.querySelector("#whiteNameInput"),
  blackNameInput: document.querySelector("#blackNameInput"),
  aiOpponentInput: document.querySelector("#aiOpponentInput"),
  whiteHud: document.querySelector("#whiteHud"),
  blackHud: document.querySelector("#blackHud"),
  whiteHand: document.querySelector("#whiteHand"),
  blackHand: document.querySelector("#blackHand"),
  turnStatus: document.querySelector("#turnStatus"),
  roundStatus: document.querySelector("#roundStatus"),
  chaosCountdown: document.querySelector("#chaosCountdown"),
  chaosMeterFill: document.querySelector("#chaosMeterFill"),
  deckStatus: document.querySelector("#deckStatus"),
  activeEvents: document.querySelector("#activeEvents"),
  eventLog: document.querySelector("#eventLog"),
  announcement: document.querySelector("#announcement"),
  statsStrip: document.querySelector("#statsStrip"),
  promotionOverlay: document.querySelector("#promotionOverlay"),
  mutationTooltip: document.querySelector("#mutationTooltip"),
  majorChaosOverlay: document.querySelector("#majorChaosOverlay"),
  majorChaosName: document.querySelector("#majorChaosName"),
  soundToggle: document.querySelector("#soundToggle"),
  helpOverlay: document.querySelector("#helpOverlay"),
  endOverlay: document.querySelector("#endOverlay"),
};

let state = createInitialState({ stats: loadStats() });
let boardMetrics;
let frame = 0;
let aiTimer = null;

function init() {
  applyStoredSettings();
  bindEvents();
  initAudioToggle(elements.soundToggle);
  resizeBoard();
  render();
  requestAnimationFrame(tick);
}

function bindEvents() {
  window.addEventListener("resize", resizeBoard);
  elements.startForm.addEventListener("submit", handleStart);
  elements.aiOpponentInput.addEventListener("change", updateAiNameState);
  elements.boardCanvas.addEventListener("click", handleBoardClick);
  elements.boardCanvas.addEventListener("mousemove", handleBoardMouseMove);
  elements.boardCanvas.addEventListener("mouseleave", hideMutationTooltip);
  elements.promotionOverlay.addEventListener("click", handlePromotionClick);
  elements.whiteHand.addEventListener("click", handleCardClick);
  elements.blackHand.addEventListener("click", handleCardClick);
  elements.endOverlay.addEventListener("click", handleEndClick);
  document.addEventListener("click", handleHelpClick);
  window.addEventListener("keydown", handleKeydown);
}

function handleStart(event) {
  event.preventDefault();
  const settings = readSettingsForm();
  persistSettings(settings);
  state = createInitialState({ ...settings, stats: loadStats() });
  setupChaosDeck(state);
  state.status = `${settings.intensity} chaos`;
  state.log = [`${settings.whiteName} and ${settings.blackName} begin.`];
  beginTurn();

  elements.menuOverlay.hidden = true;
  elements.endOverlay.hidden = true;
  elements.appShell.dataset.screen = "game";
  render();
  showAnnouncement(elements, "Match begins", "warning");
}

function handleBoardClick(event) {
  if (state.gameOver || !elements.menuOverlay.hidden || !elements.promotionOverlay.hidden) return;
  if (isAiTurn()) {
    showAnnouncement(elements, "Wacko AI is thinking", "warning");
    return;
  }

  const rect = elements.boardCanvas.getBoundingClientRect();
  const square = pointToSquare(boardMetrics, event.clientX - rect.left, event.clientY - rect.top);
  if (!square) {
    clearSelection();
    return;
  }

  if (state.targeting) {
    handleTargetingClick(square);
    return;
  }

  const clickedPiece = getPieceAt(state.board, square.row, square.col);

  if (state.selected) {
    if (clickedPiece && isPlayersPiece(state, square.row, square.col)) {
      selectPiece(square.row, square.col);
      return;
    }

    const promotionChoices = getPromotionChoices(state.validMoves, square.row, square.col);
    if (promotionChoices.length > 0) {
      state.pendingPromotion = {
        from: { row: state.selected.row, col: state.selected.col },
        to: square,
        choices: promotionChoices,
      };
      renderPromotionChoices(promotionChoices);
      return;
    }

    if (state.validMoves.some((move) => move.row === square.row && move.col === square.col)) {
      commitMove({ row: state.selected.row, col: state.selected.col }, square);
      return;
    }

    clearSelection();
    return;
  }

  if (clickedPiece && isPlayersPiece(state, square.row, square.col)) {
    selectPiece(square.row, square.col);
  }
}

function handleBoardMouseMove(event) {
  const rect = elements.boardCanvas.getBoundingClientRect();
  const square = pointToSquare(boardMetrics, event.clientX - rect.left, event.clientY - rect.top);
  if (!square) {
    hideMutationTooltip();
    return;
  }

  const piece = getPieceAt(state.board, square.row, square.col);
  if (!piece?.mutations.length) {
    hideMutationTooltip();
    return;
  }

  const mutations = describeMutations(piece);
  elements.mutationTooltip.innerHTML = `
    <strong>${getMutationTitle(piece)}</strong>
    ${mutations.map((mutation) => `<span style="--badge:${mutation.badgeColor}">${mutation.name}: ${mutation.effect}</span>`).join("")}
  `;
  elements.mutationTooltip.style.left = `${event.clientX + 16}px`;
  elements.mutationTooltip.style.top = `${event.clientY + 16}px`;
  elements.mutationTooltip.hidden = false;
}

function hideMutationTooltip() {
  elements.mutationTooltip.hidden = true;
}

function handleCardClick(event) {
  const cardButton = event.target.closest(".chaos-card--button[data-hand-index]");
  if (!cardButton) return;
  if (isAiTurn()) {
    showAnnouncement(elements, "Wacko AI is thinking", "warning");
    return;
  }
  const color = cardButton.dataset.cardColor;
  const handIndex = Number(cardButton.dataset.handIndex);

  if (!canPlayCard(state, color, handIndex)) {
    showAnnouncement(elements, "Card cannot be played", "critical");
    return;
  }

  const card = state.hands[color][handIndex];
  const targetCount = getTargetCount(card);

  if (targetCount === 0) {
    const result = playCard(state, color, handIndex, []);
    if (result) {
      showAnnouncement(elements, `${result.definition.name} played`, "warning");
      playTone("card");
    }
    render();
    return;
  }

  state.targeting = {
    color,
    handIndex,
    targets: [],
  };
  state.targetSquares = getCardTargetSquares(state, color, handIndex, []);
  showAnnouncement(elements, `${getCardDefinition(card).name}: choose target`, "warning");
  render();
}

function handleTargetingClick(square) {
  const valid = state.targetSquares.some((target) => target.row === square.row && target.col === square.col);
  if (!valid) {
    showAnnouncement(elements, "Invalid target", "critical");
    return;
  }

  state.targeting.targets.push(square);
  const card = state.hands[state.targeting.color][state.targeting.handIndex];
  const targetCount = getTargetCount(card);

  if (state.targeting.targets.length < targetCount) {
    state.targetSquares = getCardTargetSquares(state, state.targeting.color, state.targeting.handIndex, state.targeting.targets);
    showAnnouncement(elements, `Choose target ${state.targeting.targets.length + 1}`, "warning");
    return;
  }

  const result = playCard(state, state.targeting.color, state.targeting.handIndex, state.targeting.targets);
  if (result) {
    showAnnouncement(elements, `${result.definition.name} played`, "warning");
    playTone("card");
  }
  state.targeting = null;
  state.targetSquares = [];
  render();
}

function handlePromotionClick(event) {
  const button = event.target.closest("button[data-piece]");
  if (!button || !state.pendingPromotion) return;
  const promotion = button.dataset.piece;
  if (!state.pendingPromotion.choices.includes(promotion)) return;

  const { from, to } = state.pendingPromotion;
  elements.promotionOverlay.hidden = true;
  commitMove(from, to, promotion);
}

function handleEndClick(event) {
  const button = event.target.closest("button[data-end-action]");
  if (!button) return;

  if (button.dataset.endAction === "restart") {
    restartMatch(false);
  } else {
    restartMatch(true);
  }
}

function handleHelpClick(event) {
  if (event.target.closest("[data-help-open]")) {
    elements.helpOverlay.hidden = false;
    pauseClock(state);
    return;
  }

  if (event.target.closest("[data-help-close]") || event.target === elements.helpOverlay) {
    elements.helpOverlay.hidden = true;
    if (isMatchLive()) resumeClock(state);
  }
}

function isMatchLive() {
  return (
    !state.gameOver &&
    elements.menuOverlay.hidden &&
    elements.helpOverlay.hidden &&
    elements.promotionOverlay.hidden
  );
}

function handleKeydown(event) {
  if (event.key !== "Escape") return;
  elements.helpOverlay.hidden = true;
  elements.promotionOverlay.hidden = true;
  state.targeting = null;
  state.pendingPromotion = null;
  clearSelection();
  if (isMatchLive()) resumeClock(state);
}

function selectPiece(row, col) {
  const piece = getPieceAt(state.board, row, col);
  if (!piece) return;

  state.selected = { row, col, pieceId: piece.id };
  state.validMoves = getLegalMoves(state, piece.id);
}

function clearSelection() {
  state.selected = null;
  state.validMoves = [];
  state.targetSquares = [];
  state.pendingPromotion = null;
  elements.promotionOverlay.hidden = true;
}

function commitMove(from, to, promotion = undefined) {
  const previousTurn = state.turn;
  const result = requestMove(state, from, to, promotion);
  if (!result) {
    showAnnouncement(elements, "Illegal move", "critical");
    clearSelection();
    return;
  }

  state.animation = {
    pieceId: result.movingPiece.id,
    piece: { ...result.movingPiece, mutations: [...result.movingPiece.mutations] },
    from: result.from,
    to: result.to,
    startedAt: performance.now(),
    duration: CONFIG.moveAnimMs,
  };

  if (result.captured) {
    state.effects.captures.push({
      row: result.to.row,
      col: result.to.col,
      startedAt: performance.now(),
      duration: 420,
    });
  }

  if (result.shieldBlocked) {
    showAnnouncement(elements, "Shield broke the capture", "warning");
  } else if (result.gainedMutation) {
    showAnnouncement(elements, `${result.gainedMutation.name} mutation gained`, "warning");
    playTone("mutation");
  } else if (result.captured) {
    playTone("capture");
  } else {
    playTone("move");
  }

  if (state.gameOver) {
    handleGameOver();
  } else if (state.check) {
    showAnnouncement(elements, "Check", "critical");
  }

  render();
  if (state.turn !== previousTurn && !state.gameOver) {
    beginTurn();
  } else if (isAiTurn() && !state.gameOver) {
    maybeQueueAiTurn();
  }

  window.setTimeout(() => {
    state.animation = null;
  }, CONFIG.moveAnimMs + 40);
}

function renderPromotionChoices(choices) {
  for (const button of elements.promotionOverlay.querySelectorAll("button[data-piece]")) {
    button.hidden = !choices.includes(button.dataset.piece);
  }
  elements.promotionOverlay.hidden = false;
  pauseClock(state);
}

function restartMatch(showMenu) {
  window.clearTimeout(aiTimer);
  const settings = readSettingsForm();
  state = createInitialState({ ...settings, stats: loadStats() });
  setupChaosDeck(state);
  if (!showMenu) beginTurn();
  elements.endOverlay.hidden = true;
  elements.endOverlay.innerHTML = "";
  elements.menuOverlay.hidden = !showMenu;
  elements.appShell.dataset.screen = showMenu ? "menu" : "game";
  render();
}

function render() {
  syncHudStats(state);
  renderShell(state, elements);
  renderEndOverlay(elements.endOverlay, state);
}

function beginTurn() {
  handleMajorChaos(startTurn(state));
  state.status = state.settings.aiOpponent
    ? state.turn === "black"
      ? "Wacko AI thinking"
      : "Your move"
    : `${state.settings.intensity} chaos`;
  if (!state.gameOver) startClock(state, state.turn);
  render();
  maybeQueueAiTurn();
}

function resizeBoard() {
  boardMetrics = createBoardMetrics(elements.boardCanvas);
  resizeMenuCanvas();
}

function resizeMenuCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = elements.menuCanvas.getBoundingClientRect();
  elements.menuCanvas.width = Math.floor(rect.width * dpr);
  elements.menuCanvas.height = Math.floor(rect.height * dpr);
  const ctx = elements.menuCanvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function tick() {
  frame += 1;
  const now = performance.now();
  state.effects.captures = state.effects.captures.filter((effect) => now - effect.startedAt <= effect.duration);

  const boardCtx = elements.boardCanvas.getContext("2d");
  drawBoard(boardCtx, boardMetrics, frame, {
    selected: state.selected,
    validMoves: getDisplayMoves(state.validMoves),
    targetSquares: state.targetSquares,
  });
  drawTiles(boardCtx, boardMetrics, state.specialTiles, frame);
  drawPieces(boardCtx, boardMetrics, state, frame, now);
  drawMenuBackdrop(frame);
  if (frame % 15 === 0) updateClockDisplay();
  requestAnimationFrame(tick);
}

function updateClockDisplay() {
  if (isUnlimited(state)) return;
  if (checkTimeout(state)) {
    handleGameOver();
    return;
  }
  for (const color of ["white", "black"]) {
    const hud = color === "white" ? elements.whiteHud : elements.blackHud;
    const clockEl = hud?.querySelector(".hud-clock");
    if (!clockEl) continue;
    const remaining = getRemainingMs(state, color);
    clockEl.textContent = formatClock(remaining);
    clockEl.classList.toggle("is-low", remaining != null && remaining <= 30000);
    clockEl.classList.toggle("is-active", state.clocks.activeColor === color && !state.clocks.paused);
  }
}

function handleGameOver() {
  pauseClock(state);
  window.clearTimeout(aiTimer);
  updateStatsForGameOver();
  showAnnouncement(elements, state.gameOverReason, state.winner ? "critical" : "warning");
  playTone("end");
  render();
}

function drawMenuBackdrop(currentFrame) {
  if (elements.menuOverlay.hidden) return;
  const ctx = elements.menuCanvas.getContext("2d");
  const width = elements.menuCanvas.clientWidth;
  const height = elements.menuCanvas.clientHeight;

  ctx.clearRect(0, 0, width, height);
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#08090f");
  gradient.addColorStop(0.42, "#17202a");
  gradient.addColorStop(0.72, "#160d19");
  gradient.addColorStop(1, "#090a0e");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const tile = Math.max(72, Math.floor(Math.min(width, height) / 9));
  const offset = (currentFrame * 0.18) % tile;
  for (let y = -tile; y < height + tile; y += tile) {
    for (let x = -tile; x < width + tile; x += tile) {
      const row = Math.floor((y + offset) / tile);
      const col = Math.floor((x - offset) / tile);
      ctx.fillStyle = (row + col) % 2 === 0 ? "rgba(240, 192, 64, 0.06)" : "rgba(0, 229, 255, 0.055)";
      ctx.fillRect(x - offset, y + offset, tile, tile);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.035)";
      ctx.strokeRect(x - offset, y + offset, tile, tile);
    }
  }

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = "rgba(255, 59, 92, 0.12)";
  ctx.fillRect(width * 0.64, 0, 8 + Math.sin(currentFrame / 13) * 3, height);
  ctx.fillStyle = "rgba(57, 255, 20, 0.08)";
  ctx.fillRect(width * 0.2, 0, 4, height);
  ctx.restore();
}

function updateStatsForGameOver() {
  if (state.stats._updatedForCurrentGame) return;
  state.stats.gamesPlayed += 1;
  if (state.winner === "white") state.stats.whiteWins += 1;
  if (state.winner === "black") state.stats.blackWins += 1;
  if (!state.winner) state.stats.draws += 1;
  state.stats.chaosSurvived += state.majorChaosCount;
  state.stats.mostMutations = Math.max(state.stats.mostMutations, state.mutationStats.mostOnPiece);
  state.stats._updatedForCurrentGame = true;
  const { _updatedForCurrentGame, ...persistable } = state.stats;
  localStorage.setItem(STATS_KEY, JSON.stringify(persistable));
}

function handleMajorChaos(event) {
  if (!event) return;
  elements.majorChaosName.textContent = event.name;
  elements.majorChaosOverlay.hidden = false;
  playTone("chaos");
  window.clearTimeout(handleMajorChaos.timer);
  handleMajorChaos.timer = window.setTimeout(() => {
    elements.majorChaosOverlay.hidden = true;
  }, 1500);
}

function maybeQueueAiTurn() {
  window.clearTimeout(aiTimer);
  if (!isAiTurn() || state.gameOver || !elements.menuOverlay.hidden) return;
  state.status = "Wacko AI thinking";
  render();
  aiTimer = window.setTimeout(runAiTurn, 650);
}

function runAiTurn() {
  if (!isAiTurn() || state.gameOver) return;

  const cardPlay = chooseAiCardPlay(state, "black");
  if (cardPlay) {
    const result = playCard(state, "black", cardPlay.handIndex, cardPlay.targets);
    if (result) {
      showAnnouncement(elements, `AI played ${result.definition.name}`, "warning");
      playTone("card");
      render();
    }
  }

  if (state.gameOver) {
    updateStatsForGameOver();
    render();
    return;
  }

  const move = chooseAiMove(state, "black");
  if (!move) {
    showAnnouncement(elements, "Wacko AI has no legal move", "critical");
    return;
  }

  commitMove(move.from, move.to, move.promotion);
}

function isAiTurn() {
  return Boolean(state.settings.aiOpponent && state.turn === "black");
}

function updateAiNameState() {
  if (elements.aiOpponentInput.checked) {
    elements.blackNameInput.value = "Wacko AI";
    elements.blackNameInput.disabled = true;
  } else {
    elements.blackNameInput.disabled = false;
    if (elements.blackNameInput.value === "Wacko AI") {
      elements.blackNameInput.value = "Black";
    }
  }
}

function readSettingsForm() {
  const formData = new FormData(elements.startForm);
  const aiOpponent = formData.get("aiOpponent") === "on";
  return {
    whiteName: cleanName(formData.get("whiteName"), "White"),
    blackName: aiOpponent ? "Wacko AI" : cleanName(formData.get("blackName"), "Black"),
    aiOpponent,
    intensity: String(formData.get("intensity") || "standard"),
    timer: String(formData.get("timer") || "unlimited"),
  };
}

function applyStoredSettings() {
  const settings = loadJson(STORAGE_KEY, null);
  if (!settings) return;

  elements.whiteNameInput.value = settings.whiteName || "White";
  elements.blackNameInput.value = settings.blackName || "Black";
  elements.aiOpponentInput.checked = Boolean(settings.aiOpponent);
  updateAiNameState();
  setRadio("intensity", settings.intensity || "standard");
  setRadio("timer", settings.timer || "unlimited");
  state = createInitialState({ ...settings, stats: loadStats() });
}

function setRadio(name, value) {
  const input = elements.startForm.querySelector(`input[name="${name}"][value="${value}"]`);
  if (input) input.checked = true;
}

function persistSettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function loadStats() {
  return {
    gamesPlayed: 0,
    whiteWins: 0,
    blackWins: 0,
    draws: 0,
    chaosSurvived: 0,
    mostMutations: 0,
    ...loadJson(STATS_KEY, {}),
  };
}

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function cleanName(value, fallback) {
  const next = String(value || "").trim();
  return next || fallback;
}

init();
