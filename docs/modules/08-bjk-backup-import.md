# 08 BJK Backup Import

## 入口文件

- 前端：`frontend/src/services/dataBackupService.ts`
- 后端：`src/local.rs`
- Tauri command：[[02-tauri-commands]]
- UI：`BackupModal`, `BjkImportPromptController`

## 职责

`.bjk` 是 BuJo 的可扩展备份载体，用于后续多端同步和增量导入。它把 entries、manifest 和附件打包在一起，并提供导入撤回能力。

## BJK 容器

当前 `.bjk` 优先使用 zip：

```text
backup.bjk
  manifest.json
  data/
    backup.json.gz
  attachments/
    ...
```

manifest 记录：

- format：`fun.yunazju.rbujo.bjk`
- container version
- app identifier
- payload path
- payload sha256
- payload uncompressed size
- entries index / fingerprints
- attachments index

旧版 base64 gzip backup 仍可兼容读取。

## 导出流程

1. `BackupModal` 调用 `dataBackupService.exportData`。
2. 前端通过 [[10-service-layer]] 拉取 `getAllForBackup` 和 `listUploads`。
3. 前端构建 `.bjk` zip。
4. Tauri `export_bjk_archive_to_file` 弹出保存路径，默认下载目录。
5. 保存 `.bjk`。

Markdown 导出走 `export_markdown_archive_to_file`，由 Rust 生成 zip 并弹出保存路径。

## 双击导入流程

1. [[01-desktop-shell]] 捕捉 `.bjk` 文件打开。
2. Rust 生成 pending token 并 emit `file:open-bjk`。
3. `BjkImportPromptController` 打开确认弹窗。
4. 用户确认后调用 `import_pending_bjk_archive(path, token)`。
5. Rust 读取文件并调用 `import_bjk_archive_bytes`。
6. 返回 `ImportResponseDto`。
7. 前端 toast 显示实际导入数量并记录可撤回 ids。

## 手动导入流程

`BackupModal` 选择 `.bjk` 后：

- 在 Tauri 环境优先调用 Rust `import_bjk_archive`。
- 非 Tauri fallback 才在前端解析。

这样可以把 zip 解压、hash 校验、附件恢复和 entry 比对放到 Rust，提高大包导入性能。

## Rust 导入步骤

`import_bjk_archive_bytes`：

1. 解析 zip 或旧 gzip。
2. 校验 manifest format、version、payload sha256 和 size 限制。
3. 解压 `backup.json.gz`。
4. 先恢复附件，得到旧路径到新相对路径的映射。
5. 重写 entries content 内的附件引用。
6. 调用 `import_entries`。

`import_entries`：

- 同 id 同 owner 且 fingerprint 未变：跳过。
- 同 id 同 owner 但内容变化：更新。
- id 和其他 owner 冲突：生成新 uuid。
- 按内容和目标日期判断重复：跳过。
- 新条目：插入并返回 `inserted_ids`。

## 撤回导入

前端只记录本次实际插入的 ids：

- `recordImportUndoIds(insertedIds)`
- toast 或弹窗里点击撤回 -> `batchDeleteEntries(ids)`

更新过的旧条目不能靠 inserted ids 完整撤回，因此 UI 上显示的撤回主要针对新插入条目。

## 导入返回值

`ImportResponseDto`：

- `success`
- `message`
- `inserted_count`
- `updated_count`
- `skipped_count`
- `inserted_ids`

“导入条数”应显示 `inserted_count`，不是总条目数。

## 和其他模块的关系

- Entry 状态合法性依赖 [[05-entry-state-machine]]。
- 附件恢复和引用重写依赖 [[07-attachments]]。
- Markdown 工作区导出依赖 [[06-markdown-sync]]。
- UI 弹窗和 toast 由 [[12-entry-actions-modals]] 管理。
- 保存路径由 [[02-tauri-commands]] 通过 Tauri dialog 处理。

## 对接注意

- manifest 中的轻量索引可以继续扩展，用于未来多端同步的快速差异判断。
- 新增 entry 字段时必须同步 `EntryExportSchema` 和导入归一化。
- 附件引用格式变化时必须更新 BJK 导入重写逻辑。
- 不要让前端全量刷新作为唯一同步手段，导入后应通过 `entryEventBus` 精确刷新缓存。
