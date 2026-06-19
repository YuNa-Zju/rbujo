use std::path::{Path, PathBuf};
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicU64, Ordering},
};

use rbullet_journal::local::{
    AttachmentCleanupResult, AttachmentMaintenanceSummary, CreateEntryInput, DailyMarkdownFile,
    EntryPatch, FutureLogResponse, LocalBackend, MarkdownWorkspace, MigrationResult,
    ResolvedUpload, SearchOptions, SearchResult, StoredUpload, UploadBackup, UploadInput,
};
use rbullet_journal::models::{
    DayOverviewDto, EntryExportSchema, EntryResponse, ImportResponseDto, ReopenResponse,
};
use serde::Serialize;
use tauri::{
    AppHandle, Emitter, Manager, State,
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_updater::{Update, UpdaterExt};
use tokio::io::AsyncReadExt;
use url::Url;
use uuid::Uuid;

#[derive(Clone)]
struct DesktopState {
    backend: Arc<LocalBackend>,
}

struct PendingUpdate(Mutex<Option<Update>>);

const BJK_OPEN_EVENT: &str = "file:open-bjk";
const MAIN_WINDOW_LABEL: &str = "main";
const MAX_BJK_IMPORT_BYTES: u64 = 256 * 1024 * 1024;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PendingBjkImport {
    path: String,
    filename: String,
    token: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BjkImportFile {
    path: String,
    filename: String,
    bytes: Vec<u8>,
}

#[derive(Default)]
struct PendingBjkImportSlot {
    pending: Option<PendingBjkImport>,
    active_token: Option<String>,
}

struct PendingBjkImportState(Mutex<PendingBjkImportSlot>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateMetadata {
    version: String,
    current_version: String,
    body: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateDownloadProgress {
    downloaded: u64,
    total: Option<u64>,
    finished: bool,
}

#[tauri::command]
async fn check_for_update(
    app: AppHandle,
    pending_update: State<'_, PendingUpdate>,
) -> Result<Option<UpdateMetadata>, String> {
    let update = app
        .updater()
        .map_err(to_error)?
        .check()
        .await
        .map_err(to_error)?;
    let metadata = update.as_ref().map(|update| UpdateMetadata {
        version: update.version.clone(),
        current_version: update.current_version.clone(),
        body: update.body.clone(),
    });

    *pending_update
        .0
        .lock()
        .map_err(|_| "update state lock poisoned".to_string())? = update;

    Ok(metadata)
}

#[tauri::command]
async fn install_update(
    app: AppHandle,
    pending_update: State<'_, PendingUpdate>,
) -> Result<(), String> {
    let update = pending_update
        .0
        .lock()
        .map_err(|_| "update state lock poisoned".to_string())?
        .take()
        .ok_or_else(|| "there is no pending update".to_string())?;

    let downloaded = Arc::new(AtomicU64::new(0));
    let progress_app = app.clone();
    let progress_downloaded = downloaded.clone();
    let finish_app = app.clone();
    let finish_downloaded = downloaded.clone();

    update
        .download_and_install(
            move |chunk_length, content_length| {
                let downloaded = progress_downloaded
                    .fetch_add(chunk_length as u64, Ordering::Relaxed)
                    .saturating_add(chunk_length as u64);
                let _ = progress_app.emit(
                    "update:download-progress",
                    UpdateDownloadProgress {
                        downloaded,
                        total: content_length,
                        finished: false,
                    },
                );
            },
            move || {
                let _ = finish_app.emit(
                    "update:download-progress",
                    UpdateDownloadProgress {
                        downloaded: finish_downloaded.load(Ordering::Relaxed),
                        total: None,
                        finished: true,
                    },
                );
            },
        )
        .await
        .map_err(to_error)?;
    app.restart();
}

#[tauri::command]
async fn take_pending_bjk_import(
    pending_import: State<'_, PendingBjkImportState>,
) -> Result<Option<PendingBjkImport>, String> {
    Ok(pending_import
        .0
        .lock()
        .map_err(|_| "pending import state lock poisoned".to_string())?
        .pending
        .clone())
}

#[tauri::command]
async fn clear_pending_bjk_import(
    pending_import: State<'_, PendingBjkImportState>,
    token: String,
) -> Result<(), String> {
    let mut guard = pending_import
        .0
        .lock()
        .map_err(|_| "pending import state lock poisoned".to_string())?;
    let matches_pending = guard
        .pending
        .as_ref()
        .map(|pending| pending.token.as_str())
        .is_some_and(|pending_token| pending_token == token);
    let matches_active = guard.active_token.as_deref() == Some(token.as_str());

    if matches_pending {
        guard.pending = None;
    }
    if matches_active {
        guard.active_token = None;
    }
    Ok(())
}

#[tauri::command]
async fn read_bjk_import_file(
    pending_import: State<'_, PendingBjkImportState>,
    path: String,
    token: String,
) -> Result<BjkImportFile, String> {
    let pending = activate_pending_bjk_import(&pending_import, &path, &token)?;
    let path_buf = PathBuf::from(&pending.path);
    let bytes = read_bjk_import_bytes(&path_buf).await?;

    Ok(BjkImportFile {
        path: pending.path,
        filename: filename_for_path(&path_buf),
        bytes,
    })
}

#[tauri::command]
async fn import_pending_bjk_archive(
    state: State<'_, DesktopState>,
    pending_import: State<'_, PendingBjkImportState>,
    path: String,
    token: String,
) -> Result<ImportResponseDto, String> {
    let pending = activate_pending_bjk_import(&pending_import, &path, &token)?;
    let bytes = read_bjk_import_bytes(Path::new(&pending.path)).await?;
    state
        .backend
        .import_bjk_archive_bytes(bytes)
        .await
        .map_err(to_error)
}

fn activate_pending_bjk_import(
    pending_import: &PendingBjkImportState,
    path: &str,
    token: &str,
) -> Result<PendingBjkImport, String> {
    let mut guard = pending_import
        .0
        .lock()
        .map_err(|_| "pending import state lock poisoned".to_string())?;
    let pending = guard
        .pending
        .as_ref()
        .ok_or_else(|| "there is no pending backup import".to_string())?;
    if pending.token != token || pending.path != path {
        return Err("backup import request is no longer valid".to_string());
    }
    let pending = pending.clone();
    guard.active_token = Some(token.to_string());
    Ok(pending)
}

async fn read_bjk_import_bytes(path: &Path) -> Result<Vec<u8>, String> {
    if !is_bjk_path(path) {
        return Err("Only .bjk backup files can be imported this way".to_string());
    }

    let file = tokio::fs::File::open(path).await.map_err(to_error)?;
    let metadata = file.metadata().await.map_err(to_error)?;
    if !metadata.is_file() {
        return Err("Selected backup path is not a file".to_string());
    }
    if metadata.len() > MAX_BJK_IMPORT_BYTES {
        return Err("Selected backup file is too large to import".to_string());
    }

    let mut bytes =
        Vec::with_capacity(usize::try_from(metadata.len().min(MAX_BJK_IMPORT_BYTES)).unwrap_or(0));
    let mut limited_file = file.take(MAX_BJK_IMPORT_BYTES + 1);
    limited_file
        .read_to_end(&mut bytes)
        .await
        .map_err(to_error)?;
    if bytes.len() as u64 > MAX_BJK_IMPORT_BYTES {
        return Err("Selected backup file is too large to import".to_string());
    }
    Ok(bytes)
}

#[tauri::command]
async fn create_entry(
    state: State<'_, DesktopState>,
    input: CreateEntryInput,
) -> Result<EntryResponse, String> {
    state.backend.create_entry(input).await.map_err(to_error)
}

#[tauri::command]
async fn update_entry(
    state: State<'_, DesktopState>,
    id: String,
    patch: EntryPatch,
) -> Result<EntryResponse, String> {
    state
        .backend
        .update_entry(id, patch)
        .await
        .map_err(to_error)
}

#[tauri::command]
async fn archive_entry(
    state: State<'_, DesktopState>,
    id: String,
) -> Result<EntryResponse, String> {
    state.backend.archive_entry(id).await.map_err(to_error)
}

#[tauri::command]
async fn unarchive_entry(
    state: State<'_, DesktopState>,
    id: String,
) -> Result<EntryResponse, String> {
    state.backend.unarchive_entry(id).await.map_err(to_error)
}

#[tauri::command]
async fn delete_entry(state: State<'_, DesktopState>, id: String) -> Result<(), String> {
    state.backend.delete_entry(id).await.map_err(to_error)
}

#[tauri::command]
async fn reopen_entry(
    state: State<'_, DesktopState>,
    id: String,
) -> Result<ReopenResponse, String> {
    state.backend.reopen_entry(id).await.map_err(to_error)
}

#[tauri::command]
async fn move_future_entry(
    state: State<'_, DesktopState>,
    id: String,
    target_month: Option<String>,
) -> Result<EntryResponse, String> {
    state
        .backend
        .move_future_entry(id, target_month)
        .await
        .map_err(to_error)
}

#[tauri::command]
async fn get_daily_log(
    state: State<'_, DesktopState>,
    date: String,
    include_archived: bool,
) -> Result<Vec<EntryResponse>, String> {
    state
        .backend
        .get_daily_log(date, include_archived)
        .await
        .map_err(to_error)
}

#[tauri::command]
async fn get_future_log(
    state: State<'_, DesktopState>,
    include_archived: bool,
) -> Result<FutureLogResponse, String> {
    state
        .backend
        .get_future_log(include_archived)
        .await
        .map_err(to_error)
}

#[tauri::command]
async fn get_month_overview(
    state: State<'_, DesktopState>,
    month: String,
    include_archived: bool,
) -> Result<std::collections::HashMap<String, Vec<DayOverviewDto>>, String> {
    state
        .backend
        .get_month_overview(month, include_archived)
        .await
        .map_err(to_error)
}

#[tauri::command]
async fn get_range_overview(
    state: State<'_, DesktopState>,
    start_date: String,
    end_date: String,
    include_archived: bool,
) -> Result<std::collections::HashMap<String, Vec<DayOverviewDto>>, String> {
    state
        .backend
        .get_range_overview(start_date, end_date, include_archived)
        .await
        .map_err(to_error)
}

#[tauri::command]
async fn reorder_entries(
    state: State<'_, DesktopState>,
    entry_ids: Vec<String>,
) -> Result<(), String> {
    state
        .backend
        .reorder_entries(entry_ids)
        .await
        .map_err(to_error)
}

#[tauri::command]
async fn migrate_entry_to_date(
    state: State<'_, DesktopState>,
    id: String,
    target_date: String,
) -> Result<MigrationResult, String> {
    state
        .backend
        .migrate_entry_to_date(id, target_date)
        .await
        .map_err(to_error)
}

#[tauri::command]
async fn migrate_entry_to_future(
    state: State<'_, DesktopState>,
    id: String,
    target_month: Option<String>,
) -> Result<MigrationResult, String> {
    state
        .backend
        .migrate_entry_to_future(id, target_month)
        .await
        .map_err(to_error)
}

#[tauri::command]
async fn get_migration_chain(
    state: State<'_, DesktopState>,
    entry_id: String,
) -> Result<Vec<EntryResponse>, String> {
    state
        .backend
        .get_migration_chain(entry_id)
        .await
        .map_err(to_error)
}

#[tauri::command]
async fn search_entries(
    state: State<'_, DesktopState>,
    options: SearchOptions,
) -> Result<Vec<SearchResult>, String> {
    state
        .backend
        .search_entries(options)
        .await
        .map_err(to_error)
}

#[tauri::command]
async fn list_tags(state: State<'_, DesktopState>) -> Result<Vec<String>, String> {
    state.backend.list_tags().await.map_err(to_error)
}

#[tauri::command]
async fn rename_tag(
    state: State<'_, DesktopState>,
    old_name: String,
    new_name: String,
) -> Result<usize, String> {
    state
        .backend
        .rename_tag(old_name, new_name)
        .await
        .map_err(to_error)
}

#[tauri::command]
async fn store_upload(
    state: State<'_, DesktopState>,
    filename: String,
    bytes: Vec<u8>,
) -> Result<StoredUpload, String> {
    state
        .backend
        .store_upload(UploadInput { filename, bytes })
        .await
        .map_err(to_error)
}

#[tauri::command]
async fn store_upload_path(
    state: State<'_, DesktopState>,
    path: String,
) -> Result<StoredUpload, String> {
    state
        .backend
        .store_upload_path(PathBuf::from(path))
        .await
        .map_err(to_error)
}

#[tauri::command]
async fn list_uploads(state: State<'_, DesktopState>) -> Result<Vec<UploadBackup>, String> {
    state
        .backend
        .list_uploads_for_backup()
        .await
        .map_err(to_error)
}

#[tauri::command]
async fn restore_upload(
    state: State<'_, DesktopState>,
    filename: String,
    bytes: Vec<u8>,
) -> Result<StoredUpload, String> {
    state
        .backend
        .store_upload(UploadInput { filename, bytes })
        .await
        .map_err(to_error)
}

#[tauri::command]
async fn open_upload(state: State<'_, DesktopState>, relative_path: String) -> Result<(), String> {
    state
        .backend
        .open_upload(relative_path)
        .await
        .map_err(to_error)
}

#[tauri::command]
async fn resolve_uploads(
    state: State<'_, DesktopState>,
    relative_paths: Vec<String>,
) -> Result<Vec<ResolvedUpload>, String> {
    state
        .backend
        .resolve_uploads(relative_paths)
        .await
        .map_err(to_error)
}

#[tauri::command]
async fn sync_daily_markdown_file(
    state: State<'_, DesktopState>,
    date: String,
) -> Result<DailyMarkdownFile, String> {
    state
        .backend
        .sync_daily_markdown_file(date)
        .await
        .map_err(to_error)
}

#[tauri::command]
async fn open_daily_markdown(
    state: State<'_, DesktopState>,
    date: String,
) -> Result<DailyMarkdownFile, String> {
    state
        .backend
        .open_daily_markdown(date)
        .await
        .map_err(to_error)
}

#[tauri::command]
async fn sync_future_markdown_files(
    state: State<'_, DesktopState>,
) -> Result<Vec<DailyMarkdownFile>, String> {
    state
        .backend
        .sync_future_markdown_files()
        .await
        .map_err(to_error)
}

#[tauri::command]
async fn get_markdown_workspace(
    state: State<'_, DesktopState>,
) -> Result<MarkdownWorkspace, String> {
    state
        .backend
        .get_markdown_workspace()
        .await
        .map_err(to_error)
}

#[tauri::command]
async fn open_markdown_workspace(
    state: State<'_, DesktopState>,
) -> Result<MarkdownWorkspace, String> {
    state
        .backend
        .open_markdown_workspace()
        .await
        .map_err(to_error)
}

#[tauri::command]
async fn choose_markdown_workspace(
    app: AppHandle,
    state: State<'_, DesktopState>,
) -> Result<Option<MarkdownWorkspace>, String> {
    let current = state
        .backend
        .get_markdown_workspace()
        .await
        .map_err(to_error)?;
    let mut dialog = app.dialog().file();
    let current_path = PathBuf::from(current.absolute_path);
    if current_path.is_dir() {
        dialog = dialog.set_directory(current_path);
    }
    let Some(folder_path) = dialog.blocking_pick_folder() else {
        return Ok(None);
    };
    let path = folder_path
        .into_path()
        .map_err(|_| "Selected markdown workspace is not a local folder".to_string())?;
    let bookmark =
        rbullet_journal::macos_security_scope::create_bookmark(&path).map_err(to_error)?;
    state
        .backend
        .set_markdown_workspace_authorization(path, bookmark)
        .await
        .map(Some)
        .map_err(to_error)
}

#[tauri::command]
async fn attachment_maintenance_summary(
    state: State<'_, DesktopState>,
) -> Result<AttachmentMaintenanceSummary, String> {
    state
        .backend
        .attachment_maintenance_summary()
        .await
        .map_err(to_error)
}

#[tauri::command]
async fn cleanup_unused_uploads(
    state: State<'_, DesktopState>,
) -> Result<AttachmentCleanupResult, String> {
    state
        .backend
        .cleanup_unused_uploads()
        .await
        .map_err(to_error)
}

#[tauri::command]
async fn cleanup_all_unused_uploads(
    state: State<'_, DesktopState>,
) -> Result<AttachmentCleanupResult, String> {
    state
        .backend
        .cleanup_all_unused_uploads()
        .await
        .map_err(to_error)
}

#[tauri::command]
async fn export_markdown_archive(state: State<'_, DesktopState>) -> Result<Vec<u8>, String> {
    state
        .backend
        .export_markdown_archive()
        .await
        .map_err(to_error)
}

#[tauri::command]
async fn export_markdown_archive_to_file(
    app: AppHandle,
    state: State<'_, DesktopState>,
    suggested_filename: String,
) -> Result<Option<String>, String> {
    let bytes = state
        .backend
        .export_markdown_archive()
        .await
        .map_err(to_error)?;
    let suggested_filename = safe_export_archive_filename(&suggested_filename);
    let mut dialog = app
        .dialog()
        .file()
        .set_file_name(&suggested_filename)
        .add_filter("ZIP Archive", &["zip"]);
    if let Ok(download_dir) = app.path().download_dir() {
        dialog = dialog.set_directory(download_dir);
    }
    let Some(file_path) = dialog.blocking_save_file() else {
        return Ok(None);
    };
    let path = file_path
        .into_path()
        .map_err(|_| "Selected export path is not a local file".to_string())?;
    tokio::fs::write(&path, bytes).await.map_err(to_error)?;
    Ok(Some(path.to_string_lossy().to_string()))
}

#[tauri::command]
async fn export_bjk_archive_to_file(
    app: AppHandle,
    bytes: Vec<u8>,
    suggested_filename: String,
) -> Result<Option<String>, String> {
    if bytes.len() as u64 > MAX_BJK_IMPORT_BYTES {
        return Err("BJK archive is too large".to_string());
    }
    if !bytes.starts_with(b"PK\x03\x04") {
        return Err("Invalid BJK archive".to_string());
    }
    let suggested_filename = safe_export_filename(&suggested_filename, "bujo_backup.bjk", "bjk");
    let mut dialog = app
        .dialog()
        .file()
        .set_file_name(&suggested_filename)
        .add_filter("BuJo Backup", &["bjk"]);
    if let Ok(download_dir) = app.path().download_dir() {
        dialog = dialog.set_directory(download_dir);
    }
    let Some(file_path) = dialog.blocking_save_file() else {
        return Ok(None);
    };
    let path = file_path
        .into_path()
        .map_err(|_| "Selected export path is not a local file".to_string())?;
    tokio::fs::write(&path, bytes).await.map_err(to_error)?;
    Ok(Some(path.to_string_lossy().to_string()))
}

#[tauri::command]
async fn get_all_entries_for_backup(
    state: State<'_, DesktopState>,
) -> Result<Vec<EntryExportSchema>, String> {
    state
        .backend
        .get_all_entries_for_backup()
        .await
        .map_err(to_error)
}

#[tauri::command]
async fn import_entries(
    state: State<'_, DesktopState>,
    entries: Vec<EntryExportSchema>,
) -> Result<ImportResponseDto, String> {
    state
        .backend
        .import_entries(entries)
        .await
        .map_err(to_error)
}

#[tauri::command]
async fn import_bjk_archive(
    state: State<'_, DesktopState>,
    bytes: Vec<u8>,
) -> Result<ImportResponseDto, String> {
    state
        .backend
        .import_bjk_archive_bytes(bytes)
        .await
        .map_err(to_error)
}

#[tauri::command]
async fn batch_delete_entries(
    state: State<'_, DesktopState>,
    ids: Vec<String>,
) -> Result<(), String> {
    state
        .backend
        .batch_delete_entries(ids)
        .await
        .map_err(to_error)
}

fn menu_event_name(menu_id: &str) -> Option<&'static str> {
    match menu_id {
        "new_entry" => Some("menu:new-entry"),
        "search" => Some("menu:search"),
        "future_log" => Some("menu:future-log"),
        "archive" => Some("menu:archive"),
        "backup" => Some("menu:backup"),
        "attachment_maintenance" => Some("menu:attachment-maintenance"),
        "settings" => Some("menu:settings"),
        "check_update" => Some("menu:check-update"),
        "version_info" => Some("menu:version-info"),
        _ => None,
    }
}

#[cfg_attr(not(test), allow(dead_code))]
fn native_menu_enabled() -> bool {
    cfg!(target_os = "macos")
}

fn filename_for_path(path: &Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.trim().is_empty())
        .unwrap_or("backup.bjk")
        .to_string()
}

fn is_bjk_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.eq_ignore_ascii_case("bjk"))
        .unwrap_or(false)
}

