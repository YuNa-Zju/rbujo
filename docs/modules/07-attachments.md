# 07 Attachments

## 入口文件

- Rust：`src/local.rs`
- 前端服务：`frontend/src/services/attachmentService.ts`
- 拖拽 Hook：`frontend/src/hooks/useTauriAttachmentDrop.ts`
- UI：`AddEntryModal`, `EntryEditor`, `AttachmentMaintenanceController`

## 职责

附件模块负责拖拽/粘贴上传、压缩、去重、Markdown 链接生成、引用解析、预览、打开文件、存储统计和未引用清理。

## 存储位置

当前实际文件存放在 Markdown 工作区：

```text
<workspace>/attachments/<sha256>.<ext>
```

旧路径 `uploads/*` 仍可解析和迁移，但新文件应写入 `attachments/*`。工作区规则见 [[06-markdown-sync]]。

## 上传流程

### 前端拖拽或粘贴

1. `AddEntryModal` 或 `EntryEditor` 监听 DOM drop / paste。
2. Tauri native drop 由 `useTauriAttachmentDrop` 监听 `onDragDropEvent`。
3. `attachmentService` 判断文件类型和 drop 坐标是否在输入框内。
4. 图片可按 `original | compressed` 模式处理：
   - jpeg/png/webp 可转 webp。
   - 最大边默认压到 1920。
   - 压缩后不比原图小时保留原图。
5. 调用 [[10-service-layer]] 的 `entryService.uploadFile` 或 `uploadPath`。
6. 返回 `StoredUpload` 后插入 Markdown 链接。

### 后端存储

`LocalBackend::store_upload`：

1. 计算 sha256。
2. 根据扩展名生成 `<sha256>.<ext>`。
3. 如果文件已存在则复用。
4. 写入或更新 `attachment_records`。
5. 返回 relative path、asset URL、size、mime、sha。

`store_upload_path` 先从本机路径读 bytes，再走同一流程。

## Markdown 链接

前端插入：

- 图片：`![label](attachments/<sha>.<ext>)`
- 非图片：`[label](attachments/<sha>.<ext>)`

显示时可由 `resolve_uploads` 转为 Tauri asset URL 或预览 data URL。

## 引用解析

后端支持多种历史格式：

- `attachments/*`
- `uploads/*`
- `asset://localhost/...`
- `asset.localhost/...`
- URL 编码后的绝对路径

解析时会把路径约束在允许目录里，避免任意文件读取。

## 未引用清理

引用来源是 entries 的 Markdown 内容。后端会扫描所有内容，统计每个附件：

- `reference_count`
- `archived_reference_count`
- 引用日期和 entry id
- 是否 orphaned

清理触发点：

- 编辑内容导致旧附件引用消失。
- 删除条目。
- 导入覆盖或撤回。
- 存储管理面板手动清理。

归档条目引用的附件不应被当作普通未引用删除；存储管理面板会显示归档引用胶囊。

## 存储管理面板

`AttachmentMaintenanceController`：

1. 监听 `OPEN_ATTACHMENT_MAINTENANCE` 和 `menu:attachment-maintenance`。
2. 调用 `getAttachmentMaintenanceSummary` 和 `getMarkdownWorkspace`。
3. 显示工作区路径、打开文件夹、更改路径、附件总占用、引用中、可清理空间。
4. 展开附件可看引用日期。
5. 点击具体日期可跳转到 `/daily/:date`。

它和 [[15-update-and-menu]] 共用右上角菜单、设置页、命令面板入口。

## 导出导入联动

- [[08-bjk-backup-import]] 导出 `.bjk` 时会把附件放进包里，并记录 manifest。
- Markdown zip 导出会重写附件路径，让解压后的 Markdown 可读。
- 导入 `.bjk` 时 Rust 先恢复附件，再重写 entry content 内旧路径。

## 对接注意

- 新增附件类型时要同步 MIME 推断、预览、Markdown 链接生成和打开方式。
- 修改目录名必须同时改上传、解析、导出、导入、清理和旧路径迁移。
- 前端不要长期保存 `asset://localhost` 作为正文链接，正文应优先保存相对路径。
- 批量导入后要刷新 attachment summary 和日历缓存。
