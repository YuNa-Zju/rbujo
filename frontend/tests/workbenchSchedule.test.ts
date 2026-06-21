import assert from "node:assert/strict";
import test from "node:test";

import {
  FUTURE_TARGET_CUSTOM,
  buildFutureTargetOptions,
  resolveFutureTargetMonth,
} from "../src/features/workbench/workbenchScheduleModel.ts";

test("future schedule options include undetermined and common month targets", () => {
  const options = buildFutureTargetOptions(new Date("2026-06-21T10:00:00"));

  assert.deepEqual(
    options.map((option) => option.value),
    ["undetermined", "2026-06", "2026-07", FUTURE_TARGET_CUSTOM],
  );
});

test("future schedule target resolves undetermined and custom month explicitly", () => {
  assert.equal(resolveFutureTargetMonth("undetermined", "2026-09"), null);
  assert.equal(resolveFutureTargetMonth("2026-07", "2026-09"), "2026-07");
  assert.equal(resolveFutureTargetMonth(FUTURE_TARGET_CUSTOM, "2026-09"), "2026-09");
  assert.equal(resolveFutureTargetMonth(FUTURE_TARGET_CUSTOM, ""), null);
});
