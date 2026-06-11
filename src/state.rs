use std::path::PathBuf;
use std::sync::Arc;

use sqlx::SqlitePool;

#[derive(Clone)]
pub struct AppState {
    inner: Arc<AppStateInner>,
}

pub struct AppStateInner {
    pub db: SqlitePool,
    pub secret_key: String,
    pub api_base_url: String,
    pub upload_dir: PathBuf,
    pub frontend_dist: PathBuf,
}

impl AppState {
    pub fn new(
        db: SqlitePool,
        secret_key: String,
        api_base_url: String,
        upload_dir: PathBuf,
        frontend_dist: PathBuf,
    ) -> Self {
        Self {
            inner: Arc::new(AppStateInner {
                db,
                secret_key,
                api_base_url,
                upload_dir,
                frontend_dist,
            }),
        }
    }

    pub fn db(&self) -> &SqlitePool {
        &self.inner.db
    }

    pub fn secret_key(&self) -> &str {
        &self.inner.secret_key
    }

    pub fn api_base_url(&self) -> &str {
        &self.inner.api_base_url
    }

    pub fn upload_dir(&self) -> &PathBuf {
        &self.inner.upload_dir
    }

    pub fn frontend_dist(&self) -> &PathBuf {
        &self.inner.frontend_dist
    }
}
