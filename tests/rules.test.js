import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState } from "../js/state.js";
import { getLegalMoves, moveFromNotation } from "../js/rules.js";

test("initial knight moves are generated through the chess rule oracle", () => {
  const state = createInitialState();
  const knight = state.board[7][6];
  const moves = getLegalMoves(state, knight.id).map((move) => move.to).sort();

  assert.deepEqual(moves, ["f3", "h3"]);
});

test("standard moves update board state and turns", () => {
  const state = createInitialState();
  const result = moveFromNotation(state, "e2", "e4");

  assert.equal(result.move.san, "e4");
  assert.equal(state.board[4][4].type, "p");
  assert.equal(state.board[6][4], null);
  assert.equal(state.turn, "black");
});

test("castling moves both king and rook", () => {
  const state = createInitialState();
  moveFromNotation(state, "e2", "e4");
  moveFromNotation(state, "e7", "e5");
  moveFromNotation(state, "g1", "f3");
  moveFromNotation(state, "b8", "c6");
  moveFromNotation(state, "f1", "c4");
  moveFromNotation(state, "g8", "f6");
  moveFromNotation(state, "e1", "g1");

  assert.equal(state.board[7][6].type, "k");
  assert.equal(state.board[7][5].type, "r");
  assert.equal(state.board[7][4], null);
  assert.equal(state.board[7][7], null);
});

test("en passant removes the captured pawn from its passed square", () => {
  const state = createInitialState();
  moveFromNotation(state, "e2", "e4");
  moveFromNotation(state, "a7", "a6");
  moveFromNotation(state, "e4", "e5");
  moveFromNotation(state, "d7", "d5");
  const result = moveFromNotation(state, "e5", "d6");

  assert.equal(result.move.isEnPassant(), true);
  assert.equal(state.board[2][3].color, "white");
  assert.equal(state.board[3][3], null);
  assert.equal(state.capturedPieces.white.length, 1);
});

test("fool's mate ends in black checkmate win", () => {
  const state = createInitialState();
  moveFromNotation(state, "f2", "f3");
  moveFromNotation(state, "e7", "e5");
  moveFromNotation(state, "g2", "g4");
  moveFromNotation(state, "d8", "h4");

  assert.equal(state.checkmate, true);
  assert.equal(state.gameOver, true);
  assert.equal(state.winner, "black");
});
