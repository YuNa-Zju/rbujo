use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::str::FromStr;

use anyhow::{Context, bail};
use chrono::{Local, NaiveDate, NaiveDateTime};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{Row, SqlitePool};
use uuid::Uuid;

use crate::config::MigrateDbArgs;
use crate::db;
use crate::models::{
    STATUS_CANCELLED, STATUS_COMPLETED, STATUS_MIGRATED_FORWARD, STATUS_MIGRATED_FUTURE,
    STATUS_OPEN, TYPE_EVENT, TYPE_IDEA, TYPE_TASK,
};

#[derive(Debug, Default)]
pub struct MigrationReport {
    pub users_inserted: usize,
    pub entries_inserted: usize,
    pub shared_links_inserted: usize,
    pub orphan_entries_reassigned: usize,
    pub invalid_entry_types: usize,
    pub invalid_statuses: usize,
    pub invalid_dates: usize,
    pub inferred_forward_dates: usize,
    pub inferred_future_months: usize,
    pub future_sources_normalized: usize,
    pub active_future_entries: usize,
    pub duplicate_entry_ids: usize,
    pub skipped_shared_links: usize,
    pub legacy_user_id: Option<i64>,
}

#[derive(Debug, Clone)]
struct LegacyUser {
    id: i64,
    username: Option<String>,
    hashed_password: Option<String>,
}

#[derive(Debug, Clone)]
struct LegacyEntry {
    old_id: Option<String>,
    content: Option<String>,
    entry_type: Option<String>,
    status: Option<String>,
    created_at: Option<String>,
    target_date: Option<String>,
    target_month: Option<String>,
    is_future: Option<i64>,
    source_entry_id: Option<String>,
    owner_id: Option<i64>,
    position: Option<i64>,
    from_date: Option<String>,
    migrated_to_date: Option<String>,
    migrated_to_month: Option<String>,
}

#[derive(Debug, Clone)]
struct NormalizedEntry {
    id: String,
    old_id: Option<String>,
    content: String,
    entry_type: String,
    status: String,
    created_at: String,
    target_date: Option<String>,
    target_month: Option<String>,
    is_future: i64,
    source_entry_id: Option<String>,
    owner_id: i64,
    position: i64,
    from_date: Option<String>,
    migrated_to_date: Option<String>,
    migrated_to_month: Option<String>,
}

pub async fn run(args: MigrateDbArgs) -> anyhow::Result<MigrationReport> {
    if !args.source.exists() {
        bail!("source database does not exist: {}", args.source.display());
    }

    if args.source == args.target {
        bail!("source and target must be different files");
    }

    let source = connect_existing_path(&args.source).await?;
    let legacy_users = read_legacy_users(&source).await?;
    let legacy_entries = read_legacy_entries(&source).await?;
    let legacy_links = read_legacy_shared_links(&source).await?;

    if args.dry_run {
        let mut report = MigrationReport::default();
        let normalized = normalize_entries(&legacy_entries, &legacy_users, &mut report);
        print_report(&report, normalized.len(), legacy_links.len());
        return Ok(report);
    }

    let mut report = MigrationReport::default();

    if args.target.exists() {
        if !args.force {
            bail!(
                "target database already exists: {} (rerun with --force to replace it)",
                args.target.display()
            );
        }
        std::fs::remove_file(&args.target)
            .with_context(|| format!("failed to remove {}", args.target.display()))?;
    }

    let target = connect_target_path(&args.target).await?;
    db::ensure_schema(&target).await?;

    let legacy_user_id = insert_users(&target, &legacy_users, &mut report).await?;
    report.legacy_user_id = Some(legacy_user_id);

    let valid_user_ids = read_target_user_ids(&target).await?;
    let id_map = build_entry_id_map(&legacy_entries, &mut report);
    let normalized = normalize_entries_with_ids(
        &legacy_entries,
        &legacy_users,
        &id_map,
        &valid_user_ids,
        legacy_user_id,
        &mut report,
    );

    insert_entries(&target, &normalized, &mut report).await?;
    resequence_positions(&target).await?;
    insert_shared_links(&target, &legacy_links, &id_map, &mut report).await?;

    print_report(&report, report.entries_inserted, legacy_links.len());
    println!(
        "Migrated database written to {}. Use DATABASE_URL=sqlite://{} for the Rust service.",
        args.target.display(),
        args.target.display()
    );

    Ok(report)
}

