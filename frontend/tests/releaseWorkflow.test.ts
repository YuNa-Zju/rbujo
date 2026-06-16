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

test("v0.3.1 release notes are written in Chinese", async () => {
  const changelogPath = path.resolve(import.meta.dirname, "../../CHANGELOG.md");
  const changelog = await readFile(changelogPath, "utf8");
  const section = changelog.split(/^## v0\.3\.0/m)[0];

  assert.match(section, /## v0\.3\.1/);
  assert.match(section, /附件真实存储目录/);
  assert.match(section, /Storage 面板精简/);
  assert.match(section, /Future Log 增加 Markdown 磁盘同步/);
  assert.match(section, /回到应用窗口/);
});
