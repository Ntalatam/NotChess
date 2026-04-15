import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("rules and controls are available from the app chrome", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

  assert.match(html, /Rules & Controls/);
  assert.match(html, /How To Play/);
  assert.match(html, /data-help-open/);
  assert.match(html, /data-help-close/);
});