fn sqlite_url(path: &Path) -> String {
    format!("sqlite://{}", path.display())
}

async fn connect_existing_path(path: &Path) -> anyhow::Result<SqlitePool> {
    let url = sqlite_url(path);
    let options = SqliteConnectOptions::from_str(&url)?
        .create_if_missing(false)
        .foreign_keys(false);

    SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
        .with_context(|| format!("failed to open source database {}", path.display()))
}

async fn connect_target_path(path: &Path) -> anyhow::Result<SqlitePool> {
    let url = sqlite_url(path);
    let options = SqliteConnectOptions::from_str(&url)?
        .create_if_missing(true)
        .foreign_keys(true);

    SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
        .with_context(|| format!("failed to create target database {}", path.display()))
}

async fn table_exists(pool: &SqlitePool, table: &str) -> anyhow::Result<bool> {
    let exists: Option<i64> =
        sqlx::query_scalar("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
            .bind(table)
            .fetch_optional(pool)
            .await?;
    Ok(exists.is_some())
}

async fn table_columns(pool: &SqlitePool, table: &str) -> anyhow::Result<HashSet<String>> {
    let rows = sqlx::query(&format!(
        "PRAGMA table_info(\"{}\")",
        table.replace('"', "\"\"")
    ))
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .filter_map(|row| row.try_get::<String, _>("name").ok())
        .collect())
}

fn select_expr(columns: &HashSet<String>, name: &str, fallback_sql: &str) -> String {
    if columns.contains(name) {
        format!("{name} AS {name}")
    } else {
        format!("{fallback_sql} AS {name}")
    }
}

async fn read_legacy_users(pool: &SqlitePool) -> anyhow::Result<Vec<LegacyUser>> {
    if !table_exists(pool, "users").await? {
        return Ok(Vec::new());
    }

    let rows = sqlx::query("SELECT id, username, hashed_password FROM users ORDER BY id")
        .fetch_all(pool)
        .await?;

    let mut users = Vec::with_capacity(rows.len());
    for row in rows {
        users.push(LegacyUser {
            id: row.try_get::<i64, _>("id")?,
            username: row.try_get::<Option<String>, _>("username").ok().flatten(),
            hashed_password: row
                .try_get::<Option<String>, _>("hashed_password")
                .ok()
                .flatten(),
        });
    }
    Ok(users)
}

async fn read_legacy_entries(pool: &SqlitePool) -> anyhow::Result<Vec<LegacyEntry>> {
    if !table_exists(pool, "entries").await? {
        bail!("source database has no entries table");
    }

    let columns = table_columns(pool, "entries").await?;
    let select = [
        select_expr(&columns, "id", "NULL"),
        select_expr(&columns, "content", "NULL"),
        select_expr(&columns, "entry_type", "'task'"),
        select_expr(&columns, "status", "'open'"),
        select_expr(&columns, "created_at", "CURRENT_TIMESTAMP"),
        select_expr(&columns, "target_date", "NULL"),
        select_expr(&columns, "target_month", "NULL"),
        select_expr(&columns, "is_future", "0"),
        select_expr(&columns, "source_entry_id", "NULL"),
        select_expr(&columns, "owner_id", "NULL"),
        select_expr(&columns, "position", "0"),
        select_expr(&columns, "from_date", "NULL"),
        select_expr(&columns, "migrated_to_date", "NULL"),
        select_expr(&columns, "migrated_to_month", "NULL"),
    ]
    .join(", ");

    let sql = format!("SELECT {select} FROM entries ORDER BY created_at, id");
    let rows = sqlx::query(&sql).fetch_all(pool).await?;
    let mut entries = Vec::with_capacity(rows.len());

    for row in rows {
        entries.push(LegacyEntry {
            old_id: row.try_get::<Option<String>, _>("id").ok().flatten(),
            content: row.try_get::<Option<String>, _>("content").ok().flatten(),
            entry_type: row
                .try_get::<Option<String>, _>("entry_type")
                .ok()
                .flatten(),
            status: row.try_get::<Option<String>, _>("status").ok().flatten(),
            created_at: row
                .try_get::<Option<String>, _>("created_at")
                .ok()
                .flatten(),
            target_date: row
                .try_get::<Option<String>, _>("target_date")
                .ok()
                .flatten(),
            target_month: row
                .try_get::<Option<String>, _>("target_month")
                .ok()
                .flatten(),
            is_future: read_optional_i64(&row, "is_future"),
            source_entry_id: row
                .try_get::<Option<String>, _>("source_entry_id")
                .ok()
                .flatten(),
            owner_id: read_optional_i64(&row, "owner_id"),
            position: read_optional_i64(&row, "position"),
            from_date: row.try_get::<Option<String>, _>("from_date").ok().flatten(),
            migrated_to_date: row
                .try_get::<Option<String>, _>("migrated_to_date")
                .ok()
                .flatten(),
            migrated_to_month: row
                .try_get::<Option<String>, _>("migrated_to_month")
                .ok()
                .flatten(),
        });
    }

    Ok(entries)
}

