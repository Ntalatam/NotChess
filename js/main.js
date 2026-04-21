import { initAudioToggle, initMusicToggle, initVolumeControls, playTone, startMusic, stopMusic } from "./audio.js";
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
  agreeDraw,
  checkTimeout,
  clearSave,
  createInitialState,
  flushActiveClock,
  formatClock,
  getRemainingMs,
  isUnlimited,
  loadSavedGame,
  pauseClock,
  pushUndoSnapshot,
  resignGame,
  restoreSavedGame,
  restoreUndoSnapshot,
  resumeClock,
  saveGame,
  startClock,
  syncHudStats,
} from "./state.js";
import { drawTiles } from "./tiles.js";
import {
  drawEffects,
  triggerCheckFlash,
  triggerMutationGlow,
  triggerCardFlash,
  triggerChaosWave,
  triggerMoveTrail,
} from "./effects.js";
import { renderEndOverlay, renderShell, showAnnouncement } from "./ui.js";
import {
  loadThemePreference,
  setTheme,
  setPieceStyle,
  getThemeId,
  getPieceStyleId,
} from "./themes.js";
import {
  startRecording,
  recordMove,
  recordCardPlay,
  recordMajorChaos,
  finishRecording,
  loadAllReplays,
  deleteReplay,
  encodeReplay,
  decodeReplay,
  createPlayback,
} from "./replay.js";
import {
  loadExtendedStats,
  recordGameResult,
  getDisplayStats,
  loadGameHistory,
  resetAllStats,
} from "./stats.js";

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
  difficultyField: document.querySelector("#difficultyField"),
  resumeButton: document.querySelector("#resumeButton"),
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
  musicToggle: document.querySelector("#musicToggle"),
  sfxVolume: document.querySelector("#sfxVolume"),
  musicVolume: document.querySelector("#musicVolume"),
  undoButton: document.querySelector("#undoButton"),
  resignButton: document.querySelector("#resignButton"),
  drawButton: document.querySelector("#drawButton"),
  moveHistory: document.querySelector("#moveHistory"),
  helpOverlay: document.querySelector("#helpOverlay"),
  endOverlay: document.querySelector("#endOverlay"),
  replaysButton: document.querySelector("#replaysButton"),
  statsButton: document.querySelector("#statsButton"),
};

let state = createInitialState({ stats: loadStats() });
let boardMetrics;
let frame = 0;
let aiTimer = null;
let hoverSquare = null;
let hoverMovesCache = null;
let activePlayback = null;
let playbackTimer = null;

function init() {
  loadThemePreference();
  applyStoredSettings();
  bindEvents();
  initAudioToggle(elements.soundToggle);
  initMusicToggle(elements.musicToggle);
  initVolumeControls(elements.sfxVolume, elements.musicVolume);
  resizeBoard();

  const save = loadSavedGame();
  if (save && elements.resumeButton) {
    elements.resumeButton.hidden = false;
  }

  render();
  requestAnimationFrame(tick);
}

function bindEvents() {
  window.addEventListener("resize", resizeBoard);
  elements.startForm.addEventListener("submit", handleStart);
  elements.resumeButton?.addEventListener("click", handleResume);
  elements.aiOpponentInput.addEventListener("change", updateAiNameState);
  elements.boardCanvas.addEventListener("click", handleBoardClick);
  elements.boardCanvas.addEventListener("mousedown", handleBoardMouseDown);
  elements.boardCanvas.addEventListener("mousemove", handleBoardMouseMove);
  elements.boardCanvas.addEventListener("mouseleave", handleBoardMouseLeave);
  window.addEventListener("mouseup", handleBoardMouseUp);
  elements.boardCanvas.addEventListener("touchstart", handleTouchStart, { passive: false });
  elements.boardCanvas.addEventListener("touchmove", handleTouchMove, { passive: false });
  elements.boardCanvas.addEventListener("touchend", handleTouchEnd, { passive: false });
  elements.promotionOverlay.addEventListener("click", handlePromotionClick);
  elements.whiteHand.addEventListener("click", handleCardClick);
  elements.blackHand.addEventListener("click", handleCardClick);
  elements.endOverlay.addEventListener("click", handleEndClick);
  elements.undoButton?.addEventListener("click", handleUndo);
  elements.resignButton?.addEventListener("click", handleResign);
  elements.drawButton?.addEventListener("click", handleDraw);
  document.addEventListener("click", handleHelpClick);
  window.addEventListener("keydown", handleKeydown);
  elements.replaysButton?.addEventListener("click", openReplayList);
  elements.statsButton?.addEventListener("click", openStatsDashboard);
  for (const radio of elements.startForm.querySelectorAll('input[name="theme"]')) {
    radio.addEventListener("change", (e) => setTheme(e.target.value));
  }
  for (const radio of elements.startForm.querySelectorAll('input[name="pieceStyle"]')) {
    radio.addEventListener("change", (e) => setPieceStyle(e.target.value));
  }
}

