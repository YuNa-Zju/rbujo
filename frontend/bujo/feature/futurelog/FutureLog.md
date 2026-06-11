#### 1. 组件概述
`FutureModal` 是一个模态弹窗组件，用于将当前的子弹笔记条目（Entry）**迁移（Migrate）** 到“未来日志（Future Log）”。它允许用户选择一个具体的“年份-月份”作为迁移目标，或者将其标记为“待定（Someday/Undetermined）”。
#### 2. 功能描述
该组件主要提供以下交互功能：
- **月份选择**：允许用户指定任务要推迟到的具体月份（格式：YYYY-MM）。
- **待定选项**：提供一个快捷按钮，将任务移至“Someday”列表（即没有具体日期的未来任务）。
- **确认迁移**：执行迁移回调，并处理加载状态。
- **取消/关闭**：关闭弹窗而不进行任何操作。
#### 3. 函数与接口
**Props 接口定义**
此组件接收 `any` 类型的 Props（建议后续优化为具体 Interface），主要包含：

|**属性名**|**类型**|**描述**|
|---|---|---|
|`dialogRef`|`RefObject<HTMLDialogElement>`|用于控制原生 `<dialog>` 元素的显示与隐藏 (`showModal`, `close`)。|
|`futureMonth`|`string`|当前选中的目标月份，格式通常为 `"YYYY-MM"`。|
|`setFutureMonth`|`(val: string) => void`|更新目标月份的状态设置函数。|
|`onConfirm`|`(isUndetermined: boolean) => void`|确认按钮的回调。参数 `true` 代表“Someday”，`false` 代表选中了具体月份。|
|`loading`|`boolean`|控制确认按钮的加载状态（Loading Spinner）。|

#### 4. 引用组件与目的

|**引用组件/Hook**|**来源**|**目的**|
|---|---|---|
|**`useTranslation`**|`../../hooks/useTranslation`|**国际化 (i18n)**。用于获取界面文本（如标题、按钮文字）的翻译资源。|
|**`CalendarClock`**|`lucide-react`|**UI 图标**。用于模态框标题旁，直观传达“时间/未来”的语义。|
