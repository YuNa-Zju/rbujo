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

test("desktop attachment commands are exposed for portable uploads", async () => {
  const libPath = path.resolve(import.meta.dirname, "../../src-tauri/src/lib.rs");
  const configPath = path.resolve(
    import.meta.dirname,
    "../../src-tauri/tauri.conf.json",
  );
  const appPath = path.resolve(import.meta.dirname, "../src/App.tsx");
  const menuPath = path.resolve(
    import.meta.dirname,
    "../src/features/calendar/components/UserMenu.tsx",
  );
  const markdownViewerPath = path.resolve(
    import.meta.dirname,
    "../src/components/MarkdownViewer.tsx",
  );
  const uiEventsPath = path.resolve(import.meta.dirname, "../src/lib/uiEvents.ts");
  const translationsPath = path.resolve(
    import.meta.dirname,
    "../src/config/translations.ts",
  );
  const addEntryPath = path.resolve(
    import.meta.dirname,
    "../src/components/modals/AddEntryModal.tsx",
  );
  const entryEditorPath = path.resolve(
    import.meta.dirname,
    "../src/features/entry/EntryEditor.tsx",
  );
  const dropHookPath = path.resolve(
    import.meta.dirname,
    "../src/hooks/useTauriAttachmentDrop.ts",
  );
  const attachmentMaintenancePath = path.resolve(
    import.meta.dirname,
    "../src/components/modals/AttachmentMaintenanceController.tsx",
  );
  const toolbarPath = path.resolve(
    import.meta.dirname,
    "../src/components/shared/MarkdownToolbar.tsx",
  );
  const source = await readFile(libPath, "utf8");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const appSource = await readFile(appPath, "utf8");
  const menuSource = await readFile(menuPath, "utf8");
  const markdownViewerSource = await readFile(markdownViewerPath, "utf8");
  const uiEventsSource = await readFile(uiEventsPath, "utf8");
  const translationsSource = await readFile(translationsPath, "utf8");
  const addEntrySource = await readFile(addEntryPath, "utf8");
  const entryEditorSource = await readFile(entryEditorPath, "utf8");
  const dropHookSource = await readFile(dropHookPath, "utf8");
  const attachmentMaintenanceSource = await readFile(
    attachmentMaintenancePath,
    "utf8",
  );
  const toolbarSource = await readFile(toolbarPath, "utf8");

  assert.match(source, /list_uploads/);
  assert.match(source, /restore_upload/);
  assert.match(source, /store_upload_path/);
  assert.match(source, /open_upload/);
  assert.match(source, /export_markdown_archive/);
  assert.match(source, /attachment_maintenance_summary/);
  assert.match(source, /cleanup_unused_uploads/);
  assert.match(source, /cleanup_all_unused_uploads/);
  assert.match(uiEventsSource, /OPEN_ATTACHMENT_MAINTENANCE/);
  assert.match(appSource, /AttachmentMaintenanceController/);
  assert.match(menuSource, /OPEN_ATTACHMENT_MAINTENANCE/);
  assert.match(menuSource, /t\.attachmentMaintenance/);
  assert.match(translationsSource, /attachmentMaintenance/);
  assert.match(translationsSource, /维护附件/);
  assert.match(translationsSource, /清理未引用附件/);
  assert.match(translationsSource, /最近上传的未引用附件/);
  assert.match(translationsSource, /未保存草稿中的附件链接/);
  assert.match(translationsSource, /Attachment Maintenance/);
  assert.match(translationsSource, /Clean Unreferenced/);
  assert.match(translationsSource, /automatic maintenance keeps recent unreferenced uploads/);
  assert.match(translationsSource, /unsaved drafts may break/);
  assert.match(attachmentMaintenanceSource, /window\.confirm/);
  assert.match(markdownViewerSource, /urlTransform=\{transformMarkdownUrl\}/);
  assert.match(markdownViewerSource, /defaultUrlTransform/);
  assert.match(markdownViewerSource, /parsed\.protocol === "asset:"/);
  assert.match(markdownViewerSource, /parsed\.hostname === "asset\.localhost"/);
  assert.deepEqual(config.app.security.assetProtocol, {
    enable: true,
    scope: ["$APPDATA/uploads/**"],
  });
  assert.match(dropHookSource, /onDragDropEvent/);
  assert.match(dropHookSource, /getCurrentWebview\(\)\.onDragDropEvent/);
  assert.match(dropHookSource, /currentWindow\.onDragDropEvent/);
  assert.match(dropHookSource, /devicePixelRatio/);
  assert.match(addEntrySource, /useTauriAttachmentDrop/);
  assert.match(addEntrySource, /uploadPathsAsMarkdown/);
  assert.match(addEntrySource, /shouldHandleDomAttachmentDrop\(isTauri\(\)/);
  assert.match(entryEditorSource, /useTauriAttachmentDrop/);
  assert.match(entryEditorSource, /uploadPathsAsMarkdown/);
  assert.match(entryEditorSource, /shouldHandleDomAttachmentDrop\(isTauri\(\)/);
  assert.match(toolbarSource, /fileInputRef\.current\.value = ""/);
});