function handleResign() {
  if (state.gameOver) return;
  const who = state.turn;
  const whoName = state.players[who].name;
  if (!window.confirm(`${whoName}, resign this match?`)) return;
  resignGame(state, who);
  handleGameOver();
}

function handleDraw() {
  if (state.gameOver) return;
  if (!window.confirm("End the match as a draw?")) return;
  agreeDraw(state);
  handleGameOver();
}

function handleUndo() {
  if (!state.undoStack.length) return;
  if (isAiTurn()) {
    showAnnouncement(elements, "Wait for your turn", "critical");
    return;
  }
  window.clearTimeout(aiTimer);
  const restored = restoreUndoSnapshot(state);
  if (!restored) return;
  clearSelection();
  elements.promotionOverlay.hidden = true;
  state.status = state.settings.aiOpponent
    ? state.turn === "black"
      ? "Wacko AI thinking"
      : "Your move"
    : `${state.settings.intensity} chaos`;
  if (!isUnlimited(state)) startClock(state, state.turn);
  showAnnouncement(elements, "Move taken back", "warning");
  render();
  maybeQueueAiTurn();
}

function handleStart(event) {
  event.preventDefault();
  stopPlayback();
  const settings = readSettingsForm();
  persistSettings(settings);
  state = createInitialState({ ...settings, stats: loadStats() });
  setupChaosDeck(state);
  state.status = `${settings.intensity} chaos`;
  state.log = [`${settings.whiteName} and ${settings.blackName} begin.`];
  state._startTime = Date.now();
  state._cardsPlayedLog = [];
  startRecording(settings);
  beginTurn();

  clearSave();
  elements.menuOverlay.hidden = true;
  elements.endOverlay.hidden = true;
  elements.appShell.dataset.screen = "game";
  if (elements.resumeButton) elements.resumeButton.hidden = true;
  startMusic();
  render();
  showAnnouncement(elements, "Match begins", "warning");
}

