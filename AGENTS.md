# AGENTS.md

## 项目简介

`rbujo` 是一个本地优先的子弹笔记应用。桌面端基于 Tauri 2，前端在 `frontend/`，本地后端与数据逻辑在 Rust 侧。

桌面端前后端配合应走 Tauri `invoke`：

- 前端统一通过 `frontend/src/services/entryService.ts` 等 service 调用。
- Tauri command 统一在 `src-tauri/src/lib.rs` 暴露。
- 本地桌面业务逻辑优先改 `src/local.rs`，不要为桌面功能绕到 HTTP route。

## 审查流程

合并到 `master` 前按这个顺序检查：

1. 明确改动是否覆盖用户列出的每一项需求。
2. 运行核心验证：
   - `npm --prefix frontend run test:frontend`
   - `npm --prefix frontend run build`
   - `cargo test`
   - `git diff --check`
3. Rust 格式只检查本轮相关文件时使用：
   - `rustfmt --edition 2024 --check <changed-rust-files>`
4. 重大 UI/发布改动需要启用 subagent 做 code review。
5. 对 reviewer 的 Critical / Important 问题先修再合并。

说明：当前 `npm --prefix frontend run lint` 会被既有 lint debt 拦住，不作为发布门禁，除非本轮专门清理 lint。

## 发布流程

发布补丁版本的标准流程：

1. 在 bugfix/feature 分支完成改动并验证。
2. 合并到干净的 `master`。
3. 在 `master` 上运行：

```bash
npm --prefix frontend run release:patch
```

该脚本会：

- 检查当前分支必须是 `master`。
- 检查工作区必须干净。
- bump `src-tauri/tauri.conf.json`、`frontend/package.json`、`frontend/package-lock.json` 的 patch 版本。
- 提交 `Release vX.Y.Z`。
- 推送 `master`。
- 创建并推送 `vX.Y.Z` tag，触发 GitHub Actions 远程构建。

除非用户明确要求，不需要本地构建安装包，也不需要主动轮询 CI 是否成功。

## 工作约定

- 不要提交临时调试日志或调试 UI。
- 不要回滚用户已有改动；遇到无关脏文件先停下来确认。
- Windows release 若出现空命令行窗口，检查 `src-tauri/src/main.rs` 的 `windows_subsystem = "windows"`。
- 更新弹窗和版本弹窗应保持应用现有风格，并显示当前版本和更新日志。
- Future Log 当前使用 `Planning / Completed` 双 tab；过期年份 Future Log 在归档中只读展示。
