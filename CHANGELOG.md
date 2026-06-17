# Changelog

## v0.4.4 - 2026-06-17

- 修复 Windows MSI 构建在 `.bjk` 文件关联写入阶段失败的问题。
- `.bjk` 文件关联的 Windows 类型描述改为 ASCII 文本，避免 WiX `en-US` 安装包链接失败；双击导入功能保持不变。

## v0.4.3 - 2026-06-17

- 修复“数据与备份”弹窗中撤回上一次导入时，确认弹窗状态变化导致撤回失效的问题。
- 导入成功提示改为显示实际新增条数，不再把重复导入或更新的记录计入成功导入数量。
- `.bjk` 双击导入和手动导入的成功提示保持一致，并继续保留 toast 撤回入口。

## v0.4.2 - 2026-06-17

- 修复 `.bjk` 导入成功后无法稳定撤回上一次导入的问题。
- 导入成功后新增 toast 提示，可直接从 toast 撤回本次新增记录。
- 导入和撤回不再整页刷新，而是刷新当前可见的首页/日记数据。
- 备份面板的最近导入记录去掉清除按钮，避免误删撤回入口。

## v0.4.1 - 2026-06-17

- 修复 macOS 双击 `.bjk` 文件只能打开应用、但不会弹出导入确认窗口的问题。
- 导入弹窗会先注册桌面文件打开事件，再读取后端暂存的导入请求，避免启动阶段漏掉系统事件。
- 图片预览增强触控板缩放和 Ctrl + 滚轮缩放灵敏度，同时保留普通滚轮/触控板滚动平移。

## v0.4.0 - 2026-06-17

- `.bjk` 备份文件改为可扩展的 ZIP 容器，内含 `manifest.json` 和压缩后的备份数据，为之后多端同步保留元数据入口。
- 保留旧版 `.bjk` 导入兼容，并在桌面端注册 `.bjk` 文件关联；双击 `.bjk` 会打开导入确认弹窗，也可继续从“数据与备份”面板手动导入。
- 右上角菜单、命令面板和桌面原生菜单统一为“数据 / 应用”入口，覆盖归档、备份、存储管理、检查更新和版本信息。
- Windows 菜单栏新增数据与帮助菜单，避免桌面端入口缺失或无法触发。
- 图片预览改为普通滚轮/触控板滚动平移，按住 Ctrl 或使用触控板缩放手势时才缩放，并减少多指手势误触关闭。

## v0.3.4 - 2026-06-17

- 移除日历订阅同步入口和相关弹窗，避免保留暂不可用的日历同步功能。
- Future Log 保持 `Planning / Completed` 双标签结构，已完成事项集中显示在 Completed 中，Planning 专注于未完成计划。
- Planning 中新增月份整理模式，可以把 Future Log 条目拖到待定事项或指定月份。
- 月份整理模式复用主页面调整排序的视觉样式：圆形整理按钮、折叠条目卡片、左侧拖拽把手和轻量卡片背景。
- 拖拽时会保持卡片宽度，减少拖动过程中卡片缩小导致的跟手问题。

## v0.3.3 - 2026-06-17

- 附件真实存储位置改为当前项目文件夹下的 `attachments/`，和 `Daily/`、`Future/` 放在同一层。
- 更改项目文件夹时会移动原项目文件夹内容，附件不会继续留在 Application Support 的旧目录中。
- 旧版 `uploads/` 与旧 Application Support `attachments/` 会自动迁移并保持历史链接可读取。
- 关闭编辑弹窗或保存后会立即清理未被任何笔记引用的附件，避免取消拖拽上传后残留文件。
- 存储管理会标记归档笔记中的附件引用，防止归档内容引用的附件被误判为未引用。

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
