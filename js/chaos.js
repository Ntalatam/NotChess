import { notationToSquare, squareToNotation } from "./board.js";
import { createPiece, getPieceAt, pieceLabel } from "./pieces.js";
import { grantMutation, grantRandomMutation } from "./mutations.js";
import { oppositeColor, syncChessToBoard, updateGameStatus } from "./rules.js";
import { addLog } from "./state.js";
import { spawnPortalPair, spawnSpecialTile } from "./tiles.js";

export const CARD_DEFINITIONS = {
  PROMOTION_RIOT: {
    id: "PROMOTION_RIOT",
    name: "Promotion Riot",
    category: "Buff",
    flavor: "The back rank is a state of mind.",
    text: "Promote one of your pawns to a Queen immediately.",
    target: { kind: "ownPawn", count: 1 },
    resolve: (state, color, targets) => {
      const piece = getPieceAt(state.board, targets[0].row, targets[0].col);
      piece.type = "q";
      piece.promoted = true;
    },
  },
  SWAP_AND_PRAY: {
    id: "SWAP_AND_PRAY",
    name: "Swap & Pray",
    category: "Wild",
    flavor: "The board blinks first.",
    text: "Swap any two non-King pieces.",
    target: { kind: "nonKingPiece", count: 2 },
    resolve: (state, color, targets) => {
      const first = getPieceAt(state.board, targets[0].row, targets[0].col);
      const second = getPieceAt(state.board, targets[1].row, targets[1].col);
      state.board[targets[0].row][targets[0].col] = second;
      state.board[targets[1].row][targets[1].col] = first;
    },
  },
  THE_CLONE_WARS: {
    id: "THE_CLONE_WARS",
    name: "The Clone Wars",
    category: "Buff",
    flavor: "One piece becomes a committee.",
    text: "Duplicate one of your pieces into the first adjacent empty square.",
    target: { kind: "ownPieceNonKing", count: 1 },
    resolve: (state, color, targets) => {
      const origin = targets[0];
      const piece = getPieceAt(state.board, origin.row, origin.col);
      const destination = firstAdjacentEmpty(state, origin.row, origin.col);
      if (!destination) return;
      const clone = createPiece(piece.color, piece.type);
      clone.id = `${piece.id}-card-clone-${Date.now()}`;
      clone.mutations = [...piece.mutations];
      clone.promoted = piece.promoted;
      state.board[destination.row][destination.col] = clone;
    },
  },
  GRAVITY_FLIP: {
    id: "GRAVITY_FLIP",
    name: "Gravity Flip",
    category: "Board",
    flavor: "Pawns remember where they came from.",
    text: "For two turns, pawns move backward.",
    target: null,
    resolve: (state) => addChaosEvent(state, "GRAVITY_FLIP", "Gravity Flip", 2),
  },
  LAND_MINE: {
    id: "LAND_MINE",
    name: "Land Mine",
    category: "Trap",
    flavor: "A quiet square starts keeping secrets.",
    text: "Place a hidden Minefield on an empty square.",
    target: { kind: "emptySquare", count: 1 },
    resolve: (state, color, targets) => spawnSpecialTile(state, "MINEFIELD", targets[0].row, targets[0].col, { owner: color }),
  },
  PIECE_THIEF: {
    id: "PIECE_THIEF",
    name: "Piece Thief",
    category: "Attack",
    flavor: "Lost pieces hate paperwork.",
    text: "Steal a captured enemy piece onto your back rank.",
    target: { kind: "ownBackRankEmpty", count: 1 },
    canPlay: (state, color) => state.capturedPieces[oppositeColor(color)].length > 0,
    resolve: (state, color, targets) => {
      const pool = state.capturedPieces[oppositeColor(color)];
      const stolen = pool.splice(Math.floor(state.rng() * pool.length), 1)[0];
      stolen.color = color;
      stolen.id = `${color}-stolen-${stolen.type}-${Date.now()}`;
      state.board[targets[0].row][targets[0].col] = stolen;
    },
  },
  CHAOS_NOVA: {
    id: "CHAOS_NOVA",
    name: "Chaos Nova",
    category: "Wild",
    flavor: "The board asked for a reset. The board got one.",
    text: "Teleport every piece to a random empty square.",
    target: null,
    resolve: (state) => {
      const pieces = allPieces(state).map(({ piece }) => piece);
      const squares = shuffled(allSquares(), state.rng);
      state.board = Array.from({ length: 8 }, () => Array(8).fill(null));
      pieces.forEach((piece, index) => {
        const square = squares[index % squares.length];
        state.board[square.row][square.col] = piece;
      });
    },
  },
  TIME_WARP: {
    id: "TIME_WARP",
    name: "Time Warp",
    category: "Wild",
    flavor: "Your clock gets ideas.",
    text: "Take one extra move this turn.",
    target: null,
    resolve: (state, color) => {
      state.extraMoves[color] += 1;
    },
  },
  FORTIFY: {
    id: "FORTIFY",
    name: "Fortify",
    category: "Buff",
    flavor: "The piece develops boundaries.",
    text: "Give one of your pieces Shielded.",
    target: { kind: "ownPiece", count: 1 },
    resolve: (state, color, targets) => grantMutation(getPieceAt(state.board, targets[0].row, targets[0].col), "SHIELD"),
  },
  HAUNTING: {
    id: "HAUNTING",
    name: "Haunting",
    category: "Trap",
    flavor: "The quiet squares were lying.",
    text: "Place two Ghost Tiles, one targeted and one nearby.",
    target: { kind: "emptySquare", count: 1 },
    resolve: (state, color, targets) => {
      spawnSpecialTile(state, "GHOST_TILE", targets[0].row, targets[0].col);
      const second = firstEmptySquare(state, targets[0]);
      if (second) spawnSpecialTile(state, "GHOST_TILE", second.row, second.col);
    },
  },
  VOLCANO: {
    id: "VOLCANO",
    name: "Volcano",
    category: "Board",
    flavor: "A square learns anger.",
    text: "Spawn one Lava tile.",
    target: { kind: "anySquare", count: 1 },
    resolve: (state, color, targets) => spawnSpecialTile(state, "LAVA", targets[0].row, targets[0].col),
  },
  FREEZE: {
    id: "FREEZE",
    name: "Freeze",
    category: "Attack",
    flavor: "Your opponent's plan catches frostbite.",
    text: "Freeze one opponent piece for two turns.",
    target: { kind: "enemyPiece", count: 1 },
    resolve: (state, color, targets) => {
      getPieceAt(state.board, targets[0].row, targets[0].col).frozenTurns = 2;
    },
  },
  REBELLION: {
    id: "REBELLION",
    name: "Rebellion",
    category: "Wild",
    flavor: "Even rooks have opinions.",
    text: "One opponent piece makes a random legal move.",
    target: { kind: "enemyPiece", count: 1 },
    resolve: (state, color, targets) => rebelMove(state, color, targets[0]),
  },
  KINGS_GAMBLE: {
    id: "KINGS_GAMBLE",
    name: "King's Gamble",
    category: "Wild",
    flavor: "Majesty takes a shortcut.",
    text: "Teleport your King anywhere. A bad roll leaves trouble behind.",
    target: { kind: "anySquare", count: 1 },
    resolve: (state, color, targets) => {
      const king = allPieces(state).find(({ piece }) => piece.color === color && piece.type === "k");
      const occupant = getPieceAt(state.board, targets[0].row, targets[0].col);
      if (!king || occupant?.type === "k") return;
      state.board[king.row][king.col] = null;
      state.board[targets[0].row][targets[0].col] = king.piece;
      if (state.rng() >= 4 / 6) addChaosEvent(state, "KINGS_GAMBLE_CHECK", "King's Gamble Backlash", 1);
    },
  },
  PORTAL_PAIR: {
    id: "PORTAL_PAIR",
    name: "Portal Pair",
    category: "Board",
    flavor: "Distance files a complaint.",
    text: "Place a linked pair of portals.",
    target: { kind: "emptySquare", count: 2 },
    resolve: (state, color, targets) => spawnPortalPair(state, targets[0], targets[1]),
  },
  MUTATION_INJECTION: {
    id: "MUTATION_INJECTION",
    name: "Mutation Injection",
    category: "Buff",
    flavor: "A little sparkle. A lot of liability.",
    text: "Grant a random mutation to one of your pieces.",
    target: { kind: "ownPiece", count: 1 },
    resolve: (state, color, targets) => grantRandomMutation(state, getPieceAt(state.board, targets[0].row, targets[0].col)),
  },
  PIECE_STORM: {
    id: "PIECE_STORM",
    name: "Piece Storm",
    category: "Board",
    flavor: "The sky is mostly knights now.",
    text: "Summon a neutral blocker as a Ghost Tile.",
    target: null,
    resolve: (state) => {
      const square = randomEmptySquare(state);
      if (square) spawnSpecialTile(state, "GHOST_TILE", square.row, square.col, { turnsLeft: 4 });
    },
  },
  THE_SWITCH: {
    id: "THE_SWITCH",
    name: "The Switch",
    category: "Wild",
    flavor: "Walk a mile in their monarchy.",
    text: "Swap colors for one turn.",
    target: null,
    resolve: (state) => addChaosEvent(state, "THE_SWITCH", "The Switch", 1),
  },
  AMPLIFY: {
    id: "AMPLIFY",
    name: "Amplify",
    category: "Buff",
    flavor: "Subtlety leaves the room.",
    text: "Place an Amplifier tile.",
    target: { kind: "anySquare", count: 1 },
    resolve: (state, color, targets) => spawnSpecialTile(state, "AMPLIFIER", targets[0].row, targets[0].col),
  },
  NUCLEAR_OPTION: {
    id: "NUCLEAR_OPTION",
    name: "Nuclear Option",
    category: "Wild",
    flavor: "Technically, the king's square is safe. Technically.",
    text: "Destroy all non-King pieces in a 3x3 zone.",
    target: { kind: "anySquare", count: 1 },
    resolve: (state, color, targets) => {
      for (let row = targets[0].row - 1; row <= targets[0].row + 1; row += 1) {
        for (let col = targets[0].col - 1; col <= targets[0].col + 1; col += 1) {
          const piece = getPieceAt(state.board, row, col);
          if (piece && piece.type !== "k") state.board[row][col] = null;
        }
      }
    },
  },
};

