import assert from "node:assert/strict";
import test from "node:test";

import { getCalendarResponsiveMetrics } from "../src/features/calendar/calendarResponsiveLayout.ts";

test("calendar layout gets progressively shorter in low-height windows", () => {
  const regular = getCalendarResponsiveMetrics(900);
  const compact = getCalendarResponsiveMetrics(700);
  const tight = getCalendarResponsiveMetrics(620);

  assert.equal(regular.monthSurfaceHeight, 300);
  assert.equal(compact.monthSurfaceHeight, 260);
  assert.equal(tight.monthSurfaceHeight, 228);

  assert.ok(regular.monthCardMinHeight > compact.monthCardMinHeight);
  assert.ok(compact.monthCardMinHeight > tight.monthCardMinHeight);
  assert.ok(regular.dayCellHeight > compact.dayCellHeight);
  assert.ok(compact.dayCellHeight > tight.dayCellHeight);
});

test("calendar switches month rendering to week when vertical space is too tight", () => {
  const regular = getCalendarResponsiveMetrics(900);
  const compact = getCalendarResponsiveMetrics(700);
  const tight = getCalendarResponsiveMetrics(620);

  assert.equal(regular.forceWeekView, false);
  assert.equal(compact.forceWeekView, false);
  assert.equal(tight.forceWeekView, true);
  assert.ok(tight.weekDayCellHeight > tight.dayCellHeight);
});

test("calendar markers get denser before the month view collapses", () => {
  const regular = getCalendarResponsiveMetrics(900);
  const compact = getCalendarResponsiveMetrics(700);

  assert.equal(regular.dotDensity, "regular");
  assert.equal(compact.dotDensity, "compact");
  assert.ok(regular.dayButtonSize > compact.dayButtonSize);
});
