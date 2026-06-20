import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInspectorDraft,
  buildInspectorUpdatePayload,
  createInspectorStack,
  getInspectorDisplayText,
  getInspectorRouteTarget,
  mergeInspectorEntry,
  moveInspectorStack,
  pushInspectorStack,
} from "../src/features/entry/entryInspectorModel.ts";

test("resolves daily entries to a normalized jump target", () => {
  const target = getInspectorRouteTarget({
    id: "entry-1",
    target_date: "2026-06-20T08:30:00Z",
    status: "open",
  });

  assert.deepEqual(target, {
    kind: "daily",
    date: "2026-06-20",
    label: "2026-06-20",
    disabled: false,
  });
});

test("resolves future entries to the Future Log jump target", () => {
  const target = getInspectorRouteTarget({
    id: "entry-2",
    status: "future",
    is_future: true,
    target_month: "2026-07",
  });

  assert.deepEqual(target, {
    kind: "future",
    date: null,
    label: "2026-07",
    disabled: false,
  });
});

test("uses a clean markdown summary for inspector titles", () => {
  assert.equal(
    getInspectorDisplayText({
      content: "- [ ] 复习场波",
      summary: { text: "- [ ] 复习场波" },
    }),
    "复习场波",
  );

  assert.equal(
    getInspectorDisplayText({
      content: "#Tag\n\n1. **场波** report",
    }),
    "场波 report",
  );
});

test("removes stale summaries when inspector content changes", () => {
  const merged = mergeInspectorEntry(
    {
      id: "entry-3",
      content: "- [ ] old",
      entry_type: "task",
      summary: { text: "old summary" },
    },
    {
      id: "entry-3",
      content: "- [x] old",
    },
  );

  assert.equal(merged.content, "- [x] old");
  assert.equal(Object.hasOwn(merged, "summary"), false);
});

test("builds a compact update payload without moving the entry date", () => {
  const draft = buildInspectorDraft({
    id: "entry-4",
    content: "old",
    entry_type: "idea",
    status: "open",
    target_date: "2026-06-20",
    tags: ["food"],
  });

  const payload = buildInspectorUpdatePayload(draft, {
    content: "new",
    entryType: "task",
    status: "completed",
    tags: ["food", "杭州"],
  });

  assert.deepEqual(payload, {
    content: "new",
    entry_type: "task",
    status: "completed",
    tags: ["food", "杭州"],
  });
});

test("does not write migrated status through generic inspector edits", () => {
  const draft = buildInspectorDraft({
    id: "entry-5",
    content: "migrated child",
    entry_type: "task",
    status: "migrated_future",
    target_month: "2026-07",
    tags: [],
  });

  const payload = buildInspectorUpdatePayload(draft, {
    content: "updated migrated child",
  });

  assert.deepEqual(payload, {
    content: "updated migrated child",
    entry_type: "task",
    tags: [],
  });
});

test("pushes related notes into a back-forward inspector stack", () => {
  const first = { id: "a", content: "first" };
  const second = { id: "b", content: "second" };
  const third = { id: "c", content: "third" };

  const withSecond = pushInspectorStack(createInspectorStack(first), second);
  const steppedBack = moveInspectorStack(withSecond, -1);
  const branched = pushInspectorStack(steppedBack, third);

  assert.equal(withSecond.index, 1);
  assert.deepEqual(withSecond.entries.map((item) => item.id), ["a", "b"]);
  assert.equal(steppedBack.index, 0);
  assert.deepEqual(branched.entries.map((item) => item.id), ["a", "c"]);
  assert.equal(branched.index, 1);
});

test("clamps inspector stack navigation to available entries", () => {
  const stack = pushInspectorStack(
    createInspectorStack({ id: "a" }),
    { id: "b" },
  );

  assert.equal(moveInspectorStack(stack, 5).index, 1);
  assert.equal(moveInspectorStack(stack, -5).index, 0);
});