const CARD_IDS = Object.keys(CARD_DEFINITIONS);

export function setupChaosDeck(state) {
  const cards = CARD_IDS.flatMap((id) => [createCard(id), createCard(id)]);
  state.deck.cards = shuffled(cards, state.rng);
  state.deck.discard = [];
  updateDeckCounts(state);
  for (let index = 0; index < 3; index += 1) {
    drawCard(state, "white");
    drawCard(state, "black");
  }
}

export function startTurn(state) {
  state.turnActions.cardPlayed = false;
  drawCard(state, state.turn);
  tickFrozenPieces(state, state.turn);
}

export function drawCard(state, color) {
  if (state.hands[color].length >= 4) return null;
  if (state.deck.cards.length === 0 && state.deck.discard.length > 0) {
    state.deck.cards = shuffled(state.deck.discard, state.rng);
    state.deck.discard = [];
  }
  const card = state.deck.cards.pop() || null;
  if (card) state.hands[color].push(card);
  updateDeckCounts(state);
  return card;
}

export function canPlayCard(state, color, handIndex) {
  if (state.turn !== color || state.turnActions.cardPlayed || state.gameOver) return false;
  const card = state.hands[color][handIndex];
  if (!card) return false;
  const definition = CARD_DEFINITIONS[card.id];
  return definition.canPlay ? definition.canPlay(state, color) : true;
}

