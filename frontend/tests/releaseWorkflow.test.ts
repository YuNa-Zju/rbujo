import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("release workflow uploads updater metadata and fails on publish errors", async () => {
  const workflowPath = path.resolve(
    import.meta.dirname,
    "../../.github/workflows/release-desktop.yml",
  );
  const workflow = await readFile(workflowPath, "utf8");

  assert.match(workflow, /uses:\s*tauri-apps\/tauri-action@v0\.6\.2/);
  assert.match(workflow, /args:\s*--bundles app,dmg/);
  assert.match(workflow, /includeUpdaterJson:\s*true/);
  assert.match(workflow, /Missing macOS updater artifacts/);
  assert.doesNotMatch(workflow, /continue-on-error:\s*true/);
});

test("release workflow publishes changelog section as release body", async () => {
  const workflowPath = path.resolve(
    import.meta.dirname,
    "../../.github/workflows/release-desktop.yml",
  );
  const workflow = await readFile(workflowPath, "utf8");

  assert.match(workflow, /name:\s*Build release notes/);
  assert.match(workflow, /CHANGELOG\.md/);
  assert.match(workflow, /release_body\.md/);
  assert.match(workflow, /src-tauri\/tauri\.conf\.json/);
  assert.match(workflow, /index\(\$0,\s*heading\)\s*==\s*1/);
  assert.match(workflow, /releaseBody:\s*\$\{\{\s*steps\.release_notes\.outputs\.body\s*\}\}/);
  assert.doesNotMatch(workflow, /软件名称统一为 BuJo/);
});
