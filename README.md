# BuJo

BuJo 是一个本地优先的子弹笔记桌面应用。桌面端基于 Tauri 2，前端在 `frontend/`，本地数据、Markdown 磁盘化、附件和备份逻辑在 Rust 侧。

## 功能

- Daily Log：按天记录 task / idea / event。
- Future Log：Planning / Completed 双 tab，并支持拖动调整月份。
- Markdown 磁盘化：Daily、Future 和 attachments 放在用户选择的项目文件夹中。
- 附件管理：拖拽上传、引用统计、未引用附件清理。
- BJK 备份：`.bjk` 是带 `manifest.json` 的可移植备份包，支持双击导入确认。
- 更新检查：显示当前版本、更新日志和下载进度。

## 开发

安装依赖：

```bash
npm --prefix frontend ci
```

启动桌面开发模式：

```bash
npm --prefix frontend run tauri:dev
```

只构建前端：

```bash
npm --prefix frontend run build
```

运行桌面打包：

```bash
npm --prefix frontend run tauri:build
```

## 验证

合并前至少运行：

```bash
npm --prefix frontend run test:frontend
npm --prefix frontend run build
cargo test
git diff --check
```

说明：当前 `npm --prefix frontend run lint` 会被既有 lint debt 拦住，不作为发布门禁。

## 发布

补丁版本在干净的 `master` 上运行：

```bash
npm --prefix frontend run release:patch
```

该脚本会 bump 版本、提交 `Release vX.Y.Z`、推送 `master` 和 `vX.Y.Z` tag，从而触发 GitHub Actions 构建 macOS / Windows 安装包。

## macOS 文件夹权限

如果 Markdown 项目文件夹放在 `Documents` 等受保护目录，macOS 可能会提示授权。当前应用保存的是普通项目路径；后续要彻底减少重复授权，需要为用户选择的项目文件夹保存 security-scoped bookmark，并在访问 Daily / Future / attachments 前恢复该授权。

## 代码结构

- `frontend/src/services/entryService.ts`：前端到 Tauri command 的数据服务。
- `src-tauri/src/lib.rs`：Tauri command、原生菜单、窗口和更新入口。
- `src/local.rs`：本地 SQLite、Markdown、附件和备份逻辑。
- `docs/`：API、迁移、测试、发布和后续实现计划。
