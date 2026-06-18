use std::collections::HashSet;
use std::sync::OnceLock;

use regex::Regex;
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
pub struct EntrySummaryMeta {
    pub has_image: bool,
    pub has_link: bool,
    pub has_checklist: bool,
    pub has_ordered_list: bool,
    pub has_unordered_list: bool,
    pub has_code: bool,
    pub has_math: bool,
    pub has_quote: bool,
    pub has_tag: bool,
}

impl Default for EntrySummaryMeta {
    fn default() -> Self {
        Self {
            has_image: false,
            has_link: false,
            has_checklist: false,
            has_ordered_list: false,
            has_unordered_list: false,
            has_code: false,
            has_math: false,
            has_quote: false,
            has_tag: false,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct EntrySummaryDto {
    pub text: String,
    pub meta: EntrySummaryMeta,
    pub upload_references: Vec<String>,
}

impl Default for EntrySummaryDto {
    fn default() -> Self {
        Self {
            text: "新条目".to_string(),
            meta: EntrySummaryMeta::default(),
            upload_references: Vec::new(),
        }
    }
}

impl EntrySummaryDto {
    pub fn from_markdown(markdown: &str) -> Self {
        summarize_markdown(markdown)
    }
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize)]
pub struct DayOverviewDto {
    pub id: String,
    pub entry_type: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct EntryResponse {
    pub id: String,
    pub content: String,
    pub entry_type: String,
    pub status: String,
    pub tags: Vec<String>,
    pub summary: EntrySummaryDto,
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
        let summary = EntrySummaryDto::from_markdown(&entry.content);
        Self::from_entry_with_summary(entry, summary)
    }
}

impl EntryResponse {
    pub fn from_entry_with_summary(entry: Entry, summary: EntrySummaryDto) -> Self {
        Self {
            id: entry.id,
            content: entry.content,
            entry_type: entry.entry_type,
            status: entry.status,
            tags: Vec::new(),
            summary,
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

fn image_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"!\[([^\]]*)\]\(([^)]+)\)").expect("valid image regex"))
}

fn link_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\[([^\]]+)\]\(([^)]+)\)").expect("valid link regex"))
}

fn normal_link_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(^|[^!])\[([^\]]+)\]\(([^)]+)\)").expect("valid link regex"))
}

fn checklist_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?m)^\s*[-*+]\s+\[[xX ]\]").expect("valid checklist regex"))
}

fn ordered_list_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?m)^\s*\d+\.\s").expect("valid ordered list regex"))
}

fn unordered_list_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?m)^\s*[-*+]\s+").expect("valid unordered list regex"))
}

fn quote_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?m)^\s*>").expect("valid quote regex"))
}

fn leading_tags_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^(\s*#[^\s#]+\s*)+").expect("valid leading tag regex"))
}

fn line_tag_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?m)(^|\n)\s*#[^\s#]+").expect("valid line tag regex"))
}

fn control_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"[\x00-\x1F\x7F-\x9F\u{200B}]").expect("valid control regex"))
}

fn inline_math_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\$\$?([^$]+)\$\$?").expect("valid math regex"))
}

fn inline_code_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"`([^`]+)`").expect("valid inline code regex"))
}

fn emphasis_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"[*_~]{1,3}([^*_~]+)[*_~]{1,3}").expect("valid emphasis regex"))
}

fn local_asset_upload_reference_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(
            r#"(?i)\b(?:asset://localhost|https?://asset\.localhost)[^)\]"'<>]*(?:attachments|uploads)/[^)\]\s"'<>]+"#,
        )
        .expect("valid local asset upload reference regex")
    })
}

fn relative_upload_reference_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r#"(^|[\(\[\s"'=])(?P<path>(?:attachments|uploads)/[^)\]\s"'<>]+)"#)
            .expect("valid relative upload reference regex")
    })
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
    for capture in local_asset_upload_reference_re().find_iter(value) {
        if let Some(index) = capture
            .as_str()
            .find("attachments/")
            .or_else(|| capture.as_str().find("uploads/"))
        {
            references.insert(capture.as_str()[index..].to_string());
        }
    }

    for capture in relative_upload_reference_re().captures_iter(value) {
        if let Some(path) = capture.name("path") {
            references.insert(path.as_str().to_string());
        }
    }
}

