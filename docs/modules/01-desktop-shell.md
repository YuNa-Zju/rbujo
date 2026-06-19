# 01 Desktop Shell

## 入口文件

- `src-tauri/src/main.rs`
- `src-tauri/src/lib.rs`
- `src/macos_security_scope.rs`

## 职责

桌面壳负责 Tauri 生命周期、原生菜单、插件注册、更新器、单实例文件打开、`.bjk` 双击导入和系统文件对话框。业务数据仍然下沉到 [[03-local-backend]]。

## 启动流程

1. `main.rs` 在 Windows release 模式使用 `windows_subsystem = "windows"`，避免打开空命令行窗口。
2. `lib.rs::run()` 创建 Tauri Builder。
3. 注册插件：
   - `tauri_plugin_dialog`：打开文件夹、保存文件。
   - `tauri_plugin_updater`：检查和安装更新。
   - `tauri_plugin_single_instance`：重复启动和 `.bjk` 文件打开转发。
4. setup 阶段解析 app data 目录，调用 [[03-local-backend]] 的 `LocalBackend::open`。
5. 将 `LocalBackend`、pending BJK import 状态、update progress 状态放入 Tauri managed state。
6. 注册 [[02-tauri-commands]] 的 `invoke_handler`。

## 原生菜单

原生菜单在 `src-tauri/src/lib.rs` 内构造，菜单项 id 会映射为事件名：

| menu id | 事件 | 前端接收方 |
| --- | --- | --- |
| `new_entry` | `menu:new-entry` | [[12-entry-actions-modals]] / `ModalControllerContext` |
| `search` | `menu:search` | [[12-entry-actions-modals]] |
| `future_log` | `menu:future-log` | [[13-future-log-archive]] |
| `archive` | `menu:archive` | [[15-update-and-menu]] / `NativeMenuBridge` |
| `backup` | `menu:backup` | [[08-bjk-backup-import]] |
| `attachment_maintenance` | `menu:attachment-maintenance` | [[07-attachments]] |
| `settings` | `menu:settings` | [[15-update-and-menu]] |
| `check_update` | `menu:check-update` | [[15-update-and-menu]] |
| `version_info` | `menu:version-info` | [[15-update-and-menu]] |

前端监听原生事件后再发 `uiEvents`，这样右上角菜单、命令面板和原生菜单可以复用同一套弹窗控制。

## `.bjk` 双击打开

`.bjk` 文件打开由两个入口处理：

- 单实例插件收到第二次启动参数。
- Tauri run event 收到系统打开文件事件。

处理流程：

1. Rust 解析参数或 URL 中的 `.bjk` 路径。
2. 生成 pending import token，存入 managed state。
3. 向前端 emit `file:open-bjk`。
4. [[08-bjk-backup-import]] 的 `BjkImportPromptController` 打开确认弹窗。
5. 用户确认后调用 `import_pending_bjk_archive`。

## macOS 目录授权

`src/macos_security_scope.rs` 用 security-scoped bookmark 解决项目文件夹位于“文稿”等受保护目录时的权限恢复。

- 选择 Markdown 工作区时创建 bookmark。
- 后续启动时恢复 bookmark 并 `startAccessingSecurityScopedResource`。
- bookmark 同时存入 [[04-sqlite-schema]] 的 `app_settings`。

这部分和 [[06-markdown-sync]]、[[07-attachments]] 强相关，因为 Daily/Future Markdown 与附件都存放在用户选择的工作区里。

## 对接注意

- 新增系统能力时优先在 [[02-tauri-commands]] 暴露 command，再由 [[10-service-layer]] 包装。
- 需要文件夹或保存路径时使用 Tauri dialog，不要在前端拼浏览器下载路径。
- 需要触发前端 UI 时 emit 明确事件，再由 [[12-entry-actions-modals]] 或 [[15-update-and-menu]] 接管。
