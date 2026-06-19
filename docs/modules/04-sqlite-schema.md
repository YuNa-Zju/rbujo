# 04 SQLite Schema

## 入口文件

- `src/db.rs`
- `src/models.rs`

## 职责

SQLite 保存 BuJo 的运行时数据。Markdown 文件是用户可编辑的磁盘化视图，但 SQLite 仍是查询、排序、状态机、标签、搜索和导入去重的主结构。

## 表结构

### `users`

本地桌面主要使用一个用户：

- `id`
- `username`
- `created_at`

[[03-local-backend]] 启动时确保 `local` 用户存在。

### `entries`

核心条目表。重要字段：

| 字段 | 说明 |
| --- | --- |
| `id` | Entry UUID。 |
| `owner_id` | 用户 id。 |
| `content` | Markdown 内容。 |
| `entry_type` | `task` / `idea` / `event`。 |
| `status` | `open` / `completed` / `cancelled` / `forward` / `future`。 |
| `created_at` | 创建时间。 |
| `target_date` | Daily 目标日期，格式 `YYYY-MM-DD`。 |
| `target_month` | Future 月度目标，格式 `YYYY-MM`。 |
| `is_future` | 是否是活动 Future 条目。 |
| `source_entry_id` | 迁移子项指向源条目。 |
| `from_date` | 从 Daily 迁移来的原日期。 |
| `position` | 同一天或同组排序位置。 |
| `migrated_to_date` | 源条目迁移到的目标日期。 |
| `migrated_to_month` | 源条目迁移到的目标 Future 月。 |
| `archived_at` | 归档时间，和 status 正交。 |
| `chain_root_id` | 迁移链根条目。 |
| `migrated_to_entry_id` | 迁移链下一跳。 |

关键约束：

- `entry_type in ('task','idea','event')`
- `status in ('open','completed','cancelled','forward','future')`
- `target_date` 和 `target_month` 不能同时存在。
- `is_future=1` 时 `target_date` 必须为空。

状态组合详见 [[05-entry-state-machine]]。

### `tags`

标签字典：

- `id`
- `owner_id`
- `name`
- `created_at`

标签名按 owner 唯一。重命名由 [[14-search-tags-cache]] 调用 [[02-tauri-commands]] 的 `rename_tag`。

### `entry_tags`

Entry 和 tag 的多对多关系：

- `entry_id`
- `tag_id`
- `position`

保存标签顺序，供 UI 显示和 Markdown 导出。

### `attachment_records`

附件索引：

- `relative_path`
- `sha256`
- `size_bytes`
- `mime_type`
- `original_name`
- `updated_at`

文件实际位于 Markdown 工作区的 `attachments/`，引用和清理见 [[07-attachments]]。

### `app_settings`

本地设置：

- Markdown 工作区路径。
- macOS security-scoped bookmark。

由 [[01-desktop-shell]] 和 [[06-markdown-sync]] 使用。

### Markdown 同步状态表

`daily_markdown_sync_state` 记录整个文件状态：

- `owner_id`
- `date`
- `path`
- `modified_ms`
- `content_sha256`
- `synced_at`

`daily_markdown_entry_sync_state` 记录 Markdown 行与 entry 的匹配关系：

- `owner_id`
- `date`
- `entry_id`
- `line_hash`
- `line_index`
- `content`

它用于外部编辑后的增量匹配。详见 [[06-markdown-sync]]。

### `schema_migrations`

记录本地 schema 迁移版本。`src/db.rs` 还会用 `ALTER TABLE ADD COLUMN` 做兼容修复，避免旧用户数据库缺列。

## DTO 与模型

`src/models.rs` 定义：

- `Entry`
- `EntryResponse`
- `EntrySummaryDto`
- `EntryExportSchema`
- `ImportResponseDto`
- `FutureLogResponse`
- `MonthOverview`
- `AttachmentMaintenanceSummary`

前端 service 会把 snake_case 字段归一化为 UI 可用结构。见 [[10-service-layer]]。

## 对接注意

- 新增字段时要同时改 `Entry`、`EntryResponse`、schema 初始化、旧库迁移、导入导出 schema。
- 字段若影响 Markdown 文件，需要同步 [[06-markdown-sync]] 的解析和渲染。
- 字段若影响日历点点，需要同步 [[11-calendar-daily-pages]] 的 overview DTO。
- 状态字段不要临时扩展字符串；先更新 [[05-entry-state-machine]]。
