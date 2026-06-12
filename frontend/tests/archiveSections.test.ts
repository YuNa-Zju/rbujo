import assert from "node:assert/strict";
import test from "node:test";

import {
  buildArchiveSections,
  getArchiveMonthKey,
} from "../src/features/archive/archiveSections.ts";

test("archive sections put expired future log first and group rest by month", () => {
  const entries = [
    {
      id: "expired-future",
      content: "last year future",
      target_month: "2025-05",
      is_future: true,
      status: "open",
      archived_at: null,
    },
    {
      id: "manual-archive-a",
      content: "daily archived",
      target_date: "2026-06-10",
      archived_at: "2026-06-11T10:00:00Z",
      is_future: false,
    },
    {
      id: "manual-archive-b",
      content: "future archived",
      target_month: "2026-07",
      archived_at: "2026-07-01T10:00:00Z",
      is_future: true,
    },
  ];

  const sections = buildArchiveSections(entries, 2026);

  assert.deepEqual(
    sections.expiredFuture.map((entry) => entry.id),
    ["expired-future"],
  );
  assert.equal(sections.expiredFuture[0].readOnlyArchiveReason, "expired_future");
  assert.equal(sections.expiredFuture[0].canRestore, false);
  assert.deepEqual(
    sections.months.map((section) => section.month),
    ["2026-07", "2026-06"],
  );
  assert.deepEqual(
    sections.months.flatMap((section) => section.entries.map((entry) => entry.id)),
    ["manual-archive-b", "manual-archive-a"],
  );
  assert.equal(sections.months[0].entries[0].canRestore, true);
});

test("archive month key prefers target date, then target month, then archived time", () => {
  assert.equal(getArchiveMonthKey({ target_date: "2026-02-03" }), "2026-02");
  assert.equal(getArchiveMonthKey({ target_month: "2026-09" }), "2026-09");
  assert.equal(
    getArchiveMonthKey({ archived_at: "2026-08-03T10:00:00Z" }),
    "2026-08",
  );
  assert.equal(getArchiveMonthKey({}), "未归类");
});
