import assert from "node:assert/strict";
import test from "node:test";

import { getUpdateCheckFailureMessage } from "../src/services/updateCheckErrors.ts";

test("explains missing updater metadata without a generic failure message", () => {
  assert.equal(
    getUpdateCheckFailureMessage(new Error("HTTP status client error (404 Not Found)")),
    "暂时没有可用更新信息",
  );
});

test("keeps a retry message for unexpected update errors", () => {
  assert.equal(
    getUpdateCheckFailureMessage(new Error("network timeout")),
    "检查更新失败，请稍后重试",
  );
});
