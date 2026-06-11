use std::collections::{BTreeMap, HashMap, HashSet};
use std::io::{Cursor, Write};
use std::path::Path as FsPath;

use axum::body::{Body, to_bytes};
use axum::extract::{Multipart, Path, Query, State};
use axum::http::header::{CONTENT_DISPOSITION, CONTENT_TYPE};
use axum::http::{HeaderMap, HeaderValue, Request, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, patch, post};
use axum::{Json, Router};
use chrono::{Duration, Local, NaiveDate, Utc};
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::Row;
use uuid::Uuid;
use zip::write::SimpleFileOptions;

use crate::auth::{self, CurrentUser};
use crate::error::{AppError, AppResult};
use crate::models::*;
use crate::state::AppState;

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

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/", get(root))
        .route("/auth/register", post(register))
        .route("/auth/token", post(login))
        .route("/auth/logout", post(logout))
        .route("/auth/refresh", post(refresh_token))
        .route("/auth/verify-recovery", post(verify_recovery_key))
        .route("/auth/reset-password", post(reset_password))
        .route("/auth/change-password", post(change_password))
        .route("/users/me", get(read_users_me))
        .route("/entries", post(create_entry))
        .route("/entries/all", get(export_all_entries))
        .route("/entries/import", post(import_entries))
        .route("/entries/batch-delete", post(batch_delete_entries))
        .route("/entries/search", get(search_entries))
        .route("/entries/reorder", patch(reorder_entries))
        .route(
            "/entries/{entry_id}",
            patch(update_entry).delete(delete_entry),
        )
        .route("/entries/{entry_id}/migrate", post(migrate_entry))
        .route("/entries/{entry_id}/share", post(share_entry))
        .route("/log/reopen/{entry_id}", post(reopen_entry))
        .route("/log/daily/{date_str}", get(get_daily_log))
        .route("/log/future", get(get_future_log))
        .route("/log/future/batch_update", post(batch_update_future_log))
        .route("/log/month_overview/{month_str}", get(get_month_overview))
        .route("/log/range_overview", get(get_range_overview))
        .route("/share/{token}", get(view_shared_entry))
        .route("/export/markdown", get(export_entries_markdown))
        .route("/export/zip", get(export_entries_zip))
        .route("/calendar/feed/{*token_path}", get(get_calendar_feed))
        .route("/upload", post(upload_file))
        .with_state(state)
}

async fn root() -> Json<serde_json::Value> {
    Json(json!({ "message": "System is running" }))
}

async fn logout() -> StatusCode {
    StatusCode::NO_CONTENT
}

async fn register(
    State(state): State<AppState>,
    Json(user): Json<UserCreate>,
) -> AppResult<Json<TokenResponse>> {
    let username = user.username.trim();
    if username.is_empty() || user.password.is_empty() {
        return Err(AppError::BadRequest(
            "username and password are required".to_string(),
        ));
    }

    let exists: Option<i64> = sqlx::query_scalar("SELECT id FROM users WHERE username = ?")
        .bind(username)
        .fetch_optional(state.db())
        .await?;
    if exists.is_some() {
        return Err(AppError::BadRequest(
            "Username already registered".to_string(),
        ));
    }

    let hashed_password = auth::get_password_hash(&user.password)?;
    let result = sqlx::query("INSERT INTO users(username, hashed_password) VALUES (?, ?)")
        .bind(username)
        .bind(&hashed_password)
        .execute(state.db())
        .await?;
    let user_id = result.last_insert_rowid();
    let user = User {
        id: user_id,
        username: username.to_string(),
        hashed_password,
    };

    Ok(Json(tokens_for_user(&user, &state, true)?))
}

async fn login(
    State(state): State<AppState>,
    request: Request<Body>,
) -> AppResult<Json<TokenResponse>> {
    let form = parse_login_request(request).await?;
    let user = sqlx::query_as::<_, User>(
        "SELECT id, username, hashed_password FROM users WHERE username = ?",
    )
    .bind(form.username.trim())
    .fetch_optional(state.db())
    .await?
    .ok_or_else(|| AppError::Unauthorized("Incorrect username or password".to_string()))?;

    if !auth::verify_password(&form.password, &user.hashed_password) {
        return Err(AppError::Unauthorized(
            "Incorrect username or password".to_string(),
        ));
    }

    Ok(Json(tokens_for_user(&user, &state, false)?))
}

async fn parse_login_request(request: Request<Body>) -> AppResult<LoginForm> {
    let content_type = request
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_string();
    let body = to_bytes(request.into_body(), 1024 * 1024)
        .await
        .map_err(|error| AppError::BadRequest(error.to_string()))?;

    if content_type.starts_with("application/x-www-form-urlencoded") {
        return parse_urlencoded_login(&body);
    }

    if content_type.starts_with("multipart/form-data") {
        return parse_multipart_login(&content_type, &body);
    }

    if content_type.starts_with("application/json") {
        return serde_json::from_slice::<LoginForm>(&body)
            .map_err(|error| AppError::BadRequest(format!("Invalid login JSON: {error}")));
    }

    Err(AppError::BadRequest(
        "Unsupported login content type; use application/x-www-form-urlencoded, multipart/form-data, or application/json".to_string(),
    ))
}

fn parse_urlencoded_login(body: &[u8]) -> AppResult<LoginForm> {
    let mut username = None;
    let mut password = None;
    for (key, value) in form_urlencoded::parse(body) {
        match key.as_ref() {
            "username" => username = Some(value.into_owned()),
            "password" => password = Some(value.into_owned()),
            _ => {}
        }
    }
    build_login_form(username, password)
}

fn parse_multipart_login(content_type: &str, body: &[u8]) -> AppResult<LoginForm> {
    let boundary = multipart_boundary(content_type)
        .ok_or_else(|| AppError::BadRequest("Missing multipart boundary".to_string()))?;
    let marker = format!("--{boundary}");
    let text = String::from_utf8_lossy(body);
    let mut username = None;
    let mut password = None;

    for raw_part in text.split(&marker).skip(1) {
        if raw_part.starts_with("--") {
            break;
        }
        let part = raw_part.trim_start_matches("\r\n");
        let Some((headers, value)) = part.split_once("\r\n\r\n") else {
            continue;
        };
        let value = value.trim_end_matches("\r\n").to_string();
        if headers.contains("name=\"username\"") {
            username = Some(value);
        } else if headers.contains("name=\"password\"") {
            password = Some(value);
        }
    }

    build_login_form(username, password)
}

