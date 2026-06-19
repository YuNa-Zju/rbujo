# 10 Service Layer

## 入口文件

- `frontend/src/services/entryService.ts`
- `frontend/src/services/attachmentService.ts`
- `frontend/src/services/dataBackupService.ts`
- `frontend/src/services/updateService.ts`

## 职责

service 层是前端访问后端和系统能力的统一边界。桌面端通过 Tauri `invoke` 调 [[02-tauri-commands]]，页面和组件不应直接使用 command 字符串。

## `entryService`

`entryService.ts` 是最重要的 service。

### 归一化

`normalizeEntry` 会把后端返回的 snake_case 转为 UI 需要的字段：

- `target_date` -> `date`
- `tags` 保证为数组
- `summary` 保证有默认结构
- 保留迁移、归档、Future 等字段

### Entry 操作

| 方法 | Tauri command | 说明 |
| --- | --- | --- |
| `create` | `create_entry` | 新建条目。 |
| `update` | `update_entry` | 更新内容、类型、状态、标签、日期/月。 |
| `toggleStatus` | `update_entry` | 任务完成/打开。 |
| `delete(hard=false)` | `update_entry` 或 `delete_entry` | 软删除为 `cancelled`，硬删除真正移除。 |
| `archive` / `unarchive` | `archive_entry` / `unarchive_entry` | 归档恢复。 |
| `migrate` | `migrate_entry_to_date` | Daily 迁移到日期。 |
| `moveToFuture` | `migrate_entry_to_future` | Daily 迁移到 Future。 |
| `moveFutureEntry` | `move_future_entry` | Future 内移动月份。 |
| `reorder` | `reorder_entries` | 手动排序。 |

状态规则见 [[05-entry-state-machine]]。

### 查询

- `getDailyEntries`
- `getFutureLog`
- `getMonthOverview`
- `getRangeOverview`
- `search`
- `listTags`
- `renameTag`

查询结果会被 [[11-calendar-daily-pages]] 和 [[14-search-tags-cache]] 缓存。

### 文件与存储

- `openDailyMarkdown`
- `syncFutureMarkdownFiles`
- `getMarkdownWorkspace`
- `openMarkdownWorkspace`
- `chooseMarkdownWorkspace`
- `getAttachmentMaintenanceSummary`
- `cleanupUnusedUploads`
- `cleanupAllUnusedUploads`

这些方法连接 [[06-markdown-sync]] 和 [[07-attachments]]。

### 备份导入

- `getAllForBackup`
- `bulkImport`
- `batchDelete`
- `downloadBackup`
- `downloadBjkBackup`
- `takePendingBjkImport`
- `importPendingBjkArchive`
- `importBjkArchive`

详见 [[08-bjk-backup-import]]。

## `attachmentService`

负责前端附件交互：

- 判断 drop 坐标是否在编辑器内。
- 从 DOM drop 或 Tauri native drop 中提取文件。
- 图片压缩。
- 构造 Markdown 链接。
- 从 Markdown 内容提取和重写附件引用。
- `uploadFilesAsMarkdown` / `uploadPathsAsMarkdown` 调用 `entryService`。

后端存储和清理见 [[07-attachments]]。

## `dataBackupService`

负责 `.bjk` 容器的前端构建和 fallback 解析：

- 导出时构建 manifest、payload、attachments index。
- Tauri 环境导入优先转交 Rust。
- 记录 `inserted_ids` 以便撤回。

详见 [[08-bjk-backup-import]]。

## `updateService`

负责检查更新策略：

- startup 只检查一次。
- 非 Tauri 或非 production 不检查。
- 手动检查总是提示可用更新。
- 启动检查如果用户已经暂不更新某版本，则同版本不再弹，直到下一版本。

安装进度通过 Tauri event 回传给 [[15-update-and-menu]]。

## 对接注意

- 新增 command 时必须先加 service wrapper，UI 不直接 `invoke`。
- service 层适合做字段归一化，不适合做复杂业务状态机；状态机放 [[03-local-backend]]。
- 任何写操作后，调用方要负责发 `entryEventBus` 刷新 UI。见 [[12-entry-actions-modals]]。
- 大计算优先放 Rust command，前端 service 只做轻量封装。
