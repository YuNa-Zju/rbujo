import assert from "node:assert/strict";
import test from "node:test";

import { normalizeMoveToFutureResult } from "../src/services/entryServiceMigration.ts";

test("preserves updated source when normalizing daily to Future migration", () => {
  const result = normalizeMoveToFutureResult({
    updated_source: {
      id: "daily-1",
      content: "复习场波",
      entry_type: "task",
      status: "migrated_future",
      target_month: "2026-04",
      migrated_to_entry_id: "future-1",
    },
    created_entry: {
      id: "future-1",
      content: "复习场波",
      entry_type: "task",
      status: "open",
      target_month: "2026-04",
      is_future: true,
      source_entry_id: "daily-1",
    },
  });

  assert.equal(result.updated_source.id, "daily-1");
  assert.equal(result.updated_source.status, "migrated_future");
  assert.equal(result.updated_source.target_month, "2026-04");
  assert.equal(result.updated_source.migrated_to_entry_id, "future-1");
  assert.equal(result.new_entry.id, "future-1");
  assert.equal(result.new_entry.is_future, true);
});
