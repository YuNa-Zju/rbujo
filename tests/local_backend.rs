use std::fs;

use rbullet_journal::local::{
    CreateEntryInput, EntryPatch, LocalBackend, SearchMode, SearchOptions, UploadInput,
};
use uuid::Uuid;

fn temp_app_dir(label: &str) -> std::path::PathBuf {
    let path = std::env::temp_dir().join(format!("rbujo-{label}-{}", Uuid::new_v4()));
    fs::create_dir_all(&path).expect("create temp app dir");
    path
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

    let chain = target.get_migration_chain(root.id.clone()).await.unwrap();
    let chain_ids: Vec<_> = chain.into_iter().map(|entry| entry.id).collect();
    assert_eq!(chain_ids, vec![root.id, future.id, daily.id]);

    fs::remove_dir_all(source_dir).ok();
    fs::remove_dir_all(target_dir).ok();
}
