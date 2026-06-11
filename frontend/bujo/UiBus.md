| **事件名称 (Event Name)**      | **用途描述**        | **Payload 类型结构**                                    | **备注**                             |
| -------------------------- | --------------- | --------------------------------------------------- | ---------------------------------- |
| **`OPEN_SEARCH`**          | 打开全局搜索          | `void` (无参数)                                        |                                    |
| **`OPEN_TAG_SEARCH`**      | 打开标签搜索          | `string \| null`                                    | 传入标签名可直接搜索该标签，传 null 打开空搜索         |
| **`OPEN_FUTURE_LOG`**      | 跳转/打开未来日志视图     | `void`                                              |                                    |
| **`OPEN_TIMELINE`**        | 打开时间轴视图         | `void`                                              |                                    |
| **`OPEN_CALENDAR_SYNC`**   | 打开日历同步设置        | `void`                                              |                                    |
| **`OPEN_CHANGE_PASSWORD`** | 打开修改密码弹窗        | `void`                                              |                                    |
| **`OPEN_LOGOUT_CONFIRM`**  | 打开退出登录确认窗       | `void`                                              |                                    |
| **`OPEN_ADD_ENTRY`**       | 打开“添加条目”弹窗      | `{ mode?: "daily"\|"future", date?: string\|Date }` | 用于新建笔记                             |
| **`OPEN_MIGRATE_ENTRY`**   | **打开“迁移”弹窗**    | `{ entry: any }`                                    | **修复重点**：用于将 Daily 条目迁移到其他日期       |
| **`OPEN_FUTURE_ENTRY`**    | **打开“规划到未来”弹窗** | `{ entry: any }`                                    | **修复重点**：用于将条目移动到某个月份 (Future Log) |
| **`OPEN_DELETE_ENTRY`**    | **打开“删除确认”弹窗**  | `{ entry: any }`                                    | **修复重点**：用于删除条目                    |
| **`OPEN_SHARE_ENTRY`**     | 打开分享弹窗          | `{ entry: any }`                                    |                                    |