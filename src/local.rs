use std::collections::{BTreeMap, HashMap, HashSet};
use std::io::{Cursor, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

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
pub struct UploadBackup {
    pub relative_path: String,
    pub absolute_path: String,
    pub filename: String,
    pub sha256: String,
    pub bytes: Vec<u8>,
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
        tokio::fs::create_dir_all(app_dir.join("uploads"))
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
        Ok(backend)
    }

    pub fn app_dir(&self) -> &Path {
        &self.app_dir
    }

    fn upload_file_path(&self, relative_path: &str) -> AppResult<PathBuf> {
        let relative = Path::new(relative_path);
        let mut components = relative.components();
        let Some(std::path::Component::Normal(first)) = components.next() else {
            return Err(AppError::BadRequest("Invalid upload path".to_string()));
        };
        if first != "uploads" {
            return Err(AppError::BadRequest("Invalid upload path".to_string()));
        }
        for component in components {
            if !matches!(component, std::path::Component::Normal(_)) {
                return Err(AppError::BadRequest("Invalid upload path".to_string()));
            }
        }
        Ok(self.app_dir.join(relative))
    }

    async fn existing_upload_filename_for_sha(&self, sha256: &str) -> AppResult<Option<String>> {
        let upload_dir = self.app_dir.join("uploads");
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
                matches.push(filename);
            }
        }
        matches.sort();
        Ok(matches.into_iter().next())
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
        self.response_from_entry(entry).await
    }

    pub async fn update_entry(&self, id: String, patch: EntryPatch) -> AppResult<EntryResponse> {
        let mut entry = self.fetch_entry(&id).await?;
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
        Ok(response)
    }

    pub async fn archive_entry(&self, id: String) -> AppResult<EntryResponse> {
        let mut entry = self.fetch_entry(&id).await?;
        entry.archived_at = Some(now_string());
        self.save_entry(&entry).await?;
        self.response_from_entry(entry).await
    }

    pub async fn unarchive_entry(&self, id: String) -> AppResult<EntryResponse> {
        let mut entry = self.fetch_entry(&id).await?;
        entry.archived_at = None;
        self.save_entry(&entry).await?;
        self.response_from_entry(entry).await
    }

    pub async fn delete_entry(&self, id: String) -> AppResult<()> {
        let entry = self.fetch_entry(&id).await?;
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
        Ok(())
    }

    pub async fn reopen_entry(&self, id: String) -> AppResult<ReopenResponse> {
        let mut entry = self.fetch_entry(&id).await?;
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
        let mut entry = self.fetch_entry(&id).await?;
        entry.target_month = target_month.as_deref().map(validate_month).transpose()?;
        entry.target_date = None;
        entry.is_future = 1;
        if !matches!(entry.status.as_str(), STATUS_COMPLETED | STATUS_CANCELLED) {
            entry.status = STATUS_OPEN.to_string();
        }
        normalize_entry_state(&mut entry);
        self.save_entry(&entry).await?;
        self.index_entry(&entry).await?;
        self.response_from_entry(self.fetch_entry(&id).await?).await
    }

    pub async fn get_daily_log(
        &self,
        date: impl AsRef<str>,
        include_archived: bool,
    ) -> AppResult<Vec<EntryResponse>> {
        let date = validate_date(date.as_ref())?;
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
        for (index, entry_id) in entry_ids.iter().enumerate() {
            sqlx::query("UPDATE entries SET position = ? WHERE id = ? AND owner_id = ?")
                .bind(index as i64)
                .bind(entry_id)
                .bind(self.owner_id)
                .execute(&self.pool)
                .await?;
        }
        Ok(())
    }

    pub async fn migrate_entry_to_date(
        &self,
        id: String,
        target_date: String,
    ) -> AppResult<MigrationResult> {
        let target_date = validate_date(&target_date)?;
        let mut source = self.fetch_entry(&id).await?;
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
        let mut source = self.fetch_entry(&id).await?;
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

        for item in entries {
            let tags = item.tags.clone();
            let mut imported = normalize_import_entry(item, self.owner_id)?;
            let existing_owner: Option<i64> =
                sqlx::query_scalar("SELECT owner_id FROM entries WHERE id = ?")
                    .bind(&imported.id)
                    .fetch_optional(&self.pool)
                    .await?;

            if let Some(owner_id) = existing_owner {
                if owner_id == self.owner_id {
                    self.save_entry(&imported).await?;
                    self.set_entry_tags(&imported.id, tags).await?;
                    self.index_entry(&imported).await?;
                    updated_count += 1;
                } else {
                    imported.id = Uuid::new_v4().to_string();
                    self.insert_entry(&imported).await?;
                    self.set_entry_tags(&imported.id, tags).await?;
                    self.index_entry(&imported).await?;
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
                inserted_ids.push(id);
            }
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
        if let Some(filename) = self.existing_upload_filename_for_sha(&sha256).await? {
            let relative_path = format!("uploads/{filename}");
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
        let relative_path = format!("uploads/{filename}");
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
        let upload_dir = self.app_dir.join("uploads");
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
            let relative_path = format!("uploads/{filename}");
            let bytes = tokio::fs::read(entry.path())
                .await
                .map_err(|error| AppError::Internal(error.to_string()))?;
            let sha256 = sha256_hex(&bytes);
            let size = metadata.len() as i64;
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
            });
        }
        uploads.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
        Ok(uploads)
    }

    async fn upload_reference_counts(&self) -> AppResult<HashMap<String, usize>> {
        let rows = sqlx::query("SELECT content FROM entries WHERE owner_id = ?")
            .bind(self.owner_id)
            .fetch_all(&self.pool)
            .await?;
        let mut counts = HashMap::new();
        for row in rows {
            let content: String = row.try_get("content")?;
            for reference in upload_references_from_content(&content) {
                *counts.entry(reference).or_insert(0) += 1;
            }
        }
        Ok(counts)
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
        let reference_counts = self.upload_reference_counts().await?;

        let mut total_bytes = 0;
        let mut referenced_bytes = 0;
        let mut orphaned_bytes = 0;
        let mut referenced_count = 0;

        for upload in &mut uploads {
            let reference_count = reference_counts
                .get(&upload.relative_path)
                .copied()
                .unwrap_or(0);
            upload.reference_count = reference_count;
            upload.referenced = reference_count > 0;
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
        let upload_dir = self.app_dir.join("uploads");
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
            let relative_path = format!("uploads/{filename}");
            uploads.push(UploadBackup {
                relative_path,
                absolute_path: entry.path().to_string_lossy().to_string(),
                filename,
                sha256: sha256_hex(&bytes),
                bytes,
            });
        }
        uploads.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
        Ok(uploads)
    }

    pub async fn open_upload(&self, relative_path: String) -> AppResult<()> {
        let path = self.upload_file_path(&relative_path)?;
        let canonical_upload_dir = tokio::fs::canonicalize(self.app_dir.join("uploads"))
            .await
            .map_err(|error| AppError::Internal(error.to_string()))?;
        let canonical_path = tokio::fs::canonicalize(&path)
            .await
            .map_err(|_| AppError::NotFound("Upload not found".to_string()))?;
        if !canonical_path.starts_with(&canonical_upload_dir) {
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

    pub async fn export_markdown_archive(&self) -> AppResult<Vec<u8>> {
        let entries = self.get_all_entries_for_backup().await?;
        let uploads = self.list_uploads_for_backup().await?;
        let markdown = entries_to_markdown_archive(&entries, &uploads);

        let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
        let options = SimpleFileOptions::default();
        zip.start_file("entries.md", options)
            .map_err(|error| AppError::Internal(error.to_string()))?;
        zip.write_all(markdown.as_bytes())
            .map_err(|error| AppError::Internal(error.to_string()))?;
        for upload in uploads {
            let filename = Path::new(&upload.relative_path)
                .file_name()
                .and_then(|value| value.to_str())
                .ok_or_else(|| AppError::Internal("Invalid upload filename".to_string()))?;
            zip.start_file(format!("attachments/{filename}"), options)
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

fn entries_to_markdown_archive(entries: &[EntryExportSchema], uploads: &[UploadBackup]) -> String {
    let mut grouped: BTreeMap<String, Vec<&EntryExportSchema>> = BTreeMap::new();
    for entry in entries {
        let key = entry
            .target_date
            .clone()
            .or_else(|| entry.target_month.clone())
            .unwrap_or_else(|| {
                if entry.is_future {
                    "Future".to_string()
                } else {
                    "Undated".to_string()
                }
            });
        grouped.entry(key).or_default().push(entry);
    }

    grouped
        .into_iter()
        .map(|(key, items)| {
            let body = items
                .into_iter()
                .map(|entry| {
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
                    );
                    format!("{marker} {content}{status}{tags}")
                })
                .collect::<Vec<_>>()
                .join("\n");
            format!("## {key}\n\n{body}")
        })
        .collect::<Vec<_>>()
        .join("\n\n")
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
        r#"(?i)\b(?:asset://localhost|https?://asset\.localhost)[^)\]"'<>]*uploads/[^)\]\s"'<>]+"#,
    ) {
        for capture in local_asset_regex.find_iter(value) {
            if let Some(index) = capture.as_str().find("uploads/") {
                references.insert(capture.as_str()[index..].to_string());
            }
        }
    }

    if let Ok(relative_regex) = Regex::new(r#"(^|[\(\[\s"'=])(?P<path>uploads/[^)\]\s"'<>]+)"#) {
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

fn rewrite_upload_links_for_archive(content: &str, uploads: &[UploadBackup]) -> String {
    let mut rewritten = content.to_string();
    for upload in uploads {
        let Some(filename) = Path::new(&upload.relative_path)
            .file_name()
            .and_then(|value| value.to_str())
        else {
            continue;
        };
        let target = format!("attachments/{filename}");
        let escaped_relative_path = regex::escape(&upload.relative_path);
        let escaped_encoded_relative_path =
            regex::escape(&percent_encode_url_component(&upload.relative_path));
        for pattern in [
            format!(r#"asset://[^\s\)\]"']*/{escaped_relative_path}"#),
            format!(r#"https?://asset\.localhost[^\s\)\]"']*/{escaped_relative_path}"#),
            format!(r#"asset://[^\s\)\]"']*(?i:{escaped_encoded_relative_path})"#),
            format!(r#"https?://asset\.localhost[^\s\)\]"']*(?i:{escaped_encoded_relative_path})"#),
        ] {
            let Ok(regex) = Regex::new(&pattern) else {
                continue;
            };
            rewritten = regex.replace_all(&rewritten, target.as_str()).into_owned();
        }

        let raw_pattern = format!(r#"(^|[\(\s"'=]){escaped_relative_path}(?=$|[\)\]\s"'<>])"#);
        if let Ok(regex) = Regex::new(&raw_pattern) {
            rewritten = regex
                .replace_all(&rewritten, |captures: &regex::Captures<'_>| {
                    format!("{}{}", &captures[1], target)
                })
                .into_owned();
        }
    }
    rewritten
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
