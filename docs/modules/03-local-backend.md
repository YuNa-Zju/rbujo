# 03 Local Backend

## 入口文件

- `src/local.rs`
- `src/models.rs`
- `src/db.rs`

## 职责

`LocalBackend` 是桌面本地业务的核心。它直接管理 SQLite、Markdown 工作区、附件目录、BJK 导入导出、搜索索引、标签和迁移链。[[02-tauri-commands]] 基本是它的薄封装。

## 初始化

`LocalBackend::open(app_dir)` 做以下工作：

1. 创建 app data 目录。
2. 打开 `rbujo.sqlite3`。
3. 调用 [[04-sqlite-schema]] 初始化和修复 schema。
4. 创建或读取本地用户 `local`。
5. 恢复 Markdown 工作区授权。
6. 创建 summary cache 和 overview cache。
7. 修复历史迁移链。
8. 将旧 `uploads` 迁移到当前 `attachments`。

## 重要常量

- `LOCAL_USERNAME = "local"`：桌面单用户模式。
- `MARKDOWN_WORKSPACE_SETTING_KEY = "markdown_workspace_path"`：项目文件夹路径。
- `MARKDOWN_WORKSPACE_BOOKMARK_SETTING_KEY = "markdown_workspace_bookmark"`：macOS 授权 bookmark。
- `ATTACHMENT_DIR = "attachments"`：当前附件目录。
- `LEGACY_UPLOAD_DIR = "uploads"`：旧附件兼容目录。
- `FUTURE_MARKDOWN_SOMEDAY_KEY = "future:someday"`：Future Someday 同步状态 key。
- `.bjk` 常量：`BUJO_SECURE_BACKUP_V1`、`fun.yunazju.rbujo.bjk`、`manifest.json`、`data/backup.json.gz`。

## Entry 生命周期接口

| 方法 | 作用 | 触发的联动 |
| --- | --- | --- |
| `create_entry` | 新建 Daily/Future 条目 | 写 SQLite、标签、搜索索引、Markdown |
| `update_entry` | 更新内容、类型、状态、日期、月份、标签 | 导入变更 Markdown、清理旧附件引用、写回 Markdown |
| `archive_entry` | 设置 `archived_at` | 写回 Daily/Future Markdown |
| `unarchive_entry` | 清除 `archived_at` | 写回 Markdown |
| `delete_entry` | 硬删除条目和迁移子项 | 删除迁移子项、恢复父项、清理附件、写回 Markdown |
| `reopen_entry` | 撤回迁移或重新打开 | 删除迁移子项、源条目恢复 `open` |
| `reorder_entries` | 更新 position | 保持页面排序和 overview 一致 |

状态细节见 [[05-entry-state-machine]]。

## Markdown 工作区

默认工作区是 `app_dir/journal`。用户选择项目文件夹后，会移动原工作区内容并保存设置。

当前磁盘结构：

```text
<workspace>/
  Daily/
    YYYY/
      MM/
        YYYY-MM-DD.md
  Future/
    YYYY/
      MM.md
    Future.md
  attachments/
    <sha256>.<ext>
```

历史兼容路径：

- `Daily/YYYY-MM/YYYY-MM-DD.md`
- `Daily/YYYY-MM-DD.md`
- `uploads/*`

Markdown 读写细节见 [[06-markdown-sync]]。

## Future Log

`get_future_log(include_archived)` 会先导入已变更的 Future Markdown，再写回标准格式，最后返回：

- Someday entries：`is_future=1` 且无 `target_month`。
- Monthly entries：按 `target_month=YYYY-MM` 分组。

Future 条目移动使用 `move_future_entry`，迁移到具体日期使用 `migrate_entry_to_date` 或前端 `rescheduleFutureEntry`。见 [[13-future-log-archive]]。

## 迁移链

迁移会创建子条目，不会把原条目直接移动。

- `migrate_entry_to_date`：源条目变为 `status='forward'`，子条目在目标日期 `open`。
- `migrate_entry_to_future`：源条目变为 `status='future'`，子条目进入 Future Log。
- `chain_root_id` 记录整条链根节点。
- `migrated_to_entry_id` 指向下一跳。

完整状态机见 [[05-entry-state-machine]]。

## 搜索和缓存

- 搜索先按 Entry 类型、标签、日期、归档状态等条件取候选。
- 搜索支持 text、regex、semantic 三种模式。
- semantic 模式在 Rust 后端用 Candle 加载打包的 `bge-small-zh-v1.5`，生成 512 维向量并按余弦相似度排序。
- 语义向量缓存写入 SQLite 的 `semantic_embeddings` 表，按 model version、entry id 和 content sha 失效。
- summary cache 用 content sha 做 key。
- overview cache 用日期范围/月做 key。

前端缓存和标签缓存见 [[14-search-tags-cache]]。

## 附件

上传和引用解析均在本地后端完成：

- `store_upload`：按 sha256 去重，写 `attachments`。
- `store_upload_path`：从本机路径读取，适配拖拽文件路径。
- `resolve_uploads`：把 Markdown 引用解析为可显示 URL 或预览。
- `attachment_maintenance_summary`：统计引用、归档引用、孤儿文件和空间占用。
- `cleanup_unused_uploads`：删除无引用文件。

详见 [[07-attachments]]。

## BJK 和导入

`import_bjk_archive_bytes` 在 Rust 侧解析 zip/gzip、校验 manifest、恢复附件、重写引用并调用 `import_entries`。它是当前性能优先的导入路径。详见 [[08-bjk-backup-import]]。

## 对接注意

- 修改任何 Entry 字段时，都要考虑 [[06-markdown-sync]] 的导入和写回。
- 修改附件引用格式时，同时更新 [[07-attachments]] 的前端解析、后端解析和导出重写。
- 修改状态字段时必须同步 [[05-entry-state-machine]]、前端兼容状态和归档/Future 分类。
- 新增会影响日历点点的数据时，要检查 [[11-calendar-daily-pages]] 的 overview 缓存刷新。
