# 13 Future Log Archive

## 入口文件

- `frontend/src/components/modals/FutureLogModal.tsx`
- `frontend/src/features/futureLog/futureLogClassification.ts`
- `frontend/src/features/futureLog/futureLogDrag.ts`
- `frontend/src/pages/ArchivePage.tsx`
- `frontend/src/features/archive/archiveSections.ts`

## 职责

Future Log 管理未来事项，Archive 管理已归档条目和过期年份 Future 条目。两者都依赖 [[05-entry-state-machine]] 的状态组合。

## Future Log 数据

后端 `get_future_log(include_archived)` 返回：

- Someday entries。
- `monthly_log`: 按 `target_month=YYYY-MM` 分组。

读取前会同步 Future Markdown。见 [[06-markdown-sync]]。

## Future 双 tab

当前 Future Log UI 是双 tab：

- Planning：未完成、未取消、未迁移的当前年份 Future 条目。
- Completed：completed、cancelled、forward、migrated_forward、migrated_future。

过期年份条目不在主 Future planning 中处理，而在 Archive 中只读展示。

## 分类规则

`categorizeFutureEntries(entries, currentYear)`：

1. `target_month` 的年份不是 currentYear -> expired。
2. status 在 completed set 中 -> completed。
3. 其他 -> planning。

completed set 包括：

- `completed`
- `cancelled`
- `forward`
- `migrated_forward`
- `migrated_future`

## 拖动移动

`futureLogDrag.ts` 定义 drop id：

- Someday：`future-drop-someday`
- 月份：`future-drop-month-<0..11>`
- entry：`future-entry-<entryId>`

拖动结束后：

1. 解析目标月份。
2. 如果目标和当前相同，不调用后端。
3. 调用 [[10-service-layer]] 的 `moveFutureEntry`。
4. 发 `entryEventBus` 更新 UI。

## Archive

ArchivePage：

- 调用 `entryService.search({ include_archived: true })` 获取归档条目。
- 用 `buildArchiveSections` 分组。
- 支持多选。
- 支持批量恢复。
- 支持批量彻底删除。
- 过期 Future 只读展示，`canRestore=false`。

分组 key：

1. 优先 `target_date.slice(0, 7)`。
2. 其次 `target_month`。
3. 再其次 `archived_at.slice(0, 7)`。
4. 否则 `未归类`。

## 与 Entry 状态的关系

- 归档通过 `archived_at` 判断，不是 status。
- Future 过期通过 `target_month` 年份判断。
- 已迁移源条目仍可能在归档中展示迁移信息。
- 已归档条目的附件引用仍然是有效引用。见 [[07-attachments]]。

## 对接注意

- Future 新增分类时必须同步 Archive 的只读逻辑。
- 批量删除会影响附件清理和 overview dots。
- Future 移动只改目标月份，不应创建迁移子项。
- 从 Future 迁移到 Daily 会创建或移动具体条目，状态变化见 [[05-entry-state-machine]]。
