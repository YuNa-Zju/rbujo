# 05 Entry State Machine

## 入口文件

- `src/models.rs`
- `src/local.rs`
- 前端动作：[[12-entry-actions-modals]]
- Future/Archive 分类：[[13-future-log-archive]]

## 状态常量

后端正式状态：

| 状态 | 常量 | 含义 |
| --- | --- | --- |
| `open` | `STATUS_OPEN` | 未完成或普通活动条目。 |
| `completed` | `STATUS_COMPLETED` | 已完成。 |
| `cancelled` | `STATUS_CANCELLED` | 已取消，软删除使用这个状态。 |
| `forward` | `STATUS_MIGRATED_FORWARD` | 源条目已迁移到某个日期。 |
| `future` | `STATUS_MIGRATED_FUTURE` | 源条目已迁移到 Future Log。 |

前端仍有兼容名称 `migrated_forward` / `migrated_future`，但后端写库使用 `forward` / `future`。

## 目标位置状态

Entry 的位置由 `target_date`、`target_month`、`is_future` 决定。

| 位置 | 字段组合 | 说明 |
| --- | --- | --- |
| Daily 活动条目 | `target_date=YYYY-MM-DD`, `target_month=NULL`, `is_future=0` | 显示在某天日记。 |
| Future Someday | `target_date=NULL`, `target_month=NULL`, `is_future=1` | Future Log 的 Someday 列表。 |
| Future 月度 | `target_date=NULL`, `target_month=YYYY-MM`, `is_future=1` | Future Log 某月列表。 |
| 迁移源到日期 | `status=forward`, `migrated_to_date=YYYY-MM-DD`, `migrated_to_entry_id=<child>` | 原位置保留迁移痕迹。 |
| 迁移源到 Future | `status=future`, `migrated_to_month=YYYY-MM/null`, `migrated_to_entry_id=<child>` | 原位置保留 Future 迁移痕迹。 |
| 归档 | `archived_at != NULL` | 和以上状态正交，默认列表隐藏。 |

## 归一化规则

`normalize_entry_state` 保证数据库不会出现混乱组合：

- `status='forward'`
  - `is_future=0`
  - `target_month=NULL`
  - `migrated_to_month=NULL`
  - 保留 `migrated_to_date`
- `status='future'`
  - `is_future=0`
  - `target_month=NULL`
  - `migrated_to_date=NULL`
  - 保留 `migrated_to_month`
- `status in ('open','completed','cancelled')`
  - 清空 `migrated_to_date`、`migrated_to_month`、`migrated_to_entry_id`
  - 如果有 `target_date`，则 `is_future=0`
  - 如果有 `target_month` 或 `is_future=1`，则 `target_date=NULL`, `is_future=1`

## 状态转移

### 新建

`create_entry` 根据输入选择目标：

- 有 `target_date` -> Daily。
- 有 `target_month` -> Future 月度。
- `is_future=true` -> Future Someday。
- 都没有 -> 默认今天 Daily。

新建状态总是 `open`。

### 完成 / 取消 / 重新打开

- 任务点圈通常在前端调用 `update_entry(status='completed')` 或 `update_entry(status='open')`。
- 软删除调用 `delete(id, hard=false)`，服务层会转为 `update_entry(status='cancelled')`。
- `reopen_entry` 用于撤回迁移或恢复链条源条目。

### 迁移到日期

`migrate_entry_to_date(id, target_date)`：

1. 创建一个目标日期子条目，内容、类型、标签继承源条目。
2. 子条目 `status='open'`, `target_date=target_date`。
3. 源条目 `status='forward'`。
4. 源条目记录 `migrated_to_date` 和 `migrated_to_entry_id`。
5. 两者共用 `chain_root_id`。

### 迁移到 Future

`migrate_entry_to_future(id, target_month)`：

1. 创建 Future 子条目。
2. 子条目 `status='open'`, `is_future=1`, `target_month=target_month/null`。
3. 源条目 `status='future'`。
4. 源条目记录 `migrated_to_month` 和 `migrated_to_entry_id`。

### Future 内移动

`move_future_entry(id, target_month)` 不创建新条目，只修改活动 Future 条目的 `target_month`。

### 归档

归档只设置 `archived_at`，不改变 `status`。因此一个 completed、cancelled、forward、future 条目都可以被归档。[[13-future-log-archive]] 会把归档按时间分组。

### 硬删除

硬删除会：

- 删除指定条目。
- 删除迁移链子项。
- 如果删除的是子项，恢复父项可见状态。
- 清理不再被任何条目引用的附件。
- 写回 Markdown。

## 状态图

```text
open
  -> completed
  -> cancelled
  -> forward  -> child open on Daily
  -> future   -> child open in Future Log

completed -> open
cancelled -> open
forward   -> reopen_entry -> open
future    -> reopen_entry -> open

any status + archived_at -> archived view
archived_at cleared      -> active view
```

## UI 对应

- [[12-entry-actions-modals]] 的 `useEntryActions` 触发完成、取消、归档、迁移和恢复。
- [[11-calendar-daily-pages]] 根据 `entryEventBus` 更新当天列表和点点。
- [[13-future-log-archive]] 根据状态把 Future 分为 Planning / Completed / Expired。

## 对接注意

- 不要把 `forward` / `future` 当普通完成状态直接删除；它们是迁移源节点。
- 迁移必须创建子条目，不能只改原条目目标日期。
- 归档不是状态，筛选时必须同时看 `archived_at`。
- 导入时要保留 `chain_root_id`、`source_entry_id`、`migrated_to_entry_id`，否则撤回迁移会失效。
