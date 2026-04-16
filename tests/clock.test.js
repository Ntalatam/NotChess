import test from "node:test";
import assert from "node:assert/strict";
import {
  checkTimeout,
  createInitialState,
  flushActiveClock,
  formatClock,
  getRemainingMs,
  isUnlimited,
  pauseClock,
  resumeClock,
  startClock,
} from "../js/state.js";

test("unlimited timer leaves clocks null", () => {
  const state = createInitialState({ timer: "unlimited" });
  assert.equal(state.clocks.white, null);
  assert.equal(state.clocks.black, null);
  assert.equal(isUnlimited(state), true);
});

test("timed match initializes each side with the configured minutes", () => {
  const state = createInitialState({ timer: "10" });
  assert.equal(state.clocks.white, 10 * 60 * 1000);
  assert.equal(state.clocks.black, 10 * 60 * 1000);
  assert.equal(isUnlimited(state), false);
});

test("formatClock renders mm:ss with zero-padded seconds", () => {
  assert.equal(formatClock(10 * 60 * 1000), "10:00");
  assert.equal(formatClock(65 * 1000), "1:05");
  assert.equal(formatClock(500), "0:01");
  assert.equal(formatClock(0), "0:00");
  assert.equal(formatClock(null), "--:--");
});

test("startClock drains the active side while idle side stays still", () => {
  const state = createInitialState({ timer: "5" });
  const t0 = 1_000;
  startClock(state, "white", t0);

  assert.equal(getRemainingMs(state, "white", t0 + 2_000), 5 * 60 * 1000 - 2_000);
  assert.equal(getRemainingMs(state, "black", t0 + 2_000), 5 * 60 * 1000);
});

test("switching active color flushes the previous side's elapsed time", () => {
  const state = createInitialState({ timer: "5" });
  startClock(state, "white", 0);
  startClock(state, "black", 3_000);

  assert.equal(state.clocks.white, 5 * 60 * 1000 - 3_000);
  assert.equal(state.clocks.activeColor, "black");
});

test("pauseClock freezes the clock and resumeClock continues without losing the pause gap", () => {
  const state = createInitialState({ timer: "5" });
  startClock(state, "white", 0);
  flushActiveClock(state, 2_000);
  pauseClock(state, 2_000);
  // 10 real seconds pass while paused
  resumeClock(state, 12_000);
  assert.equal(getRemainingMs(state, "white", 13_000), 5 * 60 * 1000 - 3_000);
});

test("checkTimeout ends the game when the active clock hits zero", () => {
  const state = createInitialState({ timer: "5" });
  startClock(state, "white", 0);
  const timedOut = checkTimeout(state, 5 * 60 * 1000 + 1);

  assert.equal(timedOut, true);
  assert.equal(state.gameOver, true);
  assert.equal(state.winner, "black");
  assert.match(state.gameOverReason, /wins on time/i);
});

test("checkTimeout is a no-op for unlimited matches", () => {
  const state = createInitialState({ timer: "unlimited" });
  startClock(state, "white", 0);
  assert.equal(checkTimeout(state, 10 * 60 * 60 * 1000), false);
  assert.equal(state.gameOver, false);
});
