import assert from "node:assert/strict";
import test from "node:test";

import {
  FUTURE_DROP_SOMEDAY_ID,
  futureEntryDragId,
  futureMonthDropId,
  getFutureDropTargetMonth,
  isSameFutureDropTarget,
} from "../src/features/futureLog/futureLogDrag.ts";

test("future log drop ids resolve to someday or the selected month", () => {
  assert.equal(getFutureDropTargetMonth(FUTURE_DROP_SOMEDAY_ID, 2026), null);
  assert.equal(getFutureDropTargetMonth(futureMonthDropId(0), 2026), "2026-01");
  assert.equal(getFutureDropTargetMonth(futureMonthDropId(11), 2026), "2026-12");
  assert.equal(getFutureDropTargetMonth("future-drop-month-12", 2026), undefined);
  assert.equal(getFutureDropTargetMonth("entry-card", 2026), undefined);
  assert.equal(getFutureDropTargetMonth(null, 2026), undefined);
});

test("future log drag ids preserve entry ids and compare current targets", () => {
  assert.equal(futureEntryDragId("entry-1"), "future-entry-entry-1");
  assert.equal(isSameFutureDropTarget(null, null), true);
  assert.equal(isSameFutureDropTarget(undefined, null), true);
  assert.equal(isSameFutureDropTarget("undetermined", null), true);
  assert.equal(isSameFutureDropTarget("2026-01", "2026-01"), true);
  assert.equal(isSameFutureDropTarget("2026-01", "2026-02"), false);
  assert.equal(isSameFutureDropTarget(null, "2026-02"), false);
});
