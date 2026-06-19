# BuJo 模块文档索引

这组文档按模块拆分，使用 Obsidian 风格的 `[[模块名]]` 双向链接描述依赖关系。建议从 [[00-overview]] 开始读，再按要对接的方向跳转。

## 推荐阅读路径

- 总体架构：[[00-overview]] -> [[02-tauri-commands]] -> [[03-local-backend]] -> [[04-sqlite-schema]]
- 日记状态与数据流：[[05-entry-state-machine]] -> [[06-markdown-sync]] -> [[11-calendar-daily-pages]] -> [[12-entry-actions-modals]]
- 文件与同步：[[07-attachments]] -> [[08-bjk-backup-import]] -> [[16-integration-guide]]
- 前端入口：[[09-frontend-app-shell]] -> [[10-service-layer]] -> [[14-search-tags-cache]] -> [[15-update-and-menu]]

## 模块列表

- [[00-overview]]：整体分层、主数据流和边界约定。
- [[01-desktop-shell]]：Tauri 应用启动、窗口、菜单、插件和单实例文件打开。
- [[02-tauri-commands]]：Rust command 暴露面和前端 `invoke` 对应关系。
- [[03-local-backend]]：`LocalBackend` 的本地业务入口、数据读写和核心函数。
- [[04-sqlite-schema]]：SQLite 表结构、约束、索引和迁移修复。
- [[05-entry-state-machine]]：Entry 状态机、迁移链、归档、删除和恢复。
- [[06-markdown-sync]]：Daily/Future Markdown 磁盘化、导入、写回和冲突匹配。
- [[07-attachments]]：附件上传、引用解析、清理、预览和存储管理。
- [[08-bjk-backup-import]]：`.bjk` 备份包、Markdown 导出、导入和撤回。
- [[09-frontend-app-shell]]：React 入口、路由、Provider、懒加载和全局弹窗宿主。
- [[10-service-layer]]：前端 service 层、归一化、上传、更新和备份服务。
- [[11-calendar-daily-pages]]：日历页、日记页、预览数据、缓存和排序。
- [[12-entry-actions-modals]]：条目操作、全局弹窗、ESC 栈和 UI/数据事件总线。
- [[13-future-log-archive]]：Future Log、归档页、过期 Future 项和批量操作。
- [[14-search-tags-cache]]：文本/正则/本地 BGE 语义搜索、标签缓存和标签重命名。
- [[15-update-and-menu]]：更新检测、版本信息、右上角菜单、命令面板和原生菜单。
- [[16-integration-guide]]：后续功能对接清单、状态同步注意事项和测试建议。

## 当前约定

- 桌面端前后端配合走 Tauri `invoke`，前端不要绕到 HTTP route。参见 [[10-service-layer]] 和 [[02-tauri-commands]]。
- 本地桌面业务逻辑优先在 `src/local.rs` 内完成。参见 [[03-local-backend]]。
- Entry 状态与迁移链必须先看 [[05-entry-state-machine]]，避免只改 UI 后出现数据不一致。
- 文件相关功能必须同时考虑 Markdown 工作区、附件目录、数据库记录和前端缓存。参见 [[06-markdown-sync]] 与 [[07-attachments]]。
