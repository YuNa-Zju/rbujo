# 16 Integration Guide

## 目标

这份清单用于后续功能对接，避免只改一层导致状态、Markdown、附件、缓存或菜单入口不一致。

## 新增 Entry 字段

需要检查：

1. [[04-sqlite-schema]]：`entries` schema、旧库迁移、索引。
2. `src/models.rs`：`Entry`、`EntryResponse`、导入导出 DTO。
3. [[03-local-backend]]：create/update/search/backup/import 是否处理。
4. [[06-markdown-sync]]：Markdown 是否需要表达新字段。
5. [[10-service-layer]]：归一化字段。
6. [[11-calendar-daily-pages]]：overview dots 和缓存。
7. [[08-bjk-backup-import]]：`.bjk` manifest 或 payload。

## 新增条目动作

推荐流程：

1. 先在 [[05-entry-state-machine]] 定义合法状态转移。
2. 在 [[03-local-backend]] 实现原子操作。
3. 暴露 [[02-tauri-commands]]。
4. 在 [[10-service-layer]] 添加 wrapper。
5. 在 [[12-entry-actions-modals]] 增加 UI 动作和确认弹窗。
6. 操作成功后发对应 `entryEventBus`。
7. 检查 [[06-markdown-sync]] 是否需要写回。
8. 检查 [[07-attachments]] 是否需要清理引用。

## 新增全局弹窗

推荐流程：

1. 用 `EscModalWrapper` 包裹，确保 Portal 到 body。
2. 给唯一 id，进入 `modalStack`。
3. 在 `uiEvents` 增加打开事件。
4. 在 `GlobalModalHost` 或独立 Controller 监听事件。
5. 若有原生菜单入口，同步 [[15-update-and-menu]]。
6. ESC 只关闭栈顶，不要在组件里重复监听全局 Escape。

## 新增菜单入口

需要同步：

- `src-tauri/src/lib.rs` 原生菜单 id 和事件。
- `UserMenu`。
- `GlobalCommandPalette`。
- 可能的 `SettingsModalController`。
- 对应 Controller 的 `uiEvents` 监听。

入口逻辑见 [[15-update-and-menu]]。

## 新增文件能力

例如导出、导入、打开文件、选择目录：

1. 系统对话框在 [[02-tauri-commands]] / Rust 侧完成。
2. 路径授权考虑 macOS bookmark，见 [[01-desktop-shell]]。
3. 写入 Markdown 工作区时遵守 [[06-markdown-sync]]。
4. 附件路径必须是相对路径，见 [[07-attachments]]。
5. 大文件或 zip 解析优先放 Rust。

## 新增导入同步逻辑

如果要基于 `.bjk` 做多端同步：

1. 扩展 manifest，放轻量 hash、entry id、updated 信息。
2. Rust 先读 manifest 做快速差异判断。
3. 只解压需要的 payload 或附件。
4. `import_entries` 返回实际 inserted/updated/skipped。
5. 前端只刷新受影响日期和 tag cache，不全量刷新。
6. 撤回只承诺撤回新增条目；更新旧条目需要单独设计历史快照。

关联 [[08-bjk-backup-import]]。

## 新增附件能力

检查：

- `attachmentService` 的前端压缩、drop、paste。
- [[03-local-backend]] 的 `store_upload` 和 `resolve_uploads`。
- [[07-attachments]] 的路径解析、维护面板、清理。
- [[06-markdown-sync]] 的 Markdown 链接。
- [[08-bjk-backup-import]] 的导入导出重写。

## 性能优化方向

优先考虑：

- Markdown 解析、zip 解压、hash 比对放 Rust。
- 前端缓存只缓存展示数据，不保存权威状态。
- overview 走范围接口，减少逐日请求。
- tag cache 做 in-flight 去重。
- 大弹窗和重组件懒加载。
- 图片预览按需解析。

相关模块：[[03-local-backend]], [[10-service-layer]], [[11-calendar-daily-pages]], [[14-search-tags-cache]]。

## 验证建议

文档外的功能改动合并前按项目流程验证：

```bash
npm --prefix frontend run test:frontend
npm --prefix frontend run build
cargo test
git diff --check
```

文档-only 改动至少运行：

```bash
git diff --check
git diff --name-only
```

## 高风险点

- 状态字符串前后端不一致。
- 只改 SQLite 不改 Markdown 同步。
- 只改 Markdown 链接不改附件导出和导入。
- 弹窗没有 Portal，导致被父容器裁切。
- 导入后没有刷新 overview dots。
- 归档条目引用附件被误删。
- Future 迁移和 Future 内移动混淆。
