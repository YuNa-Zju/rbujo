use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use bcrypt::{DEFAULT_COST, hash, verify};
use chrono::{Duration, Utc};
use hmac::{Hmac, Mac};
use jsonwebtoken::{Algorithm, DecodingKey, EncodingKey, Header, Validation, decode, encode};
use serde::{Deserialize, Serialize};
use sha2::Sha256;

use crate::error::{AppError, AppResult};
use crate::models::User;
use crate::state::AppState;

const ACCESS_TOKEN_EXPIRE_MINUTES: i64 = 30;
const REFRESH_TOKEN_EXPIRE_DAYS: i64 = 7;
const CALENDAR_TOKEN_EXPIRE_DAYS: i64 = 365 * 10;

type HmacSha256 = Hmac<Sha256>;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub exp: i64,
    #[serde(rename = "type")]
    pub token_type: String,
}

#[derive(Debug, Clone)]
pub struct CurrentUser(pub User);

impl FromRequestParts<AppState> for CurrentUser {
    type Rejection = AppError;

    fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> impl std::future::Future<Output = Result<Self, Self::Rejection>> + Send {
        let token = bearer_token(parts).map(str::to_string);
        let state = state.clone();

        async move {
            let token = token?;
            let claims = decode_token(&token, state.secret_key(), Some("access"))?;
            let user = sqlx::query_as::<_, User>(
                "SELECT id, username, hashed_password FROM users WHERE username = ?",
            )
            .bind(claims.sub)
            .fetch_optional(state.db())
            .await?
            .ok_or_else(|| AppError::Unauthorized("Could not validate credentials".to_string()))?;

            Ok(CurrentUser(user))
        }
    }
}

fn bearer_token(parts: &Parts) -> AppResult<&str> {
    let header = parts
        .headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .ok_or_else(|| AppError::Unauthorized("Could not validate credentials".to_string()))?;

    header
        .strip_prefix("Bearer ")
        .or_else(|| header.strip_prefix("bearer "))
        .ok_or_else(|| AppError::Unauthorized("Could not validate credentials".to_string()))
}

pub fn verify_password(plain_password: &str, hashed_password: &str) -> bool {
    verify(plain_password, hashed_password).unwrap_or(false)
}

pub fn get_password_hash(password: &str) -> AppResult<String> {
    hash(password, DEFAULT_COST).map_err(|error| AppError::Internal(error.to_string()))
}

pub fn create_access_token(subject: &str, secret: &str) -> AppResult<String> {
    create_token(
        subject,
        "access",
        Duration::minutes(ACCESS_TOKEN_EXPIRE_MINUTES),
        secret,
    )
}

pub fn create_refresh_token(subject: &str, secret: &str) -> AppResult<String> {
    create_token(
        subject,
        "refresh",
        Duration::days(REFRESH_TOKEN_EXPIRE_DAYS),
        secret,
    )
}

pub fn create_calendar_token(user_id: i64, secret: &str) -> AppResult<String> {
    create_token(
        &user_id.to_string(),
        "calendar_feed",
        Duration::days(CALENDAR_TOKEN_EXPIRE_DAYS),
        secret,
    )
}

fn create_token(
    subject: &str,
    token_type: &str,
    duration: Duration,
    secret: &str,
) -> AppResult<String> {
    let claims = Claims {
        sub: subject.to_string(),
        exp: (Utc::now() + duration).timestamp(),
        token_type: token_type.to_string(),
    };

    encode(
        &Header::new(Algorithm::HS256),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|error| AppError::Internal(error.to_string()))
}

pub fn decode_token(token: &str, secret: &str, expected_type: Option<&str>) -> AppResult<Claims> {
    let mut validation = Validation::new(Algorithm::HS256);
    validation.validate_exp = true;
    let data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &validation,
    )
    .map_err(|_| AppError::Unauthorized("Could not validate credentials".to_string()))?;

    if let Some(expected_type) = expected_type {
        if data.claims.token_type != expected_type {
            return Err(AppError::Unauthorized(
                "Could not validate credentials".to_string(),
            ));
        }
    }

    Ok(data.claims)
}

pub fn verify_calendar_token(token: &str, secret: &str) -> Option<i64> {
    decode_token(token, secret, Some("calendar_feed"))
        .ok()
        .and_then(|claims| claims.sub.parse::<i64>().ok())
}

pub fn generate_recovery_key(
    username: &str,
    hashed_password: &str,
    secret: &str,
) -> AppResult<String> {
    let raw_data = format!("RECOVERY:{username}:{hashed_password}");
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes())
        .map_err(|error| AppError::Internal(error.to_string()))?;
    mac.update(raw_data.as_bytes());
    let bytes = mac.finalize().into_bytes();
    let hex = uppercase_hex(&bytes);
    let key_part = &hex[..16];
    Ok(format!(
        "rK-{}-{}-{}-{}",
        &key_part[0..4],
        &key_part[4..8],
        &key_part[8..12],
        &key_part[12..16]
    ))
}

pub fn verify_recovery_key(user: &User, provided_key: &str, secret: &str) -> AppResult<bool> {
    let expected = generate_recovery_key(&user.username, &user.hashed_password, secret)?;
    Ok(constant_time_eq(
        expected.as_bytes(),
        provided_key.as_bytes(),
    ))
}

fn uppercase_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789ABCDEF";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(HEX[(byte >> 4) as usize] as char);
        out.push(HEX[(byte & 0x0f) as usize] as char);
    }
    out
}

fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }
    let mut diff = 0u8;
    for (a, b) in left.iter().zip(right.iter()) {
        diff |= a ^ b;
    }
    diff == 0
}
