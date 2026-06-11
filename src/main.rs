mod auth;
mod config;
mod db;
mod error;
mod legacy_migration;
mod models;
mod routes;
mod state;

use anyhow::Context;
use axum::Router;
use clap::Parser;
use config::{Cli, Command, ServeArgs, UserCommand};
use state::AppState;
use tower_http::cors::CorsLayer;
use tower_http::services::{ServeDir, ServeFile};
use tower_http::trace::TraceLayer;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    let cli = Cli::parse();

    match cli.command.unwrap_or(Command::Serve(ServeArgs::default())) {
        Command::Serve(args) => serve(args).await,
        Command::MigrateDb(args) => {
            legacy_migration::run(args).await?;
            Ok(())
        }
        Command::Users(args) => run_user_command(args).await,
    }
}

async fn serve(args: ServeArgs) -> anyhow::Result<()> {
    let pool = db::connect(&args.database_url).await?;
    db::ensure_schema(&pool).await?;

    let state = AppState::new(
        pool,
        args.secret_key,
        args.api_base_url,
        args.upload_dir,
        args.frontend_dist,
    );

    let api_prefixed = routes::router(state.clone());
    let mut app = Router::new()
        .nest("/api", api_prefixed)
        .nest_service("/static/uploads", ServeDir::new(state.upload_dir().clone()))
        .nest_service(
            "/bullet-journal/static/uploads",
            ServeDir::new(state.upload_dir().clone()),
        )
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http());

    let index_file = state.frontend_dist().join("index.html");
    if index_file.exists() {
        app = app.fallback_service(
            ServeDir::new(state.frontend_dist().clone()).fallback(ServeFile::new(index_file)),
        );
    }

    let listener = tokio::net::TcpListener::bind(args.bind)
        .await
        .with_context(|| format!("failed to bind {}", args.bind))?;
    println!("rbullet-journal listening on http://{}", args.bind);
    axum::serve(listener, app).await?;
    Ok(())
}

async fn run_user_command(args: config::UserArgs) -> anyhow::Result<()> {
    let pool = db::connect(&args.database_url).await?;
    db::ensure_schema(&pool).await?;

    match args.command {
        UserCommand::List => {
            let users = sqlx::query_as::<_, models::User>(
                "SELECT id, username, hashed_password FROM users ORDER BY id",
            )
            .fetch_all(&pool)
            .await?;
            println!("{:<8} | Username", "ID");
            println!("{}", "-".repeat(40));
            for user in users {
                println!("{:<8} | {}", user.id, user.username);
            }
        }
        UserCommand::Delete { username } => {
            let result = sqlx::query("DELETE FROM users WHERE username = ?")
                .bind(username.trim())
                .execute(&pool)
                .await?;
            println!("deleted users: {}", result.rows_affected());
        }
        UserCommand::Passwd {
            username,
            new_password,
        } => {
            let hashed = auth::get_password_hash(&new_password)
                .map_err(|error| anyhow::anyhow!(error.to_string()))?;
            let result = sqlx::query("UPDATE users SET hashed_password = ? WHERE username = ?")
                .bind(hashed)
                .bind(username.trim())
                .execute(&pool)
                .await?;
            println!("updated users: {}", result.rows_affected());
        }
    }

    Ok(())
}
