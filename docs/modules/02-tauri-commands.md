# 02 Tauri Commands

## 入口文件

- `src-tauri/src/lib.rs`
- 前端调用方：[[10-service-layer]]
- 业务实现方：[[03-local-backend]]

## 职责

Tauri command 是桌面端前后端唯一稳定接口。前端通过 `invoke("command_name", payload)` 调用，Rust command 做参数解包、系统对话框、错误转换和调用 [[03-local-backend]]。

## Command 分类

### 更新

| command | 前端服务 | 说明 |
| --- | --- | --- |
| `check_for_update` | `checkForUpdates` | 使用 Tauri updater 返回最新版本、当前版本、release body。 |
| `install_update` | `installUpdate` | 下载并安装更新，进度通过 `update:download-progress` 事件回传。 |

关联 [[15-update-and-menu]]。

### Entry 生命周期

| command | 后端方法 | 说明 |
| --- | --- | --- |
| `create_entry` | `LocalBackend::create_entry` | 新建 Daily 或 Future 条目。 |
| `update_entry` | `LocalBackend::update_entry` | 更新内容、类型、状态、日期、月份、标签。 |
| `archive_entry` | `LocalBackend::archive_entry` | 设置 `archived_at`，不改业务状态。 |
| `unarchive_entry` | `LocalBackend::unarchive_entry` | 清除 `archived_at`。 |
| `delete_entry` | `LocalBackend::delete_entry` | 硬删除条目和迁移子项，触发附件清理。 |
| `reopen_entry` | `LocalBackend::reopen_entry` | 撤回迁移或完成状态，恢复为 open。 |
| `reorder_entries` | `LocalBackend::reorder_entries` | 更新同一天或同组条目的 position。 |

状态规则见 [[05-entry-state-machine]]。

### Daily / Future 读取

| command | 后端方法 | 说明 |
| --- | --- | --- |
| `get_daily_log` | `LocalBackend::get_daily_log` | 读取某天条目，读取前会检查 Markdown 是否被外部修改。 |
| `get_future_log` | `LocalBackend::get_future_log` | 读取 Future Log，包括 Someday 和月度分组。 |
| `get_month_overview` | `LocalBackend::get_month_overview` | 返回某月日历点点摘要。 |
| `get_range_overview` | `LocalBackend::get_range_overview` | 返回跨日期范围 overview，供周/月切换预渲染。 |

关联 [[06-markdown-sync]] 和 [[11-calendar-daily-pages]]。

### 迁移链

| command | 后端方法 | 说明 |
| --- | --- | --- |
| `migrate_entry_to_date` | `LocalBackend::migrate_entry_to_date` | 创建目标日子项，源条目变为 `forward`。 |
| `migrate_entry_to_future` | `LocalBackend::migrate_entry_to_future` | 创建 Future 子项，源条目变为 `future`。 |
| `move_future_entry` | `LocalBackend::move_future_entry` | Future 内部移动 Someday/月度归属。 |
| `get_migration_chain` | `LocalBackend::get_migration_chain` | 顺着 `migrated_to_entry_id` 读取链。 |

关联 [[05-entry-state-machine]] 和 [[13-future-log-archive]]。

### 搜索和标签

| command | 后端方法 | 说明 |
| --- | --- | --- |
| `search_entries` | `LocalBackend::search_entries` | 文本、正则和本地 BGE 语义搜索，支持标签和日期过滤。 |
| `list_tags` | `LocalBackend::list_tags` | 列出所有标签。 |
| `rename_tag` | `LocalBackend::rename_tag` | 标签重命名，影响所有关联条目。 |

关联 [[14-search-tags-cache]]。

### 附件与工作区

| command | 后端方法 | 说明 |
| --- | --- | --- |
| `store_upload` | `LocalBackend::store_upload` | 接收前端 bytes，写入 `attachments`。 |
| `store_upload_path` | `LocalBackend::store_upload_path` | 从本机路径读取并上传。 |
| `list_uploads` | `LocalBackend::list_uploads_for_backup` | 备份用附件列表。 |
| `restore_upload` | `LocalBackend::store_upload` | 导入时恢复附件。 |
| `open_upload` | `LocalBackend::open_upload` | 用系统默认方式打开附件。 |
| `resolve_uploads` | `LocalBackend::resolve_uploads` | 解析 Markdown 中的附件链接。 |
| `attachment_maintenance_summary` | `LocalBackend::attachment_maintenance_summary` | 存储管理面板摘要。 |
| `cleanup_unused_uploads` | `LocalBackend::cleanup_unused_uploads` | 清理未引用附件。 |
| `cleanup_all_unused_uploads` | `LocalBackend::cleanup_all_unused_uploads` | 清理所有未引用附件。 |
| `get_markdown_workspace` | `LocalBackend::get_markdown_workspace` | 返回当前项目文件夹。 |
| `choose_markdown_workspace` | `LocalBackend::set_markdown_workspace_authorization` | 弹出选择目录并迁移工作区。 |
| `open_markdown_workspace` | `LocalBackend::open_markdown_workspace` | 打开项目文件夹。 |

关联 [[07-attachments]] 和 [[06-markdown-sync]]。

### Markdown 和备份

| command | 后端方法 | 说明 |
| --- | --- | --- |
| `sync_daily_markdown_file` | `LocalBackend::sync_daily_markdown_file` | 强制同步某天 Markdown。 |
| `open_daily_markdown` | `LocalBackend::open_daily_markdown` | 同步后打开当天 Markdown。 |
| `sync_future_markdown_files` | `LocalBackend::sync_future_markdown_files` | 同步 Future Markdown。 |
| `export_markdown_archive` | `LocalBackend::export_markdown_archive` | 返回 Markdown zip bytes。 |
| `export_markdown_archive_to_file` | 同上 | 弹出保存路径并写文件。 |
| `export_bjk_archive_to_file` | 前端构建 BJK + Rust 保存 | 弹出保存路径写 `.bjk`。 |
| `get_all_entries_for_backup` | `LocalBackend::get_all_entries_for_backup` | 导出 entries schema。 |
| `import_entries` | `LocalBackend::import_entries` | 旧式 JSON 导入。 |
| `import_bjk_archive` | `LocalBackend::import_bjk_archive_bytes` | Rust 解析 `.bjk` 并增量导入。 |
| `import_pending_bjk_archive` | 同上 | 双击 `.bjk` 的确认导入路径。 |
| `batch_delete_entries` | `LocalBackend::batch_delete_entries` | 导入撤回和批量删除。 |

关联 [[08-bjk-backup-import]]。

## 错误处理约定

- Rust command 返回 `Result<T, String>` 或 app result 转换后的错误文本。
- 前端 service 不直接吞错误；页面或弹窗负责 toast。
- 文件路径选择、更新安装、打开文件夹这类系统操作应在 command 内完成，避免前端对不同平台做重复分支。

## 新增 command 清单

1. 在 [[03-local-backend]] 增加纯业务方法。
2. 在 `src-tauri/src/lib.rs` 增加 `#[tauri::command]` 包装。
3. 加入 `invoke_handler`。
4. 在 [[10-service-layer]] 增加 typed wrapper。
5. UI 只调用 service，不直接散落 `invoke`。
6. 如果 command 会改变 entries，前端要通过 [[12-entry-actions-modals]] 触发 `entryEventBus` 刷新缓存。
