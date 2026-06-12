use std::fs;

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
