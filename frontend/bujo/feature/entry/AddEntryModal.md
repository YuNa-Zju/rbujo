### 第一部分：AddEntryModal 技术文档
**文件位置**: `src/components/modals/AddEntryModal.tsx`
#### 1. 组件概述
`AddEntryModal` 是应用中用于创建新条目（Entry）的主要入口。它以模态框（Modal）形式存在，支持两种模式：
1. **Daily Mode**: 为特定日期创建条目。
2. **Future Log Mode**: 为未来某个月份或“待定”时间创建条目。
#### 2. 核心功能与逻辑

| **功能点**   | **描述**                                                                                                       |
| --------- | ------------------------------------------------------------------------------------------------------------ |
| **命令式调用** | 使用 `forwardRef` + `useImperativeHandle` 暴露 `showModal(date)` 方法。父组件通过 `ref.current.showModal()` 唤起，并可传入目标日期。 |
| **日期锁定**  | `showModal` 接收的参数具有最高优先级，确保用户点击“1月5日”的加号时，创建的条目一定属于“1月5日”，而非当前系统时间。                                          |
| **模式区分**  | 通过 props `mode` 区分 UI 和提交逻辑。`Future` 模式下会额外显示月份选择器 (`FutureLogOptions`)。                                     |
| **富文本支持** | 集成了 `MarkdownToolbar`，支持 Markdown 语法快捷插入。                                                                    |
| **文件上传**  | **(新增)** 支持剪贴板粘贴图片/文件，支持拖拽文件上传。                                                                              |

#### 3. 接口定义
**Props**
```typescript
interface Props {
  mode: "daily" | "future";
  defaultDate?: Date | string; // 兜底日期
  onSuccess?: (newEntry: any) => void; // 创建成功后的回调
}
```
**Ref Methods**
```typescript
interface AddEntryModalRef {
  showModal: (date?: Date | string) => void; // 打开弹窗，可选传入锁定日期
  close: () => void; // 关闭弹窗
}
```
#### 4. 依赖模块
- `services/entryService`: 处理数据提交。
- `components/shared/MarkdownToolbar`: Markdown 工具栏。
- `components/shared/TypeSelector`: 条目类型切换 (Task/Event/Idea)。
- `components/shared/FutureLogOptions`: 未来日志的月份选择组件。
- `lib/api`: 处理文件上传。