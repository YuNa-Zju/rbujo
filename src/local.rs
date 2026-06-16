use std::collections::{BTreeMap, HashMap, HashSet};
use std::io::{Cursor, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use regex::Regex;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{Row, SqlitePool};
use uuid::Uuid;
use zip::write::SimpleFileOptions;

use crate::db;
use crate::error::{AppError, AppResult};
use crate::models::{
    DeletedEntryInfo, Entry, EntryExportSchema, EntryResponse, ImportResponseDto, ReopenResponse,
    STATUS_CANCELLED, STATUS_COMPLETED, STATUS_MIGRATED_FORWARD, STATUS_MIGRATED_FUTURE,
    STATUS_OPEN, TYPE_EVENT, TYPE_IDEA, TYPE_TASK,
};

const LOCAL_USERNAME: &str = "local";
const LOCAL_PASSWORD_PLACEHOLDER: &str = "local_desktop_profile";
const EMBEDDING_DIMS: usize = 256;
const UPLOAD_ORPHAN_GRACE_SECONDS: u64 = 24 * 60 * 60;
const MARKDOWN_WORKSPACE_SETTING_KEY: &str = "markdown_workspace_path";
const ATTACHMENT_DIR: &str = "attachments";
const LEGACY_UPLOAD_DIR: &str = "uploads";
const FUTURE_MARKDOWN_SOMEDAY_KEY: &str = "future:someday";

const ENTRY_SELECT: &str = r#"
    SELECT entries.id AS id, entries.content AS content, entries.entry_type AS entry_type,
           entries.status AS status, entries.created_at AS created_at,
           entries.target_date AS target_date, entries.target_month AS target_month,
           entries.is_future AS is_future, entries.source_entry_id AS source_entry_id,
           entries.owner_id AS owner_id, entries.position AS position,
           entries.from_date AS from_date, entries.migrated_to_date AS migrated_to_date,
           entries.migrated_to_month AS migrated_to_month, entries.archived_at AS archived_at,
           entries.chain_root_id AS chain_root_id,
           entries.migrated_to_entry_id AS migrated_to_entry_id
    FROM entries
"#;

#[derive(Debug, Clone)]
pub struct LocalBackend {
    pool: SqlitePool,
    app_dir: PathBuf,
    owner_id: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateEntryInput {
    pub content: String,
    pub entry_type: String,
    pub target_date: Option<String>,
    pub target_month: Option<String>,
    #[serde(default)]
    pub is_future: bool,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct EntryPatch {
    pub content: Option<String>,
    pub entry_type: Option<String>,
    pub status: Option<String>,
    pub target_date: Option<String>,
    pub target_month: Option<String>,
    pub is_future: Option<bool>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SearchMode {
    Text,
    Regex,
    Semantic,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchOptions {
    pub query: String,
    #[serde(default = "default_search_mode")]
    pub mode: SearchMode,
    #[serde(default)]
    pub include_archived: bool,
    #[serde(default)]
    pub entry_type: Vec<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    #[serde(default = "default_search_limit")]
    pub limit: usize,
}

impl Default for SearchOptions {
    fn default() -> Self {
        Self {
            query: String::new(),
            mode: SearchMode::Text,
            include_archived: false,
            entry_type: Vec::new(),
            tags: Vec::new(),
            start_date: None,
            end_date: None,
            limit: default_search_limit(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct SearchResult {
    pub entry: EntryResponse,
    pub score: f32,
    pub match_type: String,
    pub snippet: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct MigrationResult {
    pub updated_source: EntryResponse,
    pub created_entry: EntryResponse,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UploadInput {
    pub filename: String,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredUpload {
    pub relative_path: String,
    pub absolute_path: String,
    pub sha256: String,
    pub size: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResolvedUpload {
    pub requested_path: String,
    pub relative_path: String,
    pub absolute_path: String,
    pub sha256: String,
    pub size: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyMarkdownFile {
    pub relative_path: String,
    pub absolute_path: String,
    pub workspace_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarkdownWorkspace {
    pub absolute_path: String,
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UploadBackup {
    pub relative_path: String,
    pub absolute_path: String,
    pub filename: String,
    pub sha256: String,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttachmentEntryReference {
    pub entry_id: String,
    pub entry_type: String,
    pub status: String,
    pub target_date: Option<String>,
    pub target_month: Option<String>,
    pub created_at: Option<String>,
    pub archived_at: Option<String>,
    pub preview: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttachmentMaintenanceItem {
    pub relative_path: String,
    pub filename: String,
    pub original_filename: Option<String>,
    pub sha256: String,
    pub size: i64,
    pub referenced: bool,
    pub reference_count: usize,
    pub references: Vec<AttachmentEntryReference>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttachmentMaintenanceSummary {
    pub total_count: usize,
    pub referenced_count: usize,
    pub orphaned_count: usize,
    pub total_bytes: i64,
    pub referenced_bytes: i64,
    pub orphaned_bytes: i64,
    pub uploads: Vec<AttachmentMaintenanceItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttachmentCleanupResult {
    pub removed_count: usize,
    pub removed_bytes: i64,
    pub kept_count: usize,
    pub summary: AttachmentMaintenanceSummary,
}

#[derive(Debug, Clone, Serialize)]
pub struct FutureLogResponse {
    pub future_log: Vec<EntryResponse>,
    pub monthly_log: BTreeMap<String, Vec<EntryResponse>>,
}

fn default_search_mode() -> SearchMode {
    SearchMode::Text
}

fn default_search_limit() -> usize {
    50
}

impl LocalBackend {
    pub async fn open(app_dir: impl AsRef<Path>) -> AppResult<Self> {
        let app_dir = app_dir.as_ref().to_path_buf();
        tokio::fs::create_dir_all(&app_dir)
            .await
            .map_err(|error| AppError::Internal(error.to_string()))?;
        tokio::fs::create_dir_all(app_dir.join(ATTACHMENT_DIR))
            .await
            .map_err(|error| AppError::Internal(error.to_string()))?;
        let db_path = app_dir.join("rbujo.sqlite3");
        let database_url = format!("sqlite://{}", db_path.display());
        let pool = db::connect(&database_url)
            .await
            .map_err(|error| AppError::Internal(error.to_string()))?;
        db::ensure_schema(&pool)
            .await
            .map_err(|error| AppError::Internal(error.to_string()))?;
        let owner_id = ensure_local_user(&pool).await?;
        adopt_legacy_entries_to_local_owner(&pool, owner_id).await?;
        repair_migration_chains(&pool, owner_id).await?;
        let backend = Self {
            pool,
            app_dir,
            owner_id,
        };
        backend.migrate_legacy_uploads_to_attachments().await?;
        Ok(backend)
    }

    pub fn app_dir(&self) -> &Path {
        &self.app_dir
    }

    fn default_markdown_workspace_path(&self) -> PathBuf {
        self.app_dir.join("journal")
    }

    pub async fn get_markdown_workspace(&self) -> AppResult<MarkdownWorkspace> {
        let default_path = self.default_markdown_workspace_path();
        let configured = self
            .get_setting(MARKDOWN_WORKSPACE_SETTING_KEY)
            .await?
            .map(PathBuf::from);
        let path = configured.unwrap_or_else(|| default_path.clone());
        Ok(MarkdownWorkspace {
            absolute_path: path.to_string_lossy().to_string(),
            is_default: path == default_path,
        })
    }

    pub async fn set_markdown_workspace(&self, path: PathBuf) -> AppResult<MarkdownWorkspace> {
        if path.as_os_str().is_empty() {
            return Err(AppError::BadRequest(
                "Markdown workspace path cannot be empty".to_string(),
            ));
        }
        if let Ok(metadata) = tokio::fs::metadata(&path).await {
            if !metadata.is_dir() {
                return Err(AppError::BadRequest(
                    "Markdown workspace path must be a directory".to_string(),
                ));
            }
        } else {
            tokio::fs::create_dir_all(&path)
                .await
                .map_err(|error| AppError::Internal(error.to_string()))?;
        }
        self.set_setting(MARKDOWN_WORKSPACE_SETTING_KEY, &path.to_string_lossy())
            .await?;
        self.clear_daily_markdown_sync_state().await?;
        self.sync_all_daily_markdown_files().await;
        let _ = self.write_future_markdown_files().await;
        self.get_markdown_workspace().await
    }

    async fn markdown_workspace_path(&self) -> AppResult<PathBuf> {
        Ok(PathBuf::from(
            self.get_markdown_workspace().await?.absolute_path,
        ))
    }

    async fn get_setting(&self, key: &str) -> AppResult<Option<String>> {
        sqlx::query_scalar("SELECT value FROM app_settings WHERE owner_id = ? AND key = ?")
            .bind(self.owner_id)
            .bind(key)
            .fetch_optional(&self.pool)
            .await
            .map_err(AppError::from)
    }

    async fn set_setting(&self, key: &str, value: &str) -> AppResult<()> {
        sqlx::query(
            r#"
            INSERT INTO app_settings(owner_id, key, value, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(owner_id, key)
            DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
            "#,
        )
        .bind(self.owner_id)
        .bind(key)
        .bind(value)
        .bind(now_string())
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    fn upload_file_path(&self, relative_path: &str) -> AppResult<PathBuf> {
        let relative = Path::new(relative_path);
        let mut components = relative.components();
        let Some(std::path::Component::Normal(first)) = components.next() else {
            return Err(AppError::BadRequest("Invalid upload path".to_string()));
        };
        if first != ATTACHMENT_DIR && first != LEGACY_UPLOAD_DIR {
            return Err(AppError::BadRequest("Invalid upload path".to_string()));
        }
        for component in components {
            if !matches!(component, std::path::Component::Normal(_)) {
                return Err(AppError::BadRequest("Invalid upload path".to_string()));
            }
        }
        Ok(self.app_dir.join(relative))
    }

    fn attachment_relative_path(filename: &str) -> String {
        format!("{ATTACHMENT_DIR}/{filename}")
    }

    fn legacy_upload_relative_path(filename: &str) -> String {
        format!("{LEGACY_UPLOAD_DIR}/{filename}")
    }

    fn upload_fallback_candidates(relative_path: &str) -> Vec<String> {
        let mut candidates = Vec::new();
        if let Some(filename) = relative_path.strip_prefix(&format!("{LEGACY_UPLOAD_DIR}/")) {
            candidates.push(Self::attachment_relative_path(filename));
        }
        candidates.push(relative_path.to_string());
        if let Some(filename) = relative_path.strip_prefix(&format!("{ATTACHMENT_DIR}/")) {
            candidates.push(Self::legacy_upload_relative_path(filename));
        }
        candidates
    }

    async fn existing_upload_relative_path_for_sha(
        &self,
        sha256: &str,
    ) -> AppResult<Option<String>> {
        for directory in [ATTACHMENT_DIR, LEGACY_UPLOAD_DIR] {
            if let Some(relative_path) = self
                .existing_upload_relative_path_for_sha_in_dir(directory, sha256)
                .await?
            {
                return Ok(Some(relative_path));
            }
        }
        Ok(None)
    }

    async fn existing_upload_relative_path_for_sha_in_dir(
        &self,
        directory: &str,
        sha256: &str,
    ) -> AppResult<Option<String>> {
        let upload_dir = self.app_dir.join(directory);
        if tokio::fs::metadata(&upload_dir).await.is_err() {
            return Ok(None);
        }

        let mut matches = Vec::new();
        let mut read_dir = tokio::fs::read_dir(&upload_dir)
            .await
            .map_err(|error| AppError::Internal(error.to_string()))?;
        while let Some(entry) = read_dir
            .next_entry()
            .await
            .map_err(|error| AppError::Internal(error.to_string()))?
        {
            let metadata = entry
                .metadata()
                .await
                .map_err(|error| AppError::Internal(error.to_string()))?;
            if !metadata.is_file() {
                continue;
            }
            let filename = entry.file_name().to_string_lossy().to_string();
            if filename == sha256
                || filename
                    .strip_prefix(sha256)
                    .is_some_and(|suffix| suffix.starts_with('.'))
            {
                matches.push(format!("{directory}/{filename}"));
            }
        }
        matches.sort();
        Ok(matches.into_iter().next())
    }

    async fn migrate_legacy_uploads_to_attachments(&self) -> AppResult<()> {
        let legacy_dir = self.app_dir.join(LEGACY_UPLOAD_DIR);
        if tokio::fs::metadata(&legacy_dir).await.is_err() {
            return Ok(());
        }

        let attachment_dir = self.app_dir.join(ATTACHMENT_DIR);
        tokio::fs::create_dir_all(&attachment_dir)
            .await
            .map_err(|error| AppError::Internal(error.to_string()))?;

        let mut migrated_paths = Vec::new();
        let mut read_dir = tokio::fs::read_dir(&legacy_dir)
            .await
            .map_err(|error| AppError::Internal(error.to_string()))?;
        while let Some(entry) = read_dir
            .next_entry()
            .await
            .map_err(|error| AppError::Internal(error.to_string()))?
        {
            let metadata = entry
                .metadata()
                .await
                .map_err(|error| AppError::Internal(error.to_string()))?;
            if !metadata.is_file() {
                continue;
            }

            let filename = entry.file_name().to_string_lossy().to_string();
            let legacy_relative_path = Self::legacy_upload_relative_path(&filename);
            let attachment_relative_path = Self::attachment_relative_path(&filename);
            let attachment_path = self.app_dir.join(&attachment_relative_path);

            if tokio::fs::metadata(&attachment_path).await.is_err()
                && tokio::fs::hard_link(entry.path(), &attachment_path)
                    .await
                    .is_err()
            {
                tokio::fs::copy(entry.path(), &attachment_path)
                    .await
                    .map_err(|error| AppError::Internal(error.to_string()))?;
            }

            let bytes = tokio::fs::read(&attachment_path)
                .await
                .map_err(|error| AppError::Internal(error.to_string()))?;
            let original_filename = sqlx::query_scalar::<_, Option<String>>(
                "SELECT original_filename FROM attachment_records WHERE relative_path = ?",
            )
            .bind(&legacy_relative_path)
            .fetch_optional(&self.pool)
            .await?
            .flatten();
            self.register_upload_record(
                &attachment_relative_path,
                &filename,
                original_filename.as_deref().or(Some(&filename)),
                &sha256_hex(&bytes),
                bytes.len() as i64,
            )
            .await?;
            sqlx::query("DELETE FROM attachment_records WHERE relative_path = ?")
                .bind(&legacy_relative_path)
                .execute(&self.pool)
                .await?;
            migrated_paths.push((legacy_relative_path, attachment_relative_path));
        }

        if migrated_paths.is_empty() {
            return Ok(());
        }

        let entries = sqlx::query_as::<_, Entry>(&format!(
            "{ENTRY_SELECT} WHERE owner_id = ? ORDER BY created_at ASC"
        ))
        .bind(self.owner_id)
        .fetch_all(&self.pool)
        .await?;
        for mut entry in entries {
            let mut content = entry.content.clone();
            for (legacy_relative_path, attachment_relative_path) in &migrated_paths {
                content = rewrite_attachment_reference_path(
                    &content,
                    legacy_relative_path,
                    attachment_relative_path,
                );
            }
            if content != entry.content {
                entry.content = content;
                self.save_entry(&entry).await?;
                self.index_entry(&entry).await?;
            }
        }

        Ok(())
    }

    pub fn db(&self) -> &SqlitePool {
        &self.pool
    }

    pub async fn create_entry(&self, input: CreateEntryInput) -> AppResult<EntryResponse> {
        let entry_type = validate_entry_type(&input.entry_type)?;
        let tags = input.tags;
        let (target_date, target_month, is_future) = normalize_new_entry_target(
            input.target_date.as_deref(),
            input.target_month.as_deref(),
            input.is_future,
        )?;
        let affects_future = is_future != 0 || target_month.is_some();
        if affects_future {
            self.import_future_markdown_files_if_changed().await?;
        }
        self.import_daily_markdown_for_date_values(vec![target_date.clone()])
            .await;
        let id = Uuid::new_v4().to_string();
        sqlx::query(
            r#"
            INSERT INTO entries(
                id, content, entry_type, status, created_at, target_date,
                target_month, is_future, owner_id, position
            ) VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?, 0)
            "#,
        )
        .bind(&id)
        .bind(input.content)
        .bind(entry_type)
        .bind(now_string())
        .bind(target_date)
        .bind(target_month)
        .bind(is_future)
        .bind(self.owner_id)
        .execute(&self.pool)
        .await?;

        let entry = self.fetch_entry(&id).await?;
        self.set_entry_tags(&id, tags).await?;
        self.index_entry(&entry).await?;
        let response = self.response_from_entry(entry).await?;
        self.sync_daily_markdown_for_date_values(vec![response.target_date.clone()])
            .await;
        if response_affects_future_markdown(&response) {
            let _ = self.write_future_markdown_files().await;
        }
        Ok(response)
    }

    pub async fn update_entry(&self, id: String, patch: EntryPatch) -> AppResult<EntryResponse> {
        let existing = self.fetch_entry(&id).await?;
        let previous_affects_future = entry_affects_future_markdown(&existing);
        let patch_affects_future = patch
            .target_month
            .as_deref()
            .is_some_and(|value| !value.trim().is_empty())
            || patch.is_future == Some(true);
        if previous_affects_future || patch_affects_future {
            self.import_future_markdown_files_if_changed().await?;
        }
        let mut import_dates = vec![existing.target_date.clone()];
        if let Some(target_date) = patch.target_date.as_deref() {
            import_dates.push(Some(validate_date(target_date)?));
        }
        self.import_daily_markdown_for_date_values(import_dates)
            .await;

        let mut entry = self.fetch_entry(&id).await?;
        let previous_target_date = entry.target_date.clone();
        let previous_upload_refs = patch
            .content
            .as_ref()
            .map(|_| upload_references_from_content(&entry.content))
            .unwrap_or_default();
        if let Some(content) = patch.content {
            entry.content = content;
        }
        if let Some(entry_type) = patch.entry_type.as_deref() {
            entry.entry_type = validate_entry_type(entry_type)?;
        }
        if let Some(status) = patch.status.as_deref() {
            entry.status = validate_status(status)?;
            if entry.status == STATUS_OPEN {
                entry.migrated_to_date = None;
                entry.migrated_to_month = None;
                entry.migrated_to_entry_id = None;
            }
        }
        if let Some(target_date) = patch.target_date.as_deref() {
            entry.target_date = Some(validate_date(target_date)?);
            entry.target_month = None;
            entry.is_future = 0;
        }
        if let Some(target_month) = patch.target_month.as_deref() {
            entry.target_month = Some(validate_month(target_month)?);
            entry.target_date = None;
            entry.is_future = 1;
        }
        if let Some(is_future) = patch.is_future {
            entry.is_future = i64::from(is_future);
            if is_future {
                entry.target_date = None;
            }
        }
        normalize_entry_state(&mut entry);
        self.save_entry(&entry).await?;
        if let Some(tags) = patch.tags {
            self.set_entry_tags(&id, tags).await?;
        }
        self.index_entry(&entry).await?;
        let response = self
            .response_from_entry(self.fetch_entry(&id).await?)
            .await?;
        self.cleanup_upload_references_if_unused(previous_upload_refs)
            .await?;
        self.sync_daily_markdown_for_date_values(vec![
            previous_target_date,
            response.target_date.clone(),
        ])
        .await;
        if previous_affects_future || response_affects_future_markdown(&response) {
            let _ = self.write_future_markdown_files().await;
        }
        Ok(response)
    }

    pub async fn archive_entry(&self, id: String) -> AppResult<EntryResponse> {
        let entry = self.fetch_entry(&id).await?;
        let affects_future = entry_affects_future_markdown(&entry);
        if affects_future {
            self.import_future_markdown_files_if_changed().await?;
        }
        self.import_daily_markdown_for_date_values(vec![entry.target_date.clone()])
            .await;
        let mut entry = self.fetch_entry(&id).await?;
        entry.archived_at = Some(now_string());
        self.save_entry(&entry).await?;
        let response = self.response_from_entry(entry).await?;
        self.sync_daily_markdown_for_date_values(vec![response.target_date.clone()])
            .await;
        if affects_future || response_affects_future_markdown(&response) {
            let _ = self.write_future_markdown_files().await;
        }
        Ok(response)
    }

    pub async fn unarchive_entry(&self, id: String) -> AppResult<EntryResponse> {
        let entry = self.fetch_entry(&id).await?;
        let affects_future = entry_affects_future_markdown(&entry);
        if affects_future {
            self.import_future_markdown_files_if_changed().await?;
        }
        self.import_daily_markdown_for_date_values(vec![entry.target_date.clone()])
            .await;
        let mut entry = self.fetch_entry(&id).await?;
        entry.archived_at = None;
        self.save_entry(&entry).await?;
        let response = self.response_from_entry(entry).await?;
        self.sync_daily_markdown_for_date_values(vec![response.target_date.clone()])
            .await;
        if affects_future || response_affects_future_markdown(&response) {
            let _ = self.write_future_markdown_files().await;
        }
        Ok(response)
    }

    pub async fn delete_entry(&self, id: String) -> AppResult<()> {
        let entry = self.fetch_entry(&id).await?;
        let affects_future = self.entry_chain_affects_future_markdown(&entry).await?;
        if affects_future {
            self.import_future_markdown_files_if_changed().await?;
        }
        let sync_dates = self.daily_dates_for_entry_chain(&entry).await?;
        self.import_daily_markdown_for_date_values(sync_dates).await;
        let entry = self.fetch_entry(&id).await?;
        let mut sync_dates = self.daily_dates_for_entry_chain(&entry).await?;
        if let Some(parent_id) = entry.source_entry_id.as_deref() {
            if let Ok(parent) = self.fetch_entry(parent_id).await {
                sync_dates.push(parent.target_date);
            }
        }
        let removed_upload_refs = self.upload_references_for_entry_chain(&entry).await?;
        self.collect_and_delete_children(&id).await?;
        if let Some(parent_id) = entry.source_entry_id {
            self.restore_parent_after_child_removal(&parent_id, &id)
                .await?;
        }
        sqlx::query("DELETE FROM entries WHERE id = ? AND owner_id = ?")
            .bind(id)
            .bind(self.owner_id)
            .execute(&self.pool)
            .await?;
        self.cleanup_upload_references_if_unused(removed_upload_refs)
            .await?;
        self.sync_daily_markdown_for_date_values(sync_dates).await;
        if affects_future {
            let _ = self.write_future_markdown_files().await;
        }
        Ok(())
    }

    pub async fn reopen_entry(&self, id: String) -> AppResult<ReopenResponse> {
        let entry = self.fetch_entry(&id).await?;
        let affects_future = self.entry_chain_affects_future_markdown(&entry).await?;
        if affects_future {
            self.import_future_markdown_files_if_changed().await?;
        }
        let sync_dates = self.daily_dates_for_entry_chain(&entry).await?;
        self.import_daily_markdown_for_date_values(sync_dates).await;
        let mut entry = self.fetch_entry(&id).await?;
        let mut sync_dates = self.daily_dates_for_entry_chain(&entry).await?;
        let deleted_entries = self.collect_and_delete_children(&id).await?;
        entry.status = STATUS_OPEN.to_string();
        entry.migrated_to_date = None;
        entry.migrated_to_month = None;
        entry.migrated_to_entry_id = None;
        entry.target_month = None;
        entry.is_future = 0;
        self.save_entry(&entry).await?;
        self.index_entry(&entry).await?;
        let updated_entry = self
            .response_from_entry(self.fetch_entry(&id).await?)
            .await?;
        sync_dates.push(updated_entry.target_date.clone());
        self.sync_daily_markdown_for_date_values(sync_dates).await;
        if affects_future || response_affects_future_markdown(&updated_entry) {
            let _ = self.write_future_markdown_files().await;
        }
        Ok(ReopenResponse {
            success: true,
            updated_entry,
            deleted_entries,
        })
    }

    pub async fn move_future_entry(
        &self,
        id: String,
        target_month: Option<String>,
    ) -> AppResult<EntryResponse> {
        let entry = self.fetch_entry(&id).await?;
        let previous_affects_future = entry_affects_future_markdown(&entry);
        if previous_affects_future || target_month.is_some() {
            self.import_future_markdown_files_if_changed().await?;
        }
        self.import_daily_markdown_for_date_values(vec![entry.target_date.clone()])
            .await;
        let mut entry = self.fetch_entry(&id).await?;
        let previous_target_date = entry.target_date.clone();
        entry.target_month = target_month.as_deref().map(validate_month).transpose()?;
        entry.target_date = None;
        entry.is_future = 1;
        if !matches!(entry.status.as_str(), STATUS_COMPLETED | STATUS_CANCELLED) {
            entry.status = STATUS_OPEN.to_string();
        }
        normalize_entry_state(&mut entry);
        self.save_entry(&entry).await?;
        self.index_entry(&entry).await?;
        let response = self
            .response_from_entry(self.fetch_entry(&id).await?)
            .await?;
        self.sync_daily_markdown_for_date_values(vec![
            previous_target_date,
            response.target_date.clone(),
        ])
        .await;
        let _ = self.write_future_markdown_files().await;
        Ok(response)
    }

    pub async fn get_daily_log(
        &self,
        date: impl AsRef<str>,
        include_archived: bool,
    ) -> AppResult<Vec<EntryResponse>> {
        let date = validate_date(date.as_ref())?;
        if !include_archived && self.import_daily_markdown_if_changed(&date).await? {
            self.write_daily_markdown_file(&date).await?;
        }
        self.daily_log_entries(&date, include_archived).await
    }

    async fn daily_log_entries(
        &self,
        date: &str,
        include_archived: bool,
    ) -> AppResult<Vec<EntryResponse>> {
        let archive_filter = if include_archived {
            ""
        } else {
            " AND archived_at IS NULL"
        };
        let sql = format!(
            "{ENTRY_SELECT} WHERE owner_id = ? AND target_date = ?{archive_filter} ORDER BY position ASC, created_at DESC"
        );
        let entries = sqlx::query_as::<_, Entry>(&sql)
            .bind(self.owner_id)
            .bind(date)
            .fetch_all(&self.pool)
            .await?;
        self.responses_from_entries(entries).await
    }

    pub async fn get_future_log(&self, include_archived: bool) -> AppResult<FutureLogResponse> {
        if !include_archived {
            self.import_future_markdown_files_if_changed().await?;
            let _ = self.write_future_markdown_files().await;
        }
        let archive_filter = if include_archived {
            ""
        } else {
            " AND archived_at IS NULL"
        };
        let future_entries = sqlx::query_as::<_, Entry>(&format!(
            r#"{ENTRY_SELECT}
            WHERE owner_id = ?
              AND is_future = 1
              AND target_date IS NULL
              AND target_month IS NULL
              AND status NOT IN ('forward', 'future')
              {archive_filter}
            ORDER BY position ASC, created_at DESC"#
        ))
        .bind(self.owner_id)
        .fetch_all(&self.pool)
        .await?;

        let monthly_entries = sqlx::query_as::<_, Entry>(&format!(
            r#"{ENTRY_SELECT}
            WHERE owner_id = ?
              AND target_month IS NOT NULL
              AND status NOT IN ('forward', 'future')
              {archive_filter}
            ORDER BY target_month ASC, position ASC, created_at DESC"#
        ))
        .bind(self.owner_id)
        .fetch_all(&self.pool)
        .await?;

        let mut monthly_log: BTreeMap<String, Vec<EntryResponse>> = BTreeMap::new();
        for entry in monthly_entries {
            if let Some(month) = entry.target_month.clone() {
                monthly_log
                    .entry(month)
                    .or_default()
                    .push(self.response_from_entry(entry).await?);
            }
        }
        Ok(FutureLogResponse {
            future_log: self.responses_from_entries(future_entries).await?,
            monthly_log,
        })
    }

    pub async fn get_month_overview(
        &self,
        month: String,
        include_archived: bool,
    ) -> AppResult<HashMap<String, Vec<serde_json::Value>>> {
        let month = validate_month(&month)?;
        let archive_filter = if include_archived {
            ""
        } else {
            " AND archived_at IS NULL"
        };
        let rows = sqlx::query(&format!(
            r#"
            SELECT id, target_date, entry_type, status
            FROM entries
            WHERE owner_id = ?
              AND substr(target_date, 1, 7) = ?
              {archive_filter}
            ORDER BY target_date ASC, position ASC, created_at DESC
            "#
        ))
        .bind(self.owner_id)
        .bind(month)
        .fetch_all(&self.pool)
        .await?;

        let mut overview: HashMap<String, Vec<serde_json::Value>> = HashMap::new();
        for row in rows {
            let date: String = row.try_get("target_date")?;
            overview.entry(date).or_default().push(serde_json::json!({
                "id": row.try_get::<String, _>("id")?,
                "type": row.try_get::<String, _>("entry_type")?,
                "status": row.try_get::<String, _>("status")?,
            }));
        }
        Ok(overview)
    }

    pub async fn reorder_entries(&self, entry_ids: Vec<String>) -> AppResult<()> {
        let mut sync_dates = Vec::new();
        let mut affects_future = false;
        for entry_id in entry_ids.iter() {
            if let Ok(entry) = self.fetch_entry(entry_id).await {
                affects_future |= entry_affects_future_markdown(&entry);
                sync_dates.push(entry.target_date);
            }
        }
        if affects_future {
            self.import_future_markdown_files_if_changed().await?;
        }
        self.import_daily_markdown_for_date_values(sync_dates.clone())
            .await;
        sync_dates.clear();
        for (index, entry_id) in entry_ids.iter().enumerate() {
            if let Ok(entry) = self.fetch_entry(entry_id).await {
                affects_future |= entry_affects_future_markdown(&entry);
                sync_dates.push(entry.target_date);
            }
            sqlx::query("UPDATE entries SET position = ? WHERE id = ? AND owner_id = ?")
                .bind(index as i64)
                .bind(entry_id)
                .bind(self.owner_id)
                .execute(&self.pool)
                .await?;
        }
        self.sync_daily_markdown_for_date_values(sync_dates).await;
        if affects_future {
            let _ = self.write_future_markdown_files().await;
        }
        Ok(())
    }

    pub async fn migrate_entry_to_date(
        &self,
        id: String,
        target_date: String,
    ) -> AppResult<MigrationResult> {
        let target_date = validate_date(&target_date)?;
        let source = self.fetch_entry(&id).await?;
        let source_affects_future = entry_affects_future_markdown(&source);
        if source_affects_future {
            self.import_future_markdown_files_if_changed().await?;
        }
        self.import_daily_markdown_for_date_values(vec![
            source.target_date.clone(),
            Some(target_date.clone()),
        ])
        .await;
        let mut source = self.fetch_entry(&id).await?;
        let previous_target_date = source.target_date.clone();
        let created = self
            .create_migration_child(&mut source, Some(&target_date), None)
            .await?;
        source.status = STATUS_MIGRATED_FORWARD.to_string();
        source.migrated_to_date = Some(target_date);
        source.migrated_to_month = None;
        source.target_month = None;
        source.is_future = 0;
        source.migrated_to_entry_id = Some(created.id.clone());
        normalize_entry_state(&mut source);
        self.save_entry(&source).await?;
        self.index_entry(&source).await?;
        self.index_entry(&created).await?;
        self.sync_daily_markdown_for_date_values(vec![
            previous_target_date,
            source.target_date.clone(),
            created.target_date.clone(),
        ])
        .await;
        if source_affects_future || entry_affects_future_markdown(&created) {
            let _ = self.write_future_markdown_files().await;
        }
        Ok(MigrationResult {
            updated_source: self.response_from_entry(source).await?,
            created_entry: self.response_from_entry(created).await?,
        })
    }

    pub async fn migrate_entry_to_future(
        &self,
        id: String,
        target_month: Option<String>,
    ) -> AppResult<MigrationResult> {
        let target_month = target_month.as_deref().map(validate_month).transpose()?;
        let source = self.fetch_entry(&id).await?;
        let source_affects_future = entry_affects_future_markdown(&source);
        if source_affects_future || target_month.is_some() {
            self.import_future_markdown_files_if_changed().await?;
        }
        self.import_daily_markdown_for_date_values(vec![source.target_date.clone()])
            .await;
        let mut source = self.fetch_entry(&id).await?;
        let previous_target_date = source.target_date.clone();
        let created = self
            .create_migration_child(&mut source, None, target_month.as_deref())
            .await?;
        source.status = STATUS_MIGRATED_FUTURE.to_string();
        source.migrated_to_month = target_month;
        source.migrated_to_date = None;
        source.target_month = None;
        source.is_future = 0;
        source.migrated_to_entry_id = Some(created.id.clone());
        normalize_entry_state(&mut source);
        self.save_entry(&source).await?;
        self.index_entry(&source).await?;
        self.index_entry(&created).await?;
        self.sync_daily_markdown_for_date_values(vec![
            previous_target_date,
            source.target_date.clone(),
            created.target_date.clone(),
        ])
        .await;
        if source_affects_future || entry_affects_future_markdown(&created) {
            let _ = self.write_future_markdown_files().await;
        }
        Ok(MigrationResult {
            updated_source: self.response_from_entry(source).await?,
            created_entry: self.response_from_entry(created).await?,
        })
    }

    pub async fn get_migration_chain(&self, entry_id: String) -> AppResult<Vec<EntryResponse>> {
        let entry = self.fetch_entry(&entry_id).await?;
        let root_id = entry.chain_root_id.clone().unwrap_or(entry.id);
        let mut current = self.fetch_entry(&root_id).await?;
        let mut seen = HashSet::new();
        let mut chain = Vec::new();
        loop {
            if !seen.insert(current.id.clone()) {
                return Err(AppError::BadRequest(
                    "Migration chain contains a cycle".to_string(),
                ));
            }
            let next_id = current.migrated_to_entry_id.clone();
            chain.push(current.clone());
            let Some(next_id) = next_id else {
                break;
            };
            current = self.fetch_entry(&next_id).await?;
            if chain.len() > 128 {
                return Err(AppError::BadRequest(
                    "Migration chain is too deep".to_string(),
                ));
            }
        }
        self.responses_from_entries(chain).await
    }

    pub async fn search_entries(&self, options: SearchOptions) -> AppResult<Vec<SearchResult>> {
        let candidates = self.search_candidates(&options).await?;
        let query = options.query.trim();
        if query.is_empty() {
            let mut results = Vec::new();
            for entry in candidates.into_iter().take(options.limit) {
                results.push(SearchResult {
                    snippet: snippet(&entry.content, ""),
                    entry: self.response_from_entry(entry).await?,
                    score: 0.0,
                    match_type: "list".to_string(),
                });
            }
            return Ok(results);
        }

        match options.mode {
            SearchMode::Text => {
                let mut results = Vec::new();
                for entry in candidates {
                    if !clean_markdown(&entry.content).contains(query) {
                        continue;
                    }
                    results.push(SearchResult {
                        snippet: snippet(&entry.content, query),
                        entry: self.response_from_entry(entry).await?,
                        score: 1.0,
                        match_type: "text".to_string(),
                    });
                    if results.len() >= options.limit {
                        break;
                    }
                }
                Ok(results)
            }
            SearchMode::Regex => {
                let pattern = Regex::new(query)
                    .map_err(|_| AppError::BadRequest("Invalid regex pattern".to_string()))?;
                let mut results = Vec::new();
                for entry in candidates {
                    if !pattern.is_match(&clean_markdown(&entry.content)) {
                        continue;
                    }
                    results.push(SearchResult {
                        snippet: snippet(&entry.content, query),
                        entry: self.response_from_entry(entry).await?,
                        score: 1.0,
                        match_type: "regex".to_string(),
                    });
                    if results.len() >= options.limit {
                        break;
                    }
                }
                Ok(results)
            }
            SearchMode::Semantic => self.semantic_search(candidates, query, options.limit).await,
        }
    }

    pub async fn migrate_text_tags_to_native(&self) -> AppResult<usize> {
        let entries = sqlx::query_as::<_, Entry>(&format!(
            "{ENTRY_SELECT} WHERE owner_id = ? ORDER BY created_at ASC"
        ))
        .bind(self.owner_id)
        .fetch_all(&self.pool)
        .await?;
        let mut migrated = 0usize;
        for entry in entries {
            if !self.get_entry_tags(&entry.id).await?.is_empty() {
                continue;
            }
            let tags = extract_text_tags(&entry.content);
            if tags.is_empty() {
                continue;
            }
            self.set_entry_tags(&entry.id, tags).await?;
            migrated += 1;
        }
        Ok(migrated)
    }

    pub async fn list_tags(&self) -> AppResult<Vec<String>> {
        let rows = sqlx::query(
            r#"
            SELECT DISTINCT tags.name AS name
            FROM tags
            JOIN entry_tags
              ON entry_tags.tag_id = tags.id
             AND entry_tags.owner_id = tags.owner_id
            JOIN entries
              ON entries.id = entry_tags.entry_id
             AND entries.owner_id = tags.owner_id
            WHERE tags.owner_id = ?
            ORDER BY lower(tags.name) ASC, tags.name ASC
            "#,
        )
        .bind(self.owner_id)
        .fetch_all(&self.pool)
        .await?;

        rows.into_iter()
            .map(|row| row.try_get::<String, _>("name").map_err(AppError::from))
            .collect()
    }

    pub async fn rebuild_search_index(&self) -> AppResult<usize> {
        let entries = sqlx::query_as::<_, Entry>(&format!(
            "{ENTRY_SELECT} WHERE owner_id = ? ORDER BY created_at ASC"
        ))
        .bind(self.owner_id)
        .fetch_all(&self.pool)
        .await?;
        let count = entries.len();
        for entry in entries {
            self.index_entry(&entry).await?;
        }
        Ok(count)
    }

    pub async fn get_all_entries_for_backup(&self) -> AppResult<Vec<EntryExportSchema>> {
        let entries = sqlx::query_as::<_, Entry>(&format!(
            "{ENTRY_SELECT} WHERE owner_id = ? ORDER BY created_at ASC"
        ))
        .bind(self.owner_id)
        .fetch_all(&self.pool)
        .await?;
        let mut export = Vec::with_capacity(entries.len());
        for entry in entries {
            export.push(export_schema_from_entry(
                entry.clone(),
                self.get_entry_tags(&entry.id).await?,
            ));
        }
        Ok(export)
    }

    pub async fn import_entries(
        &self,
        entries: Vec<EntryExportSchema>,
    ) -> AppResult<ImportResponseDto> {
        let mut inserted_ids = Vec::new();
        let mut updated_count = 0usize;
        let mut skipped_count = 0usize;
        let mut sync_dates = Vec::new();
        let mut affects_future = false;
        let mut imported_future_markdown = false;

        for item in entries {
            let tags = item.tags.clone();
            let mut imported = normalize_import_entry(item, self.owner_id)?;
            let imported_affects_future = entry_affects_future_markdown(&imported);
            affects_future |= imported_affects_future;
            if imported_affects_future && !imported_future_markdown {
                self.import_future_markdown_files_if_changed().await?;
                imported_future_markdown = true;
            }
            let existing_owner: Option<i64> =
                sqlx::query_scalar("SELECT owner_id FROM entries WHERE id = ?")
                    .bind(&imported.id)
                    .fetch_optional(&self.pool)
                    .await?;

            if let Some(owner_id) = existing_owner {
                if owner_id == self.owner_id {
                    let previous = self.fetch_entry(&imported.id).await.ok();
                    let previous_affects_future =
                        previous.as_ref().is_some_and(entry_affects_future_markdown);
                    if previous_affects_future && !imported_future_markdown {
                        self.import_future_markdown_files_if_changed().await?;
                        imported_future_markdown = true;
                    }
                    affects_future |= previous.as_ref().is_some_and(entry_affects_future_markdown);
                    self.save_entry(&imported).await?;
                    self.set_entry_tags(&imported.id, tags).await?;
                    self.index_entry(&imported).await?;
                    sync_dates.push(previous.and_then(|entry| entry.target_date));
                    sync_dates.push(imported.target_date.clone());
                    updated_count += 1;
                } else {
                    imported.id = Uuid::new_v4().to_string();
                    self.insert_entry(&imported).await?;
                    self.set_entry_tags(&imported.id, tags).await?;
                    self.index_entry(&imported).await?;
                    sync_dates.push(imported.target_date.clone());
                    inserted_ids.push(imported.id);
                }
            } else {
                let duplicate: Option<String> = sqlx::query_scalar(
                    "SELECT id FROM entries WHERE owner_id = ? AND content = ? AND target_date IS ? LIMIT 1",
                )
                .bind(self.owner_id)
                .bind(&imported.content)
                .bind(&imported.target_date)
                .fetch_optional(&self.pool)
                .await?;
                if duplicate.is_some() {
                    skipped_count += 1;
                    continue;
                }
                let id = imported.id.clone();
                self.insert_entry(&imported).await?;
                self.set_entry_tags(&imported.id, tags).await?;
                self.index_entry(&imported).await?;
                sync_dates.push(imported.target_date.clone());
                inserted_ids.push(id);
            }
        }

        self.sync_daily_markdown_for_date_values(sync_dates).await;
        if affects_future {
            let _ = self.write_future_markdown_files().await;
        }

        Ok(ImportResponseDto {
            success: true,
            message: format!(
                "Imported {} new, updated {}, skipped {}.",
                inserted_ids.len(),
                updated_count,
                skipped_count
            ),
            inserted_count: inserted_ids.len(),
            updated_count,
            skipped_count,
            inserted_ids,
        })
    }

    pub async fn batch_delete_entries(&self, ids: Vec<String>) -> AppResult<()> {
        for id in ids {
            self.delete_entry(id).await?;
        }
        Ok(())
    }

    pub async fn store_upload(&self, input: UploadInput) -> AppResult<StoredUpload> {
        let size = input.bytes.len();
        let sha256 = sha256_hex(&input.bytes);
        if let Some(relative_path) = self.existing_upload_relative_path_for_sha(&sha256).await? {
            let filename = Path::new(&relative_path)
                .file_name()
                .and_then(|value| value.to_str())
                .ok_or_else(|| AppError::Internal("Invalid upload filename".to_string()))?
                .to_string();
            let absolute_path = self.app_dir.join(&relative_path);
            self.register_upload_record(
                &relative_path,
                &filename,
                Some(&input.filename),
                &sha256,
                size as i64,
            )
            .await?;
            let _ = self.cleanup_stale_unused_uploads().await;
            return Ok(StoredUpload {
                relative_path,
                absolute_path: absolute_path.to_string_lossy().to_string(),
                sha256,
                size,
            });
        }

        let extension = sanitized_extension(&input.filename);
        let filename = if extension.is_empty() {
            sha256.clone()
        } else {
            format!("{sha256}.{extension}")
        };
        let relative_path = Self::attachment_relative_path(&filename);
        let absolute_path = self.app_dir.join(&relative_path);
        if let Some(parent) = absolute_path.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|error| AppError::Internal(error.to_string()))?;
        }
        if tokio::fs::metadata(&absolute_path).await.is_err() {
            tokio::fs::write(&absolute_path, input.bytes)
                .await
                .map_err(|error| AppError::Internal(error.to_string()))?;
        }
        self.register_upload_record(
            &relative_path,
            &filename,
            Some(&input.filename),
            &sha256,
            size as i64,
        )
        .await?;
        let _ = self.cleanup_stale_unused_uploads().await;
        Ok(StoredUpload {
            relative_path,
            absolute_path: absolute_path.to_string_lossy().to_string(),
            sha256,
            size,
        })
    }

    pub async fn store_upload_path(&self, path: impl AsRef<Path>) -> AppResult<StoredUpload> {
        let path = path.as_ref();
        let metadata = tokio::fs::metadata(path)
            .await
            .map_err(|_| AppError::NotFound("Upload source not found".to_string()))?;
        if !metadata.is_file() {
            return Err(AppError::BadRequest(
                "Upload source is not a file".to_string(),
            ));
        }

        let filename = path
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| AppError::BadRequest("Invalid upload filename".to_string()))?
            .to_string();
        let bytes = tokio::fs::read(path)
            .await
            .map_err(|error| AppError::Internal(error.to_string()))?;

        self.store_upload(UploadInput { filename, bytes }).await
    }

    async fn resolve_upload_reference(
        &self,
        requested_path: &str,
    ) -> AppResult<Option<ResolvedUpload>> {
        for candidate_relative_path in Self::upload_fallback_candidates(requested_path) {
            let Ok(path) = self.upload_file_path(&candidate_relative_path) else {
                continue;
            };
            let Ok(canonical_path) = tokio::fs::canonicalize(&path).await else {
                continue;
            };

            let mut inside_allowed_directory = false;
            for directory in [ATTACHMENT_DIR, LEGACY_UPLOAD_DIR] {
                if let Ok(canonical_dir) =
                    tokio::fs::canonicalize(self.app_dir.join(directory)).await
                    && canonical_path.starts_with(&canonical_dir)
                {
                    inside_allowed_directory = true;
                    break;
                }
            }
            if !inside_allowed_directory {
                continue;
            }

            let metadata = tokio::fs::metadata(&canonical_path)
                .await
                .map_err(|error| AppError::Internal(error.to_string()))?;
            if !metadata.is_file() {
                continue;
            }
            let stored_sha = sqlx::query_scalar::<_, Option<String>>(
                "SELECT sha256 FROM attachment_records WHERE relative_path = ?",
            )
            .bind(&candidate_relative_path)
            .fetch_optional(&self.pool)
            .await?
            .flatten();
            let sha256 = match stored_sha {
                Some(value) => value,
                None => {
                    let bytes = tokio::fs::read(&canonical_path)
                        .await
                        .map_err(|error| AppError::Internal(error.to_string()))?;
                    sha256_hex(&bytes)
                }
            };
            return Ok(Some(ResolvedUpload {
                requested_path: requested_path.to_string(),
                relative_path: candidate_relative_path,
                absolute_path: canonical_path.to_string_lossy().to_string(),
                sha256,
                size: metadata.len() as usize,
            }));
        }

        Ok(None)
    }

    pub async fn resolve_uploads(
        &self,
        relative_paths: Vec<String>,
    ) -> AppResult<Vec<ResolvedUpload>> {
        let mut resolved = Vec::new();
        for relative_path in relative_paths {
            if let Some(upload) = self.resolve_upload_reference(&relative_path).await? {
                resolved.push(upload);
            }
        }
        Ok(resolved)
    }

    async fn register_upload_record(
        &self,
        relative_path: &str,
        filename: &str,
        original_filename: Option<&str>,
        sha256: &str,
        size: i64,
    ) -> AppResult<()> {
        sqlx::query(
            r#"
            INSERT INTO attachment_records(
                relative_path, filename, original_filename, sha256, size, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT(relative_path) DO UPDATE SET
                filename = excluded.filename,
                original_filename = COALESCE(attachment_records.original_filename, excluded.original_filename),
                sha256 = excluded.sha256,
                size = excluded.size,
                updated_at = CURRENT_TIMESTAMP
            "#,
        )
        .bind(relative_path)
        .bind(filename)
        .bind(original_filename)
        .bind(sha256)
        .bind(size)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn scan_upload_files(&self) -> AppResult<Vec<AttachmentMaintenanceItem>> {
        let mut uploads = self.scan_upload_files_in_dir(ATTACHMENT_DIR).await?;
        let attachment_filenames = uploads
            .iter()
            .map(|upload| upload.filename.clone())
            .collect::<HashSet<_>>();
        for upload in self.scan_upload_files_in_dir(LEGACY_UPLOAD_DIR).await? {
            if !attachment_filenames.contains(&upload.filename) {
                uploads.push(upload);
            }
        }
        uploads.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
        Ok(uploads)
    }

    async fn scan_upload_files_in_dir(
        &self,
        directory: &str,
    ) -> AppResult<Vec<AttachmentMaintenanceItem>> {
        let upload_dir = self.app_dir.join(directory);
        if tokio::fs::metadata(&upload_dir).await.is_err() {
            return Ok(Vec::new());
        }

        let mut uploads = Vec::new();
        let mut read_dir = tokio::fs::read_dir(&upload_dir)
            .await
            .map_err(|error| AppError::Internal(error.to_string()))?;
        while let Some(entry) = read_dir
            .next_entry()
            .await
            .map_err(|error| AppError::Internal(error.to_string()))?
        {
            let metadata = entry
                .metadata()
                .await
                .map_err(|error| AppError::Internal(error.to_string()))?;
            if !metadata.is_file() {
                continue;
            }
            let filename = entry.file_name().to_string_lossy().to_string();
            let bytes = tokio::fs::read(entry.path())
                .await
                .map_err(|error| AppError::Internal(error.to_string()))?;
            let sha256 = sha256_hex(&bytes);
            let size = metadata.len() as i64;
            let relative_path = format!("{directory}/{filename}");
            let original_filename = sqlx::query(
                "SELECT original_filename FROM attachment_records WHERE relative_path = ?",
            )
            .bind(&relative_path)
            .fetch_optional(&self.pool)
            .await?
            .and_then(|row| row.try_get::<Option<String>, _>("original_filename").ok())
            .flatten();

            self.register_upload_record(
                &relative_path,
                &filename,
                original_filename.as_deref().or(Some(&filename)),
                &sha256,
                size,
            )
            .await?;

            uploads.push(AttachmentMaintenanceItem {
                relative_path,
                filename,
                original_filename,
                sha256,
                size,
                referenced: false,
                reference_count: 0,
                references: Vec::new(),
            });
        }
        Ok(uploads)
    }

    async fn upload_reference_counts(&self) -> AppResult<HashMap<String, usize>> {
        Ok(self
            .upload_references_by_upload()
            .await?
            .into_iter()
            .map(|(relative_path, references)| (relative_path, references.len()))
            .collect())
    }

    async fn upload_references_by_upload(
        &self,
    ) -> AppResult<HashMap<String, Vec<AttachmentEntryReference>>> {
        let rows = sqlx::query(
            r#"
            SELECT id, content, entry_type, status, target_date, target_month, created_at, archived_at
            FROM entries
            WHERE owner_id = ?
            ORDER BY COALESCE(target_date, target_month, created_at) DESC, created_at DESC
            "#,
        )
            .bind(self.owner_id)
            .fetch_all(&self.pool)
            .await?;
        let mut references_by_upload = HashMap::new();
        for row in rows {
            let entry_id: String = row.try_get("id")?;
            let content: String = row.try_get("content")?;
            let references = upload_references_from_content(&content);
            if references.is_empty() {
                continue;
            }
            let entry_reference = AttachmentEntryReference {
                entry_id,
                entry_type: row.try_get("entry_type")?,
                status: row.try_get("status")?,
                target_date: row.try_get("target_date")?,
                target_month: row.try_get("target_month")?,
                created_at: row.try_get("created_at")?,
                archived_at: row.try_get("archived_at")?,
                preview: attachment_reference_preview(&content),
            };
            for reference in references {
                references_by_upload
                    .entry(reference)
                    .or_insert_with(Vec::new)
                    .push(entry_reference.clone());
            }
        }
        Ok(references_by_upload)
    }

    async fn upload_references_for_entry_chain(&self, entry: &Entry) -> AppResult<HashSet<String>> {
        let mut references = upload_references_from_content(&entry.content);
        let mut current = entry.clone();
        let mut seen = HashSet::new();

        while let Some(next_id) = current.migrated_to_entry_id.clone() {
            if !seen.insert(next_id.clone()) {
                return Err(AppError::BadRequest(
                    "Migration chain contains a cycle".to_string(),
                ));
            }
            let child = self.fetch_entry(&next_id).await?;
            references.extend(upload_references_from_content(&child.content));
            current = child;
            if seen.len() > 128 {
                return Err(AppError::BadRequest(
                    "Migration chain is too deep".to_string(),
                ));
            }
        }

        Ok(references)
    }

    async fn entry_chain_affects_future_markdown(&self, entry: &Entry) -> AppResult<bool> {
        if entry_affects_future_markdown(entry) {
            return Ok(true);
        }
        let mut current = entry.clone();
        let mut seen = HashSet::new();

        while let Some(next_id) = current.migrated_to_entry_id.clone() {
            if !seen.insert(next_id.clone()) {
                return Err(AppError::BadRequest(
                    "Migration chain contains a cycle".to_string(),
                ));
            }
            let child = self.fetch_entry(&next_id).await?;
            if entry_affects_future_markdown(&child) {
                return Ok(true);
            }
            current = child;
            if seen.len() > 128 {
                return Err(AppError::BadRequest(
                    "Migration chain is too deep".to_string(),
                ));
            }
        }

        Ok(false)
    }

    async fn daily_dates_for_entry_chain(&self, entry: &Entry) -> AppResult<Vec<Option<String>>> {
        let mut dates = vec![entry.target_date.clone()];
        let mut current = entry.clone();
        let mut seen = HashSet::new();

        while let Some(next_id) = current.migrated_to_entry_id.clone() {
            if !seen.insert(next_id.clone()) {
                return Err(AppError::BadRequest(
                    "Migration chain contains a cycle".to_string(),
                ));
            }
            let child = self.fetch_entry(&next_id).await?;
            dates.push(child.target_date.clone());
            current = child;
            if seen.len() > 128 {
                return Err(AppError::BadRequest(
                    "Migration chain is too deep".to_string(),
                ));
            }
        }

        Ok(dates)
    }

    async fn sync_daily_markdown_for_date_values(&self, dates: Vec<Option<String>>) {
        self.write_daily_markdown_for_date_values(dates).await;
    }

    async fn write_daily_markdown_for_date_values(&self, dates: Vec<Option<String>>) {
        let mut seen = HashSet::new();
        for date in dates.into_iter().flatten() {
            if seen.insert(date.clone()) {
                let _ = self.write_daily_markdown_file(&date).await;
            }
        }
    }

    async fn import_daily_markdown_for_date_values(&self, dates: Vec<Option<String>>) {
        let mut seen = HashSet::new();
        for date in dates.into_iter().flatten() {
            if seen.insert(date.clone()) {
                let _ = self.import_daily_markdown_if_changed(&date).await;
            }
        }
    }

    async fn sync_all_daily_markdown_files(&self) {
        let rows = sqlx::query(
            r#"
            SELECT DISTINCT target_date
            FROM entries
            WHERE owner_id = ?
              AND target_date IS NOT NULL
            ORDER BY target_date ASC
            "#,
        )
        .bind(self.owner_id)
        .fetch_all(&self.pool)
        .await;
        if let Ok(rows) = rows {
            for row in rows {
                if let Ok(date) = row.try_get::<String, _>("target_date") {
                    let _ = self.write_daily_markdown_file(&date).await;
                }
            }
        }
    }

    async fn clear_daily_markdown_sync_state(&self) -> AppResult<()> {
        sqlx::query("DELETE FROM daily_markdown_sync_state WHERE owner_id = ?")
            .bind(self.owner_id)
            .execute(&self.pool)
            .await?;
        sqlx::query("DELETE FROM daily_markdown_entry_sync_state WHERE owner_id = ?")
            .bind(self.owner_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn daily_markdown_absolute_path(&self, date: &str) -> AppResult<(String, PathBuf)> {
        let relative_path = daily_markdown_relative_path(date);
        let absolute_path = self.markdown_workspace_path().await?.join(&relative_path);
        Ok((relative_path, absolute_path))
    }

    async fn legacy_daily_markdown_absolute_paths(
        &self,
        date: &str,
    ) -> AppResult<Vec<(String, PathBuf)>> {
        let workspace = self.markdown_workspace_path().await?;
        Ok(legacy_daily_markdown_relative_paths(date)
            .into_iter()
            .map(|relative_path| {
                let absolute_path = workspace.join(&relative_path);
                (relative_path, absolute_path)
            })
            .collect())
    }

    async fn import_daily_markdown_if_changed(&self, date: &str) -> AppResult<bool> {
        let (_, absolute_path) = self.daily_markdown_absolute_path(date).await?;
        let (import_path, bytes, imported_legacy_path) = match tokio::fs::read(&absolute_path).await
        {
            Ok(bytes) => (absolute_path, bytes, false),
            Err(error)
                if matches!(
                    error.kind(),
                    std::io::ErrorKind::NotFound | std::io::ErrorKind::NotADirectory
                ) =>
            {
                let mut last_missing = true;
                let mut found = None;
                for (_, legacy_absolute_path) in
                    self.legacy_daily_markdown_absolute_paths(date).await?
                {
                    match tokio::fs::read(&legacy_absolute_path).await {
                        Ok(bytes) => {
                            found = Some((legacy_absolute_path, bytes, true));
                            break;
                        }
                        Err(error)
                            if matches!(
                                error.kind(),
                                std::io::ErrorKind::NotFound | std::io::ErrorKind::NotADirectory
                            ) =>
                        {
                            last_missing = true;
                        }
                        Err(error) => return Err(AppError::Internal(error.to_string())),
                    }
                }
                if let Some(found) = found {
                    found
                } else if last_missing {
                    return Ok(false);
                } else {
                    return Ok(false);
                }
            }
            Err(error) => return Err(AppError::Internal(error.to_string())),
        };
        let content_sha256 = sha256_hex(&bytes);
        let modified_ms = file_modified_millis(&import_path).await?;
        let state = self.daily_markdown_file_state(date).await?;
        if state
            .as_ref()
            .is_some_and(|(state_modified_ms, state_sha256)| {
                *state_modified_ms == modified_ms && state_sha256 == &content_sha256
            })
        {
            return Ok(imported_legacy_path);
        }
        let markdown = String::from_utf8_lossy(&bytes).to_string();
        let parsed = parse_daily_markdown_file(&markdown);
        let sync_dates = self.apply_parsed_daily_markdown(date, parsed).await?;
        for sync_date in sync_dates.into_iter().flatten() {
            if sync_date != date {
                let _ = self.write_daily_markdown_file(&sync_date).await;
            }
        }
        Ok(true)
    }

    async fn daily_markdown_file_state(&self, date: &str) -> AppResult<Option<(i64, String)>> {
        let row = sqlx::query(
            r#"
            SELECT modified_ms, content_sha256
            FROM daily_markdown_sync_state
            WHERE owner_id = ? AND date = ?
            "#,
        )
        .bind(self.owner_id)
        .bind(date)
        .fetch_optional(&self.pool)
        .await?;
        row.map(|row| {
            Ok((
                row.try_get::<i64, _>("modified_ms")?,
                row.try_get::<String, _>("content_sha256")?,
            ))
        })
        .transpose()
    }

    async fn apply_parsed_daily_markdown(
        &self,
        date: &str,
        parsed_entries: Vec<ParsedDailyMarkdownEntry>,
    ) -> AppResult<Vec<Option<String>>> {
        let existing = self.daily_log_entries(date, false).await?;
        let existing_by_id: HashMap<String, EntryResponse> = existing
            .iter()
            .cloned()
            .map(|entry| (entry.id.clone(), entry))
            .collect();
        let sync_rows = self.daily_markdown_entry_states(date).await?;
        let match_result =
            match_daily_markdown_entries(&sync_rows, &parsed_entries, &existing_by_id);

        let mut seen_ids = HashSet::new();
        let mut sync_dates = Vec::new();
        for (position_index, parsed) in parsed_entries.iter().enumerate() {
            let position = position_index as i64;
            let target_id = match_result
                .matched_ids
                .get(position_index)
                .cloned()
                .flatten();

            if parsed.is_migration_pointer {
                if let Some(id) = target_id {
                    seen_ids.insert(id);
                }
                continue;
            }

            if let Some(id) = target_id {
                if existing_by_id.get(&id).is_some_and(|entry| {
                    matches!(
                        entry.status.as_str(),
                        STATUS_MIGRATED_FORWARD | STATUS_MIGRATED_FUTURE
                    )
                }) {
                    let id = self
                        .create_daily_markdown_entry_from_parsed(date, parsed, position)
                        .await?;
                    seen_ids.insert(id);
                    continue;
                }
                let mut entry = self.fetch_entry(&id).await?;
                entry.content = parsed.content.clone();
                entry.entry_type = parsed.entry_type.clone();
                entry.status = parsed.status.clone();
                entry.target_date = Some(date.to_string());
                entry.target_month = None;
                entry.is_future = 0;
                entry.position = position;
                entry.migrated_to_date = None;
                entry.migrated_to_month = None;
                entry.migrated_to_entry_id = None;
                normalize_entry_state(&mut entry);
                self.save_entry(&entry).await?;
                self.set_entry_tags(&id, parsed.tags.clone()).await?;
                self.index_entry(&entry).await?;
                seen_ids.insert(id);
            } else {
                let id = self
                    .create_daily_markdown_entry_from_parsed(date, parsed, position)
                    .await?;
                seen_ids.insert(id);
            }
        }

        for entry in existing {
            if !seen_ids.contains(&entry.id)
                && !match_result.retained_ids.contains(&entry.id)
                && !matches!(
                    entry.status.as_str(),
                    STATUS_MIGRATED_FORWARD | STATUS_MIGRATED_FUTURE
                )
            {
                sync_dates.extend(self.delete_entry_from_markdown_import(&entry.id).await?);
            }
        }

        Ok(sync_dates)
    }

    async fn delete_entry_from_markdown_import(&self, id: &str) -> AppResult<Vec<Option<String>>> {
        let entry = self.fetch_entry(id).await?;
        let mut sync_dates = self.daily_dates_for_entry_chain(&entry).await?;
        if let Some(parent_id) = entry.source_entry_id.as_deref()
            && let Ok(parent) = self.fetch_entry(parent_id).await
        {
            sync_dates.push(parent.target_date);
        }
        let removed_upload_refs = self.upload_references_for_entry_chain(&entry).await?;
        self.collect_and_delete_children(id).await?;
        if let Some(parent_id) = entry.source_entry_id {
            self.restore_parent_after_child_removal(&parent_id, id)
                .await?;
        }
        sqlx::query("DELETE FROM entries WHERE id = ? AND owner_id = ?")
            .bind(id)
            .bind(self.owner_id)
            .execute(&self.pool)
            .await?;
        self.cleanup_upload_references_if_unused(removed_upload_refs)
            .await?;
        Ok(sync_dates)
    }

    async fn create_daily_markdown_entry_from_parsed(
        &self,
        date: &str,
        parsed: &ParsedDailyMarkdownEntry,
        position: i64,
    ) -> AppResult<String> {
        let id = Uuid::new_v4().to_string();
        let entry = Entry {
            id: id.clone(),
            content: parsed.content.clone(),
            entry_type: parsed.entry_type.clone(),
            status: parsed.status.clone(),
            created_at: now_string(),
            target_date: Some(date.to_string()),
            target_month: None,
            is_future: 0,
            source_entry_id: None,
            owner_id: self.owner_id,
            position,
            from_date: None,
            migrated_to_date: None,
            migrated_to_month: None,
            archived_at: None,
            chain_root_id: None,
            migrated_to_entry_id: None,
        };
        self.insert_entry(&entry).await?;
        self.set_entry_tags(&id, parsed.tags.clone()).await?;
        self.index_entry(&entry).await?;
        Ok(id)
    }

    async fn daily_markdown_entry_states(
        &self,
        date: &str,
    ) -> AppResult<Vec<DailyMarkdownEntryState>> {
        let rows = sqlx::query(
            r#"
            SELECT entry_id, line_hash, position
            FROM daily_markdown_entry_sync_state
            WHERE owner_id = ? AND date = ?
            ORDER BY position ASC
            "#,
        )
        .bind(self.owner_id)
        .bind(date)
        .fetch_all(&self.pool)
        .await?;
        rows.into_iter()
            .map(|row| {
                Ok(DailyMarkdownEntryState {
                    entry_id: row.try_get("entry_id")?,
                    line_hash: row.try_get("line_hash")?,
                    position: row.try_get("position")?,
                })
            })
            .collect()
    }

    async fn write_daily_markdown_file(&self, date: &str) -> AppResult<DailyMarkdownFile> {
        let (relative_path, absolute_path) = self.daily_markdown_absolute_path(date).await?;
        if let Some(parent) = absolute_path.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|error| AppError::Internal(error.to_string()))?;
        }
        let entries = self.daily_log_entries(date, false).await?;
        let rendered = render_daily_markdown_file(date, &entries);
        tokio::fs::write(&absolute_path, &rendered.markdown)
            .await
            .map_err(|error| AppError::Internal(error.to_string()))?;
        self.record_daily_markdown_sync_state(
            date,
            &relative_path,
            &absolute_path,
            &rendered.markdown,
            &rendered.entry_lines,
        )
        .await?;
        Ok(DailyMarkdownFile {
            relative_path,
            absolute_path: absolute_path.to_string_lossy().to_string(),
            workspace_path: self
                .markdown_workspace_path()
                .await?
                .to_string_lossy()
                .to_string(),
        })
    }

    async fn future_markdown_absolute_path(
        &self,
        target_month: Option<&str>,
    ) -> AppResult<(String, PathBuf)> {
        let relative_path = future_markdown_relative_path(target_month);
        let absolute_path = self.markdown_workspace_path().await?.join(&relative_path);
        Ok((relative_path, absolute_path))
    }

    async fn future_markdown_scopes(&self) -> AppResult<Vec<Option<String>>> {
        let mut scopes = vec![None];
        let mut seen = HashSet::new();
        let rows = sqlx::query(
            r#"
            SELECT DISTINCT target_month
            FROM entries
            WHERE owner_id = ?
              AND target_month IS NOT NULL
            ORDER BY target_month ASC
            "#,
        )
        .bind(self.owner_id)
        .fetch_all(&self.pool)
        .await?;
        for row in rows {
            if let Some(target_month) = row.try_get::<Option<String>, _>("target_month")?
                && seen.insert(target_month.clone())
            {
                scopes.push(Some(target_month));
            }
        }

        let future_dir = self.markdown_workspace_path().await?.join("Future");
        if tokio::fs::metadata(future_dir.join("Future.md"))
            .await
            .is_ok()
        {
            scopes[0] = None;
        }
        if let Ok(mut year_dirs) = tokio::fs::read_dir(&future_dir).await {
            while let Some(year_dir) = year_dirs
                .next_entry()
                .await
                .map_err(|error| AppError::Internal(error.to_string()))?
            {
                let metadata = year_dir
                    .metadata()
                    .await
                    .map_err(|error| AppError::Internal(error.to_string()))?;
                if !metadata.is_dir() {
                    continue;
                }
                let year = year_dir.file_name().to_string_lossy().to_string();
                if year.len() != 4 || !year.chars().all(|ch| ch.is_ascii_digit()) {
                    continue;
                }
                let mut month_files = tokio::fs::read_dir(year_dir.path())
                    .await
                    .map_err(|error| AppError::Internal(error.to_string()))?;
                while let Some(month_file) = month_files
                    .next_entry()
                    .await
                    .map_err(|error| AppError::Internal(error.to_string()))?
                {
                    let metadata = month_file
                        .metadata()
                        .await
                        .map_err(|error| AppError::Internal(error.to_string()))?;
                    if !metadata.is_file() {
                        continue;
                    }
                    let filename = month_file.file_name().to_string_lossy().to_string();
                    let Some(month) = filename.strip_suffix(".md") else {
                        continue;
                    };
                    let target_month = format!("{year}-{month}");
                    if validate_month(&target_month).is_ok() && seen.insert(target_month.clone()) {
                        scopes.push(Some(target_month));
                    }
                }
            }
        }

        Ok(scopes)
    }

    async fn import_future_markdown_files_if_changed(&self) -> AppResult<bool> {
        let mut changed = false;
        for target_month in self.future_markdown_scopes().await? {
            if self
                .import_future_markdown_scope_if_changed(target_month)
                .await?
            {
                changed = true;
            }
        }
        Ok(changed)
    }

    async fn import_future_markdown_scope_if_changed(
        &self,
        target_month: Option<String>,
    ) -> AppResult<bool> {
        let sync_key = future_markdown_sync_key(target_month.as_deref());
        let (_, absolute_path) = self
            .future_markdown_absolute_path(target_month.as_deref())
            .await?;
        let bytes = match tokio::fs::read(&absolute_path).await {
            Ok(bytes) => bytes,
            Err(error)
                if matches!(
                    error.kind(),
                    std::io::ErrorKind::NotFound | std::io::ErrorKind::NotADirectory
                ) =>
            {
                return Ok(false);
            }
            Err(error) => return Err(AppError::Internal(error.to_string())),
        };
        let content_sha256 = sha256_hex(&bytes);
        let modified_ms = file_modified_millis(&absolute_path).await?;
        let state = self.daily_markdown_file_state(&sync_key).await?;
        if state
            .as_ref()
            .is_some_and(|(state_modified_ms, state_sha256)| {
                *state_modified_ms == modified_ms && state_sha256 == &content_sha256
            })
        {
            return Ok(false);
        }

        let markdown = String::from_utf8_lossy(&bytes).to_string();
        let parsed = parse_daily_markdown_file(&markdown);
        self.apply_parsed_future_markdown(target_month.as_deref(), parsed)
            .await?;
        Ok(true)
    }

    async fn apply_parsed_future_markdown(
        &self,
        target_month: Option<&str>,
        parsed_entries: Vec<ParsedDailyMarkdownEntry>,
    ) -> AppResult<()> {
        let sync_key = future_markdown_sync_key(target_month);
        let existing = self.future_markdown_entries(target_month, false).await?;
        let existing_by_id: HashMap<String, EntryResponse> = existing
            .iter()
            .cloned()
            .map(|entry| (entry.id.clone(), entry))
            .collect();
        let sync_rows = self.daily_markdown_entry_states(&sync_key).await?;
        let match_result =
            match_daily_markdown_entries(&sync_rows, &parsed_entries, &existing_by_id);

        let mut seen_ids = HashSet::new();
        for (position_index, parsed) in parsed_entries.iter().enumerate() {
            let position = position_index as i64;
            let target_id = match_result
                .matched_ids
                .get(position_index)
                .cloned()
                .flatten();

            if parsed.is_migration_pointer {
                if let Some(id) = target_id {
                    seen_ids.insert(id);
                }
                continue;
            }

            if let Some(id) = target_id {
                let mut entry = self.fetch_entry(&id).await?;
                entry.content = parsed.content.clone();
                entry.entry_type = parsed.entry_type.clone();
                entry.status = parsed.status.clone();
                entry.target_date = None;
                entry.target_month = target_month.map(str::to_string);
                entry.is_future = 1;
                entry.position = position;
                entry.migrated_to_date = None;
                entry.migrated_to_month = None;
                entry.migrated_to_entry_id = None;
                normalize_entry_state(&mut entry);
                self.save_entry(&entry).await?;
                self.set_entry_tags(&id, parsed.tags.clone()).await?;
                self.index_entry(&entry).await?;
                seen_ids.insert(id);
            } else {
                let id = self
                    .create_future_markdown_entry_from_parsed(target_month, parsed, position)
                    .await?;
                seen_ids.insert(id);
            }
        }

        for entry in existing {
            if !seen_ids.contains(&entry.id)
                && !match_result.retained_ids.contains(&entry.id)
                && !matches!(
                    entry.status.as_str(),
                    STATUS_MIGRATED_FORWARD | STATUS_MIGRATED_FUTURE
                )
            {
                self.delete_entry_from_markdown_import(&entry.id).await?;
            }
        }

        Ok(())
    }

    async fn create_future_markdown_entry_from_parsed(
        &self,
        target_month: Option<&str>,
        parsed: &ParsedDailyMarkdownEntry,
        position: i64,
    ) -> AppResult<String> {
        let id = Uuid::new_v4().to_string();
        let entry = Entry {
            id: id.clone(),
            content: parsed.content.clone(),
            entry_type: parsed.entry_type.clone(),
            status: parsed.status.clone(),
            created_at: now_string(),
            target_date: None,
            target_month: target_month.map(str::to_string),
            is_future: 1,
            source_entry_id: None,
            owner_id: self.owner_id,
            position,
            from_date: None,
            migrated_to_date: None,
            migrated_to_month: None,
            archived_at: None,
            chain_root_id: None,
            migrated_to_entry_id: None,
        };
        self.insert_entry(&entry).await?;
        self.set_entry_tags(&id, parsed.tags.clone()).await?;
        self.index_entry(&entry).await?;
        Ok(id)
    }

    async fn future_markdown_entries(
        &self,
        target_month: Option<&str>,
        include_archived: bool,
    ) -> AppResult<Vec<EntryResponse>> {
        let archive_filter = if include_archived {
            ""
        } else {
            " AND archived_at IS NULL"
        };
        let entries = if let Some(target_month) = target_month {
            sqlx::query_as::<_, Entry>(&format!(
                r#"{ENTRY_SELECT}
                WHERE owner_id = ?
                  AND target_month = ?
                  AND status NOT IN ('forward', 'future')
                  {archive_filter}
                ORDER BY position ASC, created_at DESC"#
            ))
            .bind(self.owner_id)
            .bind(target_month)
            .fetch_all(&self.pool)
            .await?
        } else {
            sqlx::query_as::<_, Entry>(&format!(
                r#"{ENTRY_SELECT}
                WHERE owner_id = ?
                  AND is_future = 1
                  AND target_date IS NULL
                  AND target_month IS NULL
                  AND status NOT IN ('forward', 'future')
                  {archive_filter}
                ORDER BY position ASC, created_at DESC"#
            ))
            .bind(self.owner_id)
            .fetch_all(&self.pool)
            .await?
        };
        self.responses_from_entries(entries).await
    }

    async fn write_future_markdown_files(&self) -> AppResult<Vec<DailyMarkdownFile>> {
        let mut files = Vec::new();
        for target_month in self.future_markdown_scopes().await? {
            let entries = self
                .future_markdown_entries(target_month.as_deref(), false)
                .await?;
            let file_exists = {
                let (_, absolute_path) = self
                    .future_markdown_absolute_path(target_month.as_deref())
                    .await?;
                tokio::fs::metadata(absolute_path).await.is_ok()
            };
            if entries.is_empty() && target_month.is_some() && !file_exists {
                continue;
            }
            if entries.is_empty() && target_month.is_none() && !file_exists {
                continue;
            }
            files.push(
                self.write_future_markdown_file(target_month.as_deref(), &entries)
                    .await?,
            );
        }
        Ok(files)
    }

    async fn write_future_markdown_file(
        &self,
        target_month: Option<&str>,
        entries: &[EntryResponse],
    ) -> AppResult<DailyMarkdownFile> {
        let (relative_path, absolute_path) =
            self.future_markdown_absolute_path(target_month).await?;
        if let Some(parent) = absolute_path.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|error| AppError::Internal(error.to_string()))?;
        }
        let title = target_month.unwrap_or("Future");
        let rendered = render_markdown_entry_file(title, entries);
        tokio::fs::write(&absolute_path, &rendered.markdown)
            .await
            .map_err(|error| AppError::Internal(error.to_string()))?;
        self.record_daily_markdown_sync_state(
            &future_markdown_sync_key(target_month),
            &relative_path,
            &absolute_path,
            &rendered.markdown,
            &rendered.entry_lines,
        )
        .await?;
        Ok(DailyMarkdownFile {
            relative_path,
            absolute_path: absolute_path.to_string_lossy().to_string(),
            workspace_path: self
                .markdown_workspace_path()
                .await?
                .to_string_lossy()
                .to_string(),
        })
    }

    async fn record_daily_markdown_sync_state(
        &self,
        date: &str,
        relative_path: &str,
        absolute_path: &Path,
        markdown: &str,
        entry_lines: &[RenderedDailyMarkdownLine],
    ) -> AppResult<()> {
        let modified_ms = file_modified_millis(absolute_path).await?;
        let content_sha256 = sha256_hex(markdown.as_bytes());
        sqlx::query(
            r#"
            INSERT INTO daily_markdown_sync_state(
                owner_id, date, relative_path, absolute_path, modified_ms, content_sha256, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(owner_id, date)
            DO UPDATE SET
                relative_path = excluded.relative_path,
                absolute_path = excluded.absolute_path,
                modified_ms = excluded.modified_ms,
                content_sha256 = excluded.content_sha256,
                updated_at = excluded.updated_at
            "#,
        )
        .bind(self.owner_id)
        .bind(date)
        .bind(relative_path)
        .bind(absolute_path.to_string_lossy().to_string())
        .bind(modified_ms)
        .bind(content_sha256)
        .bind(now_string())
        .execute(&self.pool)
        .await?;

        sqlx::query("DELETE FROM daily_markdown_entry_sync_state WHERE owner_id = ? AND date = ?")
            .bind(self.owner_id)
            .bind(date)
            .execute(&self.pool)
            .await?;
        for line in entry_lines {
            sqlx::query(
                r#"
                INSERT INTO daily_markdown_entry_sync_state(
                    owner_id, date, entry_id, line_hash, position
                ) VALUES (?, ?, ?, ?, ?)
                "#,
            )
            .bind(self.owner_id)
            .bind(date)
            .bind(&line.entry_id)
            .bind(&line.line_hash)
            .bind(line.position)
            .execute(&self.pool)
            .await?;
        }
        Ok(())
    }

    async fn cleanup_upload_references_if_unused(
        &self,
        candidates: HashSet<String>,
    ) -> AppResult<()> {
        if candidates.is_empty() {
            return Ok(());
        }

        let reference_counts = self.upload_reference_counts().await?;
        for relative_path in candidates {
            if reference_counts.get(&relative_path).copied().unwrap_or(0) > 0 {
                continue;
            }

            let path = self.upload_file_path(&relative_path)?;
            match tokio::fs::remove_file(&path).await {
                Ok(()) => {
                    sqlx::query("DELETE FROM attachment_records WHERE relative_path = ?")
                        .bind(relative_path)
                        .execute(&self.pool)
                        .await?;
                }
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                    sqlx::query("DELETE FROM attachment_records WHERE relative_path = ?")
                        .bind(relative_path)
                        .execute(&self.pool)
                        .await?;
                }
                Err(error) => return Err(AppError::Internal(error.to_string())),
            }
        }

        Ok(())
    }

    pub async fn attachment_maintenance_summary(&self) -> AppResult<AttachmentMaintenanceSummary> {
        let mut uploads = self.scan_upload_files().await?;
        let mut references_by_upload = self.upload_references_by_upload().await?;

        let mut total_bytes = 0;
        let mut referenced_bytes = 0;
        let mut orphaned_bytes = 0;
        let mut referenced_count = 0;

        for upload in &mut uploads {
            let references = references_by_upload
                .remove(&upload.relative_path)
                .unwrap_or_default();
            let reference_count = references.len();
            upload.reference_count = reference_count;
            upload.referenced = reference_count > 0;
            upload.references = references;
            total_bytes += upload.size;
            if upload.referenced {
                referenced_count += 1;
                referenced_bytes += upload.size;
            } else {
                orphaned_bytes += upload.size;
            }
        }

        Ok(AttachmentMaintenanceSummary {
            total_count: uploads.len(),
            referenced_count,
            orphaned_count: uploads.len().saturating_sub(referenced_count),
            total_bytes,
            referenced_bytes,
            orphaned_bytes,
            uploads,
        })
    }

    pub async fn cleanup_unused_uploads(&self) -> AppResult<AttachmentCleanupResult> {
        self.cleanup_stale_unused_uploads().await
    }

    pub async fn cleanup_all_unused_uploads(&self) -> AppResult<AttachmentCleanupResult> {
        self.cleanup_unused_uploads_with_min_age(None).await
    }

    async fn cleanup_stale_unused_uploads(&self) -> AppResult<AttachmentCleanupResult> {
        self.cleanup_unused_uploads_with_min_age(Some(Duration::from_secs(
            UPLOAD_ORPHAN_GRACE_SECONDS,
        )))
        .await
    }

    async fn cleanup_unused_uploads_with_min_age(
        &self,
        min_age: Option<Duration>,
    ) -> AppResult<AttachmentCleanupResult> {
        let summary = self.attachment_maintenance_summary().await?;
        let mut removed_count = 0;
        let mut removed_bytes = 0;
        let mut kept_count = 0;

        for upload in summary.uploads.iter().filter(|upload| !upload.referenced) {
            let path = self.upload_file_path(&upload.relative_path)?;
            if let Some(min_age) = min_age {
                if let Ok(metadata) = tokio::fs::metadata(&path).await {
                    if let Ok(modified) = metadata.modified() {
                        if modified.elapsed().is_ok_and(|age| age < min_age) {
                            kept_count += 1;
                            continue;
                        }
                    }
                }
            }

            match tokio::fs::remove_file(&path).await {
                Ok(()) => {
                    removed_count += 1;
                    removed_bytes += upload.size;
                    sqlx::query("DELETE FROM attachment_records WHERE relative_path = ?")
                        .bind(&upload.relative_path)
                        .execute(&self.pool)
                        .await?;
                }
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                    sqlx::query("DELETE FROM attachment_records WHERE relative_path = ?")
                        .bind(&upload.relative_path)
                        .execute(&self.pool)
                        .await?;
                }
                Err(error) => return Err(AppError::Internal(error.to_string())),
            }
        }

        Ok(AttachmentCleanupResult {
            removed_count,
            removed_bytes,
            kept_count,
            summary: self.attachment_maintenance_summary().await?,
        })
    }

    pub async fn list_uploads_for_backup(&self) -> AppResult<Vec<UploadBackup>> {
        let mut uploads = Vec::new();
        let mut attachment_filenames = HashSet::new();
        for directory in [ATTACHMENT_DIR, LEGACY_UPLOAD_DIR] {
            let upload_dir = self.app_dir.join(directory);
            if tokio::fs::metadata(&upload_dir).await.is_err() {
                continue;
            }

            let mut read_dir = tokio::fs::read_dir(&upload_dir)
                .await
                .map_err(|error| AppError::Internal(error.to_string()))?;
            while let Some(entry) = read_dir
                .next_entry()
                .await
                .map_err(|error| AppError::Internal(error.to_string()))?
            {
                let metadata = entry
                    .metadata()
                    .await
                    .map_err(|error| AppError::Internal(error.to_string()))?;
                if !metadata.is_file() {
                    continue;
                }
                let filename = entry.file_name().to_string_lossy().to_string();
                if directory == LEGACY_UPLOAD_DIR && attachment_filenames.contains(&filename) {
                    continue;
                }
                let bytes = tokio::fs::read(entry.path())
                    .await
                    .map_err(|error| AppError::Internal(error.to_string()))?;
                let relative_path = format!("{directory}/{filename}");
                if directory == ATTACHMENT_DIR {
                    attachment_filenames.insert(filename.clone());
                }
                uploads.push(UploadBackup {
                    relative_path,
                    absolute_path: entry.path().to_string_lossy().to_string(),
                    filename,
                    sha256: sha256_hex(&bytes),
                    bytes,
                });
            }
        }
        uploads.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
        Ok(uploads)
    }

    pub async fn open_upload(&self, relative_path: String) -> AppResult<()> {
        let mut path = self.upload_file_path(&relative_path)?;
        if tokio::fs::metadata(&path).await.is_err()
            && let Some(filename) = relative_path.strip_prefix(&format!("{LEGACY_UPLOAD_DIR}/"))
        {
            let fallback_relative_path = Self::attachment_relative_path(filename);
            let fallback_path = self.upload_file_path(&fallback_relative_path)?;
            if tokio::fs::metadata(&fallback_path).await.is_ok() {
                path = fallback_path;
            }
        }
        let canonical_path = tokio::fs::canonicalize(&path)
            .await
            .map_err(|_| AppError::NotFound("Upload not found".to_string()))?;
        let mut inside_allowed_directory = false;
        for directory in [ATTACHMENT_DIR, LEGACY_UPLOAD_DIR] {
            if let Ok(canonical_dir) = tokio::fs::canonicalize(self.app_dir.join(directory)).await
                && canonical_path.starts_with(&canonical_dir)
            {
                inside_allowed_directory = true;
                break;
            }
        }
        if !inside_allowed_directory {
            return Err(AppError::BadRequest("Invalid upload path".to_string()));
        }

        let metadata = tokio::fs::metadata(&canonical_path)
            .await
            .map_err(|_| AppError::NotFound("Upload not found".to_string()))?;
        if !metadata.is_file() {
            return Err(AppError::BadRequest(
                "Upload path is not a file".to_string(),
            ));
        }
        open_with_system(&canonical_path)
    }

    pub async fn sync_daily_markdown_file(&self, date: String) -> AppResult<DailyMarkdownFile> {
        let date = validate_date(&date)?;
        self.import_daily_markdown_if_changed(&date).await?;
        self.write_daily_markdown_file(&date).await
    }

    pub async fn open_daily_markdown(&self, date: String) -> AppResult<DailyMarkdownFile> {
        let file = self.sync_daily_markdown_file(date).await?;
        open_with_system(Path::new(&file.absolute_path))?;
        Ok(file)
    }

    pub async fn sync_future_markdown_files(&self) -> AppResult<Vec<DailyMarkdownFile>> {
        self.import_future_markdown_files_if_changed().await?;
        self.write_future_markdown_files().await
    }

    pub async fn open_markdown_workspace(&self) -> AppResult<MarkdownWorkspace> {
        let workspace = self.get_markdown_workspace().await?;
        tokio::fs::create_dir_all(&workspace.absolute_path)
            .await
            .map_err(|error| AppError::Internal(error.to_string()))?;
        open_with_system(Path::new(&workspace.absolute_path))?;
        Ok(workspace)
    }

    pub async fn export_markdown_archive(&self) -> AppResult<Vec<u8>> {
        let entries = self.get_all_entries_for_backup().await?;
        let uploads = self.list_uploads_for_backup().await?;
        let markdown_files = entries_to_obsidian_markdown_files(&entries, &uploads);

        let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
        let options = SimpleFileOptions::default();
        for (path, markdown) in markdown_files {
            zip.start_file(path, options)
                .map_err(|error| AppError::Internal(error.to_string()))?;
            zip.write_all(markdown.as_bytes())
                .map_err(|error| AppError::Internal(error.to_string()))?;
        }
        for upload in uploads {
            let filename = Path::new(&upload.relative_path)
                .file_name()
                .and_then(|value| value.to_str())
                .ok_or_else(|| AppError::Internal("Invalid upload filename".to_string()))?;
            zip.start_file(format!("Daily/attachments/{filename}"), options)
                .map_err(|error| AppError::Internal(error.to_string()))?;
            zip.write_all(&upload.bytes)
                .map_err(|error| AppError::Internal(error.to_string()))?;
        }
        zip.finish()
            .map(|cursor| cursor.into_inner())
            .map_err(|error| AppError::Internal(error.to_string()))
    }

    pub async fn get_range_overview(
        &self,
        start_date: String,
        end_date: String,
        include_archived: bool,
    ) -> AppResult<Vec<serde_json::Value>> {
        let start_date = validate_date(&start_date)?;
        let end_date = validate_date(&end_date)?;
        let archive_filter = if include_archived {
            ""
        } else {
            " AND archived_at IS NULL"
        };
        let rows = sqlx::query(&format!(
            r#"
            SELECT id, target_date, entry_type, status
            FROM entries
            WHERE owner_id = ?
              AND target_date >= ?
              AND target_date <= ?
              AND status NOT IN ('forward', 'future')
              {archive_filter}
            ORDER BY target_date ASC, position ASC
            "#
        ))
        .bind(self.owner_id)
        .bind(start_date)
        .bind(end_date)
        .fetch_all(&self.pool)
        .await?;
        rows.into_iter()
            .map(|row| {
                Ok(serde_json::json!({
                    "id": row.try_get::<String, _>("id")?,
                    "target_date": row.try_get::<String, _>("target_date")?,
                    "entry_type": row.try_get::<String, _>("entry_type")?,
                    "status": row.try_get::<String, _>("status")?,
                }))
            })
            .collect()
    }

    async fn search_candidates(&self, options: &SearchOptions) -> AppResult<Vec<Entry>> {
        let mut sql = format!("{ENTRY_SELECT} WHERE owner_id = ?");
        let mut bindings = Vec::new();
        if !options.include_archived {
            sql.push_str(" AND status NOT IN ('forward', 'future')");
            sql.push_str(" AND archived_at IS NULL");
        }
        let entry_types: Vec<String> = options
            .entry_type
            .iter()
            .filter_map(|value| validate_entry_type(value).ok())
            .collect();
        if !entry_types.is_empty() {
            sql.push_str(&format!(
                " AND entry_type IN ({})",
                vec!["?"; entry_types.len()].join(", ")
            ));
            bindings.extend(entry_types);
        }
        if let Some(start_date) = options.start_date.as_deref() {
            sql.push_str(" AND target_date >= ?");
            bindings.push(validate_date(start_date)?);
        }
        if let Some(end_date) = options.end_date.as_deref() {
            sql.push_str(" AND target_date <= ?");
            bindings.push(validate_date(end_date)?);
        }
        sql.push_str(" ORDER BY target_date DESC, created_at DESC");
        let mut query = sqlx::query_as::<_, Entry>(&sql).bind(self.owner_id);
        for binding in bindings {
            query = query.bind(binding);
        }
        let entries = query.fetch_all(&self.pool).await?;
        let tag_filters = normalize_tags(options.tags.clone());
        if tag_filters.is_empty() {
            return Ok(entries);
        }
        let wanted: HashSet<String> = tag_filters
            .into_iter()
            .map(|tag| tag.to_lowercase())
            .collect();
        let mut filtered = Vec::new();
        for entry in entries {
            let entry_tags: HashSet<String> = self
                .get_entry_tags(&entry.id)
                .await?
                .into_iter()
                .map(|tag| tag.to_lowercase())
                .collect();
            if wanted.iter().all(|tag| entry_tags.contains(tag)) {
                filtered.push(entry);
            }
        }
        Ok(filtered)
    }

    async fn semantic_search(
        &self,
        candidates: Vec<Entry>,
        query: &str,
        limit: usize,
    ) -> AppResult<Vec<SearchResult>> {
        let query_embedding = embed_text(query);
        let ids: HashSet<String> = candidates.iter().map(|entry| entry.id.clone()).collect();
        let entry_map: HashMap<String, Entry> = candidates
            .into_iter()
            .map(|entry| (entry.id.clone(), entry))
            .collect();
        let chunks = sqlx::query(
            r#"
            SELECT entry_id, chunk_text, embedding_json
            FROM search_chunks
            WHERE owner_id = ?
            "#,
        )
        .bind(self.owner_id)
        .fetch_all(&self.pool)
        .await?;

        let mut best: HashMap<String, (f32, String)> = HashMap::new();
        for row in chunks {
            let entry_id: String = row.try_get("entry_id")?;
            if !ids.contains(&entry_id) {
                continue;
            }
            let embedding_json: String = row.try_get("embedding_json")?;
            let embedding: Vec<f32> = serde_json::from_str(&embedding_json).unwrap_or_default();
            let score = dot(&query_embedding, &embedding);
            if score <= 0.0 {
                continue;
            }
            let chunk_text: String = row.try_get("chunk_text")?;
            let current = best.entry(entry_id).or_insert((score, chunk_text.clone()));
            if score > current.0 {
                *current = (score, chunk_text);
            }
        }

        let mut ranked: Vec<(Entry, f32, String)> = best
            .into_iter()
            .filter_map(|(entry_id, (score, chunk))| {
                entry_map
                    .get(&entry_id)
                    .cloned()
                    .map(|entry| (entry, score, chunk))
            })
            .collect();
        ranked.sort_by(|a, b| b.1.total_cmp(&a.1));
        ranked.truncate(limit);

        let mut results = Vec::with_capacity(ranked.len());
        for (entry, score, chunk) in ranked {
            results.push(SearchResult {
                snippet: snippet(&chunk, query),
                entry: self.response_from_entry(entry).await?,
                score,
                match_type: "semantic".to_string(),
            });
        }
        Ok(results)
    }

    async fn create_migration_child(
        &self,
        source: &mut Entry,
        target_date: Option<&str>,
        target_month: Option<&str>,
    ) -> AppResult<Entry> {
        let chain_root_id = source
            .chain_root_id
            .clone()
            .unwrap_or_else(|| source.id.clone());
        source.chain_root_id = Some(chain_root_id.clone());
        let child = Entry {
            id: Uuid::new_v4().to_string(),
            content: source.content.clone(),
            entry_type: source.entry_type.clone(),
            status: STATUS_OPEN.to_string(),
            created_at: now_string(),
            target_date: target_date.map(str::to_string),
            target_month: target_month.map(str::to_string),
            is_future: i64::from(target_date.is_none()),
            source_entry_id: Some(source.id.clone()),
            owner_id: self.owner_id,
            position: 0,
            from_date: source
                .target_date
                .clone()
                .or_else(|| Some(source.created_at[0..10].to_string())),
            migrated_to_date: None,
            migrated_to_month: None,
            archived_at: None,
            chain_root_id: Some(chain_root_id),
            migrated_to_entry_id: None,
        };
        self.insert_entry(&child).await?;
        self.set_entry_tags(&child.id, self.get_entry_tags(&source.id).await?)
            .await?;
        Ok(child)
    }

    async fn collect_and_delete_children(
        &self,
        entry_id: &str,
    ) -> AppResult<Vec<DeletedEntryInfo>> {
        let mut deleted = Vec::new();
        let mut current = self.fetch_entry(entry_id).await?;
        let mut seen = HashSet::new();

        while let Some(next_id) = current.migrated_to_entry_id.clone() {
            if !seen.insert(next_id.clone()) {
                return Err(AppError::BadRequest(
                    "Migration chain contains a cycle".to_string(),
                ));
            }
            let child = self.fetch_entry(&next_id).await?;
            deleted.push(DeletedEntryInfo {
                id: child.id.clone(),
                target_date: child.target_date.clone(),
                month: child
                    .target_month
                    .clone()
                    .or(child.migrated_to_month.clone()),
            });
            self.delete_entry_row(&child.id).await?;
            current = child;
            if deleted.len() > 128 {
                return Err(AppError::BadRequest(
                    "Migration chain is too deep".to_string(),
                ));
            }
        }

        Ok(deleted)
    }

    async fn response_from_entry(&self, entry: Entry) -> AppResult<EntryResponse> {
        let tags = self.get_entry_tags(&entry.id).await?;
        let mut response = EntryResponse::from(entry);
        response.tags = tags;
        if let Some(next_id) = response.migrated_to_entry_id.clone() {
            response.migrated_to_archived_at = sqlx::query_scalar::<_, Option<String>>(
                "SELECT archived_at FROM entries WHERE id = ? AND owner_id = ?",
            )
            .bind(next_id)
            .bind(self.owner_id)
            .fetch_optional(&self.pool)
            .await?
            .flatten();
        }
        Ok(response)
    }

    async fn restore_parent_after_child_removal(
        &self,
        parent_id: &str,
        child_id: &str,
    ) -> AppResult<()> {
        let mut parent = self.fetch_entry(parent_id).await?;
        if parent.migrated_to_entry_id.as_deref() != Some(child_id) {
            return Ok(());
        }

        parent.status = STATUS_OPEN.to_string();
        parent.migrated_to_date = None;
        parent.migrated_to_month = None;
        parent.migrated_to_entry_id = None;
        parent.target_month = None;
        parent.is_future = 0;
        normalize_entry_state(&mut parent);
        self.save_entry(&parent).await?;
        self.index_entry(&parent).await?;
        Ok(())
    }

    async fn responses_from_entries(&self, entries: Vec<Entry>) -> AppResult<Vec<EntryResponse>> {
        let mut responses = Vec::with_capacity(entries.len());
        for entry in entries {
            responses.push(self.response_from_entry(entry).await?);
        }
        Ok(responses)
    }

    async fn get_entry_tags(&self, entry_id: &str) -> AppResult<Vec<String>> {
        let rows = sqlx::query(
            r#"
            SELECT tags.name AS name
            FROM entry_tags
            JOIN tags ON tags.id = entry_tags.tag_id
            WHERE entry_tags.owner_id = ? AND entry_tags.entry_id = ?
            ORDER BY entry_tags.position ASC, tags.name ASC
            "#,
        )
        .bind(self.owner_id)
        .bind(entry_id)
        .fetch_all(&self.pool)
        .await?;
        rows.into_iter()
            .map(|row| row.try_get::<String, _>("name").map_err(AppError::from))
            .collect()
    }

    async fn set_entry_tags(&self, entry_id: &str, tags: Vec<String>) -> AppResult<()> {
        let tags = normalize_tags(tags);
        sqlx::query("DELETE FROM entry_tags WHERE owner_id = ? AND entry_id = ?")
            .bind(self.owner_id)
            .bind(entry_id)
            .execute(&self.pool)
            .await?;
        for (position, tag) in tags.into_iter().enumerate() {
            let tag_id = self.ensure_tag(&tag).await?;
            sqlx::query(
                r#"
                INSERT OR REPLACE INTO entry_tags(entry_id, tag_id, owner_id, position)
                VALUES (?, ?, ?, ?)
                "#,
            )
            .bind(entry_id)
            .bind(tag_id)
            .bind(self.owner_id)
            .bind(position as i64)
            .execute(&self.pool)
            .await?;
        }
        Ok(())
    }

    async fn ensure_tag(&self, tag: &str) -> AppResult<i64> {
        if let Some(existing) = sqlx::query_scalar(
            "SELECT id FROM tags WHERE owner_id = ? AND lower(name) = lower(?) ORDER BY id LIMIT 1",
        )
        .bind(self.owner_id)
        .bind(tag)
        .fetch_optional(&self.pool)
        .await?
        {
            return Ok(existing);
        }
        sqlx::query("INSERT OR IGNORE INTO tags(owner_id, name, created_at) VALUES (?, ?, ?)")
            .bind(self.owner_id)
            .bind(tag)
            .bind(now_string())
            .execute(&self.pool)
            .await?;
        sqlx::query_scalar("SELECT id FROM tags WHERE owner_id = ? AND name = ?")
            .bind(self.owner_id)
            .bind(tag)
            .fetch_one(&self.pool)
            .await
            .map_err(AppError::from)
    }

    async fn delete_entry_row(&self, id: &str) -> AppResult<()> {
        sqlx::query("DELETE FROM entries WHERE id = ? AND owner_id = ?")
            .bind(id)
            .bind(self.owner_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn fetch_entry(&self, id: &str) -> AppResult<Entry> {
        sqlx::query_as::<_, Entry>(&format!("{ENTRY_SELECT} WHERE id = ? AND owner_id = ?"))
            .bind(id)
            .bind(self.owner_id)
            .fetch_optional(&self.pool)
            .await?
            .ok_or_else(|| AppError::NotFound("Entry not found".to_string()))
    }

    async fn save_entry(&self, entry: &Entry) -> AppResult<()> {
        sqlx::query(
            r#"
            UPDATE entries SET
                content = ?, entry_type = ?, status = ?, target_date = ?,
                target_month = ?, is_future = ?, source_entry_id = ?,
                position = ?, from_date = ?, migrated_to_date = ?,
                migrated_to_month = ?, archived_at = ?, chain_root_id = ?,
                migrated_to_entry_id = ?
            WHERE id = ? AND owner_id = ?
            "#,
        )
        .bind(&entry.content)
        .bind(&entry.entry_type)
        .bind(&entry.status)
        .bind(&entry.target_date)
        .bind(&entry.target_month)
        .bind(entry.is_future)
        .bind(&entry.source_entry_id)
        .bind(entry.position)
        .bind(&entry.from_date)
        .bind(&entry.migrated_to_date)
        .bind(&entry.migrated_to_month)
        .bind(&entry.archived_at)
        .bind(&entry.chain_root_id)
        .bind(&entry.migrated_to_entry_id)
        .bind(&entry.id)
        .bind(entry.owner_id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn insert_entry(&self, entry: &Entry) -> AppResult<()> {
        sqlx::query(
            r#"
            INSERT INTO entries(
                id, content, entry_type, status, created_at, target_date,
                target_month, is_future, source_entry_id, owner_id, position,
                from_date, migrated_to_date, migrated_to_month, archived_at,
                chain_root_id, migrated_to_entry_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&entry.id)
        .bind(&entry.content)
        .bind(&entry.entry_type)
        .bind(&entry.status)
        .bind(&entry.created_at)
        .bind(&entry.target_date)
        .bind(&entry.target_month)
        .bind(entry.is_future)
        .bind(&entry.source_entry_id)
        .bind(entry.owner_id)
        .bind(entry.position)
        .bind(&entry.from_date)
        .bind(&entry.migrated_to_date)
        .bind(&entry.migrated_to_month)
        .bind(&entry.archived_at)
        .bind(&entry.chain_root_id)
        .bind(&entry.migrated_to_entry_id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn index_entry(&self, entry: &Entry) -> AppResult<()> {
        sqlx::query("DELETE FROM search_chunks WHERE entry_id = ? AND owner_id = ?")
            .bind(&entry.id)
            .bind(self.owner_id)
            .execute(&self.pool)
            .await?;
        let text = clean_markdown(&entry.content);
        if text.trim().is_empty() {
            return Ok(());
        }
        let embedding_json = serde_json::to_string(&embed_text(&text))
            .map_err(|error| AppError::Internal(error.to_string()))?;
        sqlx::query(
            r#"
            INSERT INTO search_chunks(entry_id, owner_id, chunk_text, embedding_json, updated_at)
            VALUES (?, ?, ?, ?, ?)
            "#,
        )
        .bind(&entry.id)
        .bind(self.owner_id)
        .bind(text)
        .bind(embedding_json)
        .bind(now_string())
        .execute(&self.pool)
        .await?;
        Ok(())
    }
}

async fn ensure_local_user(pool: &SqlitePool) -> AppResult<i64> {
    if let Some(id) = sqlx::query_scalar::<_, i64>("SELECT id FROM users WHERE username = ?")
        .bind(LOCAL_USERNAME)
        .fetch_optional(pool)
        .await?
    {
        return Ok(id);
    }
    let result = sqlx::query("INSERT INTO users(username, hashed_password) VALUES (?, ?)")
        .bind(LOCAL_USERNAME)
        .bind(LOCAL_PASSWORD_PLACEHOLDER)
        .execute(pool)
        .await?;
    Ok(result.last_insert_rowid())
}

async fn adopt_legacy_entries_to_local_owner(pool: &SqlitePool, owner_id: i64) -> AppResult<()> {
    sqlx::query("UPDATE entries SET owner_id = ? WHERE owner_id != ?")
        .bind(owner_id)
        .bind(owner_id)
        .execute(pool)
        .await?;
    sqlx::query("UPDATE search_chunks SET owner_id = ? WHERE owner_id != ?")
        .bind(owner_id)
        .bind(owner_id)
        .execute(pool)
        .await?;

    let legacy_tags = sqlx::query("SELECT id, name FROM tags WHERE owner_id != ?")
        .bind(owner_id)
        .fetch_all(pool)
        .await?;
    for row in legacy_tags {
        let legacy_id: i64 = row.try_get("id")?;
        let name: String = row.try_get("name")?;
        sqlx::query("INSERT OR IGNORE INTO tags(owner_id, name, created_at) VALUES (?, ?, ?)")
            .bind(owner_id)
            .bind(&name)
            .bind(now_string())
            .execute(pool)
            .await?;
        let local_id: i64 =
            sqlx::query_scalar("SELECT id FROM tags WHERE owner_id = ? AND name = ?")
                .bind(owner_id)
                .bind(&name)
                .fetch_one(pool)
                .await?;
        sqlx::query("UPDATE OR IGNORE entry_tags SET tag_id = ?, owner_id = ? WHERE tag_id = ?")
            .bind(local_id)
            .bind(owner_id)
            .bind(legacy_id)
            .execute(pool)
            .await?;
    }
    sqlx::query("UPDATE entry_tags SET owner_id = ? WHERE owner_id != ?")
        .bind(owner_id)
        .bind(owner_id)
        .execute(pool)
        .await?;
    sqlx::query("DELETE FROM tags WHERE owner_id != ?")
        .bind(owner_id)
        .execute(pool)
        .await?;
    Ok(())
}

async fn repair_migration_chains(pool: &SqlitePool, owner_id: i64) -> AppResult<()> {
    let rows = sqlx::query(
        r#"
        SELECT id, source_entry_id
        FROM entries
        WHERE owner_id = ?
        ORDER BY created_at ASC
        "#,
    )
    .bind(owner_id)
    .fetch_all(pool)
    .await?;

    let mut sources: HashMap<String, Option<String>> = HashMap::new();
    let mut children_by_parent: HashMap<String, Vec<String>> = HashMap::new();
    for row in rows {
        let id: String = row.try_get("id")?;
        let source_entry_id: Option<String> = row.try_get("source_entry_id")?;
        if let Some(parent_id) = source_entry_id.clone() {
            children_by_parent
                .entry(parent_id)
                .or_default()
                .push(id.clone());
        }
        sources.insert(id, source_entry_id);
    }

    for (parent_id, children) in &children_by_parent {
        let current_child: Option<String> = sqlx::query_scalar(
            "SELECT migrated_to_entry_id FROM entries WHERE id = ? AND owner_id = ?",
        )
        .bind(parent_id)
        .bind(owner_id)
        .fetch_optional(pool)
        .await?
        .flatten();
        let current_valid = current_child
            .as_ref()
            .is_some_and(|child_id| children.iter().any(|child| child == child_id));
        if !current_valid {
            sqlx::query(
                "UPDATE entries SET migrated_to_entry_id = ? WHERE id = ? AND owner_id = ?",
            )
            .bind(children.first())
            .bind(parent_id)
            .bind(owner_id)
            .execute(pool)
            .await?;
        }
    }

    for id in sources.keys() {
        let root_id = migration_root_for(id, &sources);
        sqlx::query("UPDATE entries SET chain_root_id = ? WHERE id = ? AND owner_id = ?")
            .bind(root_id)
            .bind(id)
            .bind(owner_id)
            .execute(pool)
            .await?;
    }
    Ok(())
}

fn migration_root_for(id: &str, sources: &HashMap<String, Option<String>>) -> String {
    let mut current = id.to_string();
    let mut seen = HashSet::new();
    while seen.insert(current.clone()) {
        let Some(Some(parent_id)) = sources.get(&current) else {
            break;
        };
        if !sources.contains_key(parent_id) {
            break;
        }
        current = parent_id.clone();
    }
    current
}

fn normalize_new_entry_target(
    target_date: Option<&str>,
    target_month: Option<&str>,
    is_future: bool,
) -> AppResult<(Option<String>, Option<String>, i64)> {
    if let Some(target_date) = target_date.filter(|value| !value.trim().is_empty()) {
        Ok((Some(validate_date(target_date)?), None, 0))
    } else if let Some(target_month) = target_month.filter(|value| !value.trim().is_empty()) {
        Ok((None, Some(validate_month(target_month)?), 1))
    } else if is_future {
        Ok((None, None, 1))
    } else {
        Ok((Some(today_string()), None, 0))
    }
}

fn normalize_entry_state(entry: &mut Entry) {
    match entry.status.as_str() {
        STATUS_MIGRATED_FORWARD => {
            entry.is_future = 0;
            entry.target_month = None;
            entry.migrated_to_month = None;
        }
        STATUS_MIGRATED_FUTURE => {
            entry.is_future = 0;
            entry.migrated_to_date = None;
            entry.target_month = None;
        }
        _ => {
            entry.migrated_to_date = None;
            entry.migrated_to_month = None;
            if entry.target_date.is_some() {
                entry.target_month = None;
                entry.is_future = 0;
            } else if entry.target_month.is_some() || entry.is_future != 0 {
                entry.target_date = None;
                entry.is_future = 1;
            }
        }
    }
}

fn entry_affects_future_markdown(entry: &Entry) -> bool {
    entry.is_future != 0 || entry.target_month.is_some()
}

fn response_affects_future_markdown(entry: &EntryResponse) -> bool {
    entry.is_future || entry.target_month.is_some()
}

fn normalize_import_entry(item: EntryExportSchema, owner_id: i64) -> AppResult<Entry> {
    let mut entry = Entry {
        id: if item.id.trim().is_empty() {
            Uuid::new_v4().to_string()
        } else {
            item.id
        },
        content: item.content.unwrap_or_default(),
        entry_type: validate_entry_type(&item.entry_type)?,
        status: validate_status(&item.status)?,
        created_at: normalize_datetime_string(&item.created_at),
        target_date: item.target_date.as_deref().map(validate_date).transpose()?,
        target_month: item
            .target_month
            .as_deref()
            .map(validate_month)
            .transpose()?,
        is_future: i64::from(item.is_future),
        source_entry_id: item.source_entry_id,
        owner_id,
        position: item.position.unwrap_or(0).max(0),
        from_date: item.from_date.as_deref().map(validate_date).transpose()?,
        migrated_to_date: item
            .migrated_to_date
            .as_deref()
            .map(validate_date)
            .transpose()?,
        migrated_to_month: item
            .migrated_to_month
            .as_deref()
            .map(validate_month)
            .transpose()?,
        archived_at: item.archived_at,
        chain_root_id: item.chain_root_id,
        migrated_to_entry_id: item.migrated_to_entry_id,
    };
    normalize_entry_state(&mut entry);
    Ok(entry)
}

fn export_schema_from_entry(entry: Entry, tags: Vec<String>) -> EntryExportSchema {
    EntryExportSchema {
        id: entry.id,
        content: Some(entry.content),
        entry_type: entry.entry_type,
        status: entry.status,
        tags,
        created_at: entry.created_at,
        target_date: entry.target_date,
        target_month: entry.target_month,
        is_future: entry.is_future != 0,
        source_entry_id: entry.source_entry_id,
        position: Some(entry.position),
        from_date: entry.from_date,
        migrated_to_date: entry.migrated_to_date,
        migrated_to_month: entry.migrated_to_month,
        archived_at: entry.archived_at,
        chain_root_id: entry.chain_root_id,
        migrated_to_entry_id: entry.migrated_to_entry_id,
    }
}

fn validate_entry_type(value: &str) -> AppResult<String> {
    let value = value.trim().to_ascii_lowercase();
    if matches!(value.as_str(), TYPE_TASK | TYPE_IDEA | TYPE_EVENT) {
        Ok(value)
    } else {
        Err(AppError::BadRequest("Invalid entry_type".to_string()))
    }
}

fn validate_status(value: &str) -> AppResult<String> {
    let value = value.trim().to_ascii_lowercase();
    if matches!(
        value.as_str(),
        STATUS_OPEN
            | STATUS_COMPLETED
            | STATUS_CANCELLED
            | STATUS_MIGRATED_FORWARD
            | STATUS_MIGRATED_FUTURE
    ) {
        Ok(value)
    } else {
        Err(AppError::BadRequest("Invalid status".to_string()))
    }
}

fn validate_date(value: &str) -> AppResult<String> {
    let value = value.trim();
    let value = value.get(0..10).unwrap_or(value);
    chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map(|date| date.format("%Y-%m-%d").to_string())
        .map_err(|_| AppError::BadRequest("Invalid date, expected YYYY-MM-DD".to_string()))
}

fn validate_month(value: &str) -> AppResult<String> {
    let value = value.trim();
    let value = value.get(0..7).unwrap_or(value);
    let date = format!("{value}-01");
    chrono::NaiveDate::parse_from_str(&date, "%Y-%m-%d")
        .map(|date| date.format("%Y-%m").to_string())
        .map_err(|_| AppError::BadRequest("Invalid month, expected YYYY-MM".to_string()))
}

fn now_string() -> String {
    chrono::Local::now()
        .naive_local()
        .format("%Y-%m-%d %H:%M:%S")
        .to_string()
}

fn today_string() -> String {
    chrono::Local::now()
        .date_naive()
        .format("%Y-%m-%d")
        .to_string()
}

fn normalize_datetime_string(value: &str) -> String {
    if value.trim().len() == 10 {
        format!("{} 00:00:00", value.trim())
    } else if value.trim().is_empty() {
        now_string()
    } else {
        value.trim().replace('T', " ")
    }
}

fn sanitized_extension(file_name: &str) -> String {
    Path::new(file_name)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| {
            ext.chars()
                .filter(|ch| ch.is_ascii_alphanumeric())
                .take(12)
                .collect::<String>()
                .to_ascii_lowercase()
        })
        .unwrap_or_default()
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

fn daily_markdown_relative_path(date: &str) -> String {
    let year = date.get(0..4).unwrap_or("unknown");
    let month = date.get(5..7).unwrap_or("unknown");
    format!("Daily/{year}/{month}/{date}.md")
}

fn legacy_daily_markdown_relative_paths(date: &str) -> Vec<String> {
    let month = date.get(0..7).unwrap_or("unknown");
    vec![
        format!("Daily/{month}/{date}.md"),
        format!("Daily/{date}.md"),
    ]
}

fn future_markdown_relative_path(target_month: Option<&str>) -> String {
    if let Some(target_month) = target_month {
        let year = target_month.get(0..4).unwrap_or("unknown");
        let month = target_month.get(5..7).unwrap_or("unknown");
        format!("Future/{year}/{month}.md")
    } else {
        "Future/Future.md".to_string()
    }
}

fn future_markdown_sync_key(target_month: Option<&str>) -> String {
    target_month
        .map(|month| format!("future:{month}"))
        .unwrap_or_else(|| FUTURE_MARKDOWN_SOMEDAY_KEY.to_string())
}

#[derive(Debug, Clone)]
struct RenderedDailyMarkdown {
    markdown: String,
    entry_lines: Vec<RenderedDailyMarkdownLine>,
}

#[derive(Debug, Clone)]
struct RenderedDailyMarkdownLine {
    entry_id: String,
    line_hash: String,
    position: i64,
}

#[derive(Debug, Clone)]
struct DailyMarkdownEntryState {
    entry_id: String,
    line_hash: String,
    position: i64,
}

#[derive(Debug, Clone)]
struct ParsedDailyMarkdownEntry {
    content: String,
    entry_type: String,
    status: String,
    tags: Vec<String>,
    line_hash: String,
    is_migration_pointer: bool,
}

#[derive(Debug, Clone)]
struct DailyMarkdownMatchResult {
    matched_ids: Vec<Option<String>>,
    retained_ids: HashSet<String>,
}

fn render_daily_markdown_file(date: &str, entries: &[EntryResponse]) -> RenderedDailyMarkdown {
    render_markdown_entry_file(date, entries)
}

fn render_markdown_entry_file(title: &str, entries: &[EntryResponse]) -> RenderedDailyMarkdown {
    let mut markdown = format!("# {title}\n\n");
    let mut entry_lines = Vec::new();
    for (position, entry) in entries.iter().enumerate() {
        let line = render_daily_markdown_entry(entry);
        entry_lines.push(RenderedDailyMarkdownLine {
            entry_id: entry.id.clone(),
            line_hash: daily_markdown_entry_hash_from_response(entry),
            position: position as i64,
        });
        markdown.push_str(&line);
        markdown.push('\n');
    }
    RenderedDailyMarkdown {
        markdown,
        entry_lines,
    }
}

fn render_daily_markdown_entry(entry: &EntryResponse) -> String {
    if matches!(
        entry.status.as_str(),
        STATUS_MIGRATED_FORWARD | STATUS_MIGRATED_FUTURE
    ) {
        return format!("- {}\n", daily_markdown_migration_target(entry));
    }
    let marker = match entry.entry_type.as_str() {
        TYPE_TASK if entry.status == STATUS_COMPLETED => "- [x]",
        TYPE_TASK => "- [ ]",
        TYPE_EVENT => "- o",
        _ => "-",
    };
    let status = if matches!(entry.status.as_str(), STATUS_OPEN | STATUS_COMPLETED) {
        String::new()
    } else {
        format!(" ({})", entry.status)
    };
    let tags = if entry.tags.is_empty() {
        String::new()
    } else {
        format!(
            "\nTags: {}",
            entry
                .tags
                .iter()
                .map(|tag| format!("#{tag}"))
                .collect::<Vec<_>>()
                .join(" ")
        )
    };
    let content = format_multiline_daily_content(&entry.content);
    format!("{marker} {content}{status}{tags}\n")
}

fn daily_markdown_entry_hash_from_response(entry: &EntryResponse) -> String {
    if matches!(
        entry.status.as_str(),
        STATUS_MIGRATED_FORWARD | STATUS_MIGRATED_FUTURE
    ) {
        return daily_markdown_entry_fingerprint(
            "migration",
            entry.status.as_str(),
            &daily_markdown_migration_target(entry),
            &[],
            true,
        );
    }
    daily_markdown_entry_fingerprint(
        entry.entry_type.as_str(),
        entry.status.as_str(),
        &entry.content,
        &entry.tags,
        false,
    )
}

fn daily_markdown_entry_fingerprint(
    entry_type: &str,
    status: &str,
    content: &str,
    tags: &[String],
    is_migration_pointer: bool,
) -> String {
    let normalized_entry_type = if is_migration_pointer {
        "migration"
    } else {
        entry_type
    };
    let normalized_status = if is_migration_pointer {
        daily_markdown_migration_pointer_status(content).unwrap_or(status)
    } else {
        status
    };
    let normalized_content = normalize_daily_markdown_content_for_hash(content);
    let normalized_tags = normalize_tags(tags.to_vec()).join(",");
    sha256_hex(
        format!(
            "{normalized_entry_type}\n{normalized_status}\n{is_migration_pointer}\n{normalized_content}\n{normalized_tags}"
        )
        .as_bytes(),
    )
}

fn normalize_daily_markdown_content_for_hash(content: &str) -> String {
    content
        .replace("\r\n", "\n")
        .replace('\r', "\n")
        .lines()
        .map(str::trim_end)
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}

fn daily_markdown_migration_pointer_status(content: &str) -> Option<&'static str> {
    let content = content.trim();
    if content.starts_with("Migrated to [[Daily/") {
        Some(STATUS_MIGRATED_FORWARD)
    } else if content.starts_with("Migrated to [[Monthly/")
        || content.starts_with("Migrated to [[Future/")
        || content == "Migrated to Future Log"
    {
        Some(STATUS_MIGRATED_FUTURE)
    } else {
        None
    }
}

fn match_daily_markdown_entries(
    sync_rows: &[DailyMarkdownEntryState],
    parsed_entries: &[ParsedDailyMarkdownEntry],
    existing_by_id: &HashMap<String, EntryResponse>,
) -> DailyMarkdownMatchResult {
    let mut old_rows = sync_rows
        .iter()
        .filter(|row| existing_by_id.contains_key(&row.entry_id))
        .collect::<Vec<_>>();
    old_rows.sort_by_key(|row| row.position);
    let mut matches = vec![None; parsed_entries.len()];
    let mut retained_ids = HashSet::new();
    if old_rows.is_empty() || parsed_entries.is_empty() {
        return DailyMarkdownMatchResult {
            matched_ids: matches,
            retained_ids,
        };
    }

    let mut old_used = vec![false; old_rows.len()];
    let mut new_used = vec![false; parsed_entries.len()];
    let mut old_counts: HashMap<String, usize> = HashMap::new();
    let mut new_counts: HashMap<String, usize> = HashMap::new();
    let mut old_unique_index: HashMap<String, usize> = HashMap::new();

    for (index, row) in old_rows.iter().enumerate() {
        *old_counts.entry(row.line_hash.clone()).or_default() += 1;
        old_unique_index.insert(row.line_hash.clone(), index);
    }
    for parsed in parsed_entries {
        *new_counts.entry(parsed.line_hash.clone()).or_default() += 1;
    }

    let mut assigned_pairs = Vec::new();
    for (new_index, parsed) in parsed_entries.iter().enumerate() {
        if old_counts.get(&parsed.line_hash) == Some(&1)
            && new_counts.get(&parsed.line_hash) == Some(&1)
            && let Some(old_index) = old_unique_index.get(&parsed.line_hash).copied()
        {
            matches[new_index] = Some(old_rows[old_index].entry_id.clone());
            old_used[old_index] = true;
            new_used[new_index] = true;
            assigned_pairs.push((old_index, new_index));
        }
    }

    let lcs_pairs = lcs_daily_markdown_hash_pairs(&old_rows, parsed_entries, &old_used, &new_used);
    for (old_index, new_index) in lcs_pairs {
        if old_used[old_index] || new_used[new_index] {
            continue;
        }
        matches[new_index] = Some(old_rows[old_index].entry_id.clone());
        old_used[old_index] = true;
        new_used[new_index] = true;
        assigned_pairs.push((old_index, new_index));
    }

    assigned_pairs.sort_by_key(|(old_index, _)| *old_index);
    let mut anchors = Vec::new();
    let mut last_new_index = None;
    for pair @ (_, new_index) in assigned_pairs {
        if last_new_index.is_none_or(|last| new_index > last) {
            anchors.push(pair);
            last_new_index = Some(new_index);
        }
    }
    anchors.push((old_rows.len(), parsed_entries.len()));

    let mut previous_old = 0usize;
    let mut previous_new = 0usize;
    for (anchor_old, anchor_new) in anchors {
        let old_segment = (previous_old..anchor_old)
            .filter(|old_index| !old_used[*old_index])
            .collect::<Vec<_>>();
        let new_segment = (previous_new..anchor_new)
            .filter(|new_index| !new_used[*new_index])
            .collect::<Vec<_>>();
        if old_segment.len() == new_segment.len() {
            for (old_index, new_index) in old_segment.into_iter().zip(new_segment) {
                matches[new_index] = Some(old_rows[old_index].entry_id.clone());
                old_used[old_index] = true;
                new_used[new_index] = true;
            }
        } else {
            let segment_pairs = match_changed_daily_markdown_segment(
                &old_rows,
                parsed_entries,
                existing_by_id,
                &old_segment,
                &new_segment,
            );
            for (old_index, new_index) in segment_pairs {
                if old_used[old_index] || new_used[new_index] {
                    continue;
                }
                matches[new_index] = Some(old_rows[old_index].entry_id.clone());
                old_used[old_index] = true;
                new_used[new_index] = true;
            }
            if !new_segment.is_empty() {
                for old_index in old_segment {
                    if !old_used[old_index] {
                        retained_ids.insert(old_rows[old_index].entry_id.clone());
                    }
                }
            }
        }
        previous_old = anchor_old.saturating_add(1);
        previous_new = anchor_new.saturating_add(1);
    }

    DailyMarkdownMatchResult {
        matched_ids: matches,
        retained_ids,
    }
}

fn match_changed_daily_markdown_segment(
    old_rows: &[&DailyMarkdownEntryState],
    parsed_entries: &[ParsedDailyMarkdownEntry],
    existing_by_id: &HashMap<String, EntryResponse>,
    old_segment: &[usize],
    new_segment: &[usize],
) -> Vec<(usize, usize)> {
    let mut pairs = Vec::new();
    let mut used_new = HashSet::new();
    for old_index in old_segment {
        let Some(old_entry) = existing_by_id.get(&old_rows[*old_index].entry_id) else {
            continue;
        };
        let mut best_match = None;
        for new_index in new_segment {
            if used_new.contains(new_index) {
                continue;
            }
            let score = daily_markdown_entry_match_score(
                old_entry,
                &parsed_entries[*new_index],
                *old_index,
                *new_index,
            );
            if best_match.is_none_or(|(_, best_score)| score > best_score) {
                best_match = Some((*new_index, score));
            }
        }
        if let Some((new_index, score)) = best_match
            && score >= 6
        {
            used_new.insert(new_index);
            pairs.push((*old_index, new_index));
        }
    }
    pairs
}

fn daily_markdown_entry_match_score(
    old_entry: &EntryResponse,
    parsed: &ParsedDailyMarkdownEntry,
    old_position: usize,
    new_position: usize,
) -> i64 {
    if parsed.is_migration_pointer
        || matches!(
            old_entry.status.as_str(),
            STATUS_MIGRATED_FORWARD | STATUS_MIGRATED_FUTURE
        )
        || old_entry.entry_type != parsed.entry_type
    {
        return 0;
    }

    let exact_content_match = old_entry.content.trim() == parsed.content.trim();
    let content_overlap_score =
        daily_markdown_content_overlap_score(&old_entry.content, &parsed.content);
    let old_tags = normalize_tags(old_entry.tags.clone());
    let parsed_tags = normalize_tags(parsed.tags.clone());
    let tag_match = old_tags
        .iter()
        .any(|tag| parsed_tags.iter().any(|parsed_tag| parsed_tag == tag));

    if !exact_content_match && content_overlap_score == 0 && !tag_match {
        return 0;
    }

    let mut score = 4;
    if old_entry.status == parsed.status {
        score += 2;
    } else if old_entry.entry_type == TYPE_TASK
        && matches!(old_entry.status.as_str(), STATUS_OPEN | STATUS_COMPLETED)
        && matches!(parsed.status.as_str(), STATUS_OPEN | STATUS_COMPLETED)
    {
        score += 1;
    }
    if old_position == new_position {
        score += 1;
    }
    if exact_content_match {
        score += 4;
    } else {
        score += content_overlap_score;
    }

    if tag_match {
        score += 1;
    }

    score
}

fn daily_markdown_content_overlap_score(old_content: &str, new_content: &str) -> i64 {
    let old_words = old_content
        .split(|ch: char| !ch.is_alphanumeric())
        .filter(|word| word.len() > 2)
        .map(|word| word.to_lowercase())
        .collect::<HashSet<_>>();
    if old_words.is_empty() {
        return 0;
    }
    let overlap = new_content
        .split(|ch: char| !ch.is_alphanumeric())
        .filter(|word| word.len() > 2)
        .map(|word| word.to_lowercase())
        .filter(|word| old_words.contains(word))
        .count();
    overlap.min(3) as i64
}

fn lcs_daily_markdown_hash_pairs(
    old_rows: &[&DailyMarkdownEntryState],
    parsed_entries: &[ParsedDailyMarkdownEntry],
    old_used: &[bool],
    new_used: &[bool],
) -> Vec<(usize, usize)> {
    let old_len = old_rows.len();
    let new_len = parsed_entries.len();
    let mut dp = vec![vec![0usize; new_len + 1]; old_len + 1];
    for old_index in (0..old_len).rev() {
        for new_index in (0..new_len).rev() {
            if !old_used[old_index]
                && !new_used[new_index]
                && old_rows[old_index].line_hash == parsed_entries[new_index].line_hash
            {
                dp[old_index][new_index] = dp[old_index + 1][new_index + 1] + 1;
            } else {
                dp[old_index][new_index] =
                    dp[old_index + 1][new_index].max(dp[old_index][new_index + 1]);
            }
        }
    }

    let mut pairs = Vec::new();
    let mut old_index = 0usize;
    let mut new_index = 0usize;
    while old_index < old_len && new_index < new_len {
        if !old_used[old_index]
            && !new_used[new_index]
            && old_rows[old_index].line_hash == parsed_entries[new_index].line_hash
        {
            pairs.push((old_index, new_index));
            old_index += 1;
            new_index += 1;
        } else if dp[old_index + 1][new_index] >= dp[old_index][new_index + 1] {
            old_index += 1;
        } else {
            new_index += 1;
        }
    }
    pairs
}

fn daily_markdown_migration_target(entry: &EntryResponse) -> String {
    if let Some(date) = entry.migrated_to_date.as_deref() {
        format!(
            "Migrated to [[{}|{date}]]",
            daily_markdown_relative_path(date)
        )
    } else if let Some(month) = entry.migrated_to_month.as_deref() {
        format!(
            "Migrated to [[{}|{month}]]",
            future_markdown_relative_path(Some(month))
        )
    } else {
        "Migrated to Future Log".to_string()
    }
}

fn format_multiline_daily_content(content: &str) -> String {
    let normalized = content.replace("\r\n", "\n").replace('\r', "\n");
    let mut lines = normalized.trim_end().lines();
    let Some(first) = lines.next() else {
        return String::new();
    };
    let mut rendered = first.trim_end().to_string();
    for line in lines {
        rendered.push('\n');
        rendered.push_str("  ");
        rendered.push_str(line.trim_end());
    }
    rendered
}

fn parse_daily_markdown_file(markdown: &str) -> Vec<ParsedDailyMarkdownEntry> {
    let mut entries = Vec::new();
    let mut current: Option<(String, String)> = None;

    for line in markdown.lines() {
        let trimmed = line.trim_end();
        if trimmed.trim().is_empty() || trimmed.trim_start().starts_with('#') {
            continue;
        }
        if trimmed.trim_start().starts_with("<!--") {
            continue;
        }
        if trimmed
            .trim_start()
            .to_ascii_lowercase()
            .starts_with("tags:")
        {
            if let Some((_, content)) = current.as_mut() {
                let tags = trimmed
                    .trim_start()
                    .split_once(':')
                    .map(|(_, tags)| tags.trim())
                    .unwrap_or_default();
                if !tags.is_empty() {
                    content.push(' ');
                    content.push_str(tags);
                }
            }
            continue;
        }
        if trimmed.starts_with("  ") || trimmed.starts_with('\t') {
            if let Some((_, content)) = current.as_mut() {
                content.push('\n');
                content.push_str(trimmed.trim());
            }
            continue;
        }
        if let Some((source, content)) = current.take() {
            if let Some(entry) = parse_daily_markdown_entry_line(&source, &content) {
                entries.push(entry);
            }
        }
        if let Some(content) = daily_markdown_line_content(trimmed) {
            current = Some((trimmed.to_string(), content.to_string()));
        }
    }

    if let Some((source, content)) = current.take() {
        if let Some(entry) = parse_daily_markdown_entry_line(&source, &content) {
            entries.push(entry);
        }
    }

    entries
}

fn daily_markdown_line_content(line: &str) -> Option<&str> {
    let line = line.trim_start();
    if line.starts_with("- [x] ") || line.starts_with("- [X] ") {
        Some(&line[6..])
    } else if let Some(rest) = line.strip_prefix("- [ ] ") {
        Some(rest)
    } else if let Some(rest) = line.strip_prefix("- o ") {
        Some(rest)
    } else {
        line.strip_prefix("- ")
    }
}

fn parse_daily_markdown_entry_line(
    source_line: &str,
    raw_content: &str,
) -> Option<ParsedDailyMarkdownEntry> {
    let line = source_line.trim_start();
    let (entry_type, status) = if line.starts_with("- [x] ") || line.starts_with("- [X] ") {
        (TYPE_TASK.to_string(), STATUS_COMPLETED.to_string())
    } else if line.starts_with("- [ ] ") {
        (TYPE_TASK.to_string(), STATUS_OPEN.to_string())
    } else if line.starts_with("- o ") {
        (TYPE_EVENT.to_string(), STATUS_OPEN.to_string())
    } else if line.starts_with("- ") {
        (TYPE_IDEA.to_string(), STATUS_OPEN.to_string())
    } else {
        return None;
    };
    let is_migration_pointer = raw_content.trim_start().starts_with("Migrated to [[")
        || raw_content.trim_start() == "Migrated to Future Log";
    let (content, tags) = split_markdown_content_tags(raw_content);
    let (content, status) = if is_migration_pointer {
        let status = daily_markdown_migration_pointer_status(&content)
            .unwrap_or(status.as_str())
            .to_string();
        (content, status)
    } else {
        split_markdown_status_suffix(content, status)
    };
    let line_hash = daily_markdown_entry_fingerprint(
        &entry_type,
        &status,
        &content,
        &tags,
        is_migration_pointer,
    );
    Some(ParsedDailyMarkdownEntry {
        content,
        entry_type,
        status,
        tags,
        line_hash,
        is_migration_pointer,
    })
}

fn split_markdown_status_suffix(content: String, default_status: String) -> (String, String) {
    for (suffix, status) in [(" (cancelled)", STATUS_CANCELLED)] {
        if let Some(content) = content.strip_suffix(suffix) {
            return (content.trim_end().to_string(), status.to_string());
        }
    }
    (content, default_status)
}

fn split_markdown_content_tags(content: &str) -> (String, Vec<String>) {
    let tag_re = Regex::new(r"(^|\s)#([\p{L}\p{N}_-]+)").expect("valid tag regex");
    let mut tags = Vec::new();
    for capture in tag_re.captures_iter(content) {
        if let Some(tag) = capture.get(2) {
            tags.push(tag.as_str().to_string());
        }
    }
    let content = tag_re
        .replace_all(content, "$1")
        .trim()
        .lines()
        .map(str::trim_end)
        .collect::<Vec<_>>()
        .join("\n");
    (content, normalize_tags(tags))
}

async fn file_modified_millis(path: &Path) -> AppResult<i64> {
    let modified = tokio::fs::metadata(path)
        .await
        .map_err(|error| AppError::Internal(error.to_string()))?
        .modified()
        .map_err(|error| AppError::Internal(error.to_string()))?;
    Ok(system_time_millis(modified))
}

fn system_time_millis(time: SystemTime) -> i64 {
    time.duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(i64::MAX as u128) as i64
}

fn entries_to_obsidian_markdown_files(
    entries: &[EntryExportSchema],
    uploads: &[UploadBackup],
) -> Vec<(String, String)> {
    let mut grouped: BTreeMap<String, (String, Vec<&EntryExportSchema>)> = BTreeMap::new();
    for entry in entries {
        let (path, title) = obsidian_archive_file_for_entry(entry);
        grouped
            .entry(path)
            .or_insert_with(|| (title, Vec::new()))
            .1
            .push(entry);
    }

    grouped
        .into_iter()
        .map(|(path, (title, items))| {
            let body = items
                .into_iter()
                .map(|entry| entry_to_markdown_archive_line(entry, uploads, &path))
                .collect::<Vec<_>>()
                .join("\n");
            (path, format!("# {title}\n\n{body}\n"))
        })
        .collect()
}

fn obsidian_archive_file_for_entry(entry: &EntryExportSchema) -> (String, String) {
    if let Some(target_date) = entry.target_date.clone() {
        (daily_markdown_relative_path(&target_date), target_date)
    } else if let Some(target_month) = entry.target_month.clone() {
        (
            future_markdown_relative_path(Some(&target_month)),
            target_month,
        )
    } else if entry.is_future {
        (future_markdown_relative_path(None), "Future".to_string())
    } else {
        ("Undated.md".to_string(), "Undated".to_string())
    }
}

fn entry_to_markdown_archive_line(
    entry: &EntryExportSchema,
    uploads: &[UploadBackup],
    archive_path: &str,
) -> String {
    let marker = match entry.entry_type.as_str() {
        TYPE_TASK => "- [ ]",
        TYPE_EVENT => "- o",
        _ => "-",
    };
    let status = if entry.status == STATUS_OPEN {
        String::new()
    } else {
        format!(" ({})", entry.status)
    };
    let tags = if entry.tags.is_empty() {
        String::new()
    } else {
        format!(
            "\n  Tags: {}",
            entry
                .tags
                .iter()
                .map(|tag| format!("#{tag}"))
                .collect::<Vec<_>>()
                .join(" ")
        )
    };
    let content = rewrite_upload_links_for_archive(
        entry.content.as_deref().unwrap_or(""),
        uploads,
        archive_path,
    );
    format!("{marker} {content}{status}{tags}")
}

fn percent_encode_url_component(value: &str) -> String {
    let mut encoded = String::new();
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric()
            || matches!(
                byte,
                b'-' | b'_' | b'.' | b'!' | b'~' | b'*' | b'\'' | b'(' | b')'
            )
        {
            encoded.push(byte as char);
        } else {
            encoded.push_str(&format!("%{byte:02X}"));
        }
    }
    encoded
}

fn percent_decode_lossy(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            let high = (bytes[index + 1] as char).to_digit(16);
            let low = (bytes[index + 2] as char).to_digit(16);
            if let (Some(high), Some(low)) = (high, low) {
                decoded.push(((high << 4) + low) as u8);
                index += 3;
                continue;
            }
        }
        decoded.push(bytes[index]);
        index += 1;
    }
    String::from_utf8_lossy(&decoded).to_string()
}

fn collect_upload_references(value: &str, references: &mut HashSet<String>) {
    if let Ok(local_asset_regex) = Regex::new(
        r#"(?i)\b(?:asset://localhost|https?://asset\.localhost)[^)\]"'<>]*(?:attachments|uploads)/[^)\]\s"'<>]+"#,
    ) {
        for capture in local_asset_regex.find_iter(value) {
            if let Some(index) = capture
                .as_str()
                .find(&format!("{ATTACHMENT_DIR}/"))
                .or_else(|| capture.as_str().find(&format!("{LEGACY_UPLOAD_DIR}/")))
            {
                references.insert(capture.as_str()[index..].to_string());
            }
        }
    }

    if let Ok(relative_regex) =
        Regex::new(r#"(^|[\(\[\s"'=])(?P<path>(?:attachments|uploads)/[^)\]\s"'<>]+)"#)
    {
        for capture in relative_regex.captures_iter(value) {
            if let Some(path) = capture.name("path") {
                references.insert(path.as_str().to_string());
            }
        }
    }
}

fn upload_references_from_content(content: &str) -> HashSet<String> {
    let mut references = HashSet::new();
    collect_upload_references(content, &mut references);
    let decoded = percent_decode_lossy(content);
    if decoded != content {
        collect_upload_references(&decoded, &mut references);
    }
    references
}

fn rewrite_attachment_reference_path(
    content: &str,
    old_relative_path: &str,
    new_relative_path: &str,
) -> String {
    let mut rewritten = content.replace(old_relative_path, new_relative_path);
    let encoded_old = percent_encode_url_component(old_relative_path);
    let encoded_new = percent_encode_url_component(new_relative_path);
    if let Ok(regex) = Regex::new(&format!("(?i){}", regex::escape(&encoded_old))) {
        rewritten = regex
            .replace_all(&rewritten, encoded_new.as_str())
            .into_owned();
    }
    rewritten
}

fn attachment_reference_preview(content: &str) -> String {
    let compact = content
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    let limit = 120;
    let mut preview = compact.chars().take(limit).collect::<String>();
    if compact.chars().count() > limit {
        preview.push_str("...");
    }
    preview
}

fn rewrite_upload_links_for_archive(
    content: &str,
    uploads: &[UploadBackup],
    archive_path: &str,
) -> String {
    let mut rewritten = content.to_string();
    let attachment_prefix = archive_attachment_prefix(archive_path);
    for upload in uploads {
        let Some(filename) = Path::new(&upload.relative_path)
            .file_name()
            .and_then(|value| value.to_str())
        else {
            continue;
        };
        let target = format!("{attachment_prefix}/{filename}");
        let mut relative_paths = vec![
            upload.relative_path.clone(),
            LocalBackend::attachment_relative_path(filename),
            LocalBackend::legacy_upload_relative_path(filename),
        ];
        relative_paths.sort();
        relative_paths.dedup();
        for relative_path in relative_paths {
            let escaped_relative_path = regex::escape(&relative_path);
            let escaped_encoded_relative_path =
                regex::escape(&percent_encode_url_component(&relative_path));
            for pattern in [
                format!(r#"asset://[^\s\)\]"']*/{escaped_relative_path}"#),
                format!(r#"https?://asset\.localhost[^\s\)\]"']*/{escaped_relative_path}"#),
                format!(r#"asset://[^\s\)\]"']*(?i:{escaped_encoded_relative_path})"#),
                format!(
                    r#"https?://asset\.localhost[^\s\)\]"']*(?i:{escaped_encoded_relative_path})"#
                ),
            ] {
                let Ok(regex) = Regex::new(&pattern) else {
                    continue;
                };
                rewritten = regex.replace_all(&rewritten, target.as_str()).into_owned();
            }

            let raw_pattern = format!(r#"(^|[\(\s"'=]){escaped_relative_path}($|[\)\]\s"'<>])"#);
            if let Ok(regex) = Regex::new(&raw_pattern) {
                rewritten = regex
                    .replace_all(&rewritten, |captures: &regex::Captures<'_>| {
                        format!("{}{}{}", &captures[1], target, &captures[2])
                    })
                    .into_owned();
            }
        }
    }
    rewritten
}

fn archive_attachment_prefix(archive_path: &str) -> &'static str {
    if archive_path.starts_with("Daily/") {
        "../attachments"
    } else if archive_path.contains('/') {
        "../Daily/attachments"
    } else {
        "Daily/attachments"
    }
}

fn open_with_system(path: &Path) -> AppResult<()> {
    #[cfg(target_os = "macos")]
    let status = Command::new("open").arg(path).spawn();

    #[cfg(target_os = "windows")]
    let status = Command::new("cmd")
        .args(["/C", "start", ""])
        .arg(path)
        .spawn();

    #[cfg(all(unix, not(target_os = "macos")))]
    let status = Command::new("xdg-open").arg(path).spawn();

    status
        .map(|_| ())
        .map_err(|error| AppError::Internal(error.to_string()))
}

fn normalize_tags(tags: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut normalized = Vec::new();
    for tag in tags {
        let Some(value) = normalize_tag(&tag) else {
            continue;
        };
        let key = value.to_lowercase();
        if seen.insert(key) {
            normalized.push(value);
        }
    }
    normalized
}

fn normalize_tag(tag: &str) -> Option<String> {
    let value = tag
        .trim()
        .trim_start_matches('#')
        .trim_matches(|ch: char| {
            ch.is_whitespace()
                || matches!(
                    ch,
                    ',' | '.'
                        | ';'
                        | ':'
                        | '!'
                        | '?'
                        | '，'
                        | '。'
                        | '；'
                        | '：'
                        | '！'
                        | '？'
                        | '、'
                )
        })
        .trim()
        .to_string();
    if value.is_empty() || value.chars().any(char::is_whitespace) {
        None
    } else {
        Some(value)
    }
}

fn extract_text_tags(content: &str) -> Vec<String> {
    let pattern = Regex::new(r"(^|\s)#([^\s#,.!?;:，。！？；：、]+)").expect("valid tag regex");
    normalize_tags(
        pattern
            .captures_iter(content)
            .filter_map(|captures| captures.get(2).map(|value| value.as_str().to_string()))
            .collect(),
    )
}

fn clean_markdown(markdown: &str) -> String {
    markdown
        .replace(['*', '#', '`', '[', ']', '(', ')', '>', '!', '~'], " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn snippet(text: &str, query: &str) -> String {
    let clean = clean_markdown(text);
    if query.is_empty() || clean.len() <= 140 {
        return clean.chars().take(140).collect();
    }
    let index = clean.find(query).unwrap_or(0);
    let start = clean[..index].chars().count().saturating_sub(30);
    clean.chars().skip(start).take(140).collect()
}

fn embed_text(text: &str) -> Vec<f32> {
    let mut vector = vec![0.0f32; EMBEDDING_DIMS];
    for token in semantic_tokens(text) {
        let index = hash_token(&token) % EMBEDDING_DIMS;
        vector[index] += token_weight(&token);
    }
    let norm = vector.iter().map(|value| value * value).sum::<f32>().sqrt();
    if norm > 0.0 {
        for value in &mut vector {
            *value /= norm;
        }
    }
    vector
}

fn semantic_tokens(text: &str) -> Vec<String> {
    let lower = text.to_lowercase();
    let mut tokens = Vec::new();
    for word in lower.split(|ch: char| !ch.is_alphanumeric() && !is_cjk(ch)) {
        if !word.trim().is_empty() {
            tokens.push(word.to_string());
        }
    }
    let chars: Vec<char> = lower.chars().filter(|ch| is_cjk(*ch)).collect();
    for ch in &chars {
        tokens.push(ch.to_string());
    }
    for pair in chars.windows(2) {
        tokens.push(pair.iter().collect());
    }
    tokens
}

fn is_cjk(ch: char) -> bool {
    matches!(
        ch as u32,
        0x4E00..=0x9FFF | 0x3400..=0x4DBF | 0x20000..=0x2A6DF
    )
}

fn token_weight(token: &str) -> f32 {
    if token.chars().count() > 1 { 1.5 } else { 1.0 }
}

fn hash_token(token: &str) -> usize {
    let mut hash = 1469598103934665603usize;
    for byte in token.as_bytes() {
        hash ^= *byte as usize;
        hash = hash.wrapping_mul(1099511628211usize);
    }
    hash
}

fn dot(left: &[f32], right: &[f32]) -> f32 {
    left.iter().zip(right.iter()).map(|(a, b)| a * b).sum()
}