function handleResume() {
  const save = loadSavedGame();
  if (!save) return;
  const settings = save.settings || readSettingsForm();
  state = createInitialState({ ...settings, stats: loadStats() });
  restoreSavedGame(state, save);
  state.undoStack = [];

  elements.menuOverlay.hidden = true;
  elements.endOverlay.hidden = true;
  elements.appShell.dataset.screen = "game";
  if (elements.resumeButton) elements.resumeButton.hidden = true;
  if (!isUnlimited(state)) startClock(state, state.turn);
  render();
  showAnnouncement(elements, "Match resumed", "warning");
  maybeQueueAiTurn();
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

function handleBoardMouseDown(event) {
  if (event.button !== 0) return;
  if (state.gameOver || !elements.menuOverlay.hidden || !elements.promotionOverlay.hidden) return;
  if (isAiTurn() || state.targeting) return;

  const rect = elements.boardCanvas.getBoundingClientRect();
  const square = pointToSquare(boardMetrics, event.clientX - rect.left, event.clientY - rect.top);
  if (!square) return;

  const piece = getPieceAt(state.board, square.row, square.col);
  if (!piece || !isPlayersPiece(state, square.row, square.col)) return;

  selectPiece(square.row, square.col);
  state.dragging = {
    pieceId: piece.id,
    from: { row: square.row, col: square.col },
    cursorX: event.clientX - rect.left,
    cursorY: event.clientY - rect.top,
    moved: false,
  };
  elements.boardCanvas.dataset.dragging = "true";
}

function handleBoardMouseMove(event) {
  const rect = elements.boardCanvas.getBoundingClientRect();
  const localX = event.clientX - rect.left;
  const localY = event.clientY - rect.top;

  if (state.dragging) {
    state.dragging.cursorX = localX;
    state.dragging.cursorY = localY;
    state.dragging.moved = true;
    hideMutationTooltip();
    return;
  }

  const square = pointToSquare(boardMetrics, localX, localY);
  if (!square) {
    hoverSquare = null;
    hoverMovesCache = null;
    hideMutationTooltip();
    return;
  }

  if (!hoverSquare || hoverSquare.row !== square.row || hoverSquare.col !== square.col) {
    hoverSquare = square;
    hoverMovesCache = null;
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

function handleBoardMouseUp(event) {
  if (!state.dragging) return;
  const rect = elements.boardCanvas.getBoundingClientRect();
  const square = pointToSquare(boardMetrics, event.clientX - rect.left, event.clientY - rect.top);
  const drag = state.dragging;
  state.dragging = null;
  delete elements.boardCanvas.dataset.dragging;

  // Click without movement — fall through to click handler behavior (keep selection)
  if (!drag.moved) return;

  if (!square) return;
  if (square.row === drag.from.row && square.col === drag.from.col) return;

  const promotionChoices = getPromotionChoices(state.validMoves, square.row, square.col);
  if (promotionChoices.length > 0) {
    state.pendingPromotion = {
      from: drag.from,
      to: square,
      choices: promotionChoices,
    };
    renderPromotionChoices(promotionChoices);
    return;
  }

  if (state.validMoves.some((m) => m.row === square.row && m.col === square.col)) {
    commitMove(drag.from, square);
  } else {
    clearSelection();
  }
}

function handleBoardMouseLeave() {
  hoverSquare = null;
  hoverMovesCache = null;
  hideMutationTooltip();
}

// ── Touch handlers for mobile ──

let touchStartPos = null;
let touchDragPiece = null;

function handleTouchStart(event) {
  if (state.gameOver || !elements.menuOverlay.hidden || !elements.promotionOverlay.hidden) return;
  if (isAiTurn()) return;

  const touch = event.touches[0];
  const rect = elements.boardCanvas.getBoundingClientRect();
  const x = touch.clientX - rect.left;
  const y = touch.clientY - rect.top;
  const square = pointToSquare(boardMetrics, x, y);

  if (!square) return;
  event.preventDefault();

  touchStartPos = { x, y, square, time: Date.now() };

  // If we tap on our own piece, start drag
  const piece = getPieceAt(state.board, square.row, square.col);
  if (piece && isPlayersPiece(state, square.row, square.col) && !state.targeting) {
    selectPiece(square.row, square.col);
    touchDragPiece = {
      pieceId: piece.id,
      from: { row: square.row, col: square.col },
    };
    state.dragging = {
      pieceId: piece.id,
      from: { row: square.row, col: square.col },
      cursorX: x,
      cursorY: y,
      moved: false,
    };
  }
}

function handleTouchMove(event) {
  if (!touchStartPos) return;
  event.preventDefault();

  const touch = event.touches[0];
  const rect = elements.boardCanvas.getBoundingClientRect();
  const x = touch.clientX - rect.left;
  const y = touch.clientY - rect.top;

  if (state.dragging) {
    state.dragging.cursorX = x;
    state.dragging.cursorY = y;
    const dx = x - touchStartPos.x;
    const dy = y - touchStartPos.y;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
      state.dragging.moved = true;
    }
  }
}

function handleTouchEnd(event) {
  if (!touchStartPos) return;
  event.preventDefault();

  const touch = event.changedTouches[0];
  const rect = elements.boardCanvas.getBoundingClientRect();
  const x = touch.clientX - rect.left;
  const y = touch.clientY - rect.top;
  const square = pointToSquare(boardMetrics, x, y);

  const drag = state.dragging;
  state.dragging = null;
  delete elements.boardCanvas.dataset.dragging;

  if (drag?.moved && square) {
    // Drag-and-drop completion
    if (square.row !== drag.from.row || square.col !== drag.from.col) {
      const promotionChoices = getPromotionChoices(state.validMoves, square.row, square.col);
      if (promotionChoices.length > 0) {
        state.pendingPromotion = { from: drag.from, to: square, choices: promotionChoices };
        renderPromotionChoices(promotionChoices);
      } else if (state.validMoves.some((m) => m.row === square.row && m.col === square.col)) {
        commitMove(drag.from, square);
      } else {
        clearSelection();
      }
    }
  } else if (square) {
    // Tap — use click-style logic
    if (state.targeting) {
      handleTargetingClick(square);
    } else if (state.selected) {
      const clickedPiece = getPieceAt(state.board, square.row, square.col);
      if (clickedPiece && isPlayersPiece(state, square.row, square.col)) {
        selectPiece(square.row, square.col);
      } else {
        const promotionChoices = getPromotionChoices(state.validMoves, square.row, square.col);
        if (promotionChoices.length > 0) {
          state.pendingPromotion = { from: { row: state.selected.row, col: state.selected.col }, to: square, choices: promotionChoices };
          renderPromotionChoices(promotionChoices);
        } else if (state.validMoves.some((m) => m.row === square.row && m.col === square.col)) {
          commitMove({ row: state.selected.row, col: state.selected.col }, square);
        } else {
          clearSelection();
        }
      }
    } else {
      const piece = getPieceAt(state.board, square.row, square.col);
      if (piece && isPlayersPiece(state, square.row, square.col)) {
        selectPiece(square.row, square.col);
      }
    }
  }

  touchStartPos = null;
  touchDragPiece = null;
}

function getHoverMoves() {
  if (state.selected || state.dragging || state.targeting || state.gameOver) return [];
  if (!hoverSquare) return [];
  const piece = getPieceAt(state.board, hoverSquare.row, hoverSquare.col);
  if (!piece || !isPlayersPiece(state, hoverSquare.row, hoverSquare.col)) return [];
  if (!hoverMovesCache) {
    hoverMovesCache = getDisplayMoves(getLegalMoves(state, piece.id));
  }
  return hoverMovesCache;
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
      recordCardPlay(color, handIndex, [], result.card.id);
      if (state._cardsPlayedLog) state._cardsPlayedLog.push(result.card.id);
      showAnnouncement(elements, `${result.definition.name} played`, "warning");
      playTone("card");
      triggerCardFlash();
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

  const { color: tColor, handIndex: tHandIndex, targets: tTargets } = state.targeting;
  const result = playCard(state, tColor, tHandIndex, tTargets);
  if (result) {
    recordCardPlay(tColor, tHandIndex, tTargets, result.card.id);
    if (state._cardsPlayedLog) state._cardsPlayedLog.push(result.card.id);
    showAnnouncement(elements, `${result.definition.name} played`, "warning");
    playTone("card");
    triggerCardFlash();
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

  const action = button.dataset.endAction;
  if (action === "restart") {
    restartMatch(false);
  } else if (action === "swap") {
    restartMatch(false, { swap: true });
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
  playTone("select");
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
  pushUndoSnapshot(state);
  const result = requestMove(state, from, to, promotion);
  if (!result) {
    state.undoStack.pop();
    showAnnouncement(elements, "Illegal move", "critical");
    clearSelection();
    return;
  }

  recordMove(from, to, promotion, previousTurn);
  state.turnActions.moveMade = true;

  state.animation = {
    pieceId: result.movingPiece.id,
    piece: { ...result.movingPiece, mutations: [...result.movingPiece.mutations] },
    from: result.from,
    to: result.to,
    startedAt: performance.now(),
    duration: CONFIG.moveAnimMs,
  };

  triggerMoveTrail(result.from.row, result.from.col, result.to.row, result.to.col, result.movingPiece.color);

  if (result.captured) {
    state.effects.captures.push({
      row: result.to.row,
      col: result.to.col,
      startedAt: performance.now(),
      duration: CONFIG.captureEffectMs,
    });
  }

  if (result.shieldBlocked) {
    showAnnouncement(elements, "Shield broke the capture", "warning");
  } else if (result.gainedMutation) {
    showAnnouncement(elements, `${result.gainedMutation.name} mutation gained`, "warning");
    playTone("mutation");
    triggerMutationGlow(result.to.row, result.to.col, result.movingPiece.color);
  } else if (result.captured) {
    playTone("capture");
  } else {
    playTone("move");
  }

  if (state.gameOver) {
    handleGameOver();
  } else if (state.check) {
    showAnnouncement(elements, "Check", "critical");
    playTone("check");
    const kingSquare = findKingSquare(state);
    if (kingSquare) triggerCheckFlash(kingSquare.row, kingSquare.col);
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

  saveGame(state);
}

function renderPromotionChoices(choices) {
  for (const button of elements.promotionOverlay.querySelectorAll("button[data-piece]")) {
    button.hidden = !choices.includes(button.dataset.piece);
  }
  elements.promotionOverlay.hidden = false;
  pauseClock(state);
}

function restartMatch(showMenu, { swap = false } = {}) {
  window.clearTimeout(aiTimer);
  clearSave();
  const settings = readSettingsForm();
  if (swap && !settings.aiOpponent) {
    const prevWhite = settings.whiteName;
    settings.whiteName = settings.blackName;
    settings.blackName = prevWhite;
    elements.whiteNameInput.value = settings.whiteName;
    elements.blackNameInput.value = settings.blackName;
    persistSettings(settings);
  }
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
  if (!state.gameOver) {
    startClock(state, state.turn);
    if (state.turnCount > 1) playTone("turnSwitch");
  }
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
    lastMove: state.lastMove,
    checkSquare: state.check ? findKingSquare(state) : null,
    hoverMoves: getHoverMoves(),
  });
  drawTiles(boardCtx, boardMetrics, state.specialTiles, frame);
  drawPieces(boardCtx, boardMetrics, state, frame, now);
  drawEffects(boardCtx, boardMetrics, now);
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
    const wasLow = clockEl.classList.contains("is-low");
    const isLow = remaining != null && remaining <= CONFIG.lowTimeWarningMs;
    clockEl.classList.toggle("is-low", isLow);
    clockEl.classList.toggle("is-active", state.clocks.activeColor === color && !state.clocks.paused);
    if (isLow && !wasLow && state.clocks.activeColor === color) {
      playTone("lowTime");
    }
  }
}

function handleGameOver() {
  pauseClock(state);
  window.clearTimeout(aiTimer);
  clearSave();
  stopMusic();
  finishRecording(state.winner, state.gameOverReason, state.turnCount);
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
  state.stats._updatedForCurrentGame = true;
  recordGameResult(state, state.stats);
}

function handleMajorChaos(event) {
  if (!event) return;
  recordMajorChaos(event.name);
  triggerChaosWave();
  elements.majorChaosName.textContent = event.name;
  elements.majorChaosOverlay.hidden = false;
  playTone("chaos");

  const stage = elements.boardCanvas.closest(".board-stage");
  if (stage) {
    stage.classList.remove("is-shaking");
    void stage.offsetWidth;
    stage.classList.add("is-shaking");
    stage.addEventListener("animationend", () => stage.classList.remove("is-shaking"), { once: true });
  }

  window.clearTimeout(handleMajorChaos.timer);
  handleMajorChaos.timer = window.setTimeout(() => {
    elements.majorChaosOverlay.hidden = true;
  }, CONFIG.majorChaosBannerMs);
}

function maybeQueueAiTurn() {
  window.clearTimeout(aiTimer);
  if (!isAiTurn() || state.gameOver || !elements.menuOverlay.hidden) return;
  state.status = "Wacko AI thinking";
  render();
  aiTimer = window.setTimeout(runAiTurn, CONFIG.aiThinkDelayMs);
}

function runAiTurn() {
  if (!isAiTurn() || state.gameOver) return;

  const cardPlay = chooseAiCardPlay(state, "black");
  if (cardPlay) {
    const result = playCard(state, "black", cardPlay.handIndex, cardPlay.targets);
    if (result) {
      recordCardPlay("black", cardPlay.handIndex, cardPlay.targets, result.card.id);
      if (state._cardsPlayedLog) state._cardsPlayedLog.push(result.card.id);
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

  // Post-move card play
  if (!state.gameOver) {
    const postCard = chooseAiCardPlay(state, "black");
    if (postCard) {
      const postResult = playCard(state, "black", postCard.handIndex, postCard.targets);
      if (postResult) {
        recordCardPlay("black", postCard.handIndex, postCard.targets, postResult.card.id);
        if (state._cardsPlayedLog) state._cardsPlayedLog.push(postResult.card.id);
        showAnnouncement(elements, `AI played ${postResult.definition.name}`, "warning");
        playTone("card");
        render();
      }
    }
  }
}

function isAiTurn() {
  return Boolean(state.settings.aiOpponent && state.turn === "black");
}

function updateAiNameState() {
  if (elements.aiOpponentInput.checked) {
    elements.blackNameInput.value = "Wacko AI";
    elements.blackNameInput.disabled = true;
    if (elements.difficultyField) elements.difficultyField.hidden = false;
  } else {
    elements.blackNameInput.disabled = false;
    if (elements.blackNameInput.value === "Wacko AI") {
      elements.blackNameInput.value = "Black";
    }
    if (elements.difficultyField) elements.difficultyField.hidden = true;
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
    aiDifficulty: String(formData.get("aiDifficulty") || "standard"),
  };
}

function applyStoredSettings() {
  setRadio("theme", getThemeId());
  setRadio("pieceStyle", getPieceStyleId());

  const settings = loadJson(STORAGE_KEY, null);
  if (!settings) return;

  elements.whiteNameInput.value = settings.whiteName || "White";
  elements.blackNameInput.value = settings.blackName || "Black";
  elements.aiOpponentInput.checked = Boolean(settings.aiOpponent);
  updateAiNameState();
  setRadio("intensity", settings.intensity || "standard");
  setRadio("timer", settings.timer || "unlimited");
  setRadio("aiDifficulty", settings.aiDifficulty || "standard");
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
  return loadExtendedStats();
}

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function findKingSquare(gameState) {
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = gameState.board[row]?.[col];
      if (piece?.type === "k" && piece.color === gameState.turn) {
        return { row, col };
      }
    }
  }
  return null;
}

function cleanName(value, fallback) {
  const next = String(value || "").trim();
  return next || fallback;
}

// ═══════════════════════════════════════════════════════════
// REPLAY VIEWER
// ═══════════════════════════════════════════════════════════

function stopPlayback() {
  if (playbackTimer) {
    clearInterval(playbackTimer);
    playbackTimer = null;
  }
  activePlayback = null;
}

function openReplayList() {
  const replays = loadAllReplays();
  const overlay = elements.endOverlay;

  if (!replays.length) {
    overlay.hidden = false;
    overlay.innerHTML = `
      <section class="end-panel">
        <h2>Replays</h2>
        <p>No saved replays yet. Finish a match to record one.</p>
        <div class="end-actions">
          <button class="btn btn--ghost" type="button" data-end-action="menu">Back</button>
        </div>
      </section>
    `;
    return;
  }

  const rows = replays.map((r, i) => {
    const date = new Date(r.date).toLocaleDateString();
    const winner = r.result?.winner ? `${r.result.winner[0].toUpperCase()}${r.result.winner.slice(1)} wins` : "Draw";
    const turns = r.result?.turnCount || "?";
    const intensity = r.settings?.intensity || "standard";
    return `
      <li class="replay-item">
        <div class="replay-item__info">
          <strong>${winner}</strong>
          <span>${date} &middot; ${turns} turns &middot; ${intensity}</span>
        </div>
        <div class="replay-item__actions">
          <button class="btn btn--ghost btn--sm" type="button" data-replay-watch="${i}">Watch</button>
          <button class="btn btn--ghost btn--sm" type="button" data-replay-share="${i}">Share</button>
          <button class="btn btn--ghost btn--sm btn--danger" type="button" data-replay-delete="${i}">Del</button>
        </div>
      </li>
    `;
  }).join("");

  overlay.hidden = false;
  overlay.innerHTML = `
    <section class="end-panel replay-panel">
      <h2>Replays</h2>
      <ul class="replay-list">${rows}</ul>
      <div class="end-actions">
        <label class="field replay-import-field">
          <span>Import replay code:</span>
          <input id="replayImportInput" autocomplete="off" placeholder="Paste encoded replay..." />
        </label>
        <button class="btn btn--ghost" type="button" id="replayImportBtn">Import</button>
        <button class="btn btn--ghost" type="button" data-end-action="menu">Back</button>
      </div>
    </section>
  `;

  overlay.addEventListener("click", handleReplayListClick);
  document.getElementById("replayImportBtn")?.addEventListener("click", handleReplayImport);
}

function handleReplayListClick(event) {
  const watchBtn = event.target.closest("[data-replay-watch]");
  const shareBtn = event.target.closest("[data-replay-share]");
  const deleteBtn = event.target.closest("[data-replay-delete]");
  const backBtn = event.target.closest("[data-end-action='menu']");

  if (watchBtn) {
    const idx = Number(watchBtn.dataset.replayWatch);
    const replays = loadAllReplays();
    if (replays[idx]) startReplayViewer(replays[idx]);
    return;
  }

  if (shareBtn) {
    const idx = Number(shareBtn.dataset.replayShare);
    const replays = loadAllReplays();
    if (replays[idx]) {
      const code = encodeReplay(replays[idx]);
      navigator.clipboard.writeText(code).then(() => {
        showAnnouncement(elements, "Replay code copied to clipboard!", "warning");
      }).catch(() => {
        prompt("Copy this replay code:", code);
      });
    }
    return;
  }

  if (deleteBtn) {
    const idx = Number(deleteBtn.dataset.replayDelete);
    deleteReplay(idx);
    openReplayList();
    return;
  }

  if (backBtn) {
    elements.endOverlay.hidden = true;
    elements.endOverlay.innerHTML = "";
    elements.endOverlay.removeEventListener("click", handleReplayListClick);
    return;
  }
}

function handleReplayImport() {
  const input = document.getElementById("replayImportInput");
  const code = (input?.value || "").trim();
  if (!code) {
    showAnnouncement(elements, "Paste a replay code first", "critical");
    return;
  }
  const replay = decodeReplay(code);
  if (!replay || !replay.events) {
    showAnnouncement(elements, "Invalid replay code", "critical");
    return;
  }
  // Save it to the list
  const replays = loadAllReplays();
  replays.unshift(replay);
  if (replays.length > 10) replays.length = 10;
  localStorage.setItem("wacko-chess-replays-v1", JSON.stringify(replays));
  showAnnouncement(elements, "Replay imported!", "warning");
  openReplayList();
}

function startReplayViewer(replay) {
  stopPlayback();

  // Set up game state from replay settings
  const settings = replay.settings || {};
  state = createInitialState({ ...settings, stats: loadStats() });
  setupChaosDeck(state);
  state.log = ["Replay started."];

  activePlayback = createPlayback(replay);

  elements.endOverlay.hidden = true;
  elements.endOverlay.innerHTML = "";
  elements.menuOverlay.hidden = true;
  elements.appShell.dataset.screen = "game";
  render();
  renderReplayControls();
  showAnnouncement(elements, "Replay mode — use controls to step through", "warning");
}

function renderReplayControls() {
  let controlBar = document.getElementById("replayControls");
  if (!controlBar) {
    controlBar = document.createElement("div");
    controlBar.id = "replayControls";
    controlBar.className = "replay-controls";
    document.querySelector(".board-stage")?.appendChild(controlBar);
  }

  if (!activePlayback) {
    controlBar.remove();
    return;
  }

  const pb = activePlayback;
  const progress = Math.round(pb.progress * 100);
  controlBar.innerHTML = `
    <button class="btn btn--ghost btn--sm" type="button" id="replayFirst" ${pb.isAtStart ? "disabled" : ""}>|&lt;</button>
    <button class="btn btn--ghost btn--sm" type="button" id="replayPrev" ${pb.isAtStart ? "disabled" : ""}>&lt;</button>
    <button class="btn btn--ghost btn--sm" type="button" id="replayPlay">${pb.playing ? "Pause" : "Play"}</button>
    <button class="btn btn--ghost btn--sm" type="button" id="replayNext" ${pb.isAtEnd ? "disabled" : ""}>&gt;</button>
    <button class="btn btn--ghost btn--sm" type="button" id="replayLast" ${pb.isAtEnd ? "disabled" : ""}>&gt;|</button>
    <span class="replay-progress">${pb.currentIndex + 1} / ${pb.totalEvents}</span>
    <button class="btn btn--ghost btn--sm btn--danger" type="button" id="replayExit">Exit</button>
  `;

  controlBar.onclick = handleReplayControlClick;
}

function handleReplayControlClick(event) {
  const btn = event.target.closest("button");
  if (!btn || !activePlayback) return;

  if (btn.id === "replayFirst") {
    replayGoTo(-1);
  } else if (btn.id === "replayPrev") {
    replayStep(-1);
  } else if (btn.id === "replayPlay") {
    toggleReplayAutoPlay();
  } else if (btn.id === "replayNext") {
    replayStep(1);
  } else if (btn.id === "replayLast") {
    replayGoTo(activePlayback.totalEvents - 1);
  } else if (btn.id === "replayExit") {
    exitReplay();
  }
}

function replayStep(direction) {
  if (!activePlayback) return;
  const pb = activePlayback;

  if (direction > 0 && !pb.isAtEnd) {
    pb.currentIndex += 1;
    applyReplayEvent(pb.replay.events[pb.currentIndex]);
  } else if (direction < 0 && !pb.isAtStart) {
    // For backward, re-apply from start up to currentIndex - 1
    replayGoTo(pb.currentIndex - 1);
    return;
  }

  render();
  renderReplayControls();
}

function replayGoTo(targetIndex) {
  if (!activePlayback) return;
  const pb = activePlayback;
  const settings = pb.replay.settings || {};

  // Reset state and re-apply all events up to targetIndex
  state = createInitialState({ ...settings, stats: loadStats() });
  setupChaosDeck(state);
  state.log = ["Replay started."];

  for (let i = 0; i <= targetIndex && i < pb.totalEvents; i++) {
    applyReplayEvent(pb.replay.events[i]);
  }

  pb.currentIndex = targetIndex;
  render();
  renderReplayControls();
}

function applyReplayEvent(event) {
  if (!event) return;

  if (event.type === "move") {
    const { from, to, promotion } = event.payload;
    // Use startTurn to draw cards and handle chaos
    if (!state.turnActions.moveMade) {
      startTurn(state);
    }
    requestMove(state, from, to, promotion);
    state.turnActions.moveMade = true;
    if (!state.gameOver) {
      startClock(state, state.turn);
    }
  } else if (event.type === "card") {
    const { color, handIndex, targets } = event.payload;
    playCard(state, color, handIndex, targets);
  } else if (event.type === "chaos") {
    // Major chaos is handled by startTurn — just log it
    state.log.push(`MAJOR CHAOS: ${event.payload.name}`);
  }
}

function toggleReplayAutoPlay() {
  if (!activePlayback) return;

  if (activePlayback.playing) {
    activePlayback.playing = false;
    clearInterval(playbackTimer);
    playbackTimer = null;
  } else {
    activePlayback.playing = true;
    playbackTimer = setInterval(() => {
      if (!activePlayback || activePlayback.isAtEnd) {
        if (activePlayback) activePlayback.playing = false;
        clearInterval(playbackTimer);
        playbackTimer = null;
        renderReplayControls();
        return;
      }
      replayStep(1);
    }, activePlayback.speed);
  }
  renderReplayControls();
}

function exitReplay() {
  stopPlayback();
  const controlBar = document.getElementById("replayControls");
  if (controlBar) controlBar.remove();
  state = createInitialState({ stats: loadStats() });
  elements.menuOverlay.hidden = false;
  elements.appShell.dataset.screen = "menu";
  render();
}

function openStatsDashboard() {
  const stats = getDisplayStats(loadExtendedStats());
  const history = loadGameHistory();
  const overlay = elements.endOverlay;

  const recentGames = history.slice(-10).reverse().map((g) => {
    const date = new Date(g.date).toLocaleDateString();
    const result = g.winner ? `${g.winner[0].toUpperCase()}${g.winner.slice(1)} wins` : "Draw";
    const dur = g.duration ? `${Math.floor(g.duration / 60)}m${g.duration % 60}s` : "";
    return `<li class="stats-history-item"><span>${result}</span><span>${g.turns} turns</span><span>${dur}</span><span>${date}</span></li>`;
  }).join("");

  const topCardsHtml = stats.topCards.length
    ? stats.topCards.map((c) => {
        const def = getCardDefinition({ id: c.id });
        const name = def ? def.name : c.id;
        return `<li><strong>${escapeHtmlLocal(name)}</strong> <span class="stats-card-count">&times;${c.count}</span></li>`;
      }).join("")
    : "<li>No cards played yet</li>";

  overlay.hidden = false;
  overlay.innerHTML = `
    <section class="end-panel stats-dashboard">
      <h2>Stats Dashboard</h2>
      <div class="stats-grid">
        <div class="stat-block">
          <strong>${stats.gamesPlayed}</strong><span>Games</span>
        </div>
        <div class="stat-block">
          <strong>${stats.whiteWins}</strong><span>White Wins</span>
        </div>
        <div class="stat-block">
          <strong>${stats.blackWins}</strong><span>Black Wins</span>
        </div>
        <div class="stat-block">
          <strong>${stats.draws}</strong><span>Draws</span>
        </div>
        <div class="stat-block stat-block--elo">
          <strong>${stats.eloWhite}</strong><span>White ELO</span>
        </div>
        <div class="stat-block stat-block--elo">
          <strong>${stats.eloBlack}</strong><span>Black ELO</span>
        </div>
        <div class="stat-block stat-block--elo">
          <strong>${stats.eloAi}</strong><span>AI ELO</span>
        </div>
        <div class="stat-block">
          <strong>${stats.winRate}%</strong><span>Win Rate</span>
        </div>
        <div class="stat-block">
          <strong>${stats.bestStreak}</strong><span>Best Streak</span>
        </div>
        <div class="stat-block">
          <strong>${stats.currentStreak}</strong><span>Current Streak</span>
        </div>
        <div class="stat-block">
          <strong>${stats.avgTurns}</strong><span>Avg Turns</span>
        </div>
        <div class="stat-block">
          <strong>${stats.avgCards}</strong><span>Avg Cards/Game</span>
        </div>
        <div class="stat-block">
          <strong>${stats.fastestWin ?? "-"}</strong><span>Fastest Win</span>
        </div>
        <div class="stat-block">
          <strong>${stats.longestGame || "-"}</strong><span>Longest Game</span>
        </div>
        <div class="stat-block">
          <strong>${stats.totalMutations}</strong><span>Total Mutations</span>
        </div>
        <div class="stat-block">
          <strong>${stats.chaosSurvived}</strong><span>Chaos Survived</span>
        </div>
      </div>
      <div class="stats-sections">
        <div class="stats-section">
          <h3>Favorite Cards</h3>
          <ul class="stats-top-cards">${topCardsHtml}</ul>
        </div>
        <div class="stats-section">
          <h3>Recent Games</h3>
          <ul class="stats-history">${recentGames || '<li>No games yet</li>'}</ul>
        </div>
      </div>
      <div class="end-actions">
        <button class="btn btn--ghost btn--danger" type="button" id="statsResetBtn">Reset Stats</button>
        <button class="btn btn--ghost" type="button" data-end-action="menu">Back</button>
      </div>
    </section>
  `;

  overlay.querySelector("#statsResetBtn")?.addEventListener("click", () => {
    if (!window.confirm("Reset all stats and game history? This cannot be undone.")) return;
    const fresh = resetAllStats();
    state.stats = fresh;
    openStatsDashboard();
  });
}

function escapeHtmlLocal(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

init();