fn bjk_path_from_arg(arg: &str) -> Option<PathBuf> {
    let trimmed = arg.trim();
    if trimmed.is_empty() {
        return None;
    }

    let path = if trimmed.starts_with("file://") {
        Url::parse(trimmed)
            .ok()
            .and_then(|url| url.to_file_path().ok())?
    } else {
        PathBuf::from(trimmed)
    };
    if is_bjk_path(&path) { Some(path) } else { None }
}

fn bjk_path_from_args(args: impl IntoIterator<Item = String>) -> Option<PathBuf> {
    args.into_iter().find_map(|arg| bjk_path_from_arg(&arg))
}

fn pending_bjk_import_from_path(path: PathBuf) -> PendingBjkImport {
    PendingBjkImport {
        filename: filename_for_path(&path),
        path: path.to_string_lossy().to_string(),
        token: Uuid::new_v4().to_string(),
    }
}

fn pending_bjk_import_from_args(
    args: impl IntoIterator<Item = String>,
) -> Option<PendingBjkImport> {
    bjk_path_from_args(args).map(pending_bjk_import_from_path)
}

fn pending_bjk_import_from_url(url: &Url) -> Option<PendingBjkImport> {
    url.to_file_path()
        .ok()
        .filter(|path| is_bjk_path(path))
        .map(pending_bjk_import_from_path)
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn emit_to_main_window(app: &AppHandle, event_name: &str) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = window.emit(event_name, ());
    } else {
        let _ = app.emit(event_name, ());
    }
}

