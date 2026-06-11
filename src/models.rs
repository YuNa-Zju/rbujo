use serde::{Deserialize, Serialize};
use sqlx::FromRow;

pub const STATUS_OPEN: &str = "open";
pub const STATUS_COMPLETED: &str = "completed";
pub const STATUS_CANCELLED: &str = "cancelled";
pub const STATUS_MIGRATED_FORWARD: &str = "forward";
pub const STATUS_MIGRATED_FUTURE: &str = "future";

pub const TYPE_TASK: &str = "task";
pub const TYPE_IDEA: &str = "idea";
pub const TYPE_EVENT: &str = "event";

#[derive(Debug, Clone, FromRow, Serialize)]
pub struct User {
    pub id: i64,
    pub username: String,
    pub hashed_password: String,
}

#[derive(Debug, Clone, FromRow)]
pub struct Entry {
    pub id: String,
    pub content: String,
    pub entry_type: String,
    pub status: String,
    pub created_at: String,
    pub target_date: Option<String>,
    pub target_month: Option<String>,
    pub is_future: i64,
    pub source_entry_id: Option<String>,
    pub owner_id: i64,
    pub position: i64,
    pub from_date: Option<String>,
    pub migrated_to_date: Option<String>,
    pub migrated_to_month: Option<String>,
    pub archived_at: Option<String>,
    pub chain_root_id: Option<String>,
    pub migrated_to_entry_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct EntryResponse {
    pub id: String,
    pub content: String,
    pub entry_type: String,
    pub status: String,
    pub tags: Vec<String>,
    pub target_date: Option<String>,
    pub target_month: Option<String>,
    pub is_future: bool,
    pub source_entry_id: Option<String>,
    pub migrated_to_date: Option<String>,
    pub migrated_to_month: Option<String>,
    pub from_date: Option<String>,
    pub position: i64,
    pub created_at: Option<String>,
    pub archived_at: Option<String>,
    pub chain_root_id: Option<String>,
    pub migrated_to_entry_id: Option<String>,
    pub migrated_to_archived_at: Option<String>,
}

impl From<Entry> for EntryResponse {
    fn from(entry: Entry) -> Self {
        Self {
            id: entry.id,
            content: entry.content,
            entry_type: entry.entry_type,
            status: entry.status,
            tags: Vec::new(),
            target_date: entry.target_date,
            target_month: entry.target_month,
            is_future: entry.is_future != 0,
            source_entry_id: entry.source_entry_id,
            migrated_to_date: entry.migrated_to_date,
            migrated_to_month: entry.migrated_to_month,
            from_date: entry.from_date,
            position: entry.position,
            created_at: Some(entry.created_at),
            archived_at: entry.archived_at,
            chain_root_id: entry.chain_root_id,
            migrated_to_entry_id: entry.migrated_to_entry_id,
            migrated_to_archived_at: None,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct UserCreate {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct TokenResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub token_type: String,
    pub recovery_key: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct TokenRefresh {
    pub refresh_token: String,
}

#[derive(Debug, Deserialize)]
pub struct VerifyKeyRequest {
    pub username: String,
    pub recovery_key: String,
}

#[derive(Debug, Deserialize)]
pub struct ResetPasswordRequest {
    pub username: String,
    pub recovery_key: String,
    pub new_password: String,
}

#[derive(Debug, Serialize)]
pub struct ResetPasswordResponse {
    pub message: String,
    pub new_recovery_key: String,
}

#[derive(Debug, Deserialize)]
pub struct ChangePasswordRequest {
    pub old_password: String,
    pub new_password: String,
}

pub type ChangePasswordResponse = ResetPasswordResponse;

#[derive(Debug, Deserialize)]
pub struct CreateEntryDto {
    pub content: String,
    pub entry_type: String,
    pub target_date: Option<String>,
    pub target_month: Option<String>,
    pub is_future: Option<bool>,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct UniversalUpdateEntryDto {
    pub content: Option<String>,
    pub entry_type: Option<String>,
    pub status: Option<String>,
    pub target_date: Option<String>,
    pub target_month: Option<String>,
    pub is_future: Option<bool>,
    pub migration_date: Option<String>,
    pub migration_month: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
pub struct MigrateRequestDto {
    pub target_date: String,
}

#[derive(Debug, Serialize)]
pub struct MigrateResponse {
    pub success: bool,
    pub new_entry: EntryResponse,
    pub updated_source: EntryResponse,
}

#[derive(Debug, Serialize)]
pub struct DeletedEntryInfo {
    pub id: String,
    pub target_date: Option<String>,
    pub month: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ReopenResponse {
    pub success: bool,
    pub updated_entry: EntryResponse,
    pub deleted_entries: Vec<DeletedEntryInfo>,
}

#[derive(Debug, Deserialize)]
pub struct ReorderDto {
    pub entry_ids: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct BatchUpdateFutureLogDto {
    pub layout: std::collections::HashMap<String, Vec<String>>,
}

#[derive(Debug, Serialize)]
pub struct RangeOverviewResponse {
    pub id: String,
    pub target_date: String,
    pub entry_type: String,
    pub status: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct EntryExportSchema {
    pub id: String,
    pub content: Option<String>,
    pub entry_type: String,
    pub status: String,
    #[serde(default)]
    pub tags: Vec<String>,
    pub created_at: String,
    pub target_date: Option<String>,
    pub target_month: Option<String>,
    pub is_future: bool,
    pub source_entry_id: Option<String>,
    pub position: Option<i64>,
    pub from_date: Option<String>,
    pub migrated_to_date: Option<String>,
    pub migrated_to_month: Option<String>,
    pub archived_at: Option<String>,
    pub chain_root_id: Option<String>,
    pub migrated_to_entry_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ImportRequestDto {
    pub entries: Vec<EntryExportSchema>,
}

#[derive(Debug, Serialize)]
pub struct ImportResponseDto {
    pub success: bool,
    pub message: String,
    pub inserted_count: usize,
    pub updated_count: usize,
    pub skipped_count: usize,
    pub inserted_ids: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct BatchDeleteDto {
    pub ids: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct LoginForm {
    pub username: String,
    pub password: String,
}
