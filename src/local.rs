use std::collections::{BTreeMap, HashMap, HashSet};
use std::path::{Path, PathBuf};

use regex::Regex;
use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool};
use uuid::Uuid;

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
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct EntryPatch {
    pub content: Option<String>,
    pub entry_type: Option<String>,
    pub status: Option<String>,
    pub target_date: Option<String>,
    pub target_month: Option<String>,
    pub is_future: Option<bool>,
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

#[derive(Debug, Clone, Serialize)]
pub struct StoredUpload {
    pub relative_path: String,
    pub absolute_path: String,
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
        Ok(Self {
            pool,
            app_dir,
            owner_id,
        })
    }

    pub fn app_dir(&self) -> &Path {
        &self.app_dir
    }

    pub fn db(&self) -> &SqlitePool {
        &self.pool
    }

    pub async fn create_entry(&self, input: CreateEntryInput) -> AppResult<EntryResponse> {
        let entry_type = validate_entry_type(&input.entry_type)?;
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
        self.index_entry(&entry).await?;
        Ok(entry.into())
    }

    pub async fn update_entry(&self, id: String, patch: EntryPatch) -> AppResult<EntryResponse> {
        let mut entry = self.fetch_entry(&id).await?;
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
        self.index_entry(&entry).await?;
        Ok(self.fetch_entry(&id).await?.into())
    }

    pub async fn archive_entry(&self, id: String) -> AppResult<EntryResponse> {
        let mut entry = self.fetch_entry(&id).await?;
        entry.archived_at = Some(now_string());
        self.save_entry(&entry).await?;
        Ok(entry.into())
    }

    pub async fn unarchive_entry(&self, id: String) -> AppResult<EntryResponse> {
        let mut entry = self.fetch_entry(&id).await?;
        entry.archived_at = None;
        self.save_entry(&entry).await?;
        Ok(entry.into())
    }

    pub async fn delete_entry(&self, id: String) -> AppResult<()> {
        sqlx::query("DELETE FROM entries WHERE id = ? AND owner_id = ?")
            .bind(id)
            .bind(self.owner_id)
            .execute(&self.pool)
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
        Ok(ReopenResponse {
            success: true,
            updated_entry: self.fetch_entry(&id).await?.into(),
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
        entry.status = STATUS_OPEN.to_string();
        normalize_entry_state(&mut entry);
        self.save_entry(&entry).await?;
        self.index_entry(&entry).await?;
        Ok(self.fetch_entry(&id).await?.into())
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
        Ok(entries.into_iter().map(EntryResponse::from).collect())
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
                monthly_log.entry(month).or_default().push(entry.into());
            }
        }
        Ok(FutureLogResponse {
            future_log: future_entries
                .into_iter()
                .map(EntryResponse::from)
                .collect(),
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
            updated_source: source.into(),
            created_entry: created.into(),
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
            updated_source: source.into(),
            created_entry: created.into(),
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
            chain.push(current.clone().into());
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
        Ok(chain)
    }

    pub async fn search_entries(&self, options: SearchOptions) -> AppResult<Vec<SearchResult>> {
        let candidates = self.search_candidates(&options).await?;
        let query = options.query.trim();
        if query.is_empty() {
            return Ok(candidates
                .into_iter()
                .take(options.limit)
                .map(|entry| SearchResult {
                    snippet: snippet(&entry.content, ""),
                    entry: entry.into(),
                    score: 0.0,
                    match_type: "list".to_string(),
                })
                .collect());
        }

        match options.mode {
            SearchMode::Text => Ok(candidates
                .into_iter()
                .filter(|entry| clean_markdown(&entry.content).contains(query))
                .take(options.limit)
                .map(|entry| SearchResult {
                    snippet: snippet(&entry.content, query),
                    entry: entry.into(),
                    score: 1.0,
                    match_type: "text".to_string(),
                })
                .collect()),
            SearchMode::Regex => {
                let pattern = Regex::new(query)
                    .map_err(|_| AppError::BadRequest("Invalid regex pattern".to_string()))?;
                Ok(candidates
                    .into_iter()
                    .filter(|entry| pattern.is_match(&clean_markdown(&entry.content)))
                    .take(options.limit)
                    .map(|entry| SearchResult {
                        snippet: snippet(&entry.content, query),
                        entry: entry.into(),
                        score: 1.0,
                        match_type: "regex".to_string(),
                    })
                    .collect())
            }
            SearchMode::Semantic => self.semantic_search(candidates, query, options.limit).await,
        }
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
        Ok(entries.into_iter().map(export_schema_from_entry).collect())
    }

    pub async fn import_entries(
        &self,
        entries: Vec<EntryExportSchema>,
    ) -> AppResult<ImportResponseDto> {
        let mut inserted_ids = Vec::new();
        let mut updated_count = 0usize;
        let mut skipped_count = 0usize;

        for item in entries {
            let mut imported = normalize_import_entry(item, self.owner_id)?;
            let existing_owner: Option<i64> =
                sqlx::query_scalar("SELECT owner_id FROM entries WHERE id = ?")
                    .bind(&imported.id)
                    .fetch_optional(&self.pool)
                    .await?;

            if let Some(owner_id) = existing_owner {
                if owner_id == self.owner_id {
                    self.save_entry(&imported).await?;
                    self.index_entry(&imported).await?;
                    updated_count += 1;
                } else {
                    imported.id = Uuid::new_v4().to_string();
                    self.insert_entry(&imported).await?;
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
        let extension = sanitized_extension(&input.filename);
        let filename = if extension.is_empty() {
            Uuid::new_v4().to_string()
        } else {
            format!("{}.{}", Uuid::new_v4(), extension)
        };
        let relative_path = format!("uploads/{filename}");
        let absolute_path = self.app_dir.join(&relative_path);
        if let Some(parent) = absolute_path.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|error| AppError::Internal(error.to_string()))?;
        }
        tokio::fs::write(&absolute_path, input.bytes)
            .await
            .map_err(|error| AppError::Internal(error.to_string()))?;
        Ok(StoredUpload {
            relative_path,
            absolute_path: absolute_path.to_string_lossy().to_string(),
        })
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
        let mut sql =
            format!("{ENTRY_SELECT} WHERE owner_id = ? AND status NOT IN ('forward', 'future')");
        let mut bindings = Vec::new();
        if !options.include_archived {
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
        Ok(query.fetch_all(&self.pool).await?)
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

        let mut results: Vec<SearchResult> = best
            .into_iter()
            .filter_map(|(entry_id, (score, chunk))| {
                entry_map.get(&entry_id).cloned().map(|entry| SearchResult {
                    snippet: snippet(&chunk, query),
                    entry: entry.into(),
                    score,
                    match_type: "semantic".to_string(),
                })
            })
            .collect();
        results.sort_by(|a, b| b.score.total_cmp(&a.score));
        results.truncate(limit);
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
            self.delete_entry(child.id.clone()).await?;
            current = child;
            if deleted.len() > 128 {
                return Err(AppError::BadRequest(
                    "Migration chain is too deep".to_string(),
                ));
            }
        }

        Ok(deleted)
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

fn export_schema_from_entry(entry: Entry) -> EntryExportSchema {
    EntryExportSchema {
        id: entry.id,
        content: Some(entry.content),
        entry_type: entry.entry_type,
        status: entry.status,
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
