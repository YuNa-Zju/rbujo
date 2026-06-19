# 12 Entry Actions Modals

## 入口文件

- `frontend/src/components/modals/GlobalModalHost.tsx`
- `frontend/src/components/modals/AddEntryModal.tsx`
- `frontend/src/hooks/useEntryActions.ts`
- `frontend/src/lib/uiEvents.ts`
- `frontend/src/lib/entryEventBus.ts`
- `frontend/src/components/common/ModalFrame.tsx`
- `frontend/src/lib/modalStack.ts`

## 职责

本模块统一处理条目操作、全局弹窗、ESC 关闭栈和 UI/数据事件分层。

## 两条事件总线

### `uiEvents`

用于打开 UI，不承载数据同步语义。

常用事件：

- `OPEN_SEARCH`
- `OPEN_TAG_SEARCH`
- `OPEN_FUTURE_LOG`
- `OPEN_TIMELINE`
- `OPEN_ADD_ENTRY`
- `OPEN_MIGRATE_ENTRY`
- `OPEN_FUTURE_ENTRY`
- `OPEN_DELETE_ENTRY`
- `OPEN_EDIT_ENTRY`
- `OPEN_BACKUP`
- `OPEN_SETTINGS`
- `OPEN_CHECK_UPDATE`
- `OPEN_VERSION_INFO`
- `OPEN_ATTACHMENT_MAINTENANCE`
- `CLOSE_MODALS`

部分事件是 replayable，即 listener 尚未挂载时会暂存一次，适配原生菜单和启动早期事件。

### `entryEventBus`

用于数据变更广播。

常用事件：

- `entry:create`
- `entry:update`
- `entry:delete`
- `entry:status_change`
- `entry:migrate`
- `entry:reload_needed`
- `entry:invalidate_overview_cache`

[[11-calendar-daily-pages]]、[[14-search-tags-cache]] 等模块订阅这些事件更新缓存。

## 全局弹窗栈

`EscModalWrapper` -> `ModalFrame` -> `modalStack`：

1. 弹窗打开时按 id 入栈。
2. 关闭时移除。
3. 全局 capture 阶段监听 Escape。
4. 每次只关闭栈顶弹窗，并阻止事件继续传播。
5. 默认 `portal` 到 `document.body`，避免嵌套容器导致弹窗无法点击或被裁切。

新增弹窗应优先使用 `EscModalWrapper`，并使用唯一 id。

## `GlobalModalHost`

承载：

- `AddEntryModal`
- `SearchModal`
- `TagSearchModal`
- `FutureLogModal`
- `TimelineModal`
- `BackupModal`
- `MigrateModal`
- `FutureModal`
- `DeleteModal`
- `UpdateCheckController`
- `VersionInfoController`
- `AttachmentMaintenanceController`
- `SettingsModalController`
- `BjkImportPromptController`

它把 `uiEvents` 或 `ModalControllerContext` 状态转换为具体弹窗实例。

## Add / Edit

`AddEntryModal.showModal` 支持：

- 新建 Daily。
- 新建 Future。
- 编辑已有 entry。

编辑和新建应复用同一套卡片和附件上传体验，避免状态和样式分叉。

## Entry 动作

`useEntryActions` 包含：

- 完成/重新打开。
- 编辑。
- 迁移到日期。
- 迁移到 Future。
- Future 内移动。
- 归档。
- 取消或硬删除。
- 复制内容。
- 快捷移动到明天或下个月。

它会调用 [[10-service-layer]]，然后发 `entryEventBus`。状态转移见 [[05-entry-state-machine]]。

## Toast

归档、导入撤回等操作通过 toast 提供 undo。约定：

- toast 是操作结果反馈，不替代数据刷新。
- 有撤回时保存必要 ids。
- 硬删除按钮要明显区分危险操作。
- 撤回成功后应刷新相关缓存，尤其是日历点点。

## 对接注意

- UI 打开事件不要混进 `entryEventBus`，数据刷新不要混进 `uiEvents`。
- 新增弹窗必须考虑 ESC 栈和 Portal。
- 修改状态动作时先查 [[05-entry-state-machine]]，再改 UI。
- 大型导入或文件操作不要阻塞主线程，优先调用 Rust command。
