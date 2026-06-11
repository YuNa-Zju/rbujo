use std::net::SocketAddr;
use std::path::PathBuf;

use clap::{Args, Parser, Subcommand};

#[derive(Debug, Parser)]
#[command(name = "rbullet-journal")]
#[command(about = "Rust backend and migration tools for Bullet Journal")]
pub struct Cli {
    #[command(subcommand)]
    pub command: Option<Command>,
}

#[derive(Debug, Subcommand)]
pub enum Command {
    Serve(ServeArgs),
    MigrateDb(MigrateDbArgs),
    MigrateTextTags(MigrateTextTagsArgs),
    Users(UserArgs),
}

#[derive(Debug, Args, Clone)]
pub struct ServeArgs {
    #[arg(
        long,
        env = "DATABASE_URL",
        default_value = "sqlite://bullet_journal_v2.db"
    )]
    pub database_url: String,

    #[arg(long, env = "BIND_ADDR", default_value = "0.0.0.0:10001")]
    pub bind: SocketAddr,

    #[arg(long, env = "UPLOAD_DIR", default_value = "uploads")]
    pub upload_dir: PathBuf,

    #[arg(long, env = "FRONTEND_DIST", default_value = "frontend/dist")]
    pub frontend_dist: PathBuf,

    #[arg(long, env = "API_BASE_URL", default_value = "http://localhost:10001")]
    pub api_base_url: String,

    #[arg(
        long,
        env = "SECRET_KEY",
        default_value = "dev_secret_key_change_in_prod"
    )]
    pub secret_key: String,
}

#[derive(Debug, Args, Clone)]
pub struct MigrateDbArgs {
    #[arg(long, default_value = "bullet_journal.db")]
    pub source: PathBuf,

    #[arg(long, default_value = "bullet_journal_v2.db")]
    pub target: PathBuf,

    #[arg(long)]
    pub force: bool,

    #[arg(long)]
    pub dry_run: bool,
}

#[derive(Debug, Args, Clone)]
pub struct MigrateTextTagsArgs {
    #[arg(long, env = "RBUJO_APP_DIR", default_value = ".rbujo-local")]
    pub app_dir: PathBuf,
}

#[derive(Debug, Args, Clone)]
pub struct UserArgs {
    #[arg(
        long,
        env = "DATABASE_URL",
        default_value = "sqlite://bullet_journal_v2.db"
    )]
    pub database_url: String,

    #[command(subcommand)]
    pub command: UserCommand,
}

#[derive(Debug, Subcommand, Clone)]
pub enum UserCommand {
    List,
    Delete {
        username: String,
    },
    Passwd {
        username: String,
        new_password: String,
    },
}

impl Default for ServeArgs {
    fn default() -> Self {
        Self {
            database_url: "sqlite://bullet_journal_v2.db".to_string(),
            bind: "0.0.0.0:10001".parse().expect("valid default bind addr"),
            upload_dir: PathBuf::from("uploads"),
            frontend_dist: PathBuf::from("frontend/dist"),
            api_base_url: "http://localhost:10001".to_string(),
            secret_key: "dev_secret_key_change_in_prod".to_string(),
        }
    }
}