fn multipart_boundary(content_type: &str) -> Option<String> {
    content_type.split(';').find_map(|part| {
        let part = part.trim();
        let boundary = part.strip_prefix("boundary=")?;
        Some(boundary.trim_matches('"').to_string())
    })
}

fn build_login_form(username: Option<String>, password: Option<String>) -> AppResult<LoginForm> {
    let username = username
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::BadRequest("username is required".to_string()))?;
    let password = password
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::BadRequest("password is required".to_string()))?;
    Ok(LoginForm { username, password })
}

async fn refresh_token(
    State(state): State<AppState>,
    Json(body): Json<TokenRefresh>,
) -> AppResult<Json<TokenResponse>> {
    let claims = auth::decode_token(&body.refresh_token, state.secret_key(), Some("refresh"))?;
    let user = sqlx::query_as::<_, User>(
        "SELECT id, username, hashed_password FROM users WHERE username = ?",
    )
    .bind(claims.sub)
    .fetch_optional(state.db())
    .await?
    .ok_or_else(|| AppError::Unauthorized("Could not validate credentials".to_string()))?;

    Ok(Json(tokens_for_user(&user, &state, false)?))
}

async fn verify_recovery_key(
    State(state): State<AppState>,
    Json(req): Json<VerifyKeyRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let user = find_user_by_name(&state, &req.username).await?;
    if !auth::verify_recovery_key(&user, &req.recovery_key, state.secret_key())? {
        return Err(AppError::BadRequest("Invalid recovery key".to_string()));
    }
    Ok(Json(json!({ "message": "Key is valid" })))
}

async fn reset_password(
    State(state): State<AppState>,
    Json(req): Json<ResetPasswordRequest>,
) -> AppResult<Json<ResetPasswordResponse>> {
    let mut user = find_user_by_name(&state, &req.username).await?;
    if !auth::verify_recovery_key(&user, &req.recovery_key, state.secret_key())? {
        return Err(AppError::BadRequest("Invalid recovery key".to_string()));
    }

    let new_hash = auth::get_password_hash(&req.new_password)?;
    sqlx::query("UPDATE users SET hashed_password = ? WHERE id = ?")
        .bind(&new_hash)
        .bind(user.id)
        .execute(state.db())
        .await?;
    user.hashed_password = new_hash;
    let new_recovery_key =
        auth::generate_recovery_key(&user.username, &user.hashed_password, state.secret_key())?;

    Ok(Json(ResetPasswordResponse {
        message: "Password reset successfully".to_string(),
        new_recovery_key,
    }))
}

async fn read_users_me(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
) -> AppResult<Json<serde_json::Value>> {
    let token = auth::create_calendar_token(user.id, state.secret_key())?;
    let base = state.api_base_url().trim_end_matches('/');
    Ok(Json(json!({
        "username": user.username,
        "id": user.id,
        "calendar_feed_url": format!("{base}/api/calendar/feed/{token}.ics")
    })))
}

async fn change_password(
    State(state): State<AppState>,
    CurrentUser(mut user): CurrentUser,
    Json(body): Json<ChangePasswordRequest>,
) -> AppResult<Json<ChangePasswordResponse>> {
    if !auth::verify_password(&body.old_password, &user.hashed_password) {
        return Err(AppError::BadRequest(
            "Old password is incorrect".to_string(),
        ));
    }

    let new_hash = auth::get_password_hash(&body.new_password)?;
    sqlx::query("UPDATE users SET hashed_password = ? WHERE id = ?")
        .bind(&new_hash)
        .bind(user.id)
        .execute(state.db())
        .await?;
    user.hashed_password = new_hash;
    let new_recovery_key =
        auth::generate_recovery_key(&user.username, &user.hashed_password, state.secret_key())?;

    Ok(Json(ChangePasswordResponse {
        message: "Password changed successfully".to_string(),
        new_recovery_key,
    }))
}

fn tokens_for_user(
    user: &User,
    state: &AppState,
    include_recovery: bool,
) -> AppResult<TokenResponse> {
    Ok(TokenResponse {
        access_token: auth::create_access_token(&user.username, state.secret_key())?,
        refresh_token: auth::create_refresh_token(&user.username, state.secret_key())?,
        token_type: "bearer".to_string(),
        recovery_key: if include_recovery {
            Some(auth::generate_recovery_key(
                &user.username,
                &user.hashed_password,
                state.secret_key(),
            )?)
        } else {
            None
        },
    })
}

async fn find_user_by_name(state: &AppState, username: &str) -> AppResult<User> {
    sqlx::query_as::<_, User>("SELECT id, username, hashed_password FROM users WHERE username = ?")
        .bind(username.trim())
        .fetch_optional(state.db())
        .await?
        .ok_or_else(|| AppError::BadRequest("Invalid username or recovery key".to_string()))
}

async fn create_entry(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Json(dto): Json<CreateEntryDto>,
) -> AppResult<Json<EntryResponse>> {
    let (target_date, target_month, is_future) = normalize_new_entry_target(
        dto.target_date.as_deref(),
        dto.target_month.as_deref(),
        dto.is_future.unwrap_or(false),
    )?;
    let entry_type = validate_entry_type(&dto.entry_type)?;
    let id = Uuid::new_v4().to_string();
    let created_at = now_string();

    sqlx::query(
        r#"
        INSERT INTO entries(
            id, content, entry_type, status, created_at, target_date, target_month,
            is_future, owner_id, position
        ) VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?, 0)
        "#,
    )
    .bind(&id)
    .bind(dto.content)
    .bind(entry_type)
    .bind(created_at)
    .bind(target_date)
    .bind(target_month)
    .bind(is_future)
    .bind(user.id)
    .execute(state.db())
    .await?;

    Ok(Json(fetch_entry_owned(&state, &id, user.id).await?.into()))
}

