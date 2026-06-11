import assert from "node:assert/strict";
import test from "node:test";

import { shouldCheckForUpdates } from "../src/services/updatePolicy.ts";

test("only checks for updates inside Tauri production builds", () => {
  assert.equal(shouldCheckForUpdates(false, true), false);
  assert.equal(shouldCheckForUpdates(true, false), false);
  assert.equal(shouldCheckForUpdates(true, true), true);
});
