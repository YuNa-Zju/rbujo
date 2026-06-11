### 文档：`src/features/entry/EntryItem.tsx`
**功能描述**： 该组件是日志列表中的单个条目组件，负责展示日志内容、状态、Tags 以及处理编辑、迁移、删除等交互。
**主要Props**：
- `entry`: 日志条目数据对象。
- `refresh`: 刷新列表的回调函数。
- `onOptimistic...`: 一系列乐观更新回调，用于提升 UI 响应速度。
- `useInlineEditor`: `boolean`，控制编辑器的展示模式（Inline 自动高度 vs Modal 固定高度）。
- `onEditingChange`: `(isEditing) => void`，通知父组件编辑状态变更（用于隐藏悬浮按钮等）。
**核心逻辑**：
1. **展示与编辑切换**：双击内容或点击编辑按钮进入编辑态。
2. **Tag 缓存管理**：
    - 引入 `useTagCache`。
    - 在 **保存编辑 (`handleSaveEdit`)** 和 **确认删除 (`performDelete`)** 后，调用 `clearCache()`，强制 Tag 缓存在下次访问时失效并重新拉取。
3. **内联编辑器配置**：将 `useInlineEditor` 传递给子组件 `EntryEditor`，决定其布局策略。
4. **状态管理**：处理完成/未完成状态切换，如果是迁移过的任务 (`isMigrated`)，点击则触发 Reopen 逻辑。