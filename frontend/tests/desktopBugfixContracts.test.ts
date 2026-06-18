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

test("desktop bundle registers bjk backup file association", async () => {
  const configPath = path.resolve(
    import.meta.dirname,
    "../../src-tauri/tauri.conf.json",
  );
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const bjkAssociation = config.bundle.fileAssociations?.find((association: any) =>
    association.ext?.includes("bjk"),
  );

  assert.ok(bjkAssociation);
  assert.equal(bjkAssociation.name, "Bullet Journal Backup");
  assert.equal(bjkAssociation.description, "BuJo backup file");
  assert.match(bjkAssociation.description, /^[\x20-\x7E]+$/);
  assert.equal(bjkAssociation.role, "Editor");
  assert.equal(bjkAssociation.mimeType, "application/vnd.yunazju.rbujo.backup");
  assert.deepEqual(bjkAssociation.exportedType, {
    identifier: "fun.yunazju.rbujo.bjk",
    conformsTo: ["public.zip-archive"],
  });
});

test("double-clicked bjk files open an import confirmation flow", async () => {
  const appPath = path.resolve(import.meta.dirname, "../src/App.tsx");
  const controllerPath = path.resolve(
    import.meta.dirname,
    "../src/components/modals/BjkImportPromptController.tsx",
  );
  const entryServicePath = path.resolve(
    import.meta.dirname,
    "../src/services/entryService.ts",
  );
  const backupServicePath = path.resolve(
    import.meta.dirname,
    "../src/services/dataBackupService.ts",
  );
  const libPath = path.resolve(import.meta.dirname, "../../src-tauri/src/lib.rs");

  const appSource = await readFile(appPath, "utf8");
  const controllerSource = await readFile(controllerPath, "utf8");
  const entryServiceSource = await readFile(entryServicePath, "utf8");
  const backupServiceSource = await readFile(backupServicePath, "utf8");
  const libSource = await readFile(libPath, "utf8");

  assert.match(appSource, /BjkImportPromptController/);
  assert.match(controllerSource, /createPortal/);
  assert.match(controllerSource, /document\.body/);
  assert.match(controllerSource, /listen(?:<[^>]+>)?\("file:open-bjk"/);
  assert.match(controllerSource, /takePendingBjkImport/);
  assert.match(controllerSource, /importPendingBjkArchive/);
  assert.doesNotMatch(controllerSource, /readBjkImportFile/);
  assert.doesNotMatch(controllerSource, /new Uint8Array\(file\.bytes\)/);
  assert.match(controllerSource, /clearPendingBjkImport/);
  assert.match(controllerSource, /const checkPendingImport = useCallback/);
  assert.match(
    controllerSource,
    /unlisten = await listen<PendingBjkImport>\("file:open-bjk"[\s\S]*await checkPendingImport\(\)/,
  );
  assert.doesNotMatch(
    controllerSource,
    /useEffect\(\(\) => \{\s*entryService\s*\.\s*takePendingBjkImport\(\)/,
  );
  assert.match(controllerSource, /statusRef/);
  assert.match(controllerSource, /statusRef\.current === "loading"/);
  assert.match(controllerSource, /entryService\.importPendingBjkArchive/);
  assert.match(controllerSource, /const importedCount = response\.inserted_count/);
  assert.doesNotMatch(controllerSource, /result\.count \+ result\.updated_count/);
  assert.match(controllerSource, /recordImportUndoIds/);
  assert.match(controllerSource, /showImportSuccessToast/);
  assert.match(entryServiceSource, /takePendingBjkImport/);
  assert.match(entryServiceSource, /readBjkImportFile/);
  assert.match(entryServiceSource, /importPendingBjkArchive/);
  assert.match(
    entryServiceSource,
    /invoke<ImportResponse>\("import_pending_bjk_archive"/,
  );
  assert.match(entryServiceSource, /clearPendingBjkImport/);
  assert.match(entryServiceSource, /importBjkArchive/);
  assert.match(entryServiceSource, /invoke<ImportResponse>\("import_bjk_archive"/);
  assert.match(backupServiceSource, /importBjkArchive/);
  assert.match(backupServiceSource, /entryService\.importBjkArchive/);
  assert.doesNotMatch(backupServiceSource, /inflateRaw/);
  assert.match(backupServiceSource, /new pako\.Inflate/);
  assert.match(libSource, /PendingBjkImport/);
  assert.match(libSource, /token: String/);
  assert.match(libSource, /active_token/);
  assert.match(libSource, /BJK_OPEN_EVENT/);
  assert.match(libSource, /take_pending_bjk_import/);
  assert.match(libSource, /clear_pending_bjk_import/);
  assert.match(libSource, /read_bjk_import_file/);
  assert.match(libSource, /import_pending_bjk_archive/);
  assert.match(libSource, /import_bjk_archive/);
  assert.match(libSource, /Url::parse/);
  assert.match(libSource, /bjk_path_from_args/);
  assert.match(libSource, /pending_bjk_import_from_url/);
  assert.match(libSource, /handle_bjk_import_request/);
  assert.match(libSource, /tauri::RunEvent::Opened/);
  assert.match(libSource, /tauri_plugin_single_instance::init\(\|app, argv/);
});

test("windows release binary uses gui subsystem instead of console subsystem", async () => {
  const mainPath = path.resolve(import.meta.dirname, "../../src-tauri/src/main.rs");
  const localPath = path.resolve(import.meta.dirname, "../../src/local.rs");
  const source = await readFile(mainPath, "utf8");
  const localSource = await readFile(localPath, "utf8");

  assert.match(
    source,
    /cfg_attr\(all\(not\(debug_assertions\),\s*windows\),\s*windows_subsystem\s*=\s*"windows"\)/,
  );
  assert.match(localSource, /std::os::windows::process::CommandExt/);
  assert.match(localSource, /CREATE_NO_WINDOW/);
  assert.match(localSource, /creation_flags\(CREATE_NO_WINDOW\)/);
  assert.match(localSource, /url\.dll,FileProtocolHandler/);
  assert.doesNotMatch(localSource, /Command::new\("cmd"\)/);
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
  assert.doesNotMatch(
    versionSource,
    /const RECENT_RELEASE_NOTES = `## 最近一次更新/,
  );
  assert.match(versionSource, /w-full/);
});

test("update install flow reports download progress in the update dialog", async () => {
  const updatePath = path.resolve(
    import.meta.dirname,
    "../src/components/modals/UpdateCheckController.tsx",
  );
  const updateServicePath = path.resolve(
    import.meta.dirname,
    "../src/services/updateService.ts",
  );
  const libPath = path.resolve(import.meta.dirname, "../../src-tauri/src/lib.rs");
  const updateSource = await readFile(updatePath, "utf8");
  const updateServiceSource = await readFile(updateServicePath, "utf8");
  const libSource = await readFile(libPath, "utf8");

  assert.match(updateServiceSource, /UpdateDownloadProgress/);
  assert.match(libSource, /UpdateDownloadProgress/);
  assert.match(libSource, /emit\(\s*"update:download-progress"/);
  assert.match(updateSource, /listen<UpdateDownloadProgress>\(\s*"update:download-progress"/);
  assert.match(updateSource, /downloadProgress/);
  assert.match(updateSource, /role="progressbar"/);
  assert.match(updateSource, /aria-valuenow/);
  assert.match(updateSource, /formatBytes/);
  assert.match(updateSource, /isIndeterminate/);
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
  assert.match(source, /const importedCount = res\.count/);
  assert.doesNotMatch(source, /res\.count \+ res\.updated_count/);
  assert.match(source, /readStoredImportUndoIds/);
  assert.match(source, /undoStoredImport/);
  assert.match(source, /setLastImportedIds\(\[\]\)/);
  assert.match(source, /pendingUndoIds/);
  assert.match(source, /setPendingUndoIds\(lastImportedIds\)/);
  assert.match(source, /const idsToUndo = pendingUndoIds\.length > 0 \? pendingUndoIds : lastImportedIds/);
  assert.doesNotMatch(source, /\[open, showConfirm, syncLastImportedIds\]/);
});

test("backup imports keep an undoable record and refresh views without full reload", async () => {
  const backupPath = path.resolve(
    import.meta.dirname,
    "../src/components/modals/BackupModal.tsx",
  );
  const bjkPromptPath = path.resolve(
    import.meta.dirname,
    "../src/components/modals/BjkImportPromptController.tsx",
  );
  const importUndoPath = path.resolve(
    import.meta.dirname,
    "../src/lib/importUndoToast.ts",
  );
  const journalDataPath = path.resolve(
    import.meta.dirname,
    "../src/hooks/useJournalData.ts",
  );
  const dailyPagePath = path.resolve(
    import.meta.dirname,
    "../src/features/daily/DailyPage.tsx",
  );
  const translationsPath = path.resolve(
    import.meta.dirname,
    "../src/config/translations.ts",
  );
  const backupSource = await readFile(backupPath, "utf8");
  const bjkPromptSource = await readFile(bjkPromptPath, "utf8");
  const importUndoSource = await readFile(importUndoPath, "utf8");
  const journalDataSource = await readFile(journalDataPath, "utf8");
  const dailyPageSource = await readFile(dailyPagePath, "utf8");
  const translationsSource = await readFile(translationsPath, "utf8");

  for (const source of [backupSource, bjkPromptSource]) {
    assert.match(source, /showImportSuccessToast/);
    assert.match(source, /recordImportUndoIds/);
    assert.doesNotMatch(source, /window\.location\.reload/);
  }

  assert.match(backupSource, /readStoredImportUndoIds/);
  assert.match(backupSource, /undoStoredImport/);
  assert.doesNotMatch(backupSource, /handleDismissUndo/);
  assert.doesNotMatch(backupSource, /<Trash2/);

  assert.match(importUndoSource, /const IMPORT_UNDO_STORAGE_KEY = "bujo_last_import_ids"/);
  assert.match(importUndoSource, /toast\.success/);
  assert.match(importUndoSource, /options\.action = \{/);
  assert.match(importUndoSource, /importedCount: number/);
  assert.match(importUndoSource, /formatCount\(labels\.importedCount, importedCount\)/);
  assert.match(importUndoSource, /dataBackupService\.undoImport/);
  assert.match(importUndoSource, /entryEventBus\.emit\("entry:delete"/);
  assert.match(importUndoSource, /entryEventBus\.emit\("entry:reload_needed"/);
  assert.match(importUndoSource, /entryEventBus\.emit\("entry:invalidate_overview_cache"/);
  assert.match(journalDataSource, /entryEventBus\.on\("entry:reload_needed", handleSilentRefresh\)/);
  assert.match(
    journalDataSource,
    /entryEventBus\.on\("entry:invalidate_overview_cache", handleInvalidateOverviewCache\)/,
  );
  assert.doesNotMatch(journalDataSource, /cacheStorage\.clearOverview/);
  assert.doesNotMatch(journalDataSource, /cacheStorage\.loadOverview/);
  assert.match(
    journalDataSource,
    /const refreshYearOverview = useCallback\(async \(\) => \{[\s\S]*entryService\.getRangeOverview/,
  );
  assert.match(
    journalDataSource,
    /const handleSilentRefresh = useCallback\(\(\) => \{[\s\S]*viewMode === "year"[\s\S]*refreshYearOverview/,
  );
  assert.match(dailyPageSource, /entryEventBus\.on\("entry:reload_needed", refreshCurrentDate\)/);
  assert.doesNotMatch(translationsSource, /即将刷新/);
  assert.doesNotMatch(translationsSource, /Refreshing\.\.\./);
});

test("archive toast offers undo and permanent delete actions", async () => {
  const archiveToastPath = path.resolve(
    import.meta.dirname,
    "../src/lib/archiveUndoToast.ts",
  );
  const entryActionsPath = path.resolve(
    import.meta.dirname,
    "../src/features/entry/useEntryActions.ts",
  );
  const cmdkEntryActionPath = path.resolve(
    import.meta.dirname,
    "../src/components/modals/cmdk/EntryActionView.tsx",
  );
  const archiveToastSource = await readFile(archiveToastPath, "utf8");
  const entryActionsSource = await readFile(entryActionsPath, "utf8");
  const cmdkEntryActionSource = await readFile(cmdkEntryActionPath, "utf8");

  assert.match(archiveToastSource, /toast\.custom/);
  assert.match(archiveToastSource, /deletePermanently/);
  assert.match(archiveToastSource, /ml-auto flex shrink-0 items-center gap-2/);
  assert.match(archiveToastSource, /border-error\/30/);
  assert.match(archiveToastSource, /bg-primary/);
  assert.match(archiveToastSource, /entryService\.delete\(archivedEntry\.id,\s*true\)/);
  assert.match(archiveToastSource, /entryEventBus\.emit\("entry:delete", archivedEntry\.id\)/);
  assert.match(archiveToastSource, /entryEventBus\.emit\("entry:create", restored\)/);
  assert.match(archiveToastSource, /entryEventBus\.emit\("entry:reload_needed"\)/);
  assert.match(entryActionsSource, /deletePermanently:\s*t\.archivePage\?\.deletePermanently/);
  assert.match(cmdkEntryActionSource, /deletePermanently:\s*t\.archivePage\?\.deletePermanently/);
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
  const localPath = path.resolve(import.meta.dirname, "../../src/local.rs");
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
  const localSource = await readFile(localPath, "utf8");
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
  assert.match(localSource, /copy_dir_recursive/);
  assert.match(localSource, /same_existing_directory\(current_path, next_path\)\.await/);
  assert.match(localSource, /tokio::fs::rename\(source, target\)\.await/);
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

test("top-right menu and command palette expose the same data and app tools", async () => {
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
  const userMenuSource = await readFile(userMenuPath, "utf8");
  const commandPaletteSource = await readFile(commandPalettePath, "utf8");
  const translationsSource = await readFile(translationsPath, "utf8");

  for (const source of [userMenuSource, commandPaletteSource]) {
    assert.match(source, /OPEN_BACKUP/);
    assert.match(source, /OPEN_ATTACHMENT_MAINTENANCE/);
    assert.match(source, /OPEN_CHECK_UPDATE/);
    assert.match(source, /OPEN_VERSION_INFO/);
    assert.match(source, /navigate\("\/archive"\)/);
  }

  assert.match(userMenuSource, /MENU_SECTION_DATA/);
  assert.match(userMenuSource, /MENU_SECTION_APP/);
  assert.match(commandPaletteSource, /t\.command\?\.data/);
  assert.match(commandPaletteSource, /t\.command\?\.app/);
  assert.match(translationsSource, /data: "数据"/);
  assert.match(translationsSource, /app: "应用"/);
  assert.match(translationsSource, /storage: "存储管理"/);
  assert.match(translationsSource, /checkUpdate: "检查更新"/);
  assert.match(translationsSource, /versionInfo: "版本信息"/);
  assert.match(translationsSource, /data: "Data"/);
  assert.match(translationsSource, /app: "App"/);
  assert.match(translationsSource, /storage: "Storage"/);
  assert.match(translationsSource, /checkUpdate: "Check for Updates"/);
  assert.match(translationsSource, /versionInfo: "Version Info"/);
});

test("command palette uses stable non-looping keyboard navigation", async () => {
  const commandPalettePath = path.resolve(
    import.meta.dirname,
    "../src/components/modals/cmdk/GlobalCommandPalette.tsx",
  );
  const cmdkComponentsPath = path.resolve(
    import.meta.dirname,
    "../src/components/modals/cmdk/CmdkComponents.tsx",
  );
  const commandPaletteSource = await readFile(commandPalettePath, "utf8");
  const cmdkComponentsSource = await readFile(cmdkComponentsPath, "utf8");

  assert.match(commandPaletteSource, /<Command[\s\S]*\bloop=\{false\}/);
  assert.match(cmdkComponentsSource, /searchString/);
  assert.match(cmdkComponentsSource, /commandValue/);
  assert.match(cmdkComponentsSource, /keywords=\{searchKeywords\}/);
  assert.doesNotMatch(cmdkComponentsSource, /value=\{searchString\}/);
});

test("desktop shell does not keep a tray background app or today widget window", async () => {
  const libPath = path.resolve(import.meta.dirname, "../../src-tauri/src/lib.rs");
  const appPath = path.resolve(import.meta.dirname, "../src/App.tsx");
  const capabilityPath = path.resolve(
    import.meta.dirname,
    "../../src-tauri/capabilities/default.json",
  );
  const commandPalettePath = path.resolve(
    import.meta.dirname,
    "../src/components/modals/cmdk/GlobalCommandPalette.tsx",
  );
  const userMenuPath = path.resolve(
    import.meta.dirname,
    "../src/features/calendar/components/UserMenu.tsx",
  );
  const settingsPath = path.resolve(
    import.meta.dirname,
    "../src/components/modals/SettingsModalController.tsx",
  );
  const libSource = await readFile(libPath, "utf8");
  const appSource = await readFile(appPath, "utf8");
  const capability = JSON.parse(await readFile(capabilityPath, "utf8"));
  const commandPaletteSource = await readFile(commandPalettePath, "utf8");
  const userMenuSource = await readFile(userMenuPath, "utf8");
  const settingsSource = await readFile(settingsPath, "utf8");

  assert.deepEqual(capability.windows, ["main"]);
  assert.doesNotMatch(libSource, /TrayIconBuilder/);
  assert.doesNotMatch(libSource, /api\.prevent_close\(\)/);
  assert.doesNotMatch(libSource, /today-widget/);
  assert.doesNotMatch(libSource, /open_today_widget|toggle_today_widget|list_today_widget_tasks/);
  assert.doesNotMatch(appSource, /TodayWidgetApp|view"\)\s*===\s*"today-widget"/);
  assert.doesNotMatch(commandPaletteSource, /todayWidget|openTodayWidget|desktopService/);
  assert.doesNotMatch(userMenuSource, /todayWidget|openTodayWidget|desktopService/);
  assert.doesNotMatch(settingsSource, /todayWidget|toggleTodayWidget|desktopService/);
});

test("native desktop menu is macOS-only while app actions stay available elsewhere", async () => {
  const libPath = path.resolve(import.meta.dirname, "../../src-tauri/src/lib.rs");
  const appPath = path.resolve(import.meta.dirname, "../src/App.tsx");
  const nativeBridgePath = path.resolve(
    import.meta.dirname,
    "../src/components/NativeMenuBridge.tsx",
  );
  const attachmentMaintenancePath = path.resolve(
    import.meta.dirname,
    "../src/components/modals/AttachmentMaintenanceController.tsx",
  );
  const versionPath = path.resolve(
    import.meta.dirname,
    "../src/components/modals/VersionInfoController.tsx",
  );
  const libSource = await readFile(libPath, "utf8");
  const appSource = await readFile(appPath, "utf8");
  const nativeBridgeSource = await readFile(nativeBridgePath, "utf8");
  const attachmentMaintenanceSource = await readFile(
    attachmentMaintenancePath,
    "utf8",
  );
  const versionSource = await readFile(versionPath, "utf8");

  assert.match(libSource, /native_menu_enabled\(\)/);
  assert.match(libSource, /cfg!\(target_os = "macos"\)/);
  assert.match(libSource, /#\[cfg\(target_os = "macos"\)\]\s*fn build_native_menu/);
  assert.match(libSource, /let builder = builder\.menu\(build_native_menu\)/);
  assert.match(libSource, /"archive" => Some\("menu:archive"\)/);
  assert.match(
    libSource,
    /"attachment_maintenance" => Some\("menu:attachment-maintenance"\)/,
  );
  assert.match(libSource, /"version_info" => Some\("menu:version-info"\)/);
  assert.match(libSource, /"数据"/);
  assert.match(libSource, /"帮助"/);
  assert.match(libSource, /"存储管理"/);
  assert.match(libSource, /"版本信息"/);
  assert.match(appSource, /NativeMenuBridge/);
  assert.match(nativeBridgeSource, /listen\("menu:archive"/);
  assert.match(nativeBridgeSource, /navigate\("\/archive"\)/);
  assert.match(
    attachmentMaintenanceSource,
    /listen\("menu:attachment-maintenance"/,
  );
  assert.match(versionSource, /listen\("menu:version-info"/);
});

test("image preview pans on wheel and reserves ctrl wheel for zoom gestures", async () => {
  const previewPath = path.resolve(
    import.meta.dirname,
    "../src/components/ImagePreview.tsx",
  );
  const source = await readFile(previewPath, "utf8");

  assert.match(
    source,
    /wheel=\{\{ step: 0\.35, smoothStep: 0\.006, wheelDisabled: true \}\}/,
  );
  assert.match(source, /pinch=\{\{ step: 8 \}\}/);
  assert.match(source, /panning=\{\{ wheelPanning: true \}\}/);
  assert.match(source, /zoomOut\(0\.75, 120\)/);
  assert.match(source, /zoomIn\(0\.75, 120\)/);
  assert.match(source, /activePointers/);
  assert.match(source, /gestureInProgress/);
  assert.match(source, /touchAction: "none"/);
  assert.match(source, /overscrollBehavior: "contain"/);
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

test("future log month dragging uses the daily-style arrange mode", async () => {
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
  assert.match(
    source,
    /const isFutureArrangeMode =\s*futureLogMode === "planning" && isMonthDragMode/,
  );
  assert.match(source, /const canDragFutureEntries = isFutureArrangeMode/);
  assert.match(source, /ArrowDownUp/);
  assert.match(source, /activeDragWidth/);
  assert.match(source, /getBoundingClientRect\(\)\.width/);
  assert.doesNotMatch(source, /FutureCompactEntryCard/);
  assert.doesNotMatch(source, /getSmartSummary/);
  assert.match(source, /dragHandleProps=\{\{ \.\.\.attributes, \.\.\.listeners \}\}/);
  assert.match(source, /forceCollapse=\{true\}/);
  assert.match(source, /readOnly=\{true\}/);
  assert.match(source, /touchAction: "pan-y"/);
  assert.match(source, /dragMode\s*\?\s*"bg-base-100 border-base-200 shadow-sm"/);
  assert.match(source, /dragMode\s*\?\s*"border-base-200 bg-base-100"/);
  assert.match(source, /btn btn-sm btn-circle border shadow-sm/);
  assert.match(source, /btn-primary text-primary-content border-primary/);
  assert.doesNotMatch(source, /bg-stone-900 text-white/);
  assert.doesNotMatch(source, /bg-white text-stone-950/);
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
