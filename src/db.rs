use std::str::FromStr;

use anyhow::Context;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{Executor, SqlitePool};

pub async fn connect(database_url: &str) -> anyhow::Result<SqlitePool> {
    let options = SqliteConnectOptions::from_str(database_url)
        .with_context(|| format!("invalid database url: {database_url}"))?
        .create_if_missing(true)
        .foreign_keys(true);

    SqlitePoolOptions::new()
        .max_connections(8)
        .connect_with(options)
        .await
        .with_context(|| format!("failed to connect database: {database_url}"))
}

pub async fn ensure_schema(pool: &SqlitePool) -> anyhow::Result<()> {
    sqlx::raw_sql(
        r#"
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            hashed_password TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS ix_users_username ON users(username);

        CREATE TABLE IF NOT EXISTS entries (
            id TEXT PRIMARY KEY,
            content TEXT NOT NULL DEFAULT '',
            entry_type TEXT NOT NULL DEFAULT 'task'
                CHECK(entry_type IN ('task', 'idea', 'event')),
            status TEXT NOT NULL DEFAULT 'open'
                CHECK(status IN ('open', 'completed', 'cancelled', 'forward', 'future')),
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            target_date TEXT,
            target_month TEXT,
            is_future INTEGER NOT NULL DEFAULT 0 CHECK(is_future IN (0, 1)),
            source_entry_id TEXT,
            owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            position INTEGER NOT NULL DEFAULT 0,
            from_date TEXT,
            migrated_to_date TEXT,
            migrated_to_month TEXT,
            archived_at TEXT,
            chain_root_id TEXT,
            migrated_to_entry_id TEXT,
            CHECK(target_date IS NULL OR length(target_date) = 10),
            CHECK(target_month IS NULL OR length(target_month) = 7),
            CHECK(migrated_to_date IS NULL OR length(migrated_to_date) = 10),
            CHECK(migrated_to_month IS NULL OR length(migrated_to_month) = 7),
            CHECK(NOT (target_date IS NOT NULL AND target_month IS NOT NULL)),
            CHECK(is_future = 0 OR target_date IS NULL)
        );

        CREATE INDEX IF NOT EXISTS ix_entries_owner_date
            ON entries(owner_id, target_date, position, created_at);
        CREATE INDEX IF NOT EXISTS ix_entries_owner_month
            ON entries(owner_id, target_month, position, created_at);
        CREATE INDEX IF NOT EXISTS ix_entries_source
            ON entries(source_entry_id);
        CREATE INDEX IF NOT EXISTS ix_entries_chain_root
            ON entries(owner_id, chain_root_id);
        CREATE INDEX IF NOT EXISTS ix_entries_archived
            ON entries(owner_id, archived_at);

        CREATE TABLE IF NOT EXISTS shared_links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            target_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
            token TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS ix_shared_links_token ON shared_links(token);
        CREATE INDEX IF NOT EXISTS ix_shared_links_target_id ON shared_links(target_id);

        CREATE TABLE IF NOT EXISTS search_chunks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
            owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            chunk_text TEXT NOT NULL,
            embedding_json TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS ix_search_chunks_entry
            ON search_chunks(entry_id);
        CREATE INDEX IF NOT EXISTS ix_search_chunks_owner
            ON search_chunks(owner_id);

        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        INSERT OR IGNORE INTO schema_migrations(version, name)
        VALUES (1, 'rust_v2_schema');
        "#,
    )
    .execute(pool)
    .await?;

    add_column_if_missing(pool, "entries", "migrated_to_month", "TEXT").await?;
    add_column_if_missing(pool, "entries", "position", "INTEGER NOT NULL DEFAULT 0").await?;
    add_column_if_missing(pool, "entries", "from_date", "TEXT").await?;
    add_column_if_missing(pool, "entries", "migrated_to_date", "TEXT").await?;
    add_column_if_missing(pool, "entries", "archived_at", "TEXT").await?;
    add_column_if_missing(pool, "entries", "chain_root_id", "TEXT").await?;
    add_column_if_missing(pool, "entries", "migrated_to_entry_id", "TEXT").await?;

    repair_created_at_dates(pool).await?;
    Ok(())
}

async fn add_column_if_missing(
    pool: &SqlitePool,
    table: &str,
    column: &str,
    definition: &str,
) -> anyhow::Result<()> {
    let escaped = table.replace('"', "\"\"");
    let pragma = format!("PRAGMA table_info(\"{escaped}\")");
    let rows = sqlx::query(&pragma).fetch_all(pool).await?;
    let exists = rows.iter().any(|row| {
        let name: String = row.try_get("name").unwrap_or_default();
        name == column
    });

    if !exists {
        let sql = format!("ALTER TABLE {table} ADD COLUMN {column} {definition}");
        pool.execute(sql.as_str()).await?;
    }

    Ok(())
}

async fn repair_created_at_dates(pool: &SqlitePool) -> anyhow::Result<()> {
    sqlx::query(
        r#"
        UPDATE entries
        SET created_at = created_at || ' 00:00:00'
        WHERE created_at IS NOT NULL
          AND length(created_at) = 10
        "#,
    )
    .execute(pool)
    .await?;
    Ok(())
}

use sqlx::Row;
