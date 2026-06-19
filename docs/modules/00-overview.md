# 00 Overview

## 职责

BuJo 是本地优先的子弹笔记桌面应用。桌面端由 Tauri 2 承载，React 前端负责交互，Rust 本地后端负责 SQLite、Markdown 文件、附件、备份包和系统级能力。

核心链路是：

`React UI` -> [[10-service-layer]] -> Tauri `invoke` -> [[02-tauri-commands]] -> [[03-local-backend]] -> [[04-sqlite-schema]] / Markdown 工作区 / 附件目录

## 分层

| 层 | 入口 | 主要职责 | 关联模块 |
| --- | --- | --- | --- |
| 桌面壳 | `src-tauri/src/lib.rs`, `src-tauri/src/main.rs` | 启动 Tauri、注册插件、菜单、单实例、文件打开、command | [[01-desktop-shell]], [[02-tauri-commands]] |
| 本地后端 | `src/local.rs` | Entry 生命周期、Markdown 同步、附件、BJK、搜索、标签 | [[03-local-backend]] |
| 数据库 | `src/db.rs`, `src/models.rs` | SQLite schema、约束、DTO、状态常量 | [[04-sqlite-schema]], [[05-entry-state-machine]] |
| 前端应用 | `frontend/src/App.tsx` | 路由、Provider、全局弹窗、命令面板 | [[09-frontend-app-shell]] |
| 前端服务 | `frontend/src/services/*` | `invoke` 包装、数据归一化、上传、更新、备份 | [[10-service-layer]] |
| 页面功能 | `frontend/src/features/*`, `frontend/src/components/*` | 日历、Daily、Future、Archive、Search、Settings | [[11-calendar-daily-pages]], [[12-entry-actions-modals]], [[13-future-log-archive]] |

## 主数据流

### 打开应用

1. [[01-desktop-shell]] 在 setup 阶段创建 app data 目录。
2. [[03-local-backend]] 调用 `LocalBackend::open(app_dir)`。
3. [[04-sqlite-schema]] 初始化 SQLite 表、索引和修复迁移。
4. 后端创建或读取本地用户 `local`。
5. 后端迁移旧 `uploads` 到当前 `attachments`，并恢复 Markdown 工作区授权。
6. React 挂载 [[09-frontend-app-shell]]，页面通过 [[10-service-layer]] 调用后端。

### 读取日记

1. [[11-calendar-daily-pages]] 请求某天 entries。
2. [[10-service-layer]] 调用 `get_daily_log`。
3. [[03-local-backend]] 先通过 [[06-markdown-sync]] 检查该日 Markdown 是否被外部编辑。
4. 如果文件变更，后端解析 Markdown 并更新 SQLite。
5. 后端返回 `EntryResponse[]`，前端写入本地 UI 缓存和 overview dots。

### 新建或编辑条目

1. [[12-entry-actions-modals]] 打开 `AddEntryModal` 或内联编辑器。
2. 前端通过 [[10-service-layer]] 调用 `create_entry` / `update_entry`。
3. [[03-local-backend]] 归一化目标日期或 Future 目标，写 SQLite 和标签关系。
4. 后端重建搜索索引，更新 Markdown 文件。
5. 前端通过 `entryEventBus` 刷新页面、点点缓存和标签缓存。

### 附件拖入

1. UI 编辑器监听 DOM drop 和 Tauri native drop。
2. [[07-attachments]] 上传文件，后端按 sha256 去重并写入 `attachments`。
3. 前端把相对链接插入 Markdown 内容。
4. Entry 保存后，附件引用从条目内容反查；没有引用的临时附件会被清理。

### 导入导出

1. [[08-bjk-backup-import]] 导出 `.bjk` 或 Markdown zip。
2. `.bjk` 导入优先走 Rust command，减少前端 zip 解压和比对压力。
3. 后端还原附件、重写引用、增量导入 entries，并返回实际插入/更新/跳过数量。

## 关键边界

- SQLite 是运行时查询和状态机的主数据源；Markdown 工作区是可读可写的磁盘化表达。参见 [[06-markdown-sync]]。
- 桌面端不应绕过 [[02-tauri-commands]] 直接使用 HTTP API。
- UI 打开行为走 `uiEvents`，数据变更广播走 `entryEventBus`。参见 [[12-entry-actions-modals]]。
- Entry 的迁移状态不是普通完成状态，必须遵守 [[05-entry-state-machine]]。
- 文件访问、打开文件夹、保存对话框和更新安装属于 Tauri/Rust 侧能力。参见 [[01-desktop-shell]] 与 [[15-update-and-menu]]。

## 后续对接优先看

- 新增数据字段：[[04-sqlite-schema]], [[03-local-backend]], [[10-service-layer]]
- 新增条目动作：[[05-entry-state-machine]], [[12-entry-actions-modals]]
- 新增文件或附件能力：[[06-markdown-sync]], [[07-attachments]]
- 新增菜单或命令：[[15-update-and-menu]]
- 新增导入导出格式：[[08-bjk-backup-import]]