export function getCardTargetSquares(state, color, handIndex, selectedTargets = []) {
  const card = state.hands[color][handIndex];
  if (!card) return [];
  const target = CARD_DEFINITIONS[card.id].target;
  if (!target) return [];
  return allSquares().filter((square) => isValidTarget(state, color, target.kind, square, selectedTargets));
}

export function playCard(state, color, handIndex, targets = []) {
  if (!canPlayCard(state, color, handIndex)) return null;
  const card = state.hands[color][handIndex];
  const definition = CARD_DEFINITIONS[card.id];
  const requiredTargets = definition.target?.count || 0;
  if (targets.length < requiredTargets) return null;

  state.hands[color].splice(handIndex, 1);
  state.deck.discard.push(card);
  state.turnActions.cardPlayed = true;
  definition.resolve(state, color, targets);
  syncChessToBoard(state, state.turn);
  updateGameStatus(state);
  updateDeckCounts(state);
  addLog(state, `${capitalize(color)} played ${definition.name}.`);
  return { card, definition };
}

export function getCardDefinition(card) {
  return CARD_DEFINITIONS[card.id];
}

export function getTargetCount(card) {
  return CARD_DEFINITIONS[card.id].target?.count || 0;
}

function createCard(id) {
  return {
    id,
    instanceId: `${id}-${Math.random().toString(16).slice(2)}`,
  };
}

