import assert from "node:assert/strict";
import test from "node:test";

import { isFutureLogEntry } from "../src/features/futureLog/futureLogEntryModel.ts";

test("future log ignores migrated daily source stubs with target month", () => {
  assert.equal(
    isFutureLogEntry({
      id: "daily-1",
      status: "migrated_future",
      target_month: "2026-04",
      is_future: false,
    }),
    false,
  );

  assert.equal(
    isFutureLogEntry({
      id: "future-1",
      status: "open",
      target_month: "2026-04",
      is_future: true,
    }),
    true,
  );

  assert.equal(
    isFutureLogEntry({
      id: "future-undetermined",
      status: "open",
      target_month: null,
      is_future: true,
    }),
    true,
  );
});
