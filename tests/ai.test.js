import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chooseAiCardPlay, chooseAiMove } from "../js/ai.js";
import { createInitialState } from "../js/state.js";

test("v1.3 AI option is exposed in release metadata and start screen", () => {
  const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

  assert.equal(packageJson.version, "1.3.0");
  assert.match(html, /Play vs Wacko AI/);
  assert.match(html, /v1\.3/);
});

test("AI chooses a legal opening move for black", () => {
  const state = createInitialState({ aiOpponent: true }, () => 0);
  state.turn = "black";
  state.chess.setTurn("b");

  const move = chooseAiMove(state, "black");

  assert.ok(move);
  assert.equal(state.board[move.from.row][move.from.col].color, "black");
});

test("AI picks a playable card with valid targets", () => {
  const state = createInitialState({ aiOpponent: true }, () => 0);
  state.turn = "black";
  state.hands.black = [{ id: "FORTIFY", instanceId: "fortify-ai" }];

  const cardPlay = chooseAiCardPlay(state, "black");

  assert.equal(cardPlay.definition.name, "Fortify");
  assert.equal(cardPlay.targets.length, 1);
  assert.equal(state.board[cardPlay.targets[0].row][cardPlay.targets[0].col].color, "black");
});