function isValidTarget(state, color, kind, square, selectedTargets) {
  if (selectedTargets.some((target) => target.row === square.row && target.col === square.col)) return false;
  const piece = getPieceAt(state.board, square.row, square.col);
  if (kind === "anySquare") return true;
  if (kind === "emptySquare") return !piece;
  if (kind === "ownPiece") return piece?.color === color;
  if (kind === "ownPieceNonKing") return piece?.color === color && piece.type !== "k";
  if (kind === "ownPawn") return piece?.color === color && piece.type === "p";
  if (kind === "enemyPiece") return piece && piece.color === oppositeColor(color);
  if (kind === "nonKingPiece") return piece && piece.type !== "k";
  if (kind === "ownBackRankEmpty") return !piece && square.row === (color === "white" ? 7 : 0);
  return false;
}

function tickFrozenPieces(state, color) {
  for (const { piece } of allPieces(state)) {
    if (piece.color === color && piece.frozenTurns > 0) {
      piece.frozenTurns -= 1;
    }
  }
}

function rebelMove(state, color, target) {
  const originalTurn = state.turn;
  const rebelColor = oppositeColor(color);
  state.turn = rebelColor;
  syncChessToBoard(state, rebelColor);
  const piece = getPieceAt(state.board, target.row, target.col);
  const moves = piece ? state.chess.moves({ square: squareToNotation(target.row, target.col), verbose: true }) : [];
  if (piece && moves.length) {
    const move = moves[Math.floor(state.rng() * moves.length)];
    const from = notationToSquare(move.from);
    const to = notationToSquare(move.to);
    const captured = getPieceAt(state.board, to.row, to.col);
    state.board[to.row][to.col] = piece;
    state.board[from.row][from.col] = null;
    if (captured) state.capturedPieces[rebelColor].push(captured);
  }
  state.turn = originalTurn;
  syncChessToBoard(state, originalTurn);
}

function addChaosEvent(state, type, name, turnsLeft) {
  state.chaosEvents.push({ type, name, turnsLeft });
}

function updateDeckCounts(state) {
  state.deck.remaining = state.deck.cards.length;
  state.deck.discarded = state.deck.discard.length;
}

function allPieces(state) {
  const pieces = [];
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = getPieceAt(state.board, row, col);
      if (piece) pieces.push({ piece, row, col });
    }
  }
  return pieces;
}

function allSquares() {
  return Array.from({ length: 64 }, (_, index) => ({
    row: Math.floor(index / 8),
    col: index % 8,
  }));
}

function randomEmptySquare(state) {
  return randomChoice(emptySquares(state), state.rng);
}

function firstEmptySquare(state, preferred) {
  return firstAdjacentEmpty(state, preferred.row, preferred.col) || randomEmptySquare(state);
}

function firstAdjacentEmpty(state, row, col) {
  for (let nextRow = row - 1; nextRow <= row + 1; nextRow += 1) {
    for (let nextCol = col - 1; nextCol <= col + 1; nextCol += 1) {
      if (nextRow === row && nextCol === col) continue;
      if (nextRow < 0 || nextRow > 7 || nextCol < 0 || nextCol > 7) continue;
      if (!getPieceAt(state.board, nextRow, nextCol)) return { row: nextRow, col: nextCol };
    }
  }
  return null;
}

function emptySquares(state) {
  return allSquares().filter((square) => !getPieceAt(state.board, square.row, square.col));
}

function randomChoice(items, rng) {
  if (!items.length) return null;
  return items[Math.floor(rng() * items.length)];
}

function shuffled(items, rng) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function capitalize(value) {
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}
