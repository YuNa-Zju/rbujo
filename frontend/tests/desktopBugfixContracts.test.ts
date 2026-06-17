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

test("backup modal header keeps title and close button aligned", async () => {
  const backupPath = path.resolve(
    import.meta.dirname,
    "../src/components/modals/BackupModal.tsx",
  );
  const source = await readFile(backupPath, "utf8");

  assert.match(source, /flex items-start justify-between gap-4/);
  assert.match(source, /min-w-0 flex-1/);
  assert.match(source, /truncate/);
  assert.match(source, /styles\.modal\.closeBtn.*shrink-0/);
  assert.match(source, /aria-label=\{t\.common\?\.close/);
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

test("daily page can open the disk-backed markdown file in the system editor", async () => {
  const dailyPagePath = path.resolve(
    import.meta.dirname,
    "../src/features/daily/DailyPage.tsx",
  );
  const entryServicePath = path.resolve(
    import.meta.dirname,
    "../src/services/entryService.ts",
  );
  const libPath = path.resolve(import.meta.dirname, "../../src-tauri/src/lib.rs");
  const translationsPath = path.resolve(
    import.meta.dirname,
    "../src/config/translations.ts",
  );
  const dailyPageSource = await readFile(dailyPagePath, "utf8");
  const entryServiceSource = await readFile(entryServicePath, "utf8");
  const libSource = await readFile(libPath, "utf8");
  const translationsSource = await readFile(translationsPath, "utf8");

  assert.match(libSource, /open_daily_markdown/);
  assert.match(libSource, /sync_daily_markdown_file/);
  assert.match(entryServiceSource, /openDailyMarkdown/);
  assert.match(entryServiceSource, /invoke<DailyMarkdownFile>\("open_daily_markdown"/);
  assert.match(dailyPageSource, /handleOpenDailyMarkdown/);
  assert.match(dailyPageSource, /FilePenLine/);
  assert.match(dailyPageSource, /t\.daily\.openMarkdown/);
  assert.match(translationsSource, /用默认编辑器打开 Markdown/);
  assert.match(translationsSource, /Open Markdown in default editor/);
});

test("markdown workspace controls live in the unified storage panel", async () => {
  const libPath = path.resolve(import.meta.dirname, "../../src-tauri/src/lib.rs");
  const capabilityPath = path.resolve(
    import.meta.dirname,
    "../../src-tauri/capabilities/default.json",
  );
  const appPath = path.resolve(import.meta.dirname, "../src/App.tsx");
  const entryServicePath = path.resolve(
    import.meta.dirname,
    "../src/services/entryService.ts",
  );
  const menuPath = path.resolve(
    import.meta.dirname,
    "../src/features/calendar/components/UserMenu.tsx",
  );
  const uiEventsPath = path.resolve(import.meta.dirname, "../src/lib/uiEvents.ts");
  const translationsPath = path.resolve(
    import.meta.dirname,
    "../src/config/translations.ts",
  );
  const storagePath = path.resolve(
    import.meta.dirname,
    "../src/components/modals/AttachmentMaintenanceController.tsx",
  );
  const libSource = await readFile(libPath, "utf8");
  const capability = JSON.parse(await readFile(capabilityPath, "utf8"));
  const appSource = await readFile(appPath, "utf8");
  const entryServiceSource = await readFile(entryServicePath, "utf8");
  const menuSource = await readFile(menuPath, "utf8");
  const uiEventsSource = await readFile(uiEventsPath, "utf8");
  const translationsSource = await readFile(translationsPath, "utf8");
  const storageSource = await readFile(storagePath, "utf8");

  assert.match(libSource, /get_markdown_workspace/);
  assert.match(libSource, /choose_markdown_workspace/);
  assert.match(libSource, /blocking_pick_folder/);
  assert.ok(capability.permissions.includes("dialog:allow-open"));
  assert.match(entryServiceSource, /getMarkdownWorkspace/);
  assert.match(entryServiceSource, /chooseMarkdownWorkspace/);
  assert.doesNotMatch(uiEventsSource, /OPEN_MARKDOWN_SETTINGS/);
  assert.doesNotMatch(menuSource, /OPEN_MARKDOWN_SETTINGS/);
  assert.doesNotMatch(appSource, /MarkdownSettingsController/);
  assert.match(storageSource, /chooseMarkdownWorkspace/);
  assert.match(storageSource, /getMarkdownWorkspace/);
  assert.match(storageSource, /openMarkdownWorkspace/);
  assert.match(storageSource, /createPortal/);
  assert.match(storageSource, /DailyRootPathCard/);
  assert.match(storageSource, /labels\.changePath/);
  assert.match(storageSource, /labels\.openFolder/);
  assert.doesNotMatch(storageSource, /labels\.done/);
  assert.doesNotMatch(storageSource, /<Check/);
  assert.match(storageSource, /labels\.dailyFolder/);
  assert.match(translationsSource, /存储管理/);
  assert.match(translationsSource, /更改路径/);
  assert.match(translationsSource, /打开文件夹/);
  assert.match(translationsSource, /Markdown 存放文件夹/);
  assert.match(translationsSource, /Storage/);
  assert.match(translationsSource, /Change Path/);
});

test("storage panel focuses attachments and navigates attachment references", async () => {
  const storagePath = path.resolve(
    import.meta.dirname,
    "../src/components/modals/AttachmentMaintenanceController.tsx",
  );
  const source = await readFile(storagePath, "utf8");

  assert.doesNotMatch(source, /dailyMarkdownPathForDate/);
  assert.doesNotMatch(source, /labels\.dailyMarkdown/);
  assert.doesNotMatch(source, /PathRow/);
  assert.match(source, /upload\.relative_path/);
  assert.match(source, /attachments\//);
  assert.match(source, /useNavigate/);
  assert.match(source, /openableDailyReferenceDate/);
  assert.match(source, /reference\.target_date/);
  assert.match(source, /reference\.archived_at/);
  assert.match(source, /navigate\(`\/daily\/\$\{targetDate\}`/);
  assert.match(source, /reference\.entry_id/);
  assert.match(source, /labels\.openReference/);
});

test("calendar subscription sync feature is removed from global UI", async () => {
  const uiEventsPath = path.resolve(import.meta.dirname, "../src/lib/uiEvents.ts");
  const modalControllerPath = path.resolve(
    import.meta.dirname,
    "../src/context/ModalControllerContext.tsx",
  );
  const globalModalsPath = path.resolve(
    import.meta.dirname,
    "../src/components/modals/GlobalUIModals.tsx",
  );
  const userMenuPath = path.resolve(
    import.meta.dirname,
    "../src/features/calendar/components/UserMenu.tsx",
  );
  const commandPalettePath = path.resolve(
    import.meta.dirname,
    "../src/components/modals/cmdk/GlobalCommandPalette.tsx",
  );
  const translationsPath = path.resolve(
    import.meta.dirname,
    "../src/config/translations.ts",
  );

  const uiEventsSource = await readFile(uiEventsPath, "utf8");
  const modalControllerSource = await readFile(modalControllerPath, "utf8");
  const globalModalsSource = await readFile(globalModalsPath, "utf8");
  const userMenuSource = await readFile(userMenuPath, "utf8");
  const commandPaletteSource = await readFile(commandPalettePath, "utf8");
  const translationsSource = await readFile(translationsPath, "utf8");

  assert.doesNotMatch(uiEventsSource, /OPEN_CALENDAR_SYNC/);
  assert.doesNotMatch(modalControllerSource, /calendarSync/i);
  assert.doesNotMatch(globalModalsSource, /CalendarSyncModal/);
  assert.doesNotMatch(userMenuSource, /Calendar Sync|日历订阅同步|t\.ics/);
  assert.doesNotMatch(commandPaletteSource, /OPEN_CALENDAR_SYNC|calendarSync/);
  assert.doesNotMatch(translationsSource, /\bics:/);
  assert.doesNotMatch(translationsSource, /calendarSync/);
});

test("future log modal supports dragging entries between month drawers", async () => {
  const futureLogPath = path.resolve(
    import.meta.dirname,
    "../src/components/modals/FutureLogModal.tsx",
  );
  const source = await readFile(futureLogPath, "utf8");

  assert.match(source, /DndContext/);
  assert.match(source, /useDraggable/);
  assert.match(source, /useDroppable/);
  assert.match(source, /getFutureDropTargetMonth/);
  assert.match(source, /entryService\.moveFutureEntry/);
  assert.match(source, /entryEventBus\.emit\("entry:update"/);
  assert.match(source, /futureMonthDropId/);
  assert.match(source, /FUTURE_DROP_SOMEDAY_ID/);
});

test("future log month dragging uses an explicit compact arrange mode", async () => {
  const futureLogPath = path.resolve(
    import.meta.dirname,
    "../src/components/modals/FutureLogModal.tsx",
  );
  const translationsPath = path.resolve(
    import.meta.dirname,
    "../src/config/translations.ts",
  );
  const source = await readFile(futureLogPath, "utf8");
  const translationsSource = await readFile(translationsPath, "utf8");

  assert.match(source, /isMonthDragMode/);
  assert.match(source, /setIsMonthDragMode/);
  assert.match(source, /ArrowDownUp/);
  assert.match(source, /activeDragWidth/);
  assert.match(source, /getBoundingClientRect\(\)\.width/);
  assert.match(source, /FutureCompactEntryCard/);
  assert.match(source, /getSmartSummary/);
  assert.match(source, /dragMode/);
  assert.match(source, /t\.futureLog\.arrangeMonths/);
  assert.match(source, /t\.futureLog\.finishArrange/);
  assert.match(translationsSource, /调整月份/);
  assert.match(translationsSource, /Finish Arrange/);
});

test("future log refreshes disk-backed markdown when app regains focus", async () => {
  const futureLogPath = path.resolve(
    import.meta.dirname,
    "../src/components/modals/FutureLogModal.tsx",
  );
  const source = await readFile(futureLogPath, "utf8");

  assert.match(source, /entryService\.getFutureLog/);
  assert.match(source, /document\.visibilityState === "visible"/);
  assert.match(source, /window\.addEventListener\("focus", fetchFutureLog\)/);
  assert.match(source, /document\.addEventListener\("visibilitychange", refreshWhenVisible\)/);
  assert.match(source, /window\.removeEventListener\("focus", fetchFutureLog\)/);
});

test("home daily header exposes open markdown next to the enter-day arrow", async () => {
  const calendarPath = path.resolve(
    import.meta.dirname,
    "../src/features/calendar/CalendarPage.tsx",
  );
  const source = await readFile(calendarPath, "utf8");

  assert.match(source, /handleOpenSelectedMarkdown/);
  assert.match(source, /entryService\.openDailyMarkdown/);
  assert.match(source, /FilePenLine/);
  assert.match(source, /t\.daily\.openMarkdown/);
  assert.match(source, /openSelectedMarkdown/);
});

test("release patch script is exposed from the frontend package", async () => {
  const packagePath = path.resolve(import.meta.dirname, "../package.json");
  const releasePath = path.resolve(import.meta.dirname, "../scripts/release.mjs");
  const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
  const releaseSource = await readFile(releasePath, "utf8");

  assert.equal(packageJson.scripts["release:patch"], "node scripts/release.mjs patch");
  assert.equal(packageJson.scripts["release:minor"], "node scripts/release.mjs minor");
  assert.match(releaseSource, /git push origin master/);
  assert.match(releaseSource, /git push origin v\$\{nextVersion\}/);
});

test("markdown archive export uses native save dialog with downloads default", async () => {
  const libPath = path.resolve(import.meta.dirname, "../../src-tauri/src/lib.rs");
  const cargoPath = path.resolve(import.meta.dirname, "../../src-tauri/Cargo.toml");
  const capabilityPath = path.resolve(
    import.meta.dirname,
    "../../src-tauri/capabilities/default.json",
  );
  const entryServicePath = path.resolve(
    import.meta.dirname,
    "../src/services/entryService.ts",
  );
  const backupPath = path.resolve(
    import.meta.dirname,
    "../src/components/modals/BackupModal.tsx",
  );
  const libSource = await readFile(libPath, "utf8");
  const cargoSource = await readFile(cargoPath, "utf8");
  const capability = JSON.parse(await readFile(capabilityPath, "utf8"));
  const entryServiceSource = await readFile(entryServicePath, "utf8");
  const backupSource = await readFile(backupPath, "utf8");

  assert.match(cargoSource, /tauri-plugin-dialog/);
  assert.match(libSource, /DialogExt/);
  assert.match(libSource, /export_markdown_archive_to_file/);
  assert.match(libSource, /blocking_save_file/);
  assert.match(libSource, /download_dir/);
  assert.ok(capability.permissions.includes("dialog:allow-save"));
  assert.match(entryServiceSource, /export_markdown_archive_to_file/);
  assert.doesNotMatch(entryServiceSource, /new Blob\(\[new Uint8Array\(bytes\)\]/);
  assert.match(backupSource, /const exported = await entryService\.downloadBackup/);
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
  const entryServicePath = path.resolve(
    import.meta.dirname,
    "../src/services/entryService.ts",
  );
  const attachmentServicePath = path.resolve(
    import.meta.dirname,
    "../src/services/attachmentService.ts",
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
  const entryServiceSource = await readFile(entryServicePath, "utf8");
  const attachmentServiceSource = await readFile(attachmentServicePath, "utf8");
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
  assert.match(source, /resolve_uploads/);
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
  assert.match(translationsSource, /存储管理/);
  assert.match(translationsSource, /展开引用/);
  assert.match(translationsSource, /引用此附件的日记/);
  assert.match(translationsSource, /归档/);
  assert.match(translationsSource, /Storage/);
  assert.doesNotMatch(translationsSource, /Attachment Maintenance/);
  assert.match(translationsSource, /Show References/);
  assert.match(translationsSource, /Notes referencing this file/);
  assert.match(attachmentMaintenanceSource, /expandedUploads/);
  assert.match(attachmentMaintenanceSource, /referencesHeader/);
  assert.match(attachmentMaintenanceSource, /archived_reference_count/);
  assert.doesNotMatch(attachmentMaintenanceSource, /cleanupHint/);
  assert.doesNotMatch(attachmentMaintenanceSource, /RefreshCw/);
  assert.doesNotMatch(attachmentMaintenanceSource, /labels\.refresh/);
  assert.doesNotMatch(attachmentMaintenanceSource, /cleanupAllUnusedUploads/);
  assert.doesNotMatch(attachmentMaintenanceSource, /window\.confirm/);
  assert.match(markdownViewerSource, /urlTransform=\{transformMarkdownUrl\}/);
  assert.match(markdownViewerSource, /defaultUrlTransform/);
  assert.match(markdownViewerSource, /parsed\.protocol === "asset:"/);
  assert.match(markdownViewerSource, /parsed\.hostname === "asset\.localhost"/);
  assert.match(markdownViewerSource, /collectUploadRelativePaths/);
  assert.match(markdownViewerSource, /resolveUploads/);
  assert.match(markdownViewerSource, /preview_url/);
  assert.match(markdownViewerSource, /resolveImageSrc/);
  assert.match(markdownViewerSource, /renderedContent/);
  assert.match(entryServiceSource, /resolve_uploads/);
  assert.match(attachmentServiceSource, /attachmentMarkdownUrlFromStoredUpload/);
  assert.match(attachmentServiceSource, /url: attachmentMarkdownUrlFromStoredUpload\(stored\)/);
  assert.doesNotMatch(attachmentServiceSource, /url: stored\.url/);
  assert.deepEqual(config.app.security.assetProtocol, {
    enable: true,
    scope: ["$APPDATA/attachments/**", "$APPDATA/uploads/**"],
  });
  assert.match(dropHookSource, /onDragDropEvent/);
  assert.match(dropHookSource, /getCurrentWebview\(\)\.onDragDropEvent/);
  assert.match(dropHookSource, /currentWindow\.onDragDropEvent/);
  assert.match(dropHookSource, /devicePixelRatio/);
  assert.match(addEntrySource, /useTauriAttachmentDrop/);
  assert.match(addEntrySource, /uploadPathsAsMarkdown/);
  assert.match(addEntrySource, /cleanupAllUnusedUploads/);
  assert.match(addEntrySource, /shouldHandleDomAttachmentDrop\(isTauri\(\)/);
  assert.match(entryEditorSource, /useTauriAttachmentDrop/);
  assert.match(entryEditorSource, /uploadPathsAsMarkdown/);
  assert.match(entryEditorSource, /shouldHandleDomAttachmentDrop\(isTauri\(\)/);
  assert.match(toolbarSource, /fileInputRef\.current\.value = ""/);
});
