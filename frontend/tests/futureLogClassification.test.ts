import assert from "node:assert/strict";
import test from "node:test";

import {
  categorizeFutureEntries,
  isCompletedFutureStatus,
} from "../src/features/futureLog/futureLogClassification.ts";

test("future log entries are split into planning, completed, and expired", () => {
  const entries = [
    {
      id: "planning-month",
      target_month: "2026-03",
      status: "open",
      is_future: true,
    },
    {
      id: "planning-someday",
      target_month: null,
      status: "open",
      is_future: true,
    },
    {
      id: "completed-month",
      target_month: "2026-04",
      status: "completed",
      is_future: true,
    },
    {
      id: "completed-someday",
      target_month: null,
      status: "cancelled",
      is_future: true,
    },
    {
      id: "expired-last-year",
      target_month: "2025-12",
      status: "open",
      is_future: true,
    },
    {
      id: "expired-next-year",
      target_month: "2027-01",
      status: "completed",
      is_future: true,
    },
  ];

  const categorized = categorizeFutureEntries(entries, 2026);

  assert.deepEqual(
    categorized.planning.map((entry) => entry.id),
    ["planning-month", "planning-someday"],
  );
  assert.deepEqual(
    categorized.completed.map((entry) => entry.id),
    ["completed-month", "completed-someday"],
  );
  assert.deepEqual(
    categorized.expired.map((entry) => entry.id),
    ["expired-last-year", "expired-next-year"],
  );
});

test("completed future statuses include migrated and cancelled states", () => {
  assert.equal(isCompletedFutureStatus("open"), false);
  assert.equal(isCompletedFutureStatus("future"), false);
  assert.equal(isCompletedFutureStatus("completed"), true);
  assert.equal(isCompletedFutureStatus("cancelled"), true);
  assert.equal(isCompletedFutureStatus("migrated_forward"), true);
  assert.equal(isCompletedFutureStatus("migrated_future"), true);
});
