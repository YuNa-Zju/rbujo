# Changelog

## v0.3.1 - 2026-06-17

- 附件真实存储目录从 `uploads/` 改为 `attachments/`，并保留旧 `uploads/` 链接和备份导入兼容。
- Daily Markdown 文件路径调整为 `Daily/YYYY/MM/YYYY-MM-DD.md`，同时兼容导入旧的 `Daily/YYYY-MM/YYYY-MM-DD.md` 和 `Daily/YYYY-MM-DD.md`。
- Storage 面板精简为工作区路径和附件信息，去掉今日 Markdown 卡片与完成按钮，并增加“打开文件夹”操作。
- Future Log 增加 Markdown 磁盘同步，计划中内容写入 `Future/Future.md`，按月内容写入 `Future/YYYY/MM.md`。
- 回到应用窗口或页面重新可见时会刷新当前日记，减少外部编辑 Markdown 后必须切换日期才更新的问题。

## v0.3.0 - 2026-06-17

- Combined attachment and Markdown management into one Storage panel.
- Added Markdown workspace path management with an inline Change Path action.
- Grouped Daily Markdown files under `Daily/YYYY-MM/YYYY-MM-DD.md`.
- Imported legacy flat `Daily/YYYY-MM-DD.md` files before writing the new month-folder layout.
- Added attachment reference expansion with date-based navigation back to the referenced daily note.
- Added a home-page shortcut to open the selected day Markdown file.
- GitHub release notes now come from this changelog instead of a hard-coded workflow body.

## v0.2.8 - 2026-06-16

- Added two-way Daily Markdown sync: external edits are detected from file timestamps and imported back into BuJo.
- Reworked Daily Markdown files into a cleaner human-readable format without internal metadata comments.
- Added a Markdown settings panel in the top-right menu for choosing the project folder used to store Daily Markdown files.
- Simplified the attachment panel copy and removed its bottom refresh control.