fn open_main_and_emit(app: &AppHandle, event_name: &str) {
    show_main_window(app);
    emit_to_main_window(app, event_name);
}

fn remember_pending_bjk_import(app: &AppHandle, pending: PendingBjkImport) -> bool {
    let Some(state) = app.try_state::<PendingBjkImportState>() else {
        return false;
    };
    let Ok(mut guard) = state.0.lock() else {
        return false;
    };
    if guard.pending.is_some() || guard.active_token.is_some() {
        return false;
    }

    guard.pending = Some(pending);
    true
}

fn emit_bjk_import_request(app: &AppHandle, pending: PendingBjkImport) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = window.emit(BJK_OPEN_EVENT, pending);
    } else {
        let _ = app.emit(BJK_OPEN_EVENT, pending);
    }
}

fn handle_bjk_import_request(app: &AppHandle, pending: PendingBjkImport) {
    show_main_window(app);
    if remember_pending_bjk_import(app, pending.clone()) {
        emit_bjk_import_request(app, pending);
    }
}

#[cfg(target_os = "macos")]
fn build_native_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let app_menu = Submenu::with_items(
        app,
        "BuJo",
        true,
        &[
            &PredefinedMenuItem::about(app, Some("关于 BuJo"), None)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "settings", "设置", true, Some("CmdOrCtrl+,"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, Some("隐藏 BuJo"))?,
            &PredefinedMenuItem::hide_others(app, Some("隐藏其他"))?,
            &PredefinedMenuItem::show_all(app, Some("全部显示"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, Some("退出 BuJo"))?,
        ],
    )?;
    let file_menu = Submenu::with_items(
        app,
        "文件",
        true,
        &[
            &MenuItem::with_id(app, "new_entry", "新建条目", true, Some("CmdOrCtrl+N"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::close_window(app, Some("关闭窗口"))?,
        ],
    )?;
    let edit_menu = Submenu::with_items(
        app,
        "编辑",
        true,
        &[
            &PredefinedMenuItem::undo(app, Some("撤销"))?,
            &PredefinedMenuItem::redo(app, Some("重做"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, Some("剪切"))?,
            &PredefinedMenuItem::copy(app, Some("复制"))?,
            &PredefinedMenuItem::paste(app, Some("粘贴"))?,
            &PredefinedMenuItem::select_all(app, Some("全选"))?,
        ],
    )?;
    let view_menu = Submenu::with_items(
        app,
        "视图",
        true,
        &[
            &MenuItem::with_id(app, "search", "搜索", true, Some("CmdOrCtrl+F"))?,
            &MenuItem::with_id(app, "future_log", "未来日志", true, Some("CmdOrCtrl+L"))?,
        ],
    )?;
    let data_menu = Submenu::with_items(
        app,
        "数据",
        true,
        &[
            &MenuItem::with_id(app, "archive", "归档", true, Some("CmdOrCtrl+Shift+A"))?,
            &MenuItem::with_id(app, "backup", "备份与导入", true, Some("CmdOrCtrl+Shift+B"))?,
            &MenuItem::with_id(
                app,
                "attachment_maintenance",
                "存储管理",
                true,
                Some("CmdOrCtrl+Shift+M"),
            )?,
        ],
    )?;
    let help_menu = Submenu::with_items(
        app,
        "帮助",
        true,
        &[
            &MenuItem::with_id(
                app,
                "check_update",
                "检查更新...",
                true,
                Some("CmdOrCtrl+Shift+U"),
            )?,
            &MenuItem::with_id(
                app,
                "version_info",
                "版本信息",
                true,
                Some("CmdOrCtrl+Shift+I"),
            )?,
        ],
    )?;
    Menu::with_items(
        app,
        &[
            &app_menu, &file_menu, &edit_menu, &view_menu, &data_menu, &help_menu,
        ],
    )
}

fn handle_run_event(app: &AppHandle, event: tauri::RunEvent) {
    match event {
        #[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
        tauri::RunEvent::Opened { urls } => {
            if let Some(pending) = urls.iter().find_map(pending_bjk_import_from_url) {
                handle_bjk_import_request(app, pending);
            } else {
                show_main_window(app);
            }
        }
        #[cfg(target_os = "macos")]
        tauri::RunEvent::Reopen { .. } => {
            show_main_window(app);
        }
        _ => {}
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder =
        tauri::Builder::default().plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(pending) = pending_bjk_import_from_args(argv) {
                handle_bjk_import_request(app, pending);
            } else {
                show_main_window(app);
            }
        }));

    #[cfg(target_os = "macos")]
    let builder = builder.menu(build_native_menu);

    builder
        .on_menu_event(|app, event| {
            if let Some(event_name) = menu_event_name(event.id().as_ref()) {
                open_main_and_emit(app, event_name);
            }
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let pending_import = pending_bjk_import_from_args(std::env::args().collect::<Vec<_>>());
            let app_dir = app.path().app_data_dir()?;
            let semantic_assets_dir = app
                .path()
                .resource_dir()
                .ok()
                .map(|dir| dir.join("semantic").join("bge-small-zh-v1.5"));
            let backend = tauri::async_runtime::block_on(LocalBackend::open_with_semantic_assets(
                app_dir,
                semantic_assets_dir,
            ))?;
            app.manage(DesktopState {
                backend: Arc::new(backend),
            });
            app.manage(PendingUpdate(Mutex::new(None)));
            app.manage(PendingBjkImportState(Mutex::new(PendingBjkImportSlot {
                pending: pending_import,
                active_token: None,
            })));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            check_for_update,
            install_update,
            take_pending_bjk_import,
            clear_pending_bjk_import,
            read_bjk_import_file,
            import_pending_bjk_archive,
            create_entry,
            update_entry,
            archive_entry,
            unarchive_entry,
            delete_entry,
            reopen_entry,
            move_future_entry,
            get_daily_log,
            get_future_log,
            get_month_overview,
            get_range_overview,
            reorder_entries,
            migrate_entry_to_date,
            migrate_entry_to_future,
            get_migration_chain,
            search_entries,
            list_tags,
            rename_tag,
            store_upload,
            store_upload_path,
            list_uploads,
            restore_upload,
            open_upload,
            resolve_uploads,
            sync_daily_markdown_file,
            open_daily_markdown,
            sync_future_markdown_files,
            get_markdown_workspace,
            open_markdown_workspace,
            choose_markdown_workspace,
            attachment_maintenance_summary,
            cleanup_unused_uploads,
            cleanup_all_unused_uploads,
            export_markdown_archive,
            export_markdown_archive_to_file,
            export_bjk_archive_to_file,
            get_all_entries_for_backup,
            import_entries,
            import_bjk_archive,
            batch_delete_entries
        ])
        .build(tauri::generate_context!())
        .expect("error while building rbujo desktop application")
        .run(handle_run_event);
}

fn to_error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

fn safe_export_archive_filename(value: &str) -> String {
    safe_export_filename(value, "bujo_obsidian_export.zip", "zip")
}

fn safe_export_filename(value: &str, fallback: &str, extension: &str) -> String {
    let mut filename = value.trim().replace(['/', '\\'], "_");
    if filename.is_empty() {
        filename = fallback.to_string();
    }
    let suffix = format!(".{extension}");
    if filename.to_ascii_lowercase().ends_with(&suffix) {
        filename
    } else {
        format!("{filename}{suffix}")
    }
}

#[cfg(test)]
mod tests {
    use super::{
        bjk_path_from_arg, bjk_path_from_args, menu_event_name, native_menu_enabled,
        pending_bjk_import_from_path, pending_bjk_import_from_url,
    };
    use std::path::PathBuf;
    use url::Url;

    #[test]
    fn maps_native_menu_ids_to_frontend_events() {
        assert_eq!(menu_event_name("new_entry"), Some("menu:new-entry"));
        assert_eq!(menu_event_name("search"), Some("menu:search"));
        assert_eq!(menu_event_name("future_log"), Some("menu:future-log"));
        assert_eq!(menu_event_name("archive"), Some("menu:archive"));
        assert_eq!(menu_event_name("backup"), Some("menu:backup"));
        assert_eq!(
            menu_event_name("attachment_maintenance"),
            Some("menu:attachment-maintenance")
        );
        assert_eq!(menu_event_name("settings"), Some("menu:settings"));
        assert_eq!(menu_event_name("check_update"), Some("menu:check-update"));
        assert_eq!(menu_event_name("version_info"), Some("menu:version-info"));
        assert_eq!(menu_event_name("unknown"), None);
    }

    #[test]
    fn native_menu_is_macos_only() {
        assert_eq!(native_menu_enabled(), cfg!(target_os = "macos"));
    }

    #[test]
    fn finds_bjk_path_from_launch_args() {
        let path = bjk_path_from_args(vec![
            "/Applications/BuJo.app/Contents/MacOS/BuJo".to_string(),
            "/Users/test/Desktop/backup.BJK".to_string(),
        ]);

        assert_eq!(path, Some(PathBuf::from("/Users/test/Desktop/backup.BJK")));
    }

    #[test]
    fn ignores_non_bjk_launch_args() {
        let path = bjk_path_from_args(vec![
            "BuJo.exe".to_string(),
            "notes.md".to_string(),
            "backup.zip".to_string(),
        ]);

        assert_eq!(path, None);
    }

    #[cfg(unix)]
    #[test]
    fn decodes_file_url_bjk_launch_args() {
        let path = bjk_path_from_arg("file:///Users/test/My%20Backup.bjk");

        assert_eq!(path, Some(PathBuf::from("/Users/test/My Backup.bjk")));
    }

    #[cfg(unix)]
    #[test]
    fn decodes_file_url_bjk_open_events() {
        let url = Url::parse("file:///Users/test/My%20Backup.bjk").unwrap();
        let pending = pending_bjk_import_from_url(&url).unwrap();

        assert_eq!(pending.filename, "My Backup.bjk");
        assert_eq!(pending.path, "/Users/test/My Backup.bjk");
        assert!(!pending.token.is_empty());
    }

    #[test]
    fn builds_pending_bjk_import_payload() {
        let pending = pending_bjk_import_from_path(PathBuf::from("/tmp/my-backup.bjk"));

        assert_eq!(pending.filename, "my-backup.bjk");
        assert_eq!(pending.path, "/tmp/my-backup.bjk");
        assert!(!pending.token.is_empty());
    }
}
