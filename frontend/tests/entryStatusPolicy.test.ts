import assert from "node:assert/strict";
import test from "node:test";

import { canToggleEntryStatus } from "../src/features/entry/entryStatusPolicy.ts";

test("does not allow archived tasks to toggle completion", () => {
  assert.equal(
    canToggleEntryStatus({
      entry_type: "task",
      status: "open",
      archived_at: "2026-06-11T08:00:00Z",
    }),
    false,
  );
});

test("allows active open tasks to toggle completion", () => {
  assert.equal(
    canToggleEntryStatus({
      entry_type: "task",
      status: "open",
      archived_at: null,
    }),
    true,
  );
});
