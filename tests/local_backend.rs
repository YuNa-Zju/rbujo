use std::fs::{self, FileTimes};
use std::io::{Cursor, Read, Write};
use std::path::Path;
use std::time::{Duration, SystemTime};

use flate2::{Compression, write::GzEncoder};
use rbullet_journal::db;
use rbullet_journal::local::{
    CreateEntryInput, EntryPatch, LocalBackend, SearchMode, SearchOptions, UploadInput,
};
use sha2::{Digest, Sha256};
use uuid::Uuid;
use zip::{ZipWriter, write::SimpleFileOptions};

fn temp_app_dir(label: &str) -> std::path::PathBuf {
    let path = std::env::temp_dir().join(format!("rbujo-{label}-{}", Uuid::new_v4()));
    fs::create_dir_all(&path).expect("create temp app dir");
    path
}

fn sqlite_url(dir: &std::path::Path) -> String {
    format!("sqlite://{}", dir.join("rbujo.sqlite3").display())
}

fn default_workspace_path(dir: &std::path::Path) -> std::path::PathBuf {
    dir.join("journal")
}

fn attachment_path(dir: &std::path::Path, relative_path: &str) -> std::path::PathBuf {
    default_workspace_path(dir).join(relative_path)
}

fn test_sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn bjk_archive_bytes(backup: serde_json::Value) -> Vec<u8> {
    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    encoder
        .write_all(serde_json::to_string(&backup).unwrap().as_bytes())
        .unwrap();
    let payload = encoder.finish().unwrap();
    let manifest = serde_json::json!({
        "format": "fun.yunazju.rbujo.bjk",
        "container_version": 1,
        "created_at": "2026-06-17T00:00:00Z",
        "payload": {
            "path": "data/backup.json.gz",
            "media_type": "application/json",
            "compression": "gzip"
        }
    });

    let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
    let options = SimpleFileOptions::default();
    writer.start_file("manifest.json", options).unwrap();
    writer
        .write_all(serde_json::to_string(&manifest).unwrap().as_bytes())
        .unwrap();
    writer.start_file("data/backup.json.gz", options).unwrap();
    writer.write_all(&payload).unwrap();
    writer.finish().unwrap().into_inner()
}