fn read_optional_i64(row: &sqlx::sqlite::SqliteRow, column: &str) -> Option<i64> {
    row.try_get::<Option<i64>, _>(column)
        .ok()
        .flatten()
        .or_else(|| {
            row.try_get::<Option<String>, _>(column)
                .ok()
                .flatten()
                .and_then(|value| value.parse::<i64>().ok())
        })
}

async fn read_legacy_shared_links(
    pool: &SqlitePool,
) -> anyhow::Result<Vec<(String, String, Option<String>)>> {
    if !table_exists(pool, "shared_links").await? {
        return Ok(Vec::new());
    }

    let columns = table_columns(pool, "shared_links").await?;
    let select = [
        select_expr(&columns, "target_id", "NULL"),
        select_expr(&columns, "token", "NULL"),
        select_expr(&columns, "created_at", "CURRENT_TIMESTAMP"),
    ]
    .join(", ");
    let sql = format!("SELECT {select} FROM shared_links ORDER BY id");
    let rows = sqlx::query(&sql).fetch_all(pool).await?;
    let mut links = Vec::new();
    for row in rows {
        let target_id = row.try_get::<Option<String>, _>("target_id").ok().flatten();
        let token = row.try_get::<Option<String>, _>("token").ok().flatten();
        if let (Some(target_id), Some(token)) = (clean_opt(target_id), clean_opt(token)) {
            links.push((
                target_id,
                token,
                row.try_get::<Option<String>, _>("created_at")
                    .ok()
                    .flatten(),
            ));
        }
    }
    Ok(links)
}

fn build_entry_id_map(
    entries: &[LegacyEntry],
    report: &mut MigrationReport,
) -> HashMap<String, String> {
    let mut seen_new_ids = HashSet::new();
    let mut map = HashMap::new();

    for entry in entries {
        let old_id = clean_opt(entry.old_id.clone());
        let preferred = old_id.clone().unwrap_or_else(|| Uuid::new_v4().to_string());
        let new_id = if seen_new_ids.insert(preferred.clone()) {
            preferred
        } else {
            report.duplicate_entry_ids += 1;
            let generated = Uuid::new_v4().to_string();
            seen_new_ids.insert(generated.clone());
            generated
        };

        if let Some(old_id) = old_id {
            map.entry(old_id).or_insert(new_id);
        }
    }

    map
}

fn normalize_entries(
    entries: &[LegacyEntry],
    users: &[LegacyUser],
    report: &mut MigrationReport,
) -> Vec<NormalizedEntry> {
    let id_map = build_entry_id_map(entries, report);
    let valid_user_ids: HashSet<i64> = users.iter().map(|u| u.id).collect();
    normalize_entries_with_ids(entries, users, &id_map, &valid_user_ids, 0, report)
}

