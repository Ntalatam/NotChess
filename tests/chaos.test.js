import test from "node:test";
import assert from "node:assert/strict";
import { grantMutation } from "../js/mutations.js";
import { getLegalMoves, moveFromNotation, syncChessToBoard } from "../js/rules.js";
import { createInitialState } from "../js/state.js";
import { drawCard, getCardTargetSquares, hasChaosEvent, playCard, setupChaosDeck, startTurn } from "../js/chaos.js";

test("chaos deck contains forty cards and deals opening hands", () => {
  const state = createInitialState();
  setupChaosDeck(state);

  assert.equal(state.deck.remaining, 34);
  assert.equal(state.hands.white.length, 3);
  assert.equal(state.hands.black.length, 3);
});

test("discard pile reshuffles when deck runs out", () => {
  const state = createInitialState();
  state.deck.cards = [];
  state.deck.discard = [{ id: "FORTIFY", instanceId: "x" }];
  drawCard(state, "white");

  assert.equal(state.hands.white.length, 1);
  assert.equal(state.deck.discarded, 0);
});

test("fortify gives an own piece shield", () => {
  const state = createInitialState();
  state.hands.white = [{ id: "FORTIFY", instanceId: "fortify" }];
  const result = playCard(state, "white", 0, [{ row: 6, col: 4 }]);

  assert.equal(result.definition.name, "Fortify");
  assert.equal(state.board[6][4].mutations.includes("SHIELD"), true);
  assert.equal(state.deck.discarded, 1);
});

test("land mine card exposes empty square targets and places a mine", () => {
  const state = createInitialState();
  state.hands.white = [{ id: "LAND_MINE", instanceId: "mine" }];
  const targets = getCardTargetSquares(state, "white", 0);

  assert.equal(targets.some((target) => target.row === 4 && target.col === 4), true);
  playCard(state, "white", 0, [{ row: 4, col: 4 }]);
  assert.equal(state.specialTiles[0].type, "MINEFIELD");
});

test("nuclear option destroys non-kings and preserves kings", () => {
  const state = createInitialState();
  state.hands.white = [{ id: "NUCLEAR_OPTION", instanceId: "nuke" }];
  playCard(state, "white", 0, [{ row: 7, col: 4 }]);

  assert.equal(state.board[7][4].type, "k");
  assert.equal(state.board[7][3], null);
});

test("time warp grants one extra move before the turn changes", () => {
  const state = createInitialState();
  state.hands.white = [{ id: "TIME_WARP", instanceId: "time" }];
  playCard(state, "white", 0, []);
  moveFromNotation(state, "e2", "e4");

  assert.equal(state.turn, "white");
  moveFromNotation(state, "g1", "f3");
  assert.equal(state.turn, "black");
});

test("hasChaosEvent detects active events by type", () => {
  const state = createInitialState();
  assert.equal(hasChaosEvent(state, "GRAVITY_FLIP"), false);
  state.chaosEvents.push({ type: "GRAVITY_FLIP", name: "Gravity Flip", turnsLeft: 2, color: null });
  assert.equal(hasChaosEvent(state, "GRAVITY_FLIP"), true);
  assert.equal(hasChaosEvent(state, "THE_SWITCH"), false);
});

test("gravity flip makes white pawns move backward", () => {
  const state = createInitialState();
  setupChaosDeck(state);

  // Move pawn to row 4 so it has open space behind (row 5, 6)
  const pawn = state.board[6][0];
  state.board[6][0] = null;
  state.board[4][0] = pawn;
  syncChessToBoard(state);

  state.chaosEvents.push({ type: "GRAVITY_FLIP", name: "Gravity Flip", turnsLeft: 2, color: null });
  const moves = getLegalMoves(state, pawn.id);

  assert.equal(moves.some((m) => m.row === 5), true, "pawn can move backward to row 5");
  assert.equal(moves.some((m) => m.row === 3), false, "pawn cannot move forward during gravity flip");
});

test("the switch lets white control black pieces", () => {
  const state = createInitialState();
  setupChaosDeck(state);
  state.chaosEvents.push({ type: "THE_SWITCH", name: "The Switch", turnsLeft: 1, color: null });

  // White's turn, but with THE_SWITCH, white controls black pieces
  const blackKnight = state.board[0][1]; // black knight at b8
  const moves = getLegalMoves(state, blackKnight.id);

  assert.equal(moves.length > 0, true, "white can generate moves for black pieces during THE_SWITCH");
  assert.equal(blackKnight.color, "black", "piece is still black-owned");

  // White's own pieces should NOT be selectable
  const whitePawn = state.board[6][4];
  const whiteMoves = getLegalMoves(state, whitePawn.id);
  assert.equal(whiteMoves.length, 0, "white cannot move own pieces during THE_SWITCH");
});

test("kings gamble backlash destroys a random piece of the triggering player", () => {
  const state = createInitialState({}, () => 0);
  setupChaosDeck(state);
  state.chaosEvents.push({ type: "KINGS_GAMBLE_CHECK", name: "King's Gamble Backlash", turnsLeft: 1, color: "white" });

  const whitePiecesBefore = state.board.flat().filter((p) => p?.color === "white" && p.type !== "k").length;

  startTurn(state);

  const whitePiecesAfter = state.board.flat().filter((p) => p?.color === "white" && p.type !== "k").length;
  assert.equal(whitePiecesAfter, whitePiecesBefore - 1, "one white non-king piece was destroyed");
  assert.equal(state.chaosEvents.some((e) => e.type === "KINGS_GAMBLE_CHECK"), false, "event was removed after tick");
});

test("rule inversion resurrects captured pieces on a random empty square", () => {
  const state = createInitialState({}, () => 0.5);
  setupChaosDeck(state);
  state.chaosEvents.push({ type: "RULE_INVERSION", name: "Rule Inversion", turnsLeft: 6, color: null });

  // Set up a direct capture scenario
  state.board[1][3] = null;
  state.board[3][3] = { ...state.board[1][4], id: "black-p-target" };
  state.board[3][3].color = "black";
  state.board[3][3].type = "p";
  state.board[3][3].mutations = [];
  state.board[1][4] = null;
  syncChessToBoard(state);

  moveFromNotation(state, "e2", "e4");
  moveFromNotation(state, "a7", "a6");

  const piecesBeforeCapture = state.board.flat().filter(Boolean).length;
  moveFromNotation(state, "e4", "d5");

  const piecesAfterCapture = state.board.flat().filter(Boolean).length;
  assert.equal(piecesAfterCapture, piecesBeforeCapture, "piece count unchanged due to resurrection");

  const revivedPieces = state.board.flat().filter((p) => p && p.id.includes("revived"));
  assert.equal(revivedPieces.length, 1, "a revived piece exists on the board");
  assert.equal(state.capturedPieces.white.length, 0, "captured list is empty after resurrection");
});

test("mutation injection can grant a mutation through card play", () => {
  const state = createInitialState({}, () => 0);
  state.hands.white = [{ id: "MUTATION_INJECTION", instanceId: "mutate" }];
  playCard(state, "white", 0, [{ row: 6, col: 4 }]);

  assert.equal(state.board[6][4].mutations.length, 1);
  assert.equal(grantMutation(state.board[7][4], "CLONER"), false);
});
