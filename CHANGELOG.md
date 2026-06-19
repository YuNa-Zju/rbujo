# Changelog

## v0.5.3 - 2026-06-19

- 全局搜索恢复“语义模式”，改为 Rust 后端使用 Candle 加载本地 `bge-small-zh-v1.5`，不依赖 Python、云端服务或前端 WebView 推理。
- 应用安装包内置 BGE 中文模型、tokenizer 和模型说明文件；首次语义搜索会懒加载模型，后续复用同一个后端实例。
- SQLite 新增 `semantic_embeddings` 缓存表，按模型版本、条目 id 和内容 sha 管理 512 维向量，条目内容变化后自动重算。
- 修复桌面打包后模型资源目录多一层 `resources/` 导致语义搜索加载失败、前端显示空结果的问题。
- 搜索弹窗和命令面板改为智能综合搜索：精确命中优先展示，低相关语义结果会被阈值过滤，并用胶囊标明“精确 / 语义 / 正则”来源。
- 搜索模块文档补齐本地 BGE 语义检索的数据流、缓存边界和后续向量索引升级方向。

## v0.5.2 - 2026-06-18

- 归档后的 toast 保持和普通 toast 一致的紧凑尺寸，撤回和彻底删除按钮移动到右侧。
- “彻底删除”改为红色实底按钮，避免和底部主按钮或深色背景混在一起。
- 修复日历当前卡片在应用亮色模式下被系统深色偏好触发描边的问题，暗色模式下才增强当前卡片区分度。
- 本地字体改为只保留压缩后的 Regular 字重，并使用 CDN 补充霞鹜文楷 Light / Bold，减少安装包内置字体体积。

## v0.5.1 - 2026-06-18

- `.bjk` 导出改为原生保存对话框，可以像 Markdown 导出一样选择导出位置，默认从下载目录开始。
- `.bjk` 备份新增更完整的 manifest 索引和 payload 哈希校验；导入时会拒绝 manifest 与真实 payload 不一致的备份包。
- `.bjk` 增量导入会在解析真实 payload 后跳过未变化条目，减少重复导入时的数据库写入和 Markdown 同步开销。
- 统一业务弹窗的顶层挂载和 ESC 栈管理，备份撤回确认、新建/编辑、迁移、移到 Future、删除、Future Log 等弹窗按一次 ESC 只关闭最上层。
- 归档 toast 改回统一样式，并保留“撤回”和“彻底删除”两个操作。
- 标签搜索弹窗支持双击标签名重命名，会同步所有相关条目；只修改大小写时也会更新生成的 Markdown 标签。
- 新建/编辑和搜索弹窗复用同一个标签输入组件，保留键盘选择和候选滚动行为。
- 修复取消按钮的英文提示溢出问题，并让 Future Log 拖拽浮层继续渲染到页面顶层，避免被弹窗内容裁剪。
- 主入口继续拆分为懒加载页面和全局弹窗 chunk，减少初始包体积。

## v0.5.0 - 2026-06-18

- 日历主页面改为桌面端更紧凑的卡片式布局，月视图会预渲染左右月份，周视图会预渲染相邻周，支持按钮、拖拽和触控板横向滚动切换。
- 下方日记区域改为独立卡片，点击或滚动顶部小条可以在月视图和周视图之间切换，月视图下也能露出当天待办。
- 修复日历点点错位和侧边月份不显示点点的问题，并恢复排序时点点互换的 layout 动画。
- 时间轴不再限制为未来 60 天，会显示所有带日期的未完成待办；后端搜索新增状态过滤，先过滤再限制数量。
- 修复标签搜索弹窗和条目卡片在圆角处溢出的问题，标签胶囊适配暗色背景。
- 回退条目卡片的错误裁剪方式，修复右侧操作按钮和取消提示被卡片边界截断的问题。
- 新建条目和搜索弹窗中的标签候选会按字母排序，并取消固定数量截断，英文标签不用先输入首字母才能看到。
- macOS Markdown 项目文件夹授权改为保存安全书签，减少项目放在“文稿”等受保护目录时反复请求权限的情况。
- 首页摘要和日历点阵数据继续向后端缓存收敛，减少前端重复解析 Markdown 的压力。

## v0.4.8 - 2026-06-17

- 修复发布流程：发布脚本会在打 tag 前检查 `CHANGELOG.md` 是否存在对应版本说明，缺失时直接停止，避免更新弹窗再次显示“没有提供更新日志”。
- GitHub Actions 构建更新包时也会检查对应版本的更新日志，缺失时失败，不再静默生成默认说明。
- README 改为面向使用者的软件介绍，整理功能、基本用法、数据位置、备份和更新方式。
- 补齐 v0.4.6 和 v0.4.7 的中文更新记录，方便之后查看历史版本变化。

## v0.4.7 - 2026-06-17

- 右上角菜单、命令面板和桌面菜单继续统一为数据与应用入口，补齐设置、版本信息和检查更新等常用操作。
- 命令面板的键盘导航改为稳定的非循环选择，修复按向下键时焦点跳回前面条目的问题。
- 归档后的提示增加“彻底删除”和“撤回”操作，可以在 toast 中直接处理刚归档的条目。
- 撤回今日待办小窗口和后台常驻实验，桌面端回到普通主窗口行为，避免不完整的小窗口体验影响使用。

## v0.4.6 - 2026-06-17

- 修复 `.bjk` 导入后弹窗中的撤回操作失效的问题，并在撤回后刷新首页点阵缓存。
- 导入成功提示显示实际新增条数，不再把重复记录计入导入数量。
- `.bjk` 导入确认弹窗改为渲染到页面顶层，减少弹窗被其他容器遮挡导致无法打开的情况。
- Windows 下打开文件夹或当天 Markdown 时隐藏额外命令行窗口。
- 版本信息中的“最近一次更新”不再重复显示标题。

## v0.4.5 - 2026-06-17

- 修复 Windows 下更改 Markdown 项目文件夹时，跨磁盘或受限目录移动导致“选择 Markdown 路径失败”的问题；选择当前项目文件夹会直接保留原路径。
- 修复“数据与备份”弹窗中撤回导入时，遇到已被删除的导入条目会提示操作失败的问题。
- 更新安装弹窗新增下载进度条，会显示百分比或已下载大小，下载完成后提示正在安装更新。

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