async fn migrate_entry(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path(entry_id): Path<String>,
    Json(dto): Json<MigrateRequestDto>,
) -> AppResult<Json<MigrateResponse>> {
    let target_date = validate_date(&dto.target_date)?;
    let mut entry = fetch_entry_owned(&state, &entry_id, user.id).await?;
    let new_entry = create_forward_child(&state, &mut entry, &target_date, user.id).await?;
    save_entry(&state, &entry).await?;

    Ok(Json(MigrateResponse {
        success: true,
        new_entry: new_entry.into(),
        updated_source: fetch_entry_owned(&state, &entry_id, user.id).await?.into(),
    }))
}

async fn reopen_entry(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path(entry_id): Path<String>,
) -> AppResult<Json<ReopenResponse>> {
    let mut entry = fetch_entry_owned(&state, &entry_id, user.id).await?;
    let deleted_entries = collect_and_delete_children(&state, &entry_id, user.id).await?;
    entry.status = STATUS_OPEN.to_string();
    entry.migrated_to_date = None;
    entry.migrated_to_month = None;
    entry.target_month = None;
    entry.is_future = 0;
    save_entry(&state, &entry).await?;

    Ok(Json(ReopenResponse {
        success: true,
        updated_entry: fetch_entry_owned(&state, &entry_id, user.id).await?.into(),
        deleted_entries,
    }))
}

async fn update_entry(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path(entry_id): Path<String>,
    Json(dto): Json<UniversalUpdateEntryDto>,
) -> AppResult<Json<EntryResponse>> {
    let mut entry = fetch_entry_owned(&state, &entry_id, user.id).await?;

    if dto.status.as_deref() == Some(STATUS_OPEN) && entry.status != STATUS_OPEN {
        if !dto.is_future.unwrap_or(false)
            && (entry.migrated_to_date.is_some()
                || entry.migrated_to_month.is_some()
                || entry.target_month.is_some())
        {
            collect_and_delete_children(&state, &entry_id, user.id).await?;
            entry.migrated_to_date = None;
            entry.migrated_to_month = None;
            entry.target_month = None;
            entry.is_future = 0;
        }
    }

    match dto.status.as_deref() {
        Some(STATUS_MIGRATED_FORWARD) => {
            if let Some(date) = dto.migration_date.as_deref() {
                let target_date = validate_date(date)?;
                create_forward_child(&state, &mut entry, &target_date, user.id).await?;
            }
        }
        Some(STATUS_MIGRATED_FUTURE) => {
            let target_month = dto
                .migration_month
                .as_deref()
                .map(validate_month)
                .transpose()?;
            create_future_child(&state, &mut entry, target_month.as_deref(), user.id).await?;
        }
        _ => {}
    }

    if let Some(content) = dto.content {
        entry.content = content;
    }
    if let Some(entry_type) = dto.entry_type.as_deref() {
        entry.entry_type = validate_entry_type(entry_type)?;
    }
    if let Some(status) = dto.status.as_deref() {
        entry.status = validate_status(status)?;
    }
    if let Some(target_date) = dto.target_date.as_deref() {
        entry.target_date = Some(validate_date(target_date)?);
        entry.target_month = None;
        entry.is_future = 0;
    }
    if let Some(target_month) = dto.target_month.as_deref() {
        entry.target_month = Some(validate_month(target_month)?);
        entry.target_date = None;
        entry.is_future = 1;
    }
    if let Some(is_future) = dto.is_future {
        entry.is_future = i64::from(is_future);
        if is_future {
            entry.target_date = None;
        }
    }

    normalize_entry_state(&mut entry);
    save_entry(&state, &entry).await?;

    if entry.source_entry_id.is_some() && (dto.target_month.is_some() || dto.is_future.is_some()) {
        sync_child_to_parent(&state, &entry, user.id).await?;
    }

    Ok(Json(
        fetch_entry_owned(&state, &entry_id, user.id).await?.into(),
    ))
}

