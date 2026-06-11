import assert from "node:assert/strict";
import test from "node:test";

import { getUpdateReleaseNotes } from "../src/services/updateReleaseNotes.ts";

test("uses update body as markdown release notes", () => {
  assert.equal(
    getUpdateReleaseNotes({ body: "## 新内容\n\n- 支持菜单检查更新" }),
    "## 新内容\n\n- 支持菜单检查更新",
  );
});

test("falls back when release notes are blank", () => {
  assert.equal(getUpdateReleaseNotes({ body: "   " }), "这次更新没有提供更新日志。");
  assert.equal(getUpdateReleaseNotes({ body: null }), "这次更新没有提供更新日志。");
});
