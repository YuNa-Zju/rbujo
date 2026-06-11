use std::sync::Arc;

use rbullet_journal::local::{
    CreateEntryInput, EntryPatch, FutureLogResponse, LocalBackend, MigrationResult, SearchOptions,
    SearchResult, StoredUpload, UploadInput,
};
use rbullet_journal::models::{
    EntryExportSchema, EntryResponse, ImportResponseDto, ReopenResponse,
};
use tauri::{Manager, State};

#[derive(Clone)]
struct DesktopState {
    backend: Arc<LocalBackend>,
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
    state.backend.update_entry(id, patch).await.map_err(to_error)
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
) -> Result<serde_json::Value, String> {
    let overview = state
        .backend
        .get_month_overview(month, include_archived)
        .await
        .map_err(to_error)?;
    serde_json::to_value(overview).map_err(|error| error.to_string())
}

#[tauri::command]
async fn get_range_overview(
    state: State<'_, DesktopState>,
    start_date: String,
    end_date: String,
    include_archived: bool,
) -> Result<Vec<serde_json::Value>, String> {
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
async fn rebuild_search_index(state: State<'_, DesktopState>) -> Result<usize, String> {
    state.backend.rebuild_search_index().await.map_err(to_error)
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            let app_dir = app.path().app_data_dir()?;
            let backend = tauri::async_runtime::block_on(LocalBackend::open(app_dir))?;
            app.manage(DesktopState {
                backend: Arc::new(backend),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
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
            rebuild_search_index,
            store_upload,
            get_all_entries_for_backup,
            import_entries,
            batch_delete_entries
        ])
        .run(tauri::generate_context!())
        .expect("error while running rbujo desktop application");
}

fn to_error(error: impl std::fmt::Display) -> String {
    error.to_string()
}