fn normalize_entries_with_ids(
    entries: &[LegacyEntry],
    _users: &[LegacyUser],
    id_map: &HashMap<String, String>,
    valid_user_ids: &HashSet<i64>,
    legacy_user_id: i64,
    report: &mut MigrationReport,
) -> Vec<NormalizedEntry> {
    let child_dates = first_child_dates(entries);
    let child_months = first_child_months(entries);
    let mut normalized = Vec::with_capacity(entries.len());

    for entry in entries {
        let old_id = clean_opt(entry.old_id.clone());
        let id = match old_id.as_ref().and_then(|id| id_map.get(id)) {
            Some(id) => id.clone(),
            None => {
                let generated = Uuid::new_v4().to_string();
                generated
            }
        };

        let owner_id = match entry.owner_id {
            Some(owner_id) if valid_user_ids.contains(&owner_id) => owner_id,
            _ => {
                report.orphan_entries_reassigned += 1;
                legacy_user_id
            }
        };

        let (entry_type, type_valid) = normalize_entry_type(entry.entry_type.as_deref());
        if !type_valid {
            report.invalid_entry_types += 1;
        }

        let (status, status_valid) = normalize_status(entry.status.as_deref());
        if !status_valid {
            report.invalid_statuses += 1;
        }

        let created_at = normalize_datetime(entry.created_at.as_deref(), report);
        let raw_target_date = normalize_date(entry.target_date.as_deref(), report);
        let raw_target_month = normalize_month(entry.target_month.as_deref(), report);
        let from_date = normalize_date(entry.from_date.as_deref(), report);
        let mut migrated_to_date = normalize_date(entry.migrated_to_date.as_deref(), report);
        let mut migrated_to_month = normalize_month(entry.migrated_to_month.as_deref(), report);
        let old_is_future = entry.is_future.unwrap_or(0) != 0;

        let (target_date, target_month, is_future) = match status.as_str() {
            STATUS_MIGRATED_FORWARD => {
                if migrated_to_date.is_none() {
                    if let Some(old_id) = old_id.as_ref() {
                        migrated_to_date = child_dates.get(old_id).cloned();
                        if migrated_to_date.is_some() {
                            report.inferred_forward_dates += 1;
                        }
                    }
                }
                (raw_target_date, None, 0)
            }
            STATUS_MIGRATED_FUTURE => {
                report.future_sources_normalized += 1;
                if migrated_to_month.is_none() {
                    migrated_to_month = raw_target_month.clone();
                    if migrated_to_month.is_none() {
                        if let Some(old_id) = old_id.as_ref() {
                            migrated_to_month = child_months.get(old_id).cloned();
                        }
                    }
                    if migrated_to_month.is_some() {
                        report.inferred_future_months += 1;
                    }
                }
                migrated_to_date = None;
                (raw_target_date, None, 0)
            }
            _ => {
                migrated_to_date = None;
                migrated_to_month = None;
                if raw_target_date.is_some() {
                    (raw_target_date, None, 0)
                } else if raw_target_month.is_some() {
                    report.active_future_entries += 1;
                    (None, raw_target_month, 1)
                } else if old_is_future {
                    report.active_future_entries += 1;
                    (None, None, 1)
                } else {
                    (None, None, 0)
                }
            }
        };

        let source_entry_id = clean_opt(entry.source_entry_id.clone())
            .and_then(|source| id_map.get(&source).cloned())
            .filter(|source| source != &id);

        normalized.push(NormalizedEntry {
            id,
            old_id,
            content: entry.content.clone().unwrap_or_default(),
            entry_type,
            status,
            created_at,
            target_date,
            target_month,
            is_future,
            source_entry_id,
            owner_id,
            position: entry.position.unwrap_or(0).max(0),
            from_date,
            migrated_to_date,
            migrated_to_month,
        });
    }

    normalized
}

fn first_child_dates(entries: &[LegacyEntry]) -> HashMap<String, String> {
    let mut map = HashMap::new();
    for child in entries {
        if let (Some(source), Some(target_date)) = (
            clean_opt(child.source_entry_id.clone()),
            normalize_date_quiet(child.target_date.as_deref()),
        ) {
            map.entry(source).or_insert(target_date);
        }
    }
    map
}

fn first_child_months(entries: &[LegacyEntry]) -> HashMap<String, String> {
    let mut map = HashMap::new();
    for child in entries {
        if let (Some(source), Some(target_month)) = (
            clean_opt(child.source_entry_id.clone()),
            normalize_month_quiet(child.target_month.as_deref()),
        ) {
            map.entry(source).or_insert(target_month);
        }
    }
    map
}

async fn insert_users(
    pool: &SqlitePool,
    users: &[LegacyUser],
    report: &mut MigrationReport,
) -> anyhow::Result<i64> {
    let mut used_names = HashSet::new();

    for user in users {
        let username = unique_username(
            user.username
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .unwrap_or("legacy_user"),
            &mut used_names,
        );
        let hashed_password = user
            .hashed_password
            .clone()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(disabled_password_marker);

        sqlx::query(
            r#"
            INSERT INTO users(id, username, hashed_password)
            VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                username = excluded.username,
                hashed_password = excluded.hashed_password
            "#,
        )
        .bind(user.id)
        .bind(username)
        .bind(hashed_password)
        .execute(pool)
        .await?;
        report.users_inserted += 1;
    }

    let legacy_name = unique_username("legacy_import", &mut used_names);
    sqlx::query(
        r#"
        INSERT INTO users(username, hashed_password)
        VALUES (?, ?)
        ON CONFLICT(username) DO NOTHING
        "#,
    )
    .bind(&legacy_name)
    .bind(disabled_password_marker())
    .execute(pool)
    .await?;

    let legacy_id: i64 = sqlx::query_scalar("SELECT id FROM users WHERE username = ?")
        .bind(legacy_name)
        .fetch_one(pool)
        .await?;

    Ok(legacy_id)
}

