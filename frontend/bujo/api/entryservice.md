### 前端 Service 文档: Entry Service
**文件路径**: `src/features/entry/entryService.ts`
**描述**: 负责所有与“子弹笔记条目”相关的 CRUD、状态流转、迁移及搜索操作。
#### 2.1 类型定义 (Interfaces)
**`CreateEntryPayload` (创建参数)**

| 字段 | 类型 | 描述 |
| :--- | :--- | :--- |
| `content` | `string` | 条目内容 (Markdown) |
| `entry_type` | `EntryType` | 类型: task, idea, event |
| `status` | `string` | 初始状态 |
| `target_date` | `string \| null` | 关联日期 (YYYY-MM-DD) |
| `is_future` | `boolean` | 是否为未来日志 |
| `target_month` | `string \| null` | 关联月份 (YYYY-MM) |

**`UpdateEntryPayload` (更新参数 - Partial)**

| 字段 | 类型 | 描述|
| :--- | :--- | :--- |
| `content` | `string` | 内容更新 |
| `status` | `string` | 状态变更 |
| `migration_date` | `string` | 迁移至具体日期 |
| `migration_month`| `string` | 迁移至具体月份 |
| ... | ... | 其他字段同 Create |

#### 2.2 方法列表 (Methods)

|**方法名**|**HTTP**|**路径**|**描述**|
|---|---|---|---|
|**`create`**|POST|`/entries`|创建新条目。|
|**`update`**|PATCH|`/entries/{id}`|更新条目的任意字段。|
|**`toggleStatus`**|PATCH|`/entries/{id}`|**快捷操作**: 在 `open` 和 `completed` 之间切换状态。|
|**`migrate`**|PATCH|`/entries/{id}`|**Daily Log 迁移**: 将状态设为 `forward` 并记录 `migration_date` (任务推延)。|
|**`moveToFuture`**|PATCH|`/entries/{id}`|**移至未来**: 将状态设为 `future` 并记录 `migration_month`。|
|**`rescheduleFutureEntry`**|PATCH|`/entries/{id}`|**未来 -> 每日**: 将 Future Log 条目具体化到某一天 (清除 `is_future`, 设置 `target_date`)。|
|**`moveFutureEntry`**|PATCH|`/entries/{id}`|**未来 -> 未来**: 修改 Future Log 条目的所属月份。|
|**`delete`**|PATCH/DELETE|`/entries/{id}`|**删除**: 默认为软删除 (`status: cancelled`)，传入 `hard=true` 执行物理删除。|
|**`reorder`**|PATCH|`/entries/reorder`|**排序**: 更新条目 ID 列表的顺序。|
|**`search`**|GET|`/entries/search`|**搜索**: 支持文本/正则、类型筛选、日期范围。处理了数组参数序列化问题。|
|**`getFutureLog`**|GET|`/log/future`|**聚合**: 获取未来日志，合并了后端返回的 `future_log` 和 `monthly_log` 数据。|
|**`getRangeOverview`**|GET|`/log/range_overview`|**概览**: 获取指定日期范围内的条目概览。|
