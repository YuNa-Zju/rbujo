use std::fs::{self, FileTimes};
use std::io::{Cursor, Read};
use std::path::Path;
use std::time::{Duration, SystemTime};

use rbullet_journal::db;
use rbullet_journal::local::{
    CreateEntryInput, EntryPatch, LocalBackend, SearchMode, SearchOptions, UploadInput,
};
use uuid::Uuid;

fn temp_app_dir(label: &str) -> std::path::PathBuf {
    let path = std::env::temp_dir().join(format!("rbujo-{label}-{}", Uuid::new_v4()));
    fs::create_dir_all(&path).expect("create temp app dir");
    path
}

fn sqlite_url(dir: &std::path::Path) -> String {
    format!("sqlite://{}", dir.join("rbujo.sqlite3").display())
}

fn age_file_past_upload_grace(path: &Path) {
    let file = fs::OpenOptions::new().write(true).open(path).unwrap();
    file.set_times(
        FileTimes::new().set_modified(SystemTime::now() - Duration::from_secs(24 * 60 * 60 + 60)),
    )
    .unwrap();
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
async fn uploads_are_stored_under_local_app_data_with_relative_urls() {
    let dir = temp_app_dir("uploads");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();

    let stored = backend
        .store_upload(UploadInput {
            filename: "课程截图.png".to_string(),
            bytes: vec![1, 2, 3, 4],
        })
        .await
        .unwrap();

    assert!(stored.relative_path.starts_with("uploads/"));
    assert!(stored.relative_path.ends_with(".png"));
    assert_eq!(
        fs::read(dir.join(&stored.relative_path)).unwrap(),
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
    assert!(first.relative_path.starts_with("uploads/"));
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

    assert!(stored.relative_path.starts_with("uploads/"));
    assert!(stored.relative_path.ends_with(".jpeg"));
    assert_eq!(
        fs::read(dir.join(&stored.relative_path)).unwrap(),
        vec![11, 12, 13]
    );
    assert_ne!(dir.join(&stored.relative_path), external_file);

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

    age_file_past_upload_grace(&dir.join(&orphaned.relative_path));
    let cleanup = backend.cleanup_unused_uploads().await.unwrap();
    assert_eq!(cleanup.removed_count, 1);
    assert_eq!(cleanup.removed_bytes, orphaned.size as i64);
    assert!(dir.join(&referenced.relative_path).exists());
    assert!(!dir.join(&orphaned.relative_path).exists());

    backend.delete_entry(entry.id).await.unwrap();
    assert!(!dir.join(&referenced.relative_path).exists());

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

    age_file_past_upload_grace(&dir.join(&stored.relative_path));
    let cleanup = backend.cleanup_unused_uploads().await.unwrap();
    assert_eq!(cleanup.removed_count, 1);
    assert!(!dir.join(&stored.relative_path).exists());

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

    assert!(!dir.join(&referenced.relative_path).exists());
    assert!(dir.join(&pending.relative_path).exists());
    let cleanup = backend.cleanup_unused_uploads().await.unwrap();
    assert_eq!(cleanup.removed_count, 0);
    assert_eq!(cleanup.kept_count, 1);
    assert!(dir.join(&pending.relative_path).exists());

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

    let protected = backend.cleanup_unused_uploads().await.unwrap();
    assert_eq!(protected.removed_count, 0);
    assert_eq!(protected.kept_count, 1);
    assert!(dir.join(&pending.relative_path).exists());

    let forced = backend.cleanup_all_unused_uploads().await.unwrap();
    assert_eq!(forced.removed_count, 1);
    assert_eq!(forced.kept_count, 0);
    assert!(!dir.join(&pending.relative_path).exists());

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
    backend
        .create_entry(CreateEntryInput {
            content: format!(
                "课件链接: [lecture](asset://localhost/%2FUsers%2Fme%2FLibrary%2FApplication%20Support%2Ffun.yunazju.rbujo%2F{encoded_relative_path})",
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
    zip.by_name("entries.md")
        .unwrap()
        .read_to_string(&mut markdown)
        .unwrap();
    assert!(markdown.contains("attachments/"));
    assert!(!markdown.contains("asset://localhost/%2FUsers%2F"));

    let attachment_name = format!(
        "attachments/{}",
        std::path::Path::new(&stored.relative_path)
            .file_name()
            .unwrap()
            .to_string_lossy()
    );
    let mut attachment = Vec::new();
    zip.by_name(&attachment_name)
        .unwrap()
        .read_to_end(&mut attachment)
        .unwrap();
    assert_eq!(attachment, b"%PDF-test");

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
    zip.by_name("entries.md")
        .unwrap()
        .read_to_string(&mut markdown)
        .unwrap();

    assert!(markdown.contains("[local](attachments/"));
    assert!(markdown.contains("https://example.com/uploads/"));

    fs::remove_dir_all(dir).ok();
}

#[tokio::test]
async fn open_upload_rejects_paths_outside_uploads() {
    let dir = temp_app_dir("open-upload-safety");
    let backend = LocalBackend::open(dir.clone()).await.unwrap();
    std::fs::write(dir.join("outside.txt"), b"outside").unwrap();
    std::fs::create_dir_all(dir.join("uploads/folder")).unwrap();

    assert!(
        backend
            .open_upload("/tmp/outside.txt".to_string())
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