#[tokio::test]
async fn archived_entries_are_hidden_from_daily_but_search_can_include_them() {
    let dir = temp_app_dir("archive");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    let entry = backend
        .create_entry(CreateEntryInput {
            content: "归档测试条目".to_string(),
            entry_type: "task".to_string(),
            target_date: Some("2026-06-11".to_string()),
            target_month: None,
            is_future: false,
            tags: vec!["毕业设计".to_string()],
        })
        .await
        .unwrap();

    backend.archive_entry(entry.id.clone()).await.unwrap();

    let visible = backend.get_daily_log("2026-06-11", false).await.unwrap();
    assert!(visible.iter().all(|item| item.id != entry.id));

    let archived = backend.get_daily_log("2026-06-11", true).await.unwrap();
    assert!(archived.iter().any(|item| item.id == entry.id));

    let hidden_search = backend
        .search_entries(SearchOptions {
            query: "归档测试".to_string(),
            mode: SearchMode::Text,
            include_archived: false,
            ..Default::default()
        })
        .await
        .unwrap();
    assert!(hidden_search.iter().all(|item| item.entry.id != entry.id));

    let included_search = backend
        .search_entries(SearchOptions {
            query: "归档测试".to_string(),
            mode: SearchMode::Text,
            include_archived: true,
            ..Default::default()
        })
        .await
        .unwrap();
    assert_eq!(included_search[0].entry.id, entry.id);

    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn native_tags_are_stored_separately_and_filter_search() {
    let dir = temp_app_dir("native-tags");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    let entry = backend
        .create_entry(CreateEntryInput {
            content: "复习概率论，不在正文写 hashtag".to_string(),
            entry_type: "idea".to_string(),
            target_date: Some("2026-06-11".to_string()),
            target_month: None,
            is_future: false,
            tags: vec!["课程".to_string(), "#AI".to_string(), "课程".to_string()],
        })
        .await
        .unwrap();

    assert!(entry.tags.contains(&"课程".to_string()));
    assert!(entry.tags.contains(&"AI".to_string()));
    assert_eq!(entry.tags.len(), 2);

    let by_tag = backend
        .search_entries(SearchOptions {
            query: String::new(),
            mode: SearchMode::Text,
            tags: vec!["AI".to_string()],
            ..Default::default()
        })
        .await
        .unwrap();
    assert_eq!(by_tag.len(), 1);
    assert_eq!(by_tag[0].entry.id, entry.id);

    let updated = backend
        .update_entry(
            entry.id.clone(),
            EntryPatch {
                tags: Some(vec!["数学".to_string()]),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    assert_eq!(updated.tags, vec!["数学".to_string()]);

    let old_tag = backend
        .search_entries(SearchOptions {
            query: String::new(),
            mode: SearchMode::Text,
            tags: vec!["AI".to_string()],
            ..Default::default()
        })
        .await
        .unwrap();
    assert!(old_tag.is_empty());

    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn native_tag_search_is_case_insensitive() {
    let dir = temp_app_dir("native-tag-case");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    let entry = backend
        .create_entry(CreateEntryInput {
            content: "大小写 tag 搜索".to_string(),
            entry_type: "idea".to_string(),
            target_date: Some("2026-06-11".to_string()),
            target_month: None,
            is_future: false,
            tags: vec!["AI".to_string()],
        })
        .await
        .unwrap();

    let lower = backend
        .search_entries(SearchOptions {
            query: String::new(),
            tags: vec!["ai".to_string()],
            ..Default::default()
        })
        .await
        .unwrap();
    assert_eq!(lower.len(), 1);
    assert_eq!(lower[0].entry.id, entry.id);

    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn native_tag_list_reads_tags_without_entry_search() {
    let dir = temp_app_dir("native-tag-list");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    backend
        .create_entry(CreateEntryInput {
            content: "标签列表来源一".to_string(),
            entry_type: "idea".to_string(),
            target_date: Some("2026-06-11".to_string()),
            target_month: None,
            is_future: false,
            tags: vec!["课程".to_string(), "AI".to_string()],
        })
        .await
        .unwrap();
    backend
        .create_entry(CreateEntryInput {
            content: "标签列表来源二".to_string(),
            entry_type: "task".to_string(),
            target_date: Some("2026-06-12".to_string()),
            target_month: None,
            is_future: false,
            tags: vec!["ai".to_string(), "数学".to_string()],
        })
        .await
        .unwrap();
    let stale = backend
        .create_entry(CreateEntryInput {
            content: "临时标签稍后移除".to_string(),
            entry_type: "task".to_string(),
            target_date: Some("2026-06-13".to_string()),
            target_month: None,
            is_future: false,
            tags: vec!["临时".to_string()],
        })
        .await
        .unwrap();

    let tags = backend.list_tags().await.unwrap();

    assert_eq!(tags, vec!["AI", "临时", "数学", "课程"]);

    backend
        .update_entry(
            stale.id,
            EntryPatch {
                tags: Some(Vec::new()),
                ..Default::default()
            },
        )
        .await
        .unwrap();

    let tags = backend.list_tags().await.unwrap();
    assert_eq!(tags, vec!["AI", "数学", "课程"]);

    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn tag_migration_script_parses_existing_text_tags_once() {
    let dir = temp_app_dir("text-tag-migration");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    let entry = backend
        .create_entry(CreateEntryInput {
            content: "#课程 #AI\n迁移旧标签到原生字段".to_string(),
            entry_type: "idea".to_string(),
            target_date: Some("2026-06-11".to_string()),
            target_month: None,
            is_future: false,
            tags: Vec::new(),
        })
        .await
        .unwrap();
    assert!(entry.tags.is_empty());

    let migrated = backend.migrate_text_tags_to_native().await.unwrap();
    assert_eq!(migrated, 1);

    let by_tag = backend
        .search_entries(SearchOptions {
            query: String::new(),
            mode: SearchMode::Text,
            tags: vec!["课程".to_string()],
            ..Default::default()
        })
        .await
        .unwrap();
    assert_eq!(by_tag.len(), 1);
    assert_eq!(by_tag[0].entry.id, entry.id);
    assert!(by_tag[0].entry.tags.contains(&"课程".to_string()));
    assert!(by_tag[0].entry.tags.contains(&"AI".to_string()));

    let second_run = backend.migrate_text_tags_to_native().await.unwrap();
    assert_eq!(second_run, 0);

    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn migration_chain_tracks_daily_future_daily_links() {
    let dir = temp_app_dir("chain");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    let root = backend
        .create_entry(CreateEntryInput {
            content: "准备暑假项目".to_string(),
            entry_type: "task".to_string(),
            target_date: Some("2026-06-11".to_string()),
            target_month: None,
            is_future: false,
            tags: vec!["毕业设计".to_string()],
        })
        .await
        .unwrap();

    let to_future = backend
        .migrate_entry_to_future(root.id.clone(), Some("2026-07".to_string()))
        .await
        .unwrap();
    let future_child = to_future.created_entry;
    assert_eq!(
        to_future.updated_source.migrated_to_entry_id,
        Some(future_child.id.clone())
    );
    assert_eq!(future_child.chain_root_id, Some(root.id.clone()));
    assert_eq!(future_child.source_entry_id, Some(root.id.clone()));

    let to_daily = backend
        .migrate_entry_to_date(future_child.id.clone(), "2026-07-02".to_string())
        .await
        .unwrap();
    assert_eq!(
        to_daily.updated_source.migrated_to_entry_id,
        Some(to_daily.created_entry.id.clone())
    );
    assert_eq!(to_daily.created_entry.chain_root_id, Some(root.id.clone()));

    let chain = backend.get_migration_chain(root.id.clone()).await.unwrap();
    let chain_ids: Vec<_> = chain.into_iter().map(|entry| entry.id).collect();
    assert_eq!(
        chain_ids,
        vec![root.id, future_child.id, to_daily.created_entry.id]
    );

    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn opening_local_backend_adopts_legacy_owner_and_backfills_chain() {
    let dir = temp_app_dir("legacy-adopt");
    let pool = db::connect(&sqlite_url(&dir)).await.unwrap();
    db::ensure_schema(&pool).await.unwrap();
    let owner_id = sqlx::query("INSERT INTO users(username, hashed_password) VALUES ('old', 'x')")
        .execute(&pool)
        .await
        .unwrap()
        .last_insert_rowid();
    sqlx::query(
        r#"
        INSERT INTO entries(
            id, content, entry_type, status, created_at, target_date, is_future, owner_id,
            position, migrated_to_month
        ) VALUES ('legacy-root', '旧任务 #旧标签', 'task', 'future', '2026-06-10 08:00:00',
                  '2026-06-10', 0, ?, 0, '2026-07')
        "#,
    )
    .bind(owner_id)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        r#"
        INSERT INTO entries(
            id, content, entry_type, status, created_at, target_month, is_future, source_entry_id,
            owner_id, position, from_date
        ) VALUES ('legacy-child', '旧任务 #旧标签', 'task', 'open', '2026-06-10 08:01:00',
                  '2026-07', 1, 'legacy-root', ?, 0, '2026-06-10')
        "#,
    )
    .bind(owner_id)
    .execute(&pool)
    .await
    .unwrap();
    drop(pool);

    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    let daily = backend.get_daily_log("2026-06-10", true).await.unwrap();
    assert!(daily.iter().any(|entry| entry.id == "legacy-root"));

    let chain = backend
        .get_migration_chain("legacy-root".to_string())
        .await
        .unwrap();
    let ids: Vec<_> = chain.into_iter().map(|entry| entry.id).collect();
    assert_eq!(
        ids,
        vec!["legacy-root".to_string(), "legacy-child".to_string()]
    );

    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn opening_local_backend_repairs_stale_migrated_to_pointer() {
    let dir = temp_app_dir("legacy-stale-chain");
    let pool = db::connect(&sqlite_url(&dir)).await.unwrap();
    db::ensure_schema(&pool).await.unwrap();
    let owner_id = sqlx::query("INSERT INTO users(username, hashed_password) VALUES ('old', 'x')")
        .execute(&pool)
        .await
        .unwrap()
        .last_insert_rowid();
    sqlx::query(
        r#"
        INSERT INTO entries(
            id, content, entry_type, status, created_at, target_date, owner_id,
            migrated_to_entry_id
        ) VALUES ('stale-root', '旧链路 stale 指针', 'task', 'forward',
                  '2026-06-10 08:00:00', '2026-06-10', ?, 'missing-child')
        "#,
    )
    .bind(owner_id)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        r#"
        INSERT INTO entries(
            id, content, entry_type, status, created_at, target_date, source_entry_id,
            owner_id
        ) VALUES ('real-child', '旧链路 stale 指针', 'task', 'open',
                  '2026-06-11 08:00:00', '2026-06-11', 'stale-root', ?)
        "#,
    )
    .bind(owner_id)
    .execute(&pool)
    .await
    .unwrap();
    drop(pool);

    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    let chain = backend
        .get_migration_chain("stale-root".to_string())
        .await
        .unwrap();
    let ids: Vec<_> = chain.into_iter().map(|entry| entry.id).collect();
    assert_eq!(
        ids,
        vec!["stale-root".to_string(), "real-child".to_string()]
    );

    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn reopen_deletes_downstream_migration_chain() {
    let dir = temp_app_dir("reopen");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    let root = backend
        .create_entry(CreateEntryInput {
            content: "重新打开迁移任务".to_string(),
            entry_type: "task".to_string(),
            target_date: Some("2026-06-11".to_string()),
            target_month: None,
            is_future: false,
            tags: vec!["毕业设计".to_string()],
        })
        .await
        .unwrap();
    let future = backend
        .migrate_entry_to_future(root.id.clone(), Some("2026-07".to_string()))
        .await
        .unwrap()
        .created_entry;
    let daily = backend
        .migrate_entry_to_date(future.id.clone(), "2026-07-05".to_string())
        .await
        .unwrap()
        .created_entry;

    let reopened = backend.reopen_entry(root.id.clone()).await.unwrap();
    assert_eq!(reopened.updated_entry.status, "open");
    assert_eq!(reopened.updated_entry.migrated_to_entry_id, None);
    let deleted_ids: Vec<_> = reopened
        .deleted_entries
        .into_iter()
        .map(|entry| entry.id)
        .collect();
    assert_eq!(deleted_ids, vec![future.id.clone(), daily.id.clone()]);

    let chain = backend.get_migration_chain(root.id.clone()).await.unwrap();
    assert_eq!(chain.len(), 1);
    assert_eq!(chain[0].id, root.id);

    let future_search = backend
        .search_entries(SearchOptions {
            query: "重新打开".to_string(),
            mode: SearchMode::Text,
            include_archived: true,
            ..Default::default()
        })
        .await
        .unwrap();
    assert_eq!(future_search.len(), 1);
    assert_eq!(future_search[0].entry.id, root.id);

    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn archived_migrated_stubs_remain_searchable_for_archive_restore() {
    let dir = temp_app_dir("archive-stub");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    let root = backend
        .create_entry(CreateEntryInput {
            content: "归档一个已迁移任务".to_string(),
            entry_type: "task".to_string(),
            target_date: Some("2026-06-11".to_string()),
            target_month: None,
            is_future: false,
            tags: Vec::new(),
        })
        .await
        .unwrap();
    backend
        .migrate_entry_to_future(root.id.clone(), Some("2026-07".to_string()))
        .await
        .unwrap();
    backend.archive_entry(root.id.clone()).await.unwrap();

    let archived = backend
        .search_entries(SearchOptions {
            query: String::new(),
            include_archived: true,
            ..Default::default()
        })
        .await
        .unwrap();
    assert!(archived.iter().any(|result| result.entry.id == root.id));

    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn hard_delete_middle_entry_removes_downstream_and_repairs_parent_link() {
    let dir = temp_app_dir("hard-delete-chain");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    let root = backend
        .create_entry(CreateEntryInput {
            content: "删除中间迁移节点".to_string(),
            entry_type: "task".to_string(),
            target_date: Some("2026-06-11".to_string()),
            target_month: None,
            is_future: false,
            tags: Vec::new(),
        })
        .await
        .unwrap();
    let future = backend
        .migrate_entry_to_future(root.id.clone(), Some("2026-07".to_string()))
        .await
        .unwrap()
        .created_entry;
    let daily = backend
        .migrate_entry_to_date(future.id.clone(), "2026-07-05".to_string())
        .await
        .unwrap()
        .created_entry;

    backend.delete_entry(future.id.clone()).await.unwrap();
    let chain = backend.get_migration_chain(root.id.clone()).await.unwrap();
    assert_eq!(chain.len(), 1);
    assert_eq!(chain[0].migrated_to_entry_id, None);

    let results = backend
        .search_entries(SearchOptions {
            query: "删除中间迁移节点".to_string(),
            include_archived: true,
            ..Default::default()
        })
        .await
        .unwrap();
    assert!(results.iter().all(|result| result.entry.id != future.id));
    assert!(results.iter().all(|result| result.entry.id != daily.id));

    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn future_entry_can_move_between_month_and_someday() {
    let dir = temp_app_dir("future-move");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    let entry = backend
        .create_entry(CreateEntryInput {
            content: "无固定日期的未来任务".to_string(),
            entry_type: "task".to_string(),
            target_date: None,
            target_month: Some("2026-09".to_string()),
            is_future: true,
            tags: Vec::new(),
        })
        .await
        .unwrap();

    let someday = backend
        .move_future_entry(entry.id.clone(), None)
        .await
        .unwrap();
    assert!(someday.is_future);
    assert_eq!(someday.target_month, None);
    assert_eq!(someday.target_date, None);

    let moved = backend
        .move_future_entry(entry.id.clone(), Some("2026-10".to_string()))
        .await
        .unwrap();
    assert_eq!(moved.target_month, Some("2026-10".to_string()));

    let future_log = backend.get_future_log(false).await.unwrap();
    assert!(future_log.future_log.is_empty());
    assert_eq!(future_log.monthly_log["2026-10"][0].id, entry.id);

    backend
        .update_entry(
            entry.id.clone(),
            EntryPatch {
                status: Some("completed".to_string()),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    let completed_move = backend
        .move_future_entry(entry.id.clone(), Some("2026-11".to_string()))
        .await
        .unwrap();
    assert_eq!(completed_move.status, "completed");
    assert_eq!(completed_move.target_month, Some("2026-11".to_string()));

    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn future_markdown_files_are_synced_for_someday_and_monthly_entries() {
    let dir = temp_app_dir("future-markdown-disk");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    backend
        .create_entry(CreateEntryInput {
            content: "someday disk plan".to_string(),
            entry_type: "idea".to_string(),
            target_date: None,
            target_month: None,
            is_future: true,
            tags: vec!["future".to_string()],
        })
        .await
        .unwrap();
    backend
        .create_entry(CreateEntryInput {
            content: "july disk plan".to_string(),
            entry_type: "task".to_string(),
            target_date: None,
            target_month: Some("2026-07".to_string()),
            is_future: true,
            tags: Vec::new(),
        })
        .await
        .unwrap();

    let files = backend.sync_future_markdown_files().await.unwrap();
    let paths = files
        .iter()
        .map(|file| file.relative_path.as_str())
        .collect::<Vec<_>>();
    assert!(paths.contains(&"Future/Future.md"));
    assert!(paths.contains(&"Future/2026/07.md"));

    let someday = fs::read_to_string(dir.join("journal/Future/Future.md")).unwrap();
    assert!(someday.contains("- someday disk plan"));
    assert!(someday.contains("Tags: #future"));
    let monthly = fs::read_to_string(dir.join("journal/Future/2026/07.md")).unwrap();
    assert!(monthly.contains("- [ ] july disk plan"));

    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn future_markdown_imports_external_edits_when_reading_future_log() {
    let dir = temp_app_dir("future-markdown-import");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    let entry = backend
        .create_entry(CreateEntryInput {
            content: "future original body".to_string(),
            entry_type: "task".to_string(),
            target_date: None,
            target_month: None,
            is_future: true,
            tags: Vec::new(),
        })
        .await
        .unwrap();
    backend.sync_future_markdown_files().await.unwrap();
    let markdown_path = dir.join("journal/Future/Future.md");
    fs::write(
        &markdown_path,
        "# Future\n\n- [x] future body edited from markdown #external\n- new someday idea #idea\n",
    )
    .unwrap();
    let file = fs::OpenOptions::new()
        .write(true)
        .open(&markdown_path)
        .unwrap();
    file.set_times(FileTimes::new().set_modified(SystemTime::now() + Duration::from_secs(60)))
        .unwrap();

    let future_log = backend.get_future_log(false).await.unwrap();
    let edited = future_log
        .future_log
        .iter()
        .find(|item| item.id == entry.id)
        .expect("existing future entry should be updated from markdown");
    assert_eq!(edited.content, "future body edited from markdown");
    assert_eq!(edited.status, "completed");
    assert_eq!(edited.tags, vec!["external".to_string()]);
    assert!(
        future_log
            .future_log
            .iter()
            .any(|item| item.entry_type == "idea" && item.content == "new someday idea")
    );

    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn future_log_read_generates_missing_markdown_files_for_existing_entries() {
    let dir = temp_app_dir("future-markdown-read-writes");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    backend
        .create_entry(CreateEntryInput {
            content: "existing future plan".to_string(),
            entry_type: "task".to_string(),
            target_date: None,
            target_month: Some("2026-08".to_string()),
            is_future: true,
            tags: Vec::new(),
        })
        .await
        .unwrap();
    fs::remove_file(dir.join("journal/Future/2026/08.md")).ok();

    backend.get_future_log(false).await.unwrap();

    let monthly = fs::read_to_string(dir.join("journal/Future/2026/08.md")).unwrap();
    assert!(monthly.contains("- [ ] existing future plan"));

    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn markdown_workspace_switch_writes_future_markdown_files() {
    let dir = temp_app_dir("future-markdown-workspace-switch");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    backend
        .create_entry(CreateEntryInput {
            content: "workspace future plan".to_string(),
            entry_type: "idea".to_string(),
            target_date: None,
            target_month: None,
            is_future: true,
            tags: Vec::new(),
        })
        .await
        .unwrap();
    let workspace = dir.join("custom-journal");

    backend
        .set_markdown_workspace(workspace.clone())
        .await
        .unwrap();

    let someday = fs::read_to_string(workspace.join("Future/Future.md")).unwrap();
    assert!(someday.contains("- workspace future plan"));

    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn markdown_workspace_switch_moves_attachments_with_project_folder() {
    let dir = temp_app_dir("workspace-move-attachments");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    let stored = backend
        .store_upload(UploadInput {
            filename: "workspace.pdf".to_string(),
            bytes: b"workspace-attachment".to_vec(),
        })
        .await
        .unwrap();
    let old_path = attachment_path(&dir, &stored.relative_path);
    assert!(old_path.is_file());

    let workspace = temp_app_dir("workspace-move-target");
    backend
        .set_markdown_workspace(workspace.clone())
        .await
        .unwrap();

    let moved_path = workspace.join(&stored.relative_path);
    assert!(moved_path.is_file());
    assert!(!old_path.exists());

    let resolved = backend
        .resolve_uploads(vec![stored.relative_path.clone()])
        .await
        .unwrap();
    assert_eq!(resolved.len(), 1);
    assert_eq!(
        Path::new(&resolved[0].absolute_path)
            .canonicalize()
            .unwrap(),
        moved_path.canonicalize().unwrap()
    );

    fs::remove_dir_all(workspace).ok();
    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn batch_delete_entries_ignores_missing_ids_for_import_undo() {
    let dir = temp_app_dir("batch-delete-missing-ids");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    let entry = backend
        .create_entry(CreateEntryInput {
            content: "undo imported item once".to_string(),
            entry_type: "task".to_string(),
            target_date: Some("2026-06-22".to_string()),
            target_month: None,
            is_future: false,
            tags: Vec::new(),
        })
        .await
        .unwrap();

    backend
        .batch_delete_entries(vec![entry.id.clone(), "already-deleted".to_string()])
        .await
        .unwrap();

    let daily_entries = backend.get_daily_log("2026-06-22", true).await.unwrap();
    assert!(daily_entries.iter().all(|item| item.id != entry.id));

    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn future_entry_writes_import_dirty_markdown_before_appending() {
    let dir = temp_app_dir("future-markdown-dirty-before-write");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    let original = backend
        .create_entry(CreateEntryInput {
            content: "future original before dirty edit".to_string(),
            entry_type: "task".to_string(),
            target_date: None,
            target_month: None,
            is_future: true,
            tags: Vec::new(),
        })
        .await
        .unwrap();
    backend.sync_future_markdown_files().await.unwrap();
    let markdown_path = dir.join("journal/Future/Future.md");
    fs::write(
        &markdown_path,
        "# Future\n\n- [x] future edited before app write #external\n",
    )
    .unwrap();
    let file = fs::OpenOptions::new()
        .write(true)
        .open(&markdown_path)
        .unwrap();
    file.set_times(FileTimes::new().set_modified(SystemTime::now() + Duration::from_secs(60)))
        .unwrap();

    let appended = backend
        .create_entry(CreateEntryInput {
            content: "future appended in app".to_string(),
            entry_type: "idea".to_string(),
            target_date: None,
            target_month: None,
            is_future: true,
            tags: Vec::new(),
        })
        .await
        .unwrap();
    let future_log = backend.get_future_log(false).await.unwrap();

    let edited = future_log
        .future_log
        .iter()
        .find(|item| item.id == original.id)
        .expect("dirty markdown should update existing entry before app write");
    assert_eq!(edited.content, "future edited before app write");
    assert_eq!(edited.status, "completed");
    assert!(
        future_log
            .future_log
            .iter()
            .any(|item| item.id == appended.id)
    );

    let markdown = fs::read_to_string(markdown_path).unwrap();
    assert!(markdown.contains("future edited before app write"));
    assert!(markdown.contains("future appended in app"));

    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn default_markdown_workspace_is_created_before_opening() {
    let dir = temp_app_dir("default-markdown-open");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    assert!(dir.join("journal/attachments").is_dir());

    let result = backend.open_markdown_workspace().await;

    assert!(dir.join("journal").is_dir());
    if cfg!(target_os = "macos") {
        assert!(result.is_ok());
    }

    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn migrated_legacy_upload_links_remain_openable() {
    let dir = temp_app_dir("legacy-upload-link-open");
    fs::create_dir_all(dir.join("uploads")).unwrap();
    fs::write(dir.join("uploads/legacy.png"), [1, 2, 3, 4]).unwrap();

    let backend = LocalBackend::open(dir.clone()).await.unwrap();

    assert!(dir.join("journal/attachments/legacy.png").is_file());
    assert!(!dir.join("uploads/legacy.png").exists());
    assert!(
        backend
            .open_upload("uploads/legacy.png".to_string())
            .await
            .is_ok()
    );
    assert!(
        backend
            .open_upload("attachments/legacy.png".to_string())
            .await
            .is_ok()
    );

    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn legacy_upload_path_falls_back_to_attachment_file() {
    let dir = temp_app_dir("legacy-upload-fallback");
    fs::create_dir_all(dir.join("attachments")).unwrap();
    fs::write(dir.join("attachments/legacy.png"), [1, 2, 3, 4]).unwrap();

    let backend = LocalBackend::open(dir.clone()).await.unwrap();

    assert!(
        backend
            .open_upload("uploads/legacy.png".to_string())
            .await
            .is_ok()
    );

    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn legacy_upload_migration_preserves_same_filename_conflicts() {
    let dir = temp_app_dir("legacy-upload-conflict");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    let workspace_conflict = dir.join("journal/attachments/conflict.png");
    fs::create_dir_all(workspace_conflict.parent().unwrap()).unwrap();
    fs::write(&workspace_conflict, b"new-workspace-file").unwrap();
    fs::create_dir_all(dir.join("uploads")).unwrap();
    fs::write(dir.join("uploads/conflict.png"), b"legacy-file").unwrap();
    let entry = backend
        .create_entry(CreateEntryInput {
            content: "[legacy](uploads/conflict.png)".to_string(),
            entry_type: "idea".to_string(),
            target_date: Some("2026-06-12".to_string()),
            target_month: None,
            is_future: false,
            tags: Vec::new(),
        })
        .await
        .unwrap();

    backend
        .set_markdown_workspace(dir.join("journal"))
        .await
        .unwrap();

    let updated = backend
        .get_daily_log("2026-06-12", false)
        .await
        .unwrap()
        .into_iter()
        .find(|item| item.id == entry.id)
        .unwrap();
    assert_ne!(updated.content, "[legacy](attachments/conflict.png)");
    assert!(updated.content.starts_with("[legacy](attachments/"));
    assert!(updated.content.ends_with(".png)"));
    let migrated_relative = updated
        .content
        .trim_start_matches("[legacy](")
        .trim_end_matches(')');
    assert_eq!(
        fs::read(attachment_path(&dir, migrated_relative)).unwrap(),
        b"legacy-file"
    );
    assert_eq!(fs::read(workspace_conflict).unwrap(), b"new-workspace-file");

    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn resolve_uploads_canonicalizes_relative_and_legacy_paths() {
    let dir = temp_app_dir("resolve-upload-links");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    let stored = backend
        .store_upload(UploadInput {
            filename: "notes.pdf".to_string(),
            bytes: vec![9, 8, 7],
        })
        .await
        .unwrap();
    let filename = Path::new(&stored.relative_path)
        .file_name()
        .unwrap()
        .to_string_lossy()
        .to_string();

    let resolved = backend
        .resolve_uploads(vec![
            stored.relative_path.clone(),
            format!("uploads/{filename}"),
            "attachments/missing.pdf".to_string(),
        ])
        .await
        .unwrap();

    assert_eq!(resolved.len(), 2);
    assert_eq!(resolved[0].requested_path, stored.relative_path);
    assert_eq!(resolved[1].requested_path, format!("uploads/{filename}"));
    assert!(
        resolved
            .iter()
            .all(|item| item.relative_path == stored.relative_path)
    );
    assert!(
        resolved
            .iter()
            .all(|item| item.absolute_path.ends_with(&filename))
    );
    assert!(resolved.iter().all(|item| item.sha256 == stored.sha256));
    assert!(resolved.iter().all(|item| item.preview_url.is_none()));

    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn resolve_uploads_returns_data_url_preview_for_images() {
    let dir = temp_app_dir("resolve-image-preview");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    let stored = backend
        .store_upload(UploadInput {
            filename: "tiny.png".to_string(),
            bytes: vec![
                137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0,
                1, 8, 6, 0, 0, 0, 31, 21, 196, 137,
            ],
        })
        .await
        .unwrap();

    let resolved = backend
        .resolve_uploads(vec![stored.relative_path])
        .await
        .unwrap();

    assert_eq!(resolved.len(), 1);
    assert!(
        resolved[0]
            .preview_url
            .as_deref()
            .unwrap()
            .starts_with("data:image/png;base64,")
    );

    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn uploads_are_stored_under_project_attachments_with_relative_urls() {
    let dir = temp_app_dir("uploads");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();

    let stored = backend
        .store_upload(UploadInput {
            filename: "课程截图.png".to_string(),
            bytes: vec![1, 2, 3, 4],
        })
        .await
        .unwrap();

    assert!(stored.relative_path.starts_with("attachments/"));
    assert!(stored.relative_path.ends_with(".png"));
    assert_eq!(
        fs::read(attachment_path(&dir, &stored.relative_path)).unwrap(),
        vec![1, 2, 3, 4]
    );

    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn uploads_are_deduplicated_by_sha256_and_exported_for_backup() {
    let dir = temp_app_dir("upload-dedupe");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();

    let first = backend
        .store_upload(UploadInput {
            filename: "课堂截图.png".to_string(),
            bytes: vec![7, 8, 9, 10],
        })
        .await
        .unwrap();
    let second = backend
        .store_upload(UploadInput {
            filename: "另一个名字.jpg".to_string(),
            bytes: vec![7, 8, 9, 10],
        })
        .await
        .unwrap();

    assert_eq!(first.relative_path, second.relative_path);
    assert_eq!(first.sha256, second.sha256);
    assert!(first.relative_path.starts_with("attachments/"));
    assert!(first.relative_path.ends_with(".png"));

    let uploads = backend.list_uploads_for_backup().await.unwrap();
    assert_eq!(uploads.len(), 1);
    assert_eq!(uploads[0].relative_path, first.relative_path);
    assert_eq!(uploads[0].sha256, first.sha256);
    assert_eq!(uploads[0].bytes, vec![7, 8, 9, 10]);

    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn upload_path_copies_external_file_into_private_uploads() {
    let dir = temp_app_dir("upload-path");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    let external_dir = temp_app_dir("external-upload-source");
    let external_file = external_dir.join("飞天5k.jpeg");
    fs::write(&external_file, vec![11, 12, 13]).unwrap();

    let stored = backend
        .store_upload_path(external_file.clone())
        .await
        .unwrap();

    assert!(stored.relative_path.starts_with("attachments/"));
    assert!(stored.relative_path.ends_with(".jpeg"));
    assert_eq!(
        fs::read(attachment_path(&dir, &stored.relative_path)).unwrap(),
        vec![11, 12, 13]
    );
    assert_ne!(attachment_path(&dir, &stored.relative_path), external_file);

    assert!(
        backend
            .store_upload_path(external_dir.clone())
            .await
            .is_err()
    );
    assert!(
        backend
            .store_upload_path(external_dir.join("missing.pdf"))
            .await
            .is_err()
    );

    fs::remove_dir_all(external_dir).ok();
    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn daily_markdown_file_is_synced_when_daily_entries_change() {
    let dir = temp_app_dir("daily-markdown-disk");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    let first = backend
        .create_entry(CreateEntryInput {
            content: "write disk-backed note".to_string(),
            entry_type: "task".to_string(),
            target_date: Some("2026-06-16".to_string()),
            target_month: None,
            is_future: false,
            tags: vec!["disk".to_string()],
        })
        .await
        .unwrap();
    let second = backend
        .create_entry(CreateEntryInput {
            content: "temporary idea".to_string(),
            entry_type: "idea".to_string(),
            target_date: Some("2026-06-16".to_string()),
            target_month: None,
            is_future: false,
            tags: Vec::new(),
        })
        .await
        .unwrap();

    let file = backend
        .sync_daily_markdown_file("2026-06-16".to_string())
        .await
        .unwrap();
    assert_eq!(file.relative_path, "Daily/2026/06/2026-06-16.md");
    let markdown_path = dir.join("journal").join(&file.relative_path);
    let markdown = fs::read_to_string(&markdown_path).unwrap();
    assert!(markdown.starts_with("# 2026-06-16"));
    assert!(!markdown.contains("<!-- rbujo-entry"));
    assert!(markdown.contains("- [ ] write disk-backed note"));
    assert!(markdown.contains("#disk"));
    assert!(markdown.contains("- temporary idea"));

    backend
        .update_entry(
            first.id.clone(),
            EntryPatch {
                content: Some("edited through app".to_string()),
                status: Some("completed".to_string()),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    backend.delete_entry(second.id.clone()).await.unwrap();

    let updated = fs::read_to_string(&markdown_path).unwrap();
    assert!(updated.contains("- [x] edited through app"));
    assert!(!updated.contains("temporary idea"));

    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn daily_markdown_imports_external_edits_when_timestamp_changes() {
    let dir = temp_app_dir("daily-markdown-import-edit");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    let entry = backend
        .create_entry(CreateEntryInput {
            content: "original body".to_string(),
            entry_type: "task".to_string(),
            target_date: Some("2026-06-16".to_string()),
            target_month: None,
            is_future: false,
            tags: vec!["old".to_string()],
        })
        .await
        .unwrap();
    let file = backend
        .sync_daily_markdown_file("2026-06-16".to_string())
        .await
        .unwrap();
    let markdown_path = dir.join("journal").join(&file.relative_path);

    fs::write(
        &markdown_path,
        "# 2026-06-16\n\n- [x] original body edited from markdown #external\n- o calendar review #event\n- new idea from markdown #idea\n",
    )
    .unwrap();
    let file = fs::OpenOptions::new()
        .write(true)
        .open(&markdown_path)
        .unwrap();
    file.set_times(FileTimes::new().set_modified(SystemTime::now() + Duration::from_secs(60)))
        .unwrap();

    backend
        .sync_daily_markdown_file("2026-06-16".to_string())
        .await
        .unwrap();

    let daily_entries = backend.get_daily_log("2026-06-16", false).await.unwrap();
    let edited = daily_entries
        .iter()
        .find(|item| item.id == entry.id)
        .expect("existing entry should be updated from markdown");
    assert_eq!(edited.content, "original body edited from markdown");
    assert_eq!(edited.status, "completed");
    assert_eq!(edited.entry_type, "task");
    assert_eq!(edited.tags, vec!["external".to_string()]);
    assert!(
        daily_entries
            .iter()
            .any(|item| item.entry_type == "event" && item.content == "calendar review")
    );
    assert!(
        daily_entries
            .iter()
            .any(|item| item.entry_type == "idea" && item.content == "new idea from markdown")
    );
    let normalized = fs::read_to_string(&markdown_path).unwrap();
    assert!(!normalized.contains("<!-- rbujo-entry"));

    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn daily_markdown_imports_legacy_flat_file_before_month_folder_write() {
    let dir = temp_app_dir("daily-markdown-legacy-flat-import");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    let entry = backend
        .create_entry(CreateEntryInput {
            content: "legacy original body".to_string(),
            entry_type: "task".to_string(),
            target_date: Some("2026-06-16".to_string()),
            target_month: None,
            is_future: false,
            tags: Vec::new(),
        })
        .await
        .unwrap();
    let nested_path = dir.join("journal/Daily/2026/06/2026-06-16.md");
    fs::remove_file(&nested_path).unwrap();
    let legacy_path = dir.join("journal/Daily/2026-06-16.md");
    fs::write(
        &legacy_path,
        "# 2026-06-16\n\n- [x] legacy body edited from flat file #legacy\n- flat file inserted idea #idea\n",
    )
    .unwrap();
    let file = fs::OpenOptions::new()
        .write(true)
        .open(&legacy_path)
        .unwrap();
    file.set_times(FileTimes::new().set_modified(SystemTime::now() + Duration::from_secs(60)))
        .unwrap();

    let synced = backend
        .sync_daily_markdown_file("2026-06-16".to_string())
        .await
        .unwrap();

    assert_eq!(synced.relative_path, "Daily/2026/06/2026-06-16.md");
    let daily_entries = backend.get_daily_log("2026-06-16", false).await.unwrap();
    let edited = daily_entries
        .iter()
        .find(|item| item.id == entry.id)
        .expect("legacy flat file should update the existing entry");
    assert_eq!(edited.content, "legacy body edited from flat file");
    assert_eq!(edited.status, "completed");
    assert_eq!(edited.tags, vec!["legacy".to_string()]);
    assert!(
        daily_entries
            .iter()
            .any(|item| item.content == "flat file inserted idea")
    );
    let nested_markdown = fs::read_to_string(&nested_path).unwrap();
    assert!(nested_markdown.contains("legacy body edited from flat file"));
    assert!(legacy_path.exists());

    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn daily_markdown_imports_legacy_year_month_file_before_year_month_folder_write() {
    let dir = temp_app_dir("daily-markdown-legacy-year-month-import");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    let entry = backend
        .create_entry(CreateEntryInput {
            content: "legacy year month original".to_string(),
            entry_type: "task".to_string(),
            target_date: Some("2026-06-16".to_string()),
            target_month: None,
            is_future: false,
            tags: Vec::new(),
        })
        .await
        .unwrap();
    let nested_path = dir.join("journal/Daily/2026/06/2026-06-16.md");
    fs::remove_file(&nested_path).unwrap();
    let legacy_path = dir.join("journal/Daily/2026-06/2026-06-16.md");
    fs::create_dir_all(legacy_path.parent().unwrap()).unwrap();
    fs::write(
        &legacy_path,
        "# 2026-06-16\n\n- [x] legacy year month edited #legacy-month\n",
    )
    .unwrap();
    let file = fs::OpenOptions::new()
        .write(true)
        .open(&legacy_path)
        .unwrap();
    file.set_times(FileTimes::new().set_modified(SystemTime::now() + Duration::from_secs(60)))
        .unwrap();

    let synced = backend
        .sync_daily_markdown_file("2026-06-16".to_string())
        .await
        .unwrap();

    assert_eq!(synced.relative_path, "Daily/2026/06/2026-06-16.md");
    let daily_entries = backend.get_daily_log("2026-06-16", false).await.unwrap();
    let edited = daily_entries
        .iter()
        .find(|item| item.id == entry.id)
        .expect("legacy year-month file should update the existing entry");
    assert_eq!(edited.content, "legacy year month edited");
    assert_eq!(edited.status, "completed");
    assert_eq!(edited.tags, vec!["legacy-month".to_string()]);
    let nested_markdown = fs::read_to_string(&nested_path).unwrap();
    assert!(nested_markdown.contains("legacy year month edited"));
    assert!(legacy_path.exists());

    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn markdown_workspace_switch_overwrites_existing_folder_from_bujo() {
    let dir = temp_app_dir("daily-markdown-workspace-overwrite");
    let workspace = temp_app_dir("daily-markdown-workspace-existing");
    fs::create_dir_all(workspace.join("Daily/2026/06")).unwrap();
    fs::write(
        workspace.join("Daily/2026/06/2026-06-16.md"),
        "# 2026-06-16\n\n- [ ] stale folder content\n",
    )
    .unwrap();
    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    backend
        .create_entry(CreateEntryInput {
            content: "current bujo content".to_string(),
            entry_type: "task".to_string(),
            target_date: Some("2026-06-16".to_string()),
            target_month: None,
            is_future: false,
            tags: Vec::new(),
        })
        .await
        .unwrap();

    backend
        .set_markdown_workspace(workspace.clone())
        .await
        .unwrap();

    let daily_entries = backend.get_daily_log("2026-06-16", false).await.unwrap();
    assert!(
        daily_entries
            .iter()
            .any(|item| item.content == "current bujo content")
    );
    assert!(
        daily_entries
            .iter()
            .all(|item| item.content != "stale folder content")
    );
    let markdown = fs::read_to_string(workspace.join("Daily/2026/06/2026-06-16.md")).unwrap();
    assert!(markdown.contains("current bujo content"));
    assert!(!markdown.contains("stale folder content"));

    fs::remove_dir_all(workspace).ok();
    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn daily_markdown_inserted_line_does_not_repurpose_existing_entries() {
    let dir = temp_app_dir("daily-markdown-insert-line");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    let first = backend
        .create_entry(CreateEntryInput {
            content: "alpha body".to_string(),
            entry_type: "task".to_string(),
            target_date: Some("2026-06-16".to_string()),
            target_month: None,
            is_future: false,
            tags: Vec::new(),
        })
        .await
        .unwrap();
    let second = backend
        .create_entry(CreateEntryInput {
            content: "beta body".to_string(),
            entry_type: "task".to_string(),
            target_date: Some("2026-06-16".to_string()),
            target_month: None,
            is_future: false,
            tags: Vec::new(),
        })
        .await
        .unwrap();
    let file = backend
        .sync_daily_markdown_file("2026-06-16".to_string())
        .await
        .unwrap();
    let markdown_path = dir.join("journal").join(&file.relative_path);
    fs::write(
        &markdown_path,
        "# 2026-06-16\n\n- [ ] inserted above\n- [ ] alpha body\n- [ ] beta body\n",
    )
    .unwrap();
    let file = fs::OpenOptions::new()
        .write(true)
        .open(&markdown_path)
        .unwrap();
    file.set_times(FileTimes::new().set_modified(SystemTime::now() + Duration::from_secs(60)))
        .unwrap();

    backend
        .sync_daily_markdown_file("2026-06-16".to_string())
        .await
        .unwrap();

    let daily_entries = backend.get_daily_log("2026-06-16", false).await.unwrap();
    assert_eq!(
        daily_entries
            .iter()
            .find(|item| item.id == first.id)
            .unwrap()
            .content,
        "alpha body"
    );
    assert_eq!(
        daily_entries
            .iter()
            .find(|item| item.id == second.id)
            .unwrap()
            .content,
        "beta body"
    );
    assert!(
        daily_entries
            .iter()
            .any(|item| item.content == "inserted above")
    );

    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn daily_markdown_ambiguous_insert_and_edit_retains_existing_entry() {
    let dir = temp_app_dir("daily-markdown-ambiguous-insert-edit");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    let entry = backend
        .create_entry(CreateEntryInput {
            content: "stable original body".to_string(),
            entry_type: "task".to_string(),
            target_date: Some("2026-06-16".to_string()),
            target_month: None,
            is_future: false,
            tags: Vec::new(),
        })
        .await
        .unwrap();
    let file = backend
        .sync_daily_markdown_file("2026-06-16".to_string())
        .await
        .unwrap();
    let markdown_path = dir.join("journal").join(&file.relative_path);
    fs::write(
        &markdown_path,
        "# 2026-06-16\n\n- [ ] inserted unrelated item\n- [ ] completely rewritten text\n",
    )
    .unwrap();
    let file = fs::OpenOptions::new()
        .write(true)
        .open(&markdown_path)
        .unwrap();
    file.set_times(FileTimes::new().set_modified(SystemTime::now() + Duration::from_secs(60)))
        .unwrap();

    backend
        .sync_daily_markdown_file("2026-06-16".to_string())
        .await
        .unwrap();

    let daily_entries = backend.get_daily_log("2026-06-16", false).await.unwrap();
    assert_eq!(
        daily_entries
            .iter()
            .find(|item| item.id == entry.id)
            .unwrap()
            .content,
        "stable original body"
    );
    assert!(
        daily_entries
            .iter()
            .any(|item| item.content == "inserted unrelated item" && item.id != entry.id)
    );
    assert!(
        daily_entries
            .iter()
            .any(|item| item.content == "completely rewritten text" && item.id != entry.id)
    );

    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn app_create_imports_pending_markdown_before_writing() {
    let dir = temp_app_dir("daily-markdown-app-create-import");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    let entry = backend
        .create_entry(CreateEntryInput {
            content: "before external edit".to_string(),
            entry_type: "task".to_string(),
            target_date: Some("2026-06-16".to_string()),
            target_month: None,
            is_future: false,
            tags: Vec::new(),
        })
        .await
        .unwrap();
    let file = backend
        .sync_daily_markdown_file("2026-06-16".to_string())
        .await
        .unwrap();
    let markdown_path = dir.join("journal").join(&file.relative_path);
    fs::write(
        &markdown_path,
        "# 2026-06-16\n\n- [x] edited before app create\n",
    )
    .unwrap();
    let file = fs::OpenOptions::new()
        .write(true)
        .open(&markdown_path)
        .unwrap();
    file.set_times(FileTimes::new().set_modified(SystemTime::now() + Duration::from_secs(60)))
        .unwrap();

    let created = backend
        .create_entry(CreateEntryInput {
            content: "created in app after external edit".to_string(),
            entry_type: "task".to_string(),
            target_date: Some("2026-06-16".to_string()),
            target_month: None,
            is_future: false,
            tags: Vec::new(),
        })
        .await
        .unwrap();

    let daily_entries = backend.get_daily_log("2026-06-16", false).await.unwrap();
    let edited = daily_entries
        .iter()
        .find(|item| item.id == entry.id)
        .unwrap();
    assert_eq!(edited.content, "edited before app create");
    assert_eq!(edited.status, "completed");
    assert!(daily_entries.iter().any(|item| item.id == created.id));

    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn daily_markdown_deleting_migrated_child_repairs_parent_chain() {
    let dir = temp_app_dir("daily-markdown-delete-child-repair");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    let entry = backend
        .create_entry(CreateEntryInput {
            content: "source for child deletion".to_string(),
            entry_type: "task".to_string(),
            target_date: Some("2026-06-16".to_string()),
            target_month: None,
            is_future: false,
            tags: Vec::new(),
        })
        .await
        .unwrap();
    backend
        .migrate_entry_to_date(entry.id.clone(), "2026-06-17".to_string())
        .await
        .unwrap();
    let file = backend
        .sync_daily_markdown_file("2026-06-17".to_string())
        .await
        .unwrap();
    let markdown_path = dir.join("journal").join(&file.relative_path);
    fs::write(&markdown_path, "# 2026-06-17\n\n").unwrap();
    let file = fs::OpenOptions::new()
        .write(true)
        .open(&markdown_path)
        .unwrap();
    file.set_times(FileTimes::new().set_modified(SystemTime::now() + Duration::from_secs(60)))
        .unwrap();

    backend
        .sync_daily_markdown_file("2026-06-17".to_string())
        .await
        .unwrap();

    let chain = backend.get_migration_chain(entry.id.clone()).await.unwrap();
    assert_eq!(chain.len(), 1);
    assert_eq!(chain[0].id, entry.id);
    assert_eq!(chain[0].status, "open");
    assert!(chain[0].migrated_to_entry_id.is_none());
    assert!(chain[0].migrated_to_date.is_none());

    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn daily_markdown_does_not_mutate_migration_pointer_into_normal_entry() {
    let dir = temp_app_dir("daily-markdown-migration-pointer-edit");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    let entry = backend
        .create_entry(CreateEntryInput {
            content: "migration source body".to_string(),
            entry_type: "task".to_string(),
            target_date: Some("2026-06-16".to_string()),
            target_month: None,
            is_future: false,
            tags: Vec::new(),
        })
        .await
        .unwrap();
    let migration = backend
        .migrate_entry_to_date(entry.id.clone(), "2026-06-17".to_string())
        .await
        .unwrap();
    let file = backend
        .sync_daily_markdown_file("2026-06-16".to_string())
        .await
        .unwrap();
    let markdown_path = dir.join("journal").join(&file.relative_path);
    fs::write(
        &markdown_path,
        "# 2026-06-16\n\n- [ ] ordinary replacement\n",
    )
    .unwrap();
    let file = fs::OpenOptions::new()
        .write(true)
        .open(&markdown_path)
        .unwrap();
    file.set_times(FileTimes::new().set_modified(SystemTime::now() + Duration::from_secs(60)))
        .unwrap();

    backend
        .sync_daily_markdown_file("2026-06-16".to_string())
        .await
        .unwrap();

    let chain = backend.get_migration_chain(entry.id.clone()).await.unwrap();
    assert_eq!(chain[0].id, entry.id);
    assert_eq!(chain[0].status, "forward");
    assert_eq!(chain[1].id, migration.created_entry.id);
    let source_day = backend.get_daily_log("2026-06-16", false).await.unwrap();
    assert!(
        source_day
            .iter()
            .any(|item| item.content == "ordinary replacement")
    );

    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn daily_markdown_status_suffix_does_not_create_migration_state() {
    let dir = temp_app_dir("daily-markdown-status-suffix");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    backend
        .create_entry(CreateEntryInput {
            content: "suffix body".to_string(),
            entry_type: "task".to_string(),
            target_date: Some("2026-06-16".to_string()),
            target_month: None,
            is_future: false,
            tags: Vec::new(),
        })
        .await
        .unwrap();
    let file = backend
        .sync_daily_markdown_file("2026-06-16".to_string())
        .await
        .unwrap();
    let markdown_path = dir.join("journal").join(&file.relative_path);
    fs::write(
        &markdown_path,
        "# 2026-06-16\n\n- [ ] normal text (future)\n",
    )
    .unwrap();
    let file = fs::OpenOptions::new()
        .write(true)
        .open(&markdown_path)
        .unwrap();
    file.set_times(FileTimes::new().set_modified(SystemTime::now() + Duration::from_secs(60)))
        .unwrap();

    backend
        .sync_daily_markdown_file("2026-06-16".to_string())
        .await
        .unwrap();

    let daily_entries = backend.get_daily_log("2026-06-16", false).await.unwrap();
    assert!(daily_entries.iter().any(|item| {
        item.content == "normal text (future)"
            && item.status == "open"
            && item.migrated_to_entry_id.is_none()
    }));

    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn markdown_workspace_can_move_to_user_selected_directory() {
    let dir = temp_app_dir("daily-markdown-workspace");
    let workspace = temp_app_dir("daily-markdown-workspace-target");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    let default_workspace = backend.get_markdown_workspace().await.unwrap();
    assert_eq!(
        default_workspace.absolute_path,
        dir.join("journal").to_string_lossy()
    );
    assert!(default_workspace.is_default);

    let selected = backend
        .set_markdown_workspace(workspace.clone())
        .await
        .unwrap();
    assert_eq!(selected.absolute_path, workspace.to_string_lossy());
    assert!(!selected.is_default);

    backend
        .create_entry(CreateEntryInput {
            content: "stored in selected workspace".to_string(),
            entry_type: "task".to_string(),
            target_date: Some("2026-06-21".to_string()),
            target_month: None,
            is_future: false,
            tags: Vec::new(),
        })
        .await
        .unwrap();
    assert!(workspace.join("Daily/2026/06/2026-06-21.md").exists());
    assert!(!dir.join("journal/Daily/2026/06/2026-06-21.md").exists());

    let reopened = LocalBackend::open(dir.clone()).await.unwrap();
    let persisted = reopened.get_markdown_workspace().await.unwrap();
    assert_eq!(persisted.absolute_path, workspace.to_string_lossy());
    assert!(!persisted.is_default);

    fs::remove_dir_all(workspace).ok();
    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn daily_markdown_auto_sync_failure_does_not_fail_entry_writes() {
    let dir = temp_app_dir("daily-markdown-best-effort");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    fs::remove_dir_all(dir.join("journal")).unwrap();
    fs::write(dir.join("journal"), b"not a directory").unwrap();

    let entry = backend
        .create_entry(CreateEntryInput {
            content: "database write survives markdown sync failure".to_string(),
            entry_type: "task".to_string(),
            target_date: Some("2026-06-16".to_string()),
            target_month: None,
            is_future: false,
            tags: Vec::new(),
        })
        .await
        .unwrap();

    let daily_entries = backend.get_daily_log("2026-06-16", false).await.unwrap();
    assert!(daily_entries.iter().any(|item| item.id == entry.id));
    assert!(
        backend
            .sync_daily_markdown_file("2026-06-16".to_string())
            .await
            .is_err()
    );

    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn daily_markdown_auto_syncs_archive_reorder_import_and_future_moves() {
    let dir = temp_app_dir("daily-markdown-write-paths");
    let source_dir = temp_app_dir("daily-markdown-import-source");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    let source = LocalBackend::open(source_dir.clone()).await.unwrap();

    let first = backend
        .create_entry(CreateEntryInput {
            content: "first order item".to_string(),
            entry_type: "task".to_string(),
            target_date: Some("2026-06-16".to_string()),
            target_month: None,
            is_future: false,
            tags: Vec::new(),
        })
        .await
        .unwrap();
    let second = backend
        .create_entry(CreateEntryInput {
            content: "second order item".to_string(),
            entry_type: "task".to_string(),
            target_date: Some("2026-06-16".to_string()),
            target_month: None,
            is_future: false,
            tags: Vec::new(),
        })
        .await
        .unwrap();
    let markdown_path = dir.join("journal/Daily/2026/06/2026-06-16.md");

    backend
        .reorder_entries(vec![second.id.clone(), first.id.clone()])
        .await
        .unwrap();
    let reordered = fs::read_to_string(&markdown_path).unwrap();
    assert!(
        reordered.find("second order item").unwrap() < reordered.find("first order item").unwrap()
    );

    backend.archive_entry(first.id.clone()).await.unwrap();
    let archived = fs::read_to_string(&markdown_path).unwrap();
    assert!(!archived.contains("first order item"));
    assert!(archived.contains("second order item"));

    backend.unarchive_entry(first.id.clone()).await.unwrap();
    let unarchived = fs::read_to_string(&markdown_path).unwrap();
    assert!(unarchived.contains("first order item"));

    backend
        .move_future_entry(first.id.clone(), Some("2026-07".to_string()))
        .await
        .unwrap();
    let moved_to_future = fs::read_to_string(&markdown_path).unwrap();
    assert!(!moved_to_future.contains("first order item"));

    backend
        .batch_delete_entries(vec![second.id.clone()])
        .await
        .unwrap();
    let after_batch_delete = fs::read_to_string(&markdown_path).unwrap();
    assert!(!after_batch_delete.contains("second order item"));

    source
        .create_entry(CreateEntryInput {
            content: "imported daily markdown body".to_string(),
            entry_type: "idea".to_string(),
            target_date: Some("2026-06-20".to_string()),
            target_month: None,
            is_future: false,
            tags: Vec::new(),
        })
        .await
        .unwrap();
    let backup = source.get_all_entries_for_backup().await.unwrap();
    backend.import_entries(backup).await.unwrap();
    let imported = fs::read_to_string(dir.join("journal/Daily/2026/06/2026-06-20.md")).unwrap();
    assert!(imported.contains("imported daily markdown body"));

    fs::remove_dir_all(source_dir).ok();
    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn daily_markdown_renders_migration_sources_as_links_not_duplicate_content() {
    let dir = temp_app_dir("daily-markdown-migration-link");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    let entry = backend
        .create_entry(CreateEntryInput {
            content: "migrate without duplicating this body".to_string(),
            entry_type: "task".to_string(),
            target_date: Some("2026-06-16".to_string()),
            target_month: None,
            is_future: false,
            tags: Vec::new(),
        })
        .await
        .unwrap();

    backend
        .migrate_entry_to_date(entry.id, "2026-06-17".to_string())
        .await
        .unwrap();

    let source_markdown =
        fs::read_to_string(dir.join("journal/Daily/2026/06/2026-06-16.md")).unwrap();
    assert!(source_markdown.contains("Migrated to [[Daily/2026/06/2026-06-17.md|2026-06-17]]"));
    assert!(!source_markdown.contains("migrate without duplicating this body"));

    let target_markdown =
        fs::read_to_string(dir.join("journal/Daily/2026/06/2026-06-17.md")).unwrap();
    assert!(target_markdown.contains("migrate without duplicating this body"));

    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn daily_markdown_resyncs_when_reopening_or_deleting_migrated_children() {
    let dir = temp_app_dir("daily-markdown-reopen-chain");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    let entry = backend
        .create_entry(CreateEntryInput {
            content: "restore this migrated body".to_string(),
            entry_type: "task".to_string(),
            target_date: Some("2026-06-16".to_string()),
            target_month: None,
            is_future: false,
            tags: Vec::new(),
        })
        .await
        .unwrap();

    backend
        .migrate_entry_to_date(entry.id.clone(), "2026-06-17".to_string())
        .await
        .unwrap();
    backend.reopen_entry(entry.id.clone()).await.unwrap();

    let reopened_source =
        fs::read_to_string(dir.join("journal/Daily/2026/06/2026-06-16.md")).unwrap();
    assert!(reopened_source.contains("restore this migrated body"));
    assert!(!reopened_source.contains("Migrated to"));
    let reopened_target =
        fs::read_to_string(dir.join("journal/Daily/2026/06/2026-06-17.md")).unwrap();
    assert!(!reopened_target.contains("restore this migrated body"));

    let migration = backend
        .migrate_entry_to_date(entry.id.clone(), "2026-06-18".to_string())
        .await
        .unwrap();
    backend
        .delete_entry(migration.created_entry.id)
        .await
        .unwrap();

    let parent_after_child_delete =
        fs::read_to_string(dir.join("journal/Daily/2026/06/2026-06-16.md")).unwrap();
    assert!(parent_after_child_delete.contains("restore this migrated body"));
    assert!(!parent_after_child_delete.contains("Migrated to"));
    let deleted_target =
        fs::read_to_string(dir.join("journal/Daily/2026/06/2026-06-18.md")).unwrap();
    assert!(!deleted_target.contains("restore this migrated body"));

    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn attachment_maintenance_reports_and_cleans_orphaned_uploads() {
    let dir = temp_app_dir("attachment-maintenance");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    let referenced = backend
        .store_upload(UploadInput {
            filename: "referenced.png".to_string(),
            bytes: vec![21, 22, 23],
        })
        .await
        .unwrap();
    let orphaned = backend
        .store_upload(UploadInput {
            filename: "orphaned.pdf".to_string(),
            bytes: b"orphaned".to_vec(),
        })
        .await
        .unwrap();
    let entry = backend
        .create_entry(CreateEntryInput {
            content: format!(
                "![referenced](asset://localhost/%2FUsers%2Fme%2FLibrary%2FApplication%20Support%2Ffun.yunazju.rbujo%2F{})",
                referenced.relative_path.replace('/', "%2F")
            ),
            entry_type: "idea".to_string(),
            target_date: Some("2026-06-12".to_string()),
            target_month: None,
            is_future: false,
            tags: Vec::new(),
        })
        .await
        .unwrap();

    let summary = backend.attachment_maintenance_summary().await.unwrap();
    assert_eq!(summary.total_count, 2);
    assert_eq!(summary.referenced_count, 1);
    assert_eq!(summary.orphaned_count, 1);
    assert_eq!(
        summary.total_bytes,
        referenced.size as i64 + orphaned.size as i64
    );
    assert_eq!(summary.orphaned_bytes, orphaned.size as i64);
    assert_eq!(
        summary
            .uploads
            .iter()
            .find(|upload| upload.relative_path == referenced.relative_path)
            .unwrap()
            .reference_count,
        1
    );
    assert!(
        !summary
            .uploads
            .iter()
            .find(|upload| upload.relative_path == orphaned.relative_path)
            .unwrap()
            .referenced
    );

    let cleanup = backend.cleanup_unused_uploads().await.unwrap();
    assert_eq!(cleanup.removed_count, 1);
    assert_eq!(cleanup.removed_bytes, orphaned.size as i64);
    assert!(attachment_path(&dir, &referenced.relative_path).exists());
    assert!(!attachment_path(&dir, &orphaned.relative_path).exists());

    backend.delete_entry(entry.id).await.unwrap();
    assert!(!attachment_path(&dir, &referenced.relative_path).exists());

    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn attachment_maintenance_lists_entries_referencing_each_upload() {
    let dir = temp_app_dir("attachment-reference-list");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    let stored = backend
        .store_upload(UploadInput {
            filename: "meeting.png".to_string(),
            bytes: vec![51, 52, 53],
        })
        .await
        .unwrap();

    let first = backend
        .create_entry(CreateEntryInput {
            content: format!("first upload note ![img]({})", stored.relative_path),
            entry_type: "idea".to_string(),
            target_date: Some("2026-06-12".to_string()),
            target_month: None,
            is_future: false,
            tags: Vec::new(),
        })
        .await
        .unwrap();
    let second = backend
        .create_entry(CreateEntryInput {
            content: format!("second upload note [file]({})", stored.relative_path),
            entry_type: "task".to_string(),
            target_date: Some("2026-06-13".to_string()),
            target_month: None,
            is_future: false,
            tags: Vec::new(),
        })
        .await
        .unwrap();

    let summary = backend.attachment_maintenance_summary().await.unwrap();
    let summary_json = serde_json::to_value(&summary).unwrap();
    let upload = summary_json["uploads"]
        .as_array()
        .unwrap()
        .iter()
        .find(|upload| upload["relative_path"] == stored.relative_path)
        .unwrap();
    let references = upload["references"]
        .as_array()
        .expect("upload references should be listed");
    assert_eq!(references.len(), 2);
    let ids: Vec<_> = references
        .iter()
        .filter_map(|reference| reference["entry_id"].as_str())
        .collect();
    assert!(ids.contains(&first.id.as_str()));
    assert!(ids.contains(&second.id.as_str()));
    let first_reference = references
        .iter()
        .find(|reference| reference["entry_id"] == first.id)
        .unwrap();
    assert_eq!(first_reference["target_date"], "2026-06-12");
    assert_eq!(first_reference["entry_type"], "idea");
    assert!(
        first_reference["preview"]
            .as_str()
            .unwrap()
            .contains("first upload note")
    );

    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn archived_attachment_references_are_counted_and_protected() {
    let dir = temp_app_dir("attachment-archived-reference");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    let stored = backend
        .store_upload(UploadInput {
            filename: "archived.pdf".to_string(),
            bytes: b"archived".to_vec(),
        })
        .await
        .unwrap();
    let entry = backend
        .create_entry(CreateEntryInput {
            content: format!("[archived]({})", stored.relative_path),
            entry_type: "idea".to_string(),
            target_date: Some("2026-06-12".to_string()),
            target_month: None,
            is_future: false,
            tags: Vec::new(),
        })
        .await
        .unwrap();
    backend.archive_entry(entry.id).await.unwrap();

    let summary = backend.attachment_maintenance_summary().await.unwrap();
    let upload = summary
        .uploads
        .iter()
        .find(|upload| upload.relative_path == stored.relative_path)
        .unwrap();
    assert!(upload.referenced);
    assert_eq!(upload.reference_count, 1);
    assert_eq!(upload.archived_reference_count, 1);
    assert!(upload.references[0].archived_at.is_some());

    let cleanup = backend.cleanup_unused_uploads().await.unwrap();
    assert_eq!(cleanup.removed_count, 0);
    assert!(attachment_path(&dir, &stored.relative_path).exists());

    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn attachment_reference_scan_ignores_external_upload_urls() {
    let dir = temp_app_dir("attachment-external-reference");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    let stored = backend
        .store_upload(UploadInput {
            filename: "external-name.pdf".to_string(),
            bytes: b"external-looking".to_vec(),
        })
        .await
        .unwrap();
    backend
        .create_entry(CreateEntryInput {
            content: format!("[external](https://example.com/{})", stored.relative_path),
            entry_type: "idea".to_string(),
            target_date: Some("2026-06-12".to_string()),
            target_month: None,
            is_future: false,
            tags: Vec::new(),
        })
        .await
        .unwrap();

    let summary = backend.attachment_maintenance_summary().await.unwrap();
    assert_eq!(summary.total_count, 1);
    assert_eq!(summary.referenced_count, 0);
    assert_eq!(summary.orphaned_count, 1);
    assert!(!summary.uploads[0].referenced);

    let cleanup = backend.cleanup_unused_uploads().await.unwrap();
    assert_eq!(cleanup.removed_count, 1);
    assert!(!attachment_path(&dir, &stored.relative_path).exists());

    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn entry_delete_cleans_only_removed_entry_uploads() {
    let dir = temp_app_dir("attachment-delete-scope");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    let referenced = backend
        .store_upload(UploadInput {
            filename: "attached.png".to_string(),
            bytes: vec![31, 32, 33],
        })
        .await
        .unwrap();
    let pending = backend
        .store_upload(UploadInput {
            filename: "pending.png".to_string(),
            bytes: vec![41, 42, 43],
        })
        .await
        .unwrap();
    let entry = backend
        .create_entry(CreateEntryInput {
            content: format!(
                "![attached](asset://localhost/{})",
                referenced.relative_path
            ),
            entry_type: "idea".to_string(),
            target_date: Some("2026-06-12".to_string()),
            target_month: None,
            is_future: false,
            tags: Vec::new(),
        })
        .await
        .unwrap();

    backend.delete_entry(entry.id).await.unwrap();

    assert!(!attachment_path(&dir, &referenced.relative_path).exists());
    assert!(attachment_path(&dir, &pending.relative_path).exists());
    let cleanup = backend.cleanup_unused_uploads().await.unwrap();
    assert_eq!(cleanup.removed_count, 1);
    assert_eq!(cleanup.kept_count, 0);
    assert!(!attachment_path(&dir, &pending.relative_path).exists());

    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn forced_attachment_cleanup_removes_recent_orphaned_uploads() {
    let dir = temp_app_dir("attachment-cleanup-force");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    let pending = backend
        .store_upload(UploadInput {
            filename: "pending.png".to_string(),
            bytes: vec![51, 52, 53],
        })
        .await
        .unwrap();

    let cleanup = backend.cleanup_unused_uploads().await.unwrap();
    assert_eq!(cleanup.removed_count, 1);
    assert_eq!(cleanup.kept_count, 0);
    assert!(!attachment_path(&dir, &pending.relative_path).exists());

    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn markdown_archive_rewrites_upload_links_and_includes_attachment_files() {
    let dir = temp_app_dir("markdown-archive-uploads");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    let stored = backend
        .store_upload(UploadInput {
            filename: "lecture.pdf".to_string(),
            bytes: b"%PDF-test".to_vec(),
        })
        .await
        .unwrap();
    let encoded_relative_path = stored.relative_path.replace('/', "%2F");
    let stored_filename = std::path::Path::new(&stored.relative_path)
        .file_name()
        .unwrap()
        .to_string_lossy()
        .to_string();
    backend
        .create_entry(CreateEntryInput {
            content: format!(
                "课件链接: [lecture](asset://localhost/%2FUsers%2Fme%2FLibrary%2FApplication%20Support%2Ffun.yunazju.rbujo%2F{encoded_relative_path}) [legacy](uploads/{stored_filename}) [legacy-asset](asset://localhost/private/uploads/{stored_filename})",
            ),
            entry_type: "idea".to_string(),
            target_date: Some("2026-06-12".to_string()),
            target_month: None,
            is_future: false,
            tags: vec!["课件".to_string()],
        })
        .await
        .unwrap();

    let archive = backend.export_markdown_archive().await.unwrap();
    let mut zip = zip::ZipArchive::new(Cursor::new(archive)).unwrap();

    let mut markdown = String::new();
    zip.by_name("Daily/2026/06/2026-06-12.md")
        .unwrap()
        .read_to_string(&mut markdown)
        .unwrap();
    assert!(zip.by_name("entries.md").is_err());
    assert!(markdown.contains("../attachments/"));
    assert!(!markdown.contains("asset://localhost/%2FUsers%2F"));
    assert!(!markdown.contains(&format!("uploads/{stored_filename}")));
    assert!(!markdown.contains("asset://localhost/private/uploads/"));

    let attachment_name = format!("Daily/attachments/{}", stored_filename);
    let mut attachment = Vec::new();
    zip.by_name(&attachment_name)
        .unwrap()
        .read_to_end(&mut attachment)
        .unwrap();
    assert_eq!(attachment, b"%PDF-test");

    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn markdown_archive_groups_entries_into_obsidian_daily_monthly_and_future_files() {
    let dir = temp_app_dir("markdown-archive-obsidian");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    backend
        .create_entry(CreateEntryInput {
            content: "daily one".to_string(),
            entry_type: "task".to_string(),
            target_date: Some("2026-06-12".to_string()),
            target_month: None,
            is_future: false,
            tags: vec!["daily".to_string()],
        })
        .await
        .unwrap();
    backend
        .create_entry(CreateEntryInput {
            content: "daily two".to_string(),
            entry_type: "idea".to_string(),
            target_date: Some("2026-06-13".to_string()),
            target_month: None,
            is_future: false,
            tags: Vec::new(),
        })
        .await
        .unwrap();
    backend
        .create_entry(CreateEntryInput {
            content: "monthly plan".to_string(),
            entry_type: "event".to_string(),
            target_date: None,
            target_month: Some("2026-07".to_string()),
            is_future: true,
            tags: Vec::new(),
        })
        .await
        .unwrap();
    backend
        .create_entry(CreateEntryInput {
            content: "someday plan".to_string(),
            entry_type: "idea".to_string(),
            target_date: None,
            target_month: None,
            is_future: true,
            tags: Vec::new(),
        })
        .await
        .unwrap();

    let archive = backend.export_markdown_archive().await.unwrap();
    let mut zip = zip::ZipArchive::new(Cursor::new(archive)).unwrap();

    let mut first_daily = String::new();
    zip.by_name("Daily/2026/06/2026-06-12.md")
        .unwrap()
        .read_to_string(&mut first_daily)
        .unwrap();
    assert!(first_daily.starts_with("# 2026-06-12"));
    assert!(first_daily.contains("- [ ] daily one"));
    assert!(first_daily.contains("Tags: #daily"));

    let mut second_daily = String::new();
    zip.by_name("Daily/2026/06/2026-06-13.md")
        .unwrap()
        .read_to_string(&mut second_daily)
        .unwrap();
    assert!(second_daily.contains("- daily two"));

    let mut monthly = String::new();
    zip.by_name("Future/2026/07.md")
        .unwrap()
        .read_to_string(&mut monthly)
        .unwrap();
    assert!(monthly.starts_with("# 2026-07"));
    assert!(monthly.contains("- o monthly plan"));

    let mut future = String::new();
    zip.by_name("Future/Future.md")
        .unwrap()
        .read_to_string(&mut future)
        .unwrap();
    assert!(future.contains("- someday plan"));

    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn markdown_archive_does_not_rewrite_external_upload_links() {
    let dir = temp_app_dir("markdown-archive-external");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    let stored = backend
        .store_upload(UploadInput {
            filename: "local.pdf".to_string(),
            bytes: b"local".to_vec(),
        })
        .await
        .unwrap();
    backend
        .create_entry(CreateEntryInput {
            content: format!(
                "[local](asset://localhost/private/{}) [external](https://example.com/uploads/{})",
                stored.relative_path,
                std::path::Path::new(&stored.relative_path)
                    .file_name()
                    .unwrap()
                    .to_string_lossy()
            ),
            entry_type: "idea".to_string(),
            target_date: Some("2026-06-12".to_string()),
            target_month: None,
            is_future: false,
            tags: Vec::new(),
        })
        .await
        .unwrap();

    let archive = backend.export_markdown_archive().await.unwrap();
    let mut zip = zip::ZipArchive::new(Cursor::new(archive)).unwrap();
    let mut markdown = String::new();
    zip.by_name("Daily/2026/06/2026-06-12.md")
        .unwrap()
        .read_to_string(&mut markdown)
        .unwrap();

    assert!(markdown.contains("[local](../attachments/"));
    assert!(markdown.contains("https://example.com/uploads/"));

    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn open_upload_rejects_paths_outside_uploads() {
    let dir = temp_app_dir("open-upload-safety");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    std::fs::write(dir.join("outside.txt"), b"outside").unwrap();
    std::fs::create_dir_all(dir.join("attachments/folder")).unwrap();
    std::fs::create_dir_all(dir.join("uploads/folder")).unwrap();

    assert!(
        backend
            .open_upload("/tmp/outside.txt".to_string())
            .await
            .is_err()
    );
    assert!(
        backend
            .open_upload("attachments/../outside.txt".to_string())
            .await
            .is_err()
    );
    assert!(
        backend
            .open_upload("attachments/missing.txt".to_string())
            .await
            .is_err()
    );
    assert!(
        backend
            .open_upload("attachments/folder".to_string())
            .await
            .is_err()
    );
    assert!(
        backend
            .open_upload("uploads/../outside.txt".to_string())
            .await
            .is_err()
    );
    assert!(
        backend
            .open_upload("uploads/missing.txt".to_string())
            .await
            .is_err()
    );
    assert!(
        backend
            .open_upload("uploads/folder".to_string())
            .await
            .is_err()
    );

    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(dir.join("outside.txt"), dir.join("uploads/link.txt")).unwrap();
        assert!(
            backend
                .open_upload("uploads/link.txt".to_string())
                .await
                .is_err()
        );
    }

    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn semantic_search_supports_chinese_ranked_retrieval() {
    let dir = temp_app_dir("semantic");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    let target = backend
        .create_entry(CreateEntryInput {
            content: "复习随机过程中的马尔可夫链和平稳分布".to_string(),
            entry_type: "idea".to_string(),
            target_date: Some("2026-06-11".to_string()),
            target_month: None,
            is_future: false,
            tags: Vec::new(),
        })
        .await
        .unwrap();
    backend
        .create_entry(CreateEntryInput {
            content: "买牛奶和面包".to_string(),
            entry_type: "task".to_string(),
            target_date: Some("2026-06-11".to_string()),
            target_month: None,
            is_future: false,
            tags: Vec::new(),
        })
        .await
        .unwrap();

    let results = backend
        .search_entries(SearchOptions {
            query: "马尔可夫 平稳".to_string(),
            mode: SearchMode::Semantic,
            include_archived: false,
            ..Default::default()
        })
        .await
        .unwrap();

    assert_eq!(results[0].entry.id, target.id);
    assert!(results[0].score > 0.0);
    assert_eq!(results[0].match_type, "semantic");

    backend
        .update_entry(
            target.id.clone(),
            EntryPatch {
                content: Some("随机过程复习完成".to_string()),
                ..Default::default()
            },
        )
        .await
        .unwrap();

    let updated = backend
        .search_entries(SearchOptions {
            query: "复习完成".to_string(),
            mode: SearchMode::Semantic,
            include_archived: false,
            ..Default::default()
        })
        .await
        .unwrap();
    assert_eq!(updated[0].entry.id, target.id);

    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn backup_roundtrip_preserves_archive_and_migration_chain() {
    let source_dir = temp_app_dir("roundtrip-source");
    let target_dir = temp_app_dir("roundtrip-target");
    let source = LocalBackend::open(source_dir.clone()).await.unwrap();
    let target = LocalBackend::open(target_dir.clone()).await.unwrap();

    let root = source
        .create_entry(CreateEntryInput {
            content: "需要长期跟踪的毕业设计任务".to_string(),
            entry_type: "task".to_string(),
            target_date: Some("2026-06-11".to_string()),
            target_month: None,
            is_future: false,
            tags: vec!["毕业设计".to_string()],
        })
        .await
        .unwrap();
    let future = source
        .migrate_entry_to_future(root.id.clone(), Some("2026-08".to_string()))
        .await
        .unwrap()
        .created_entry;
    let daily = source
        .migrate_entry_to_date(future.id.clone(), "2026-08-20".to_string())
        .await
        .unwrap()
        .created_entry;

    source.archive_entry(root.id.clone()).await.unwrap();

    let backup = source.get_all_entries_for_backup().await.unwrap();
    let import = target.import_entries(backup).await.unwrap();
    assert_eq!(import.inserted_count, 3);
    assert_eq!(import.updated_count, 0);
    assert_eq!(import.skipped_count, 0);

    let hidden = target.get_daily_log("2026-06-11", false).await.unwrap();
    assert!(hidden.iter().all(|entry| entry.id != root.id));

    let archived = target.get_daily_log("2026-06-11", true).await.unwrap();
    let imported_root = archived
        .iter()
        .find(|entry| entry.id == root.id)
        .expect("archived root should roundtrip");
    assert!(imported_root.archived_at.is_some());
    assert_eq!(imported_root.tags, vec!["毕业设计".to_string()]);

    let chain = target.get_migration_chain(root.id.clone()).await.unwrap();
    let chain_ids: Vec<_> = chain.into_iter().map(|entry| entry.id).collect();
    assert_eq!(chain_ids, vec![root.id, future.id, daily.id]);

    fs::remove_dir_all(source_dir).ok();
    fs::remove_dir_all(target_dir).ok();
}

#[tokio::test]
async fn bjk_import_restores_attachments_and_rewrites_asset_urls() {
    let dir = temp_app_dir("bjk-import-attachments");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    let attachment_bytes = b"portable attachment bytes";
    let attachment_hash = test_sha256_hex(attachment_bytes);
    let entry_id = Uuid::new_v4().to_string();
    let backup = serde_json::json!({
        "header": "BUJO_SECURE_BACKUP_V1",
        "version": 2,
        "timestamp": 1781654400000u64,
        "count": 1,
        "attachments": [{
            "relative_path": "uploads/original.png",
            "filename": "original.png",
            "sha256": attachment_hash,
            "bytes": attachment_bytes
        }],
        "data": [{
            "id": entry_id,
            "content": "![img](asset://localhost/private/uploads/original.png)",
            "entry_type": "idea",
            "status": "open",
            "tags": ["附件"],
            "created_at": "2026-06-17T00:00:00Z",
            "target_date": "2026-06-17",
            "target_month": null,
            "is_future": false,
            "source_entry_id": null,
            "position": 0,
            "from_date": null,
            "migrated_to_date": null,
            "migrated_to_month": null,
            "archived_at": null,
            "chain_root_id": null,
            "migrated_to_entry_id": null
        }]
    });

    let result = backend
        .import_bjk_archive_bytes(bjk_archive_bytes(backup))
        .await
        .unwrap();

    assert_eq!(result.inserted_count, 1);
    assert_eq!(result.updated_count, 0);

    let entries = backend.get_daily_log("2026-06-17", false).await.unwrap();
    assert_eq!(entries.len(), 1);
    assert!(entries[0].content.contains("attachments/"));
    assert!(!entries[0].content.contains("asset://localhost"));
    assert!(!entries[0].content.contains("uploads/original.png"));

    let uploads = backend.list_uploads_for_backup().await.unwrap();
    assert_eq!(uploads.len(), 1);
    assert!(uploads[0].relative_path.starts_with("attachments/"));
    assert!(Path::new(&uploads[0].absolute_path).exists());
    assert!(
        Path::new(&uploads[0].absolute_path).starts_with(default_workspace_path(&dir)),
        "attachment should be stored in the markdown workspace"
    );

    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn bjk_import_rejects_attachment_hash_mismatch() {
    let dir = temp_app_dir("bjk-import-hash-mismatch");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    let backup = serde_json::json!({
        "header": "BUJO_SECURE_BACKUP_V1",
        "version": 2,
        "timestamp": 1781654400000u64,
        "count": 1,
        "attachments": [{
            "relative_path": "uploads/broken.pdf",
            "filename": "broken.pdf",
            "sha256": "0000000000000000000000000000000000000000000000000000000000000000",
            "bytes": [1, 2, 3, 4]
        }],
        "data": [{
            "id": Uuid::new_v4().to_string(),
            "content": "[file](uploads/broken.pdf)",
            "entry_type": "idea",
            "status": "open",
            "tags": [],
            "created_at": "2026-06-17T00:00:00Z",
            "target_date": "2026-06-17",
            "target_month": null,
            "is_future": false,
            "source_entry_id": null,
            "position": 0,
            "from_date": null,
            "migrated_to_date": null,
            "migrated_to_month": null,
            "archived_at": null,
            "chain_root_id": null,
            "migrated_to_entry_id": null
        }]
    });

    let error = backend
        .import_bjk_archive_bytes(bjk_archive_bytes(backup))
        .await
        .unwrap_err();

    assert!(error.to_string().contains("Attachment hash mismatch"));
    let entries = backend.get_daily_log("2026-06-17", false).await.unwrap();
    assert!(entries.is_empty());

    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn bjk_import_preserves_zero_byte_attachments() {
    let dir = temp_app_dir("bjk-import-empty-attachment");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    let attachment_hash = test_sha256_hex(&[]);
    let backup = serde_json::json!({
        "header": "BUJO_SECURE_BACKUP_V1",
        "version": 2,
        "timestamp": 1781654400000u64,
        "count": 1,
        "attachments": [{
            "relative_path": "uploads/empty.txt",
            "filename": "empty.txt",
            "sha256": attachment_hash,
            "bytes": []
        }],
        "data": [{
            "id": Uuid::new_v4().to_string(),
            "content": "[empty](uploads/empty.txt)",
            "entry_type": "idea",
            "status": "open",
            "tags": [],
            "created_at": "2026-06-17T00:00:00Z",
            "target_date": "2026-06-17",
            "target_month": null,
            "is_future": false,
            "source_entry_id": null,
            "position": 0,
            "from_date": null,
            "migrated_to_date": null,
            "migrated_to_month": null,
            "archived_at": null,
            "chain_root_id": null,
            "migrated_to_entry_id": null
        }]
    });

    let result = backend
        .import_bjk_archive_bytes(bjk_archive_bytes(backup))
        .await
        .unwrap();

    assert_eq!(result.inserted_count, 1);
    let entries = backend.get_daily_log("2026-06-17", false).await.unwrap();
    assert!(entries[0].content.contains("attachments/"));
    let uploads = backend.list_uploads_for_backup().await.unwrap();
    assert_eq!(uploads.len(), 1);
    assert_eq!(uploads[0].bytes, Vec::<u8>::new());

    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn bjk_import_rejects_invalid_attachment_paths_before_writing() {
    let dir = temp_app_dir("bjk-import-invalid-path");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    let backup = serde_json::json!({
        "header": "BUJO_SECURE_BACKUP_V1",
        "version": 2,
        "timestamp": 1781654400000u64,
        "count": 0,
        "attachments": [{
            "relative_path": "notes.md",
            "filename": "notes.md",
            "sha256": test_sha256_hex(b"bad path"),
            "bytes": b"bad path"
        }],
        "data": []
    });

    let error = backend
        .import_bjk_archive_bytes(bjk_archive_bytes(backup))
        .await
        .unwrap_err();

    assert!(error.to_string().contains("Invalid upload path"));
    assert!(backend.list_uploads_for_backup().await.unwrap().is_empty());

    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn bjk_import_hash_failure_leaves_no_prior_attachment_side_effects() {
    let dir = temp_app_dir("bjk-import-partial-hash-failure");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    let backup = serde_json::json!({
        "header": "BUJO_SECURE_BACKUP_V1",
        "version": 2,
        "timestamp": 1781654400000u64,
        "count": 0,
        "attachments": [
            {
                "relative_path": "uploads/ok.txt",
                "filename": "ok.txt",
                "sha256": test_sha256_hex(b"ok"),
                "bytes": b"ok"
            },
            {
                "relative_path": "uploads/broken.txt",
                "filename": "broken.txt",
                "sha256": "0000000000000000000000000000000000000000000000000000000000000000",
                "bytes": b"broken"
            }
        ],
        "data": []
    });

    let error = backend
        .import_bjk_archive_bytes(bjk_archive_bytes(backup))
        .await
        .unwrap_err();

    assert!(error.to_string().contains("Attachment hash mismatch"));
    assert!(backend.list_uploads_for_backup().await.unwrap().is_empty());

    fs::remove_dir_all(dir).ok();
}
