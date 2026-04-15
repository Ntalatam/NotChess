import test from "node:test";
import assert from "node:assert/strict";
import { notationToSquare, squareToNotation, pointToSquare } from "../js/board.js";

test("square notation maps top-left board coordinates correctly", () => {
  assert.deepEqual(notationToSquare("a8"), { row: 0, col: 0 });
  assert.deepEqual(notationToSquare("h1"), { row: 7, col: 7 });
  assert.equal(squareToNotation(0, 0), "a8");
  assert.equal(squareToNotation(7, 7), "h1");
});

test("invalid notation returns null", () => {
  assert.equal(notationToSquare("z9"), null);
  assert.equal(notationToSquare("a0"), null);
});

test("canvas points convert to board squares", () => {
  const metrics = {
    originX: 40,
    originY: 40,
    boardSize: 640,
    squareSize: 80,
  };

  assert.deepEqual(pointToSquare(metrics, 41, 41), { row: 0, col: 0 });
  assert.deepEqual(pointToSquare(metrics, 679, 679), { row: 7, col: 7 });
  assert.equal(pointToSquare(metrics, 20, 20), null);
  assert.equal(pointToSquare(metrics, 681, 681), null);
});
