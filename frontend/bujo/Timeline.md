#### 1. 组件概述
`TimelinePage` 是一个结合了**时间轴视图**与**实时搜索**的综合看板。它默认加载未来 60 天内的所有任务，并以垂直时间轴的形式呈现。用户可以在顶部输入关键词，实时过滤时间轴上的内容，快速定位近期任务。
#### 2. 核心功能
- **范围限定搜索**: 自动计算 `startDate` (Today) 和 `endDate` (Today + 60d)，作为 `entryService.search` 的固定参数。
- **实时防抖搜索**: 复用 `SearchModal` 的 `useEffect` 防抖逻辑 (400ms)，支持文本关键词过滤。
- **数据分组 (Grouping)**: 将后端返回的扁平化数组 (`Entry[]`) 在前端按 `target_date` 分组，转换为 `{ "2023-10-01": [Entry, ...], ... }` 结构以适配时间轴渲染。
- **时间轴渲染**:
    - **日期高亮**: 自动识别 "Today", "Tomorrow"。
    - **倒计时**: 显示 `X days left` 胶囊标签。
    - **视觉连接**: 使用垂直线条连接有任务的日期，跳过无任务的日期（稀疏时间轴）。
- **卡片展示**: 使用 `MarkdownViewer` 预览内容，并根据 `ENTRY_THEME` 进行左侧色条标记。
#### 3. 核心函数与逻辑

| **函数/变量**                | **作用**                                                     |
| ------------------------ | ---------------------------------------------------------- |
| **`useEffect` (Search)** | 监听 `query` 变化。计算日期范围，调用 `entryService.search`。内置 400ms 防抖。 |
| **`groupEntriesByDate`** | **数据转换核心**。遍历搜索结果，过滤掉没有 `target_date` 的条目，将剩余条目按日期字符串归类。   |
| **`sortedDates`**        | `useMemo`。获取分组后的所有日期 Key，并进行升序排列，确保时间轴从近到远。                |
| **`getDateLabel`**       | 辅助函数。将日期字符串转换为语义化文本 (Today / Tomorrow / Weekday)。          |

#### 4. 引用组件

- **`MarkdownViewer`**: 用于在时间轴卡片中安全、美观地渲染 Markdown 内容（禁用溢出检查，限制行数）。
- **`entryService`**: 数据源。
- **`useEntryNavigation`**: (可选) 如果需要点击卡片跳转到 Daily Log，可集成此 Hook。