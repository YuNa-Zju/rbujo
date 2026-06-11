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

  assert.match(workflow, /uses:\s*tauri-apps\/tauri-action@v1/);
  assert.match(workflow, /args:\s*--bundles app,dmg/);
  assert.match(workflow, /uploadUpdaterJson:\s*true/);
  assert.match(workflow, /Missing macOS updater artifacts/);
  assert.doesNotMatch(workflow, /includeUpdaterJson:/);
  assert.doesNotMatch(workflow, /continue-on-error:\s*true/);
});
