import assert from "node:assert/strict";
import test from "node:test";

import { uiEvents } from "../src/lib/uiEvents.ts";

test("replays check update menu requests to late listeners", () => {
  let calls = 0;
  const listener = () => {
    calls += 1;
  };

  uiEvents.emit("OPEN_CHECK_UPDATE" as any);
  uiEvents.on("OPEN_CHECK_UPDATE" as any, listener);

  assert.equal(calls, 1);

  uiEvents.off("OPEN_CHECK_UPDATE" as any, listener);
});
