import assert from "node:assert/strict";
import test from "node:test";

import {
  WORKBENCH_DEFAULT_WIDTH,
  WORKBENCH_MAX_WIDTH,
  WORKBENCH_MIN_WIDTH,
  buildInitialWorkbenchState,
  clampWorkbenchWidth,
  openWorkbenchEntry,
  openWorkbenchTimeline,
  returnWorkbenchTimeline,
  setWorkbenchCollapsed,
  setWorkbenchWidth,
} from "../src/features/workbench/workbenchModel.ts";

test("clamps persistent workbench width to desktop card bounds", () => {
  assert.equal(clampWorkbenchWidth(WORKBENCH_MIN_WIDTH - 80), WORKBENCH_MIN_WIDTH);
  assert.equal(clampWorkbenchWidth(WORKBENCH_MAX_WIDTH + 80), WORKBENCH_MAX_WIDTH);
  assert.equal(clampWorkbenchWidth(420), 420);
});

test("builds initial workbench state from persisted preferences", () => {
  assert.deepEqual(
    buildInitialWorkbenchState({
      collapsed: true,
      width: WORKBENCH_DEFAULT_WIDTH + 40,
    }),
    {
      mode: "timeline",
      entry: null,
      collapsed: true,
      width: WORKBENCH_DEFAULT_WIDTH + 40,
    },
  );
});

test("opens timeline and entry detail without closing the persistent panel", () => {
  const collapsed = buildInitialWorkbenchState({ collapsed: true, width: 390 });
  const timeline = openWorkbenchTimeline(collapsed);

  assert.equal(timeline.mode, "timeline");
  assert.equal(timeline.collapsed, false);
  assert.equal(timeline.entry, null);
  assert.equal(timeline.width, 390);

  const detail = openWorkbenchEntry(timeline, { id: "entry-1", content: "复习场波" });
  assert.equal(detail.mode, "detail");
  assert.equal(detail.collapsed, false);
  assert.equal(detail.entry.id, "entry-1");

  const returned = returnWorkbenchTimeline(detail);
  assert.equal(returned.mode, "timeline");
  assert.equal(returned.entry, null);
  assert.equal(returned.collapsed, false);
});

test("updates persistent collapsed and width preferences without changing mode", () => {
  const detail = openWorkbenchEntry(buildInitialWorkbenchState(), {
    id: "entry-2",
    content: "读书报告",
  });

  assert.equal(setWorkbenchCollapsed(detail, true).mode, "detail");
  assert.equal(setWorkbenchCollapsed(detail, true).collapsed, true);
  assert.equal(setWorkbenchWidth(detail, WORKBENCH_MAX_WIDTH + 10).width, WORKBENCH_MAX_WIDTH);
});
