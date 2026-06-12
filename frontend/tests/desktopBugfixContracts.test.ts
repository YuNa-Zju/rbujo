import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("desktop app uses BuJo as its ASCII bundle brand without changing updater identity", async () => {
  const configPath = path.resolve(
    import.meta.dirname,
    "../../src-tauri/tauri.conf.json",
  );
  const indexPath = path.resolve(import.meta.dirname, "../index.html");
  const menuPath = path.resolve(import.meta.dirname, "../../src-tauri/src/lib.rs");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const indexHtml = await readFile(indexPath, "utf8");
  const menuSource = await readFile(menuPath, "utf8");

  assert.equal(config.productName, "BuJo");
  assert.match(config.productName, /^[\x20-\x7E]+$/);
  assert.equal(config.identifier, "fun.yunazju.rbujo");
  assert.equal(config.app.windows[0].title, "BuJo");
  assert.match(indexHtml, /<title>BuJo<\/title>/);
  assert.match(menuSource, /关于 BuJo/);
  assert.match(menuSource, /隐藏 BuJo/);
  assert.match(menuSource, /退出 BuJo/);
});

test("windows release binary uses gui subsystem instead of console subsystem", async () => {
  const mainPath = path.resolve(import.meta.dirname, "../../src-tauri/src/main.rs");
  const source = await readFile(mainPath, "utf8");

  assert.match(
    source,
    /cfg_attr\(all\(not\(debug_assertions\),\s*windows\),\s*windows_subsystem\s*=\s*"windows"\)/,
  );
});

test("update and version dialogs use polished aligned layouts", async () => {
  const updatePath = path.resolve(
    import.meta.dirname,
    "../src/components/modals/UpdateCheckController.tsx",
  );
  const versionPath = path.resolve(
    import.meta.dirname,
    "../src/components/modals/VersionInfoController.tsx",
  );
  const updateSource = await readFile(updatePath, "utf8");
  const versionSource = await readFile(versionPath, "utf8");

  assert.doesNotMatch(updateSource, /absolute right-4 top-4/);
  assert.match(updateSource, /justify-between/);
  assert.match(versionSource, /MarkdownViewer/);
  assert.match(versionSource, /最近一次更新/);
  assert.match(versionSource, /w-full/);
});

test("entry editing reuses the add-entry modal including future options", async () => {
  const entryItemPath = path.resolve(
    import.meta.dirname,
    "../src/features/entry/EntryItem.tsx",
  );
  const addEntryPath = path.resolve(
    import.meta.dirname,
    "../src/components/modals/AddEntryModal.tsx",
  );
  const entryItemSource = await readFile(entryItemPath, "utf8");
  const addEntrySource = await readFile(addEntryPath, "utf8");

  assert.doesNotMatch(entryItemSource, /<EntryEditor/);
  assert.match(entryItemSource, /OPEN_EDIT_ENTRY/);
  assert.doesNotMatch(addEntrySource, /!editingEntry && mode === "future"/);
  assert.match(addEntrySource, /target_month/);
  assert.match(addEntrySource, /is_future/);
});

test("release patch script is exposed from the frontend package", async () => {
  const packagePath = path.resolve(import.meta.dirname, "../package.json");
  const releasePath = path.resolve(import.meta.dirname, "../scripts/release.mjs");
  const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
  const releaseSource = await readFile(releasePath, "utf8");

  assert.equal(packageJson.scripts["release:patch"], "node scripts/release.mjs patch");
  assert.match(releaseSource, /git push origin master/);
  assert.match(releaseSource, /git push origin v\$\{nextVersion\}/);
});