async fn read_target_user_ids(pool: &SqlitePool) -> anyhow::Result<HashSet<i64>> {
    let ids: Vec<i64> = sqlx::query_scalar("SELECT id FROM users")
        .fetch_all(pool)
        .await?;
    Ok(ids.into_iter().collect())
}

async fn insert_entries(
    pool: &SqlitePool,
    entries: &[NormalizedEntry],
    report: &mut MigrationReport,
) -> anyhow::Result<()> {
    for entry in entries {
        let _ = entry.old_id.as_deref();
        sqlx::query(
            r#"
            INSERT INTO entries(
                id, content, entry_type, status, created_at,
                target_date, target_month, is_future, source_entry_id,
                owner_id, position, from_date, migrated_to_date, migrated_to_month
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        .execute(pool)
        .await?;
        report.entries_inserted += 1;
    }
    Ok(())
}

async fn resequence_positions(pool: &SqlitePool) -> anyhow::Result<()> {
    sqlx::query(
        r#"
        WITH ranked AS (
            SELECT
                id,
                ROW_NUMBER() OVER (
                    PARTITION BY
                        owner_id,
                        COALESCE(target_date, ''),
                        COALESCE(target_month, ''),
                        is_future,
                        CASE WHEN status IN ('forward', 'future') THEN status ELSE 'active' END
                    ORDER BY position ASC, created_at DESC, id ASC
                ) - 1 AS new_position
            FROM entries
        )
        UPDATE entries
        SET position = (
            SELECT new_position FROM ranked WHERE ranked.id = entries.id
        )
        WHERE id IN (SELECT id FROM ranked)
        "#,
    )
    .execute(pool)
    .await?;
    Ok(())
}

async fn insert_shared_links(
    pool: &SqlitePool,
    links: &[(String, String, Option<String>)],
    id_map: &HashMap<String, String>,
    report: &mut MigrationReport,
) -> anyhow::Result<()> {
    for (old_target_id, token, created_at) in links {
        let Some(target_id) = id_map.get(old_target_id) else {
            report.skipped_shared_links += 1;
            continue;
        };

        let created_at = normalize_datetime(created_at.as_deref(), report);
        let result = sqlx::query(
            r#"
            INSERT OR IGNORE INTO shared_links(target_id, token, created_at)
            VALUES (?, ?, ?)
            "#,
        )
        .bind(target_id)
        .bind(token)
        .bind(created_at)
        .execute(pool)
        .await?;

        if result.rows_affected() > 0 {
            report.shared_links_inserted += 1;
        } else {
            report.skipped_shared_links += 1;
        }
    }
    Ok(())
}

fn unique_username(base: &str, used: &mut HashSet<String>) -> String {
    let clean = base.trim().replace(char::is_whitespace, "_");
    let clean = if clean.is_empty() {
        "legacy_user".to_string()
    } else {
        clean
    };

    if used.insert(clean.clone()) {
        return clean;
    }

    for index in 2.. {
        let candidate = format!("{clean}_{index}");
        if used.insert(candidate.clone()) {
            return candidate;
        }
    }
    unreachable!()
}

fn disabled_password_marker() -> String {
    format!("disabled:{}", Uuid::new_v4())
}

fn normalize_entry_type(value: Option<&str>) -> (String, bool) {
    match value.map(|value| value.trim().to_ascii_lowercase()) {
        Some(value) if matches!(value.as_str(), TYPE_TASK | TYPE_IDEA | TYPE_EVENT) => {
            (value, true)
        }
        _ => (TYPE_TASK.to_string(), false),
    }
}

fn normalize_status(value: Option<&str>) -> (String, bool) {
    match value.map(|value| value.trim().to_ascii_lowercase()) {
        Some(value)
            if matches!(
                value.as_str(),
                STATUS_OPEN
                    | STATUS_COMPLETED
                    | STATUS_CANCELLED
                    | STATUS_MIGRATED_FORWARD
                    | STATUS_MIGRATED_FUTURE
            ) =>
        {
            (value, true)
        }
        Some(value) if value == "migrated_forward" || value == "migrated" => {
            (STATUS_MIGRATED_FORWARD.to_string(), false)
        }
        Some(value) if value == "migrated_future" => (STATUS_MIGRATED_FUTURE.to_string(), false),
        _ => (STATUS_OPEN.to_string(), false),
    }
}

fn normalize_date(value: Option<&str>, report: &mut MigrationReport) -> Option<String> {
    match normalize_date_quiet(value) {
        Some(date) => Some(date),
        None => {
            if value.and_then(clean_str).is_some() {
                report.invalid_dates += 1;
            }
            None
        }
    }
}

fn normalize_date_quiet(value: Option<&str>) -> Option<String> {
    let value = value.and_then(clean_str)?;
    let candidate = value.get(0..10).unwrap_or(value);
    NaiveDate::parse_from_str(candidate, "%Y-%m")
        .ok()
        .map(|date| date.format("%Y-%m-%d").to_string())
        .or_else(|| {
            NaiveDate::parse_from_str(candidate, "%Y-%m-%d")
                .ok()
                .map(|date| date.format("%Y-%m-%d").to_string())
        })
}

fn normalize_month(value: Option<&str>, report: &mut MigrationReport) -> Option<String> {
    match normalize_month_quiet(value) {
        Some(month) => Some(month),
        None => {
            if value.and_then(clean_str).is_some() {
                report.invalid_dates += 1;
            }
            None
        }
    }
}

fn normalize_month_quiet(value: Option<&str>) -> Option<String> {
    let value = value.and_then(clean_str)?;
    let candidate = if value.len() >= 7 {
        &value[0..7]
    } else {
        value
    };
    let date = format!("{candidate}-01");
    NaiveDate::parse_from_str(&date, "%Y-%m-%d")
        .ok()
        .map(|date| date.format("%Y-%m").to_string())
}

fn normalize_datetime(value: Option<&str>, report: &mut MigrationReport) -> String {
    let Some(value) = value.and_then(clean_str) else {
        return Local::now()
            .naive_local()
            .format("%Y-%m-%d %H:%M:%S")
            .to_string();
    };

    for format in ["%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"] {
        if let Ok(parsed) = NaiveDateTime::parse_from_str(value, format) {
            return parsed.format("%Y-%m-%d %H:%M:%S").to_string();
        }
    }

    if let Ok(date) = NaiveDate::parse_from_str(value.get(0..10).unwrap_or(value), "%Y-%m-%d") {
        return date
            .and_hms_opt(0, 0, 0)
            .expect("midnight is valid")
            .format("%Y-%m-%d %H:%M:%S")
            .to_string();
    }

    report.invalid_dates += 1;
    Local::now()
        .naive_local()
        .format("%Y-%m-%d %H:%M:%S")
        .to_string()
}

fn clean_opt(value: Option<String>) -> Option<String> {
    value.and_then(|value| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn clean_str(value: &str) -> Option<&str> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

fn print_report(report: &MigrationReport, entries_seen: usize, links_seen: usize) {
    println!("Legacy database migration report");
    println!("  users inserted: {}", report.users_inserted);
    println!("  entries seen: {entries_seen}");
    println!("  entries inserted: {}", report.entries_inserted);
    println!("  shared links seen: {links_seen}");
    println!("  shared links inserted: {}", report.shared_links_inserted);
    println!(
        "  orphan entries reassigned to legacy_import: {}",
        report.orphan_entries_reassigned
    );
    println!(
        "  invalid entry types normalized: {}",
        report.invalid_entry_types
    );
    println!("  invalid statuses normalized: {}", report.invalid_statuses);
    println!(
        "  invalid dates cleared/defaulted: {}",
        report.invalid_dates
    );
    println!(
        "  forward migrated_to_date inferred from children: {}",
        report.inferred_forward_dates
    );
    println!(
        "  future migrated_to_month inferred from old target_month/children: {}",
        report.inferred_future_months
    );
    println!(
        "  future source entries normalized: {}",
        report.future_sources_normalized
    );
    println!(
        "  active future entries retained: {}",
        report.active_future_entries
    );
    println!(
        "  duplicate entry ids regenerated: {}",
        report.duplicate_entry_ids
    );
    println!("  skipped shared links: {}", report.skipped_shared_links);
    if let Some(id) = report.legacy_user_id {
        println!("  legacy_import user id: {id}");
    }
}