async fn delete_entry(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path(entry_id): Path<String>,
) -> AppResult<StatusCode> {
    fetch_entry_owned(&state, &entry_id, user.id).await?;
    collect_and_delete_children(&state, &entry_id, user.id).await?;
    sqlx::query("DELETE FROM entries WHERE id = ? AND owner_id = ?")
        .bind(entry_id)
        .bind(user.id)
        .execute(state.db())
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn reorder_entries(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Json(dto): Json<ReorderDto>,
) -> AppResult<StatusCode> {
    for (index, entry_id) in dto.entry_ids.iter().enumerate() {
        sqlx::query("UPDATE entries SET position = ? WHERE id = ? AND owner_id = ?")
            .bind(index as i64)
            .bind(entry_id)
            .bind(user.id)
            .execute(state.db())
            .await?;
    }
    Ok(StatusCode::NO_CONTENT)
}

async fn get_daily_log(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path(date_str): Path<String>,
) -> AppResult<Json<Vec<EntryResponse>>> {
    let date = validate_date(&date_str)?;
    let entries = sqlx::query_as::<_, Entry>(&format!(
        "{ENTRY_SELECT} WHERE owner_id = ? AND target_date = ? ORDER BY position ASC, created_at DESC"
    ))
    .bind(user.id)
    .bind(date)
    .fetch_all(state.db())
    .await?;
    Ok(Json(entries.into_iter().map(EntryResponse::from).collect()))
}

#[derive(Serialize)]
struct FutureLogResponse {
    future_log: Vec<EntryResponse>,
    monthly_log: BTreeMap<String, Vec<EntryResponse>>,
}

async fn get_future_log(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
) -> AppResult<Json<FutureLogResponse>> {
    let future_entries = sqlx::query_as::<_, Entry>(&format!(
        r#"{ENTRY_SELECT}
        WHERE owner_id = ?
          AND is_future = 1
          AND target_date IS NULL
          AND target_month IS NULL
          AND status NOT IN ('forward', 'future')
        ORDER BY position ASC, created_at DESC"#
    ))
    .bind(user.id)
    .fetch_all(state.db())
    .await?;

    let monthly_entries = sqlx::query_as::<_, Entry>(&format!(
        r#"{ENTRY_SELECT}
        WHERE owner_id = ?
          AND target_month IS NOT NULL
          AND status NOT IN ('forward', 'future')
        ORDER BY target_month ASC, position ASC, created_at DESC"#
    ))
    .bind(user.id)
    .fetch_all(state.db())
    .await?;

    let mut monthly_log: BTreeMap<String, Vec<EntryResponse>> = BTreeMap::new();
    for entry in monthly_entries {
        if let Some(month) = entry.target_month.clone() {
            monthly_log.entry(month).or_default().push(entry.into());
        }
    }

    Ok(Json(FutureLogResponse {
        future_log: future_entries
            .into_iter()
            .map(EntryResponse::from)
            .collect(),
        monthly_log,
    }))
}

async fn get_month_overview(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path(month_str): Path<String>,
) -> AppResult<Json<HashMap<String, Vec<serde_json::Value>>>> {
    let month = validate_month(&month_str)?;
    let rows = sqlx::query(
        r#"
        SELECT id, target_date, entry_type, status
        FROM entries
        WHERE owner_id = ? AND substr(target_date, 1, 7) = ?
        ORDER BY target_date ASC, position ASC, created_at DESC
        "#,
    )
    .bind(user.id)
    .bind(month)
    .fetch_all(state.db())
    .await?;

    let mut overview: HashMap<String, Vec<serde_json::Value>> = HashMap::new();
    for row in rows {
        let date: String = row.try_get("target_date")?;
        overview.entry(date).or_default().push(json!({
            "id": row.try_get::<String, _>("id")?,
            "type": row.try_get::<String, _>("entry_type")?,
            "status": row.try_get::<String, _>("status")?,
        }));
    }
    Ok(Json(overview))
}

async fn batch_update_future_log(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Json(dto): Json<BatchUpdateFutureLogDto>,
) -> AppResult<StatusCode> {
    for (container_key, ids) in dto.layout {
        let target_month = if container_key == "undetermined" || container_key == "null" {
            None
        } else {
            Some(validate_month(&container_key)?)
        };

        for (index, entry_id) in ids.iter().enumerate() {
            let mut entry = match fetch_entry_owned(&state, entry_id, user.id).await {
                Ok(entry) => entry,
                Err(AppError::NotFound(_)) => continue,
                Err(error) => return Err(error),
            };
            entry.position = index as i64;
            entry.target_month = target_month.clone();
            entry.target_date = None;
            entry.is_future = 1;
            if !matches!(entry.status.as_str(), STATUS_COMPLETED | STATUS_CANCELLED) {
                entry.status = STATUS_OPEN.to_string();
            }
            normalize_entry_state(&mut entry);
            save_entry(&state, &entry).await?;
        }
    }
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
struct RangeOverviewQuery {
    start_date: String,
    end_date: String,
}

async fn get_range_overview(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Query(query): Query<RangeOverviewQuery>,
) -> AppResult<Json<Vec<RangeOverviewResponse>>> {
    let start_date = validate_date(&query.start_date)?;
    let end_date = validate_date(&query.end_date)?;
    let rows = sqlx::query(
        r#"
        SELECT id, target_date, entry_type, status
        FROM entries
        WHERE owner_id = ?
          AND target_date >= ?
          AND target_date <= ?
          AND status NOT IN ('forward', 'future')
        "#,
    )
    .bind(user.id)
    .bind(start_date)
    .bind(end_date)
    .fetch_all(state.db())
    .await?;

    let mut response = Vec::with_capacity(rows.len());
    for row in rows {
        response.push(RangeOverviewResponse {
            id: row.try_get("id")?,
            target_date: row.try_get("target_date")?,
            entry_type: row.try_get("entry_type")?,
            status: row.try_get("status")?,
        });
    }
    Ok(Json(response))
}

#[derive(Deserialize)]
struct SearchQuery {
    q: Option<String>,
    mode: Option<String>,
    #[serde(default)]
    entry_type: Vec<String>,
    start_date: Option<String>,
    end_date: Option<String>,
}

async fn search_entries(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Query(query): Query<SearchQuery>,
) -> AppResult<Json<Vec<EntryResponse>>> {
    let mut sql = format!(
        r#"{ENTRY_SELECT}
        WHERE owner_id = ?
          AND status NOT IN ('forward', 'future')"#
    );
    let mut bindings = Vec::new();
    bindings.push(user.id.to_string());

    let entry_types: Vec<String> = query
        .entry_type
        .iter()
        .filter_map(|value| validate_entry_type(value).ok())
        .collect();
    if !entry_types.is_empty() {
        let placeholders = vec!["?"; entry_types.len()].join(", ");
        sql.push_str(&format!(" AND entry_type IN ({placeholders})"));
        bindings.extend(entry_types);
    }

    if let Some(start_date) = query.start_date.as_deref() {
        sql.push_str(" AND target_date >= ?");
        bindings.push(validate_date(start_date)?);
    }
    if let Some(end_date) = query.end_date.as_deref() {
        sql.push_str(" AND target_date <= ?");
        bindings.push(validate_date(end_date)?);
    }
    sql.push_str(" ORDER BY target_date DESC, created_at DESC");

    let mut db_query = sqlx::query_as::<_, Entry>(&sql).bind(user.id);
    for binding in bindings.into_iter().skip(1) {
        db_query = db_query.bind(binding);
    }
    let candidates = db_query.fetch_all(state.db()).await?;

    let q = query.q.unwrap_or_default();
    if q.is_empty() {
        return Ok(Json(
            candidates.into_iter().map(EntryResponse::from).collect(),
        ));
    }

    let mode = query.mode.unwrap_or_else(|| "text".to_string());
    let matcher = if mode == "regex" {
        Some(
            Regex::new(&format!("(?i){q}"))
                .map_err(|_| AppError::BadRequest("Invalid regex pattern".to_string()))?,
        )
    } else {
        None
    };
    let q_lower = q.to_lowercase();
    let mut results = Vec::new();
    for entry in candidates {
        let plain = clean_markdown_regex(&entry.content);
        let matched = if let Some(pattern) = matcher.as_ref() {
            pattern.is_match(&plain)
        } else {
            plain.to_lowercase().contains(&q_lower)
        };
        if matched {
            results.push(entry.into());
        }
    }
    Ok(Json(results))
}

async fn share_entry(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Path(entry_id): Path<String>,
) -> AppResult<Json<ShareLinkResponse>> {
    fetch_entry_owned(&state, &entry_id, user.id).await?;
    let existing: Option<String> = sqlx::query_scalar(
        "SELECT token FROM shared_links WHERE target_id = ? ORDER BY id LIMIT 1",
    )
    .bind(&entry_id)
    .fetch_optional(state.db())
    .await?;

    let token = if let Some(token) = existing {
        token
    } else {
        let token = Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO shared_links(target_id, token) VALUES (?, ?)")
            .bind(entry_id)
            .bind(&token)
            .execute(state.db())
            .await?;
        token
    };

    Ok(Json(ShareLinkResponse {
        share_url: format!("/s/{token}"),
        token,
    }))
}

async fn view_shared_entry(
    State(state): State<AppState>,
    Path(token): Path<String>,
) -> AppResult<Json<PublicEntryResponse>> {
    let entry = sqlx::query_as::<_, Entry>(&format!(
        r#"{ENTRY_SELECT}
        INNER JOIN shared_links ON shared_links.target_id = entries.id
        WHERE shared_links.token = ?"#
    ))
    .bind(token)
    .fetch_optional(state.db())
    .await?
    .ok_or_else(|| AppError::NotFound("Link expired or invalid".to_string()))?;

    let author =
        sqlx::query_as::<_, User>("SELECT id, username, hashed_password FROM users WHERE id = ?")
            .bind(entry.owner_id)
            .fetch_optional(state.db())
            .await?;
    let author_name = author
        .as_ref()
        .map(|user| user.username.clone())
        .unwrap_or_else(|| "Unknown".to_string());
    let author_avatar = author_name
        .chars()
        .take(2)
        .collect::<String>()
        .to_uppercase();

    Ok(Json(PublicEntryResponse {
        content: entry.content,
        entry_type: entry.entry_type,
        status: entry.status,
        created_at: entry.created_at,
        author_name,
        author_avatar: if author_avatar.is_empty() {
            "??".to_string()
        } else {
            author_avatar
        },
    }))
}

async fn export_all_entries(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
) -> AppResult<Json<Vec<EntryExportSchema>>> {
    let entries = sqlx::query_as::<_, Entry>(&format!(
        "{ENTRY_SELECT} WHERE owner_id = ? ORDER BY created_at ASC"
    ))
    .bind(user.id)
    .fetch_all(state.db())
    .await?;
    Ok(Json(
        entries.into_iter().map(export_schema_from_entry).collect(),
    ))
}

async fn import_entries(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Json(payload): Json<ImportRequestDto>,
) -> AppResult<Json<ImportResponseDto>> {
    let mut inserted_ids = Vec::new();
    let mut updated_count = 0usize;
    let mut skipped_count = 0usize;

    for item in payload.entries {
        let mut imported = normalize_import_entry(item, user.id)?;
        let existing_owner: Option<i64> =
            sqlx::query_scalar("SELECT owner_id FROM entries WHERE id = ?")
                .bind(&imported.id)
                .fetch_optional(state.db())
                .await?;

        if let Some(owner_id) = existing_owner {
            if owner_id == user.id {
                save_entry(&state, &imported).await?;
                updated_count += 1;
            } else {
                imported.id = Uuid::new_v4().to_string();
                insert_full_entry(&state, &imported).await?;
                inserted_ids.push(imported.id);
            }
        } else {
            let duplicate: Option<String> = sqlx::query_scalar(
                "SELECT id FROM entries WHERE owner_id = ? AND content = ? AND target_date IS ? LIMIT 1",
            )
            .bind(user.id)
            .bind(&imported.content)
            .bind(&imported.target_date)
            .fetch_optional(state.db())
            .await?;
            if duplicate.is_some() {
                skipped_count += 1;
                continue;
            }
            let id = imported.id.clone();
            insert_full_entry(&state, &imported).await?;
            inserted_ids.push(id);
        }
    }

    let message = format!(
        "Imported {} new, updated {}, skipped {}.",
        inserted_ids.len(),
        updated_count,
        skipped_count
    );
    Ok(Json(ImportResponseDto {
        success: true,
        message,
        inserted_count: inserted_ids.len(),
        updated_count,
        skipped_count,
        inserted_ids,
    }))
}

async fn batch_delete_entries(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    Json(payload): Json<BatchDeleteDto>,
) -> AppResult<StatusCode> {
    for id in payload.ids {
        sqlx::query("DELETE FROM entries WHERE id = ? AND owner_id = ?")
            .bind(id)
            .bind(user.id)
            .execute(state.db())
            .await?;
    }
    Ok(StatusCode::NO_CONTENT)
}

async fn export_entries_markdown(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
) -> AppResult<Response> {
    let entries = sqlx::query_as::<_, Entry>(&format!(
        r#"{ENTRY_SELECT}
        WHERE owner_id = ?
        ORDER BY target_date DESC, is_future DESC, target_month DESC, position ASC"#
    ))
    .bind(user.id)
    .fetch_all(state.db())
    .await?;

    let mut lines = vec![
        format!("# Bullet Journal Backup - {}", user.username),
        String::new(),
    ];
    let mut current_section = String::new();
    for entry in entries {
        let section = entry_section_title(&entry);
        if section != current_section {
            lines.push(String::new());
            lines.push("---".to_string());
            lines.push(section.clone());
            lines.push(String::new());
            current_section = section;
        }
        lines.push(format!(
            "### {} [{}]",
            title_case(&entry.entry_type),
            entry.status.to_uppercase()
        ));
        if entry.content.is_empty() {
            lines.push("> *(No content)*".to_string());
        } else {
            for line in entry.content.lines() {
                lines.push(format!("> {line}"));
            }
        }
        lines.push(String::new());
    }

    let mut headers = HeaderMap::new();
    headers.insert(
        CONTENT_TYPE,
        HeaderValue::from_static("text/markdown; charset=utf-8"),
    );
    headers.insert(
        CONTENT_DISPOSITION,
        HeaderValue::from_static("attachment; filename=bullet_journal_export.md"),
    );
    Ok((headers, lines.join("\n")).into_response())
}

async fn export_entries_zip(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
) -> AppResult<Response> {
    let entries = sqlx::query_as::<_, Entry>(&format!(
        "{ENTRY_SELECT} WHERE owner_id = ? ORDER BY target_date ASC, position ASC"
    ))
    .bind(user.id)
    .fetch_all(state.db())
    .await?;

    let mut files: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for entry in entries {
        let (path, header) = entry_archive_path(&entry);
        let lines = files
            .entry(path)
            .or_insert_with(|| vec![header, String::new()]);
        lines.push(format_entry_to_markdown(&entry));
    }

    let cursor = Cursor::new(Vec::new());
    let mut zip = zip::ZipWriter::new(cursor);
    let options = SimpleFileOptions::default();
    for (path, lines) in files {
        zip.start_file(path, options)
            .map_err(|error| AppError::Internal(error.to_string()))?;
        zip.write_all(lines.join("\n").as_bytes())
            .map_err(|error| AppError::Internal(error.to_string()))?;
    }
    let bytes = zip
        .finish()
        .map_err(|error| AppError::Internal(error.to_string()))?
        .into_inner();

    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/zip"));
    headers.insert(
        CONTENT_DISPOSITION,
        HeaderValue::from_str(&format!(
            "attachment; filename=bujo_export_{}.zip",
            user.username
        ))
        .unwrap_or_else(|_| HeaderValue::from_static("attachment; filename=bujo_export.zip")),
    );
    Ok((headers, Body::from(bytes)).into_response())
}

async fn get_calendar_feed(
    State(state): State<AppState>,
    Path(token_path): Path<String>,
) -> Response {
    let token = token_path.trim_end_matches(".ics");
    let Some(user_id) = auth::verify_calendar_token(token, state.secret_key()) else {
        return (StatusCode::FORBIDDEN, "Invalid or Expired Calendar Token").into_response();
    };

    let start_filter = (Local::now().date_naive() - Duration::days(30))
        .format("%Y-%m-%d")
        .to_string();
    let entries = sqlx::query_as::<_, Entry>(&format!(
        r#"{ENTRY_SELECT}
        WHERE owner_id = ?
          AND target_date >= ?
          AND status != 'cancelled'
          AND entry_type IN ('task', 'event')"#
    ))
    .bind(user_id)
    .bind(start_filter)
    .fetch_all(state.db())
    .await;

    let Ok(entries) = entries else {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    };

    let mut ics =
        String::from("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//BulletJournal Rust//EN\r\n");
    let stamp = Utc::now().format("%Y%m%dT%H%M%SZ").to_string();
    for entry in entries {
        let Some(target_date) = entry.target_date.as_deref() else {
            continue;
        };
        let date = target_date.replace('-', "");
        let prefix = match (entry.status.as_str(), entry.entry_type.as_str()) {
            (STATUS_COMPLETED, _) => "[DONE] ",
            (_, TYPE_EVENT) => "[EVENT] ",
            _ => "[TASK] ",
        };
        ics.push_str("BEGIN:VEVENT\r\n");
        ics.push_str(&format!("UID:{}\r\n", escape_ics(&entry.id)));
        ics.push_str(&format!("DTSTAMP:{stamp}\r\n"));
        ics.push_str(&format!("DTSTART;VALUE=DATE:{date}\r\n"));
        ics.push_str(&format!(
            "SUMMARY:{}{}\r\n",
            prefix,
            escape_ics(&entry.content)
        ));
        ics.push_str(&format!(
            "DESCRIPTION:{}\r\n",
            escape_ics(&format!(
                "Type: {}\nStatus: {}\nID: {}",
                entry.entry_type, entry.status, entry.id
            ))
        ));
        ics.push_str("END:VEVENT\r\n");
    }
    ics.push_str("END:VCALENDAR\r\n");

    let mut headers = HeaderMap::new();
    headers.insert(
        CONTENT_TYPE,
        HeaderValue::from_static("text/calendar; charset=utf-8"),
    );
    (headers, ics).into_response()
}

async fn upload_file(
    State(state): State<AppState>,
    CurrentUser(user): CurrentUser,
    mut multipart: Multipart,
) -> AppResult<Json<serde_json::Value>> {
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|error| AppError::BadRequest(error.to_string()))?
    {
        let file_name = field.file_name().map(str::to_string).unwrap_or_default();
        let extension = sanitized_extension(&file_name);
        let unique_filename = if extension.is_empty() {
            Uuid::new_v4().to_string()
        } else {
            format!("{}.{}", Uuid::new_v4(), extension)
        };
        let user_dir = state.upload_dir().join(user.id.to_string());
        tokio::fs::create_dir_all(&user_dir)
            .await
            .map_err(|error| AppError::Internal(error.to_string()))?;
        let path = user_dir.join(&unique_filename);
        let bytes = field
            .bytes()
            .await
            .map_err(|error| AppError::BadRequest(error.to_string()))?;
        tokio::fs::write(&path, bytes)
            .await
            .map_err(|error| AppError::Internal(error.to_string()))?;
        let base = state.api_base_url().trim_end_matches('/');
        let url = format!("{base}/static/uploads/{}/{}", user.id, unique_filename);
        return Ok(Json(json!({ "url": url })));
    }

    Err(AppError::BadRequest("file is required".to_string()))
}

async fn fetch_entry_owned(state: &AppState, entry_id: &str, owner_id: i64) -> AppResult<Entry> {
    sqlx::query_as::<_, Entry>(&format!("{ENTRY_SELECT} WHERE id = ? AND owner_id = ?"))
        .bind(entry_id)
        .bind(owner_id)
        .fetch_optional(state.db())
        .await?
        .ok_or_else(|| AppError::NotFound("Entry not found".to_string()))
}

async fn save_entry(state: &AppState, entry: &Entry) -> AppResult<()> {
    sqlx::query(
        r#"
        UPDATE entries SET
            content = ?, entry_type = ?, status = ?, target_date = ?, target_month = ?,
            is_future = ?, source_entry_id = ?, position = ?, from_date = ?,
            migrated_to_date = ?, migrated_to_month = ?, archived_at = ?,
            chain_root_id = ?, migrated_to_entry_id = ?
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
    .execute(state.db())
    .await?;
    Ok(())
}

async fn insert_full_entry(state: &AppState, entry: &Entry) -> AppResult<()> {
    sqlx::query(
        r#"
        INSERT INTO entries(
            id, content, entry_type, status, created_at, target_date, target_month,
            is_future, source_entry_id, owner_id, position, from_date,
            migrated_to_date, migrated_to_month, archived_at, chain_root_id,
            migrated_to_entry_id
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
    .execute(state.db())
    .await?;
    Ok(())
}

async fn create_forward_child(
    state: &AppState,
    entry: &mut Entry,
    target_date: &str,
    owner_id: i64,
) -> AppResult<Entry> {
    entry.status = STATUS_MIGRATED_FORWARD.to_string();
    entry.migrated_to_date = Some(target_date.to_string());
    entry.migrated_to_month = None;
    entry.is_future = 0;
    let chain_root_id = entry
        .chain_root_id
        .clone()
        .unwrap_or_else(|| entry.id.clone());
    entry.chain_root_id = Some(chain_root_id.clone());
    let child = Entry {
        id: Uuid::new_v4().to_string(),
        content: entry.content.clone(),
        entry_type: entry.entry_type.clone(),
        status: STATUS_OPEN.to_string(),
        created_at: now_string(),
        target_date: Some(target_date.to_string()),
        target_month: None,
        is_future: 0,
        source_entry_id: Some(entry.id.clone()),
        owner_id,
        position: 0,
        from_date: entry
            .target_date
            .clone()
            .or_else(|| Some(entry.created_at[0..10].to_string())),
        migrated_to_date: None,
        migrated_to_month: None,
        archived_at: None,
        chain_root_id: Some(chain_root_id),
        migrated_to_entry_id: None,
    };
    entry.migrated_to_entry_id = Some(child.id.clone());
    insert_full_entry(state, &child).await?;
    Ok(child)
}

async fn create_future_child(
    state: &AppState,
    entry: &mut Entry,
    target_month: Option<&str>,
    owner_id: i64,
) -> AppResult<Entry> {
    entry.status = STATUS_MIGRATED_FUTURE.to_string();
    entry.migrated_to_month = target_month.map(str::to_string);
    entry.migrated_to_date = None;
    entry.target_month = None;
    entry.is_future = 0;
    let chain_root_id = entry
        .chain_root_id
        .clone()
        .unwrap_or_else(|| entry.id.clone());
    entry.chain_root_id = Some(chain_root_id.clone());
    let child = Entry {
        id: Uuid::new_v4().to_string(),
        content: entry.content.clone(),
        entry_type: entry.entry_type.clone(),
        status: STATUS_OPEN.to_string(),
        created_at: now_string(),
        target_date: None,
        target_month: target_month.map(str::to_string),
        is_future: 1,
        source_entry_id: Some(entry.id.clone()),
        owner_id,
        position: 0,
        from_date: entry.target_date.clone(),
        migrated_to_date: None,
        migrated_to_month: None,
        archived_at: None,
        chain_root_id: Some(chain_root_id),
        migrated_to_entry_id: None,
    };
    entry.migrated_to_entry_id = Some(child.id.clone());
    insert_full_entry(state, &child).await?;
    Ok(child)
}

async fn collect_and_delete_children(
    state: &AppState,
    root_id: &str,
    owner_id: i64,
) -> AppResult<Vec<DeletedEntryInfo>> {
    let mut deleted = Vec::new();
    let mut stack = vec![root_id.to_string()];
    let mut seen = HashSet::new();

    while let Some(parent_id) = stack.pop() {
        if !seen.insert(parent_id.clone()) {
            continue;
        }
        let children = sqlx::query_as::<_, Entry>(&format!(
            "{ENTRY_SELECT} WHERE source_entry_id = ? AND owner_id = ?"
        ))
        .bind(&parent_id)
        .bind(owner_id)
        .fetch_all(state.db())
        .await?;

        for child in children {
            stack.push(child.id.clone());
            deleted.push(DeletedEntryInfo {
                id: child.id,
                target_date: child.target_date,
                month: child.target_month,
            });
        }
    }

    for child in &deleted {
        sqlx::query("DELETE FROM entries WHERE id = ? AND owner_id = ?")
            .bind(&child.id)
            .bind(owner_id)
            .execute(state.db())
            .await?;
    }

    Ok(deleted)
}

async fn sync_child_to_parent(state: &AppState, child: &Entry, owner_id: i64) -> AppResult<()> {
    let Some(parent_id) = child.source_entry_id.as_deref() else {
        return Ok(());
    };
    let mut parent = match fetch_entry_owned(state, parent_id, owner_id).await {
        Ok(parent) => parent,
        Err(AppError::NotFound(_)) => return Ok(()),
        Err(error) => return Err(error),
    };

    if child.is_future != 0 {
        parent.status = STATUS_MIGRATED_FUTURE.to_string();
        parent.migrated_to_month = child.target_month.clone();
        parent.migrated_to_date = None;
        parent.target_month = None;
        parent.is_future = 0;
    } else if let Some(target_date) = child.target_date.clone() {
        parent.status = STATUS_MIGRATED_FORWARD.to_string();
        parent.migrated_to_date = Some(target_date);
        parent.migrated_to_month = None;
        parent.target_month = None;
        parent.is_future = 0;
    }
    save_entry(state, &parent).await
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
    if entry.status == STATUS_MIGRATED_FUTURE && entry.migrated_to_month.is_none() {
        entry.migrated_to_month = entry.target_month.clone();
    }
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
    NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map(|date| date.format("%Y-%m-%d").to_string())
        .map_err(|_| AppError::BadRequest("Invalid date, expected YYYY-MM-DD".to_string()))
}

fn validate_month(value: &str) -> AppResult<String> {
    let value = value.trim();
    let value = value.get(0..7).unwrap_or(value);
    let date = format!("{value}-01");
    NaiveDate::parse_from_str(&date, "%Y-%m-%d")
        .map(|date| date.format("%Y-%m").to_string())
        .map_err(|_| AppError::BadRequest("Invalid month, expected YYYY-MM".to_string()))
}

fn now_string() -> String {
    Local::now()
        .naive_local()
        .format("%Y-%m-%d %H:%M:%S")
        .to_string()
}

fn today_string() -> String {
    Local::now().date_naive().format("%Y-%m-%d").to_string()
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

fn clean_markdown_regex(md: &str) -> String {
    let replacements = [
        (r"(?m)^`{3,}.*$", ""),
        (r"!\[([^\]]*)\]\([^)]+\)", "$1"),
        (r"\[([^\]]*)\]\([^)]+\)", "$1"),
        (r"(?m)^\s{0,3}#{1,6}\s+", ""),
        (r"(?m)^\s{0,3}>\s+", ""),
        (r"(?m)^\s{0,3}([-*_])\s*(\1\s*){2,}$", ""),
        (r"(\*\*|__)(.*?)\1", "$2"),
        (r"(\*|_)(.*?)\1", "$2"),
        (r"~~(.*?)~~", "$1"),
        (r"`([^`]*)`", "$1"),
        (r"(?m)^\s*[-*+]\s+(\[[ xX]\]\s+)?", ""),
        (r"(?m)^\s*\d+\.\s+", ""),
    ];
    let mut text = md.to_string();
    for (pattern, replacement) in replacements {
        if let Ok(regex) = Regex::new(pattern) {
            text = regex.replace_all(&text, replacement).to_string();
        }
    }
    text.trim().to_string()
}

fn entry_section_title(entry: &Entry) -> String {
    if entry.is_future != 0 && entry.target_month.is_none() {
        "## Future Log (Undetermined)".to_string()
    } else if let Some(month) = entry.target_month.as_deref() {
        format!("## Monthly Log: {month}")
    } else if let Some(date) = entry.target_date.as_deref() {
        format!("## {date}")
    } else {
        "## Inbox".to_string()
    }
}

fn entry_archive_path(entry: &Entry) -> (String, String) {
    if entry.is_future != 0 && entry.target_month.is_none() {
        ("Future_Log.md".to_string(), "# Future Log".to_string())
    } else if let Some(month) = entry.target_month.as_deref() {
        (
            format!("Monthly_Logs/{month}.md"),
            format!("# Monthly Log: {month}"),
        )
    } else if let Some(date) = entry.target_date.as_deref() {
        let year = &date[0..4];
        let month = &date[5..7];
        (
            format!("Daily_Logs/{year}/{month}/{date}.md"),
            format!("# Daily Log: {date}"),
        )
    } else {
        ("Inbox.md".to_string(), "# Inbox".to_string())
    }
}

fn format_entry_to_markdown(entry: &Entry) -> String {
    let mut prefix = "- ".to_string();
    if entry.entry_type == TYPE_TASK {
        prefix = match entry.status.as_str() {
            STATUS_COMPLETED => "- [x] ".to_string(),
            STATUS_CANCELLED => "- [-] ".to_string(),
            _ => "- [ ] ".to_string(),
        };
    } else if entry.entry_type == TYPE_IDEA {
        prefix = "- Idea: ".to_string();
    } else if entry.entry_type == TYPE_EVENT {
        prefix = "- Event: ".to_string();
    }

    let mut lines = entry.content.lines();
    let first = lines.next().unwrap_or_default();
    let suffix = match entry.status.as_str() {
        STATUS_MIGRATED_FORWARD => " > [Migrated]",
        STATUS_MIGRATED_FUTURE => " > [Future Log]",
        _ => "",
    };
    let mut markdown = format!("{prefix}{first}{suffix}");
    for line in lines {
        markdown.push_str(&format!("\n    {line}"));
    }
    markdown
}

fn title_case(value: &str) -> String {
    let mut chars = value.chars();
    match chars.next() {
        Some(first) => format!("{}{}", first.to_uppercase(), chars.as_str()),
        None => String::new(),
    }
}

fn escape_ics(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace(';', "\\;")
        .replace(',', "\\,")
        .replace('\n', "\\n")
        .replace('\r', "")
}

fn sanitized_extension(file_name: &str) -> String {
    FsPath::new(file_name)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_urlencoded_login() {
        let form = parse_urlencoded_login(b"username=alice&password=s3cret").unwrap();
        assert_eq!(form.username, "alice");
        assert_eq!(form.password, "s3cret");
    }

    #[test]
    fn parses_urlencoded_login_with_escaped_values() {
        let form =
            parse_urlencoded_login(b"username=alice%40example.com&password=a%2Bb%3D1").unwrap();
        assert_eq!(form.username, "alice@example.com");
        assert_eq!(form.password, "a+b=1");
    }

    #[test]
    fn parses_multipart_login() {
        let content_type = "multipart/form-data; boundary=----boundary";
        let body = b"------boundary\r\nContent-Disposition: form-data; name=\"username\"\r\n\r\nalice\r\n------boundary\r\nContent-Disposition: form-data; name=\"password\"\r\n\r\ns3cret\r\n------boundary--\r\n";
        let form = parse_multipart_login(content_type, body).unwrap();
        assert_eq!(form.username, "alice");
        assert_eq!(form.password, "s3cret");
    }

    #[test]
    fn rejects_missing_login_password() {
        let error = parse_urlencoded_login(b"username=alice").unwrap_err();
        assert!(error.to_string().contains("password is required"));
    }

    #[test]
    fn extracts_quoted_multipart_boundary() {
        let boundary = multipart_boundary("multipart/form-data; boundary=\"abc123\"").unwrap();
        assert_eq!(boundary, "abc123");
    }
}