fn upload_references_from_markdown(markdown: &str) -> Vec<String> {
    let mut references = HashSet::new();
    collect_upload_references(markdown, &mut references);
    let decoded = percent_decode_lossy(markdown);
    if decoded != markdown {
        collect_upload_references(&decoded, &mut references);
    }
    let mut references: Vec<_> = references.into_iter().collect();
    references.sort();
    references
}

fn summarize_markdown(markdown: &str) -> EntrySummaryDto {
    if markdown.is_empty() {
        return EntrySummaryDto::default();
    }

    let meta = EntrySummaryMeta {
        has_image: image_re().is_match(markdown),
        has_link: normal_link_re().is_match(markdown),
        has_checklist: checklist_re().is_match(markdown),
        has_ordered_list: ordered_list_re().is_match(markdown),
        has_unordered_list: markdown.lines().any(|line| {
            let trimmed = line.trim_start();
            unordered_list_re().is_match(trimmed)
                && !(trimmed.starts_with("- [")
                    || trimmed.starts_with("* [")
                    || trimmed.starts_with("+ ["))
        }),
        has_code: markdown.contains('`'),
        has_math: markdown.contains('$'),
        has_quote: quote_re().is_match(markdown),
        has_tag: line_tag_re().is_match(markdown),
    };

    let mut text = String::new();
    for line in markdown.lines() {
        let mut candidate = line.trim().to_string();
        if candidate.is_empty() || candidate.starts_with("```") {
            continue;
        }
        if candidate.chars().all(|ch| matches!(ch, '-' | '*' | '_')) && candidate.len() >= 3 {
            continue;
        }
        if candidate.starts_with('#') {
            candidate = leading_tags_re().replace(&candidate, "").trim().to_string();
            if candidate.is_empty() {
                continue;
            }
        }

        candidate = candidate
            .strip_prefix("- [x] ")
            .or_else(|| candidate.strip_prefix("- [X] "))
            .or_else(|| candidate.strip_prefix("- [ ] "))
            .or_else(|| candidate.strip_prefix("> "))
            .or_else(|| candidate.strip_prefix("- "))
            .or_else(|| candidate.strip_prefix("* "))
            .or_else(|| candidate.strip_prefix("+ "))
            .unwrap_or(&candidate)
            .to_string();

        if let Some((_, rest)) = candidate.split_once(". ") {
            if candidate
                .chars()
                .take_while(|ch| ch.is_ascii_digit())
                .count()
                > 0
            {
                candidate = rest.to_string();
            }
        }
        candidate = candidate.trim_start_matches('#').trim().to_string();

        candidate = image_re()
            .replace_all(&candidate, |captures: &regex::Captures<'_>| {
                let alt = captures.get(1).map(|value| value.as_str()).unwrap_or("");
                if alt.is_empty() {
                    "[图片]".to_string()
                } else {
                    format!("[图片] {alt}")
                }
            })
            .to_string();
        candidate = link_re().replace_all(&candidate, "$1").to_string();
        candidate = inline_math_re().replace_all(&candidate, "$1").to_string();
        candidate = inline_code_re().replace_all(&candidate, "$1").to_string();
        candidate = emphasis_re().replace_all(&candidate, "$1").to_string();
        candidate = control_re().replace_all(&candidate, "").trim().to_string();

        if !candidate.is_empty() {
            text = candidate;
            break;
        }
    }

    if text.is_empty() && meta.has_image {
        text = "[图片]".to_string();
    }
    if text.is_empty() && meta.has_code {
        text = "[代码]".to_string();
    }
    if text.is_empty() {
        text = "新条目".to_string();
    }

    EntrySummaryDto {
        text,
        meta,
        upload_references: upload_references_from_markdown(markdown),
    }
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
