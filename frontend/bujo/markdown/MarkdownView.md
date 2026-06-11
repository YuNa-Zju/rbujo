#### 1.1 组件概述
`MarkdownViewer` 是应用中用于渲染 Markdown 文本的核心组件。它不仅是将 Markdown 转换为 HTML，还集成了代码高亮、数学公式渲染、交互式任务列表（Checklist）、图片预览以及**长文本自动折叠**功能。
#### 1.2 核心功能
1. **富文本渲染**:
    - 支持 **GFM (GitHub Flavored Markdown)**: 表格、删除线、自动链接、任务列表。
    - 支持 **LaTeX 数学公式**: 通过 `remark-math` 和 `rehype-katex` 渲染数学符号。
    - **代码块优化**: 自定义 `CodeBlock` 组件，提供 Mac 风格的窗口样式、语言标识和一键复制功能。
2. **交互性**:
    - **任务切换**: 支持直接点击渲染后的 Checkbox，回调 `onTaskToggle` 修改原始 Markdown 文本（状态回流）。
    - **图片预览**: 点击 Markdown 中的图片，调用 [[ImagePreview]] 组件进行全屏查看。
3. **UI 适配**:
    - **自动折叠 (Overflow Check)**: 当渲染后的内容高度超过 `220px` 时，自动折叠并显示“Show More”渐变遮罩按钮。
    - **样式定制**: 针对 Tailwind DaisyUI 进行了深度定制（Checkbox 样式、引用块样式、列表间距等）。

#### 1.3 核心函数与逻辑

|**函数/Hook**|**作用**|
|---|---|
|**`CodeBlock`**|(内部组件) 封装 `pre` 和 `code` 标签。实现了复制到剪贴板功能，并美化了代码块外观。|
|**`handleCheckboxChange`**|**核心交互逻辑**。当用户点击 Checkbox 时，解析原始 `content` 字符串，定位到对应的行，将 `[ ]` 替换为 `[x]` (或反之)，然后通过 `onTaskToggle` 将新的全文传回父组件保存。|
|**`useEffect` (Overflow)**|**(本次修复重点)** 监听内容变化或容器尺寸变化，计算 `scrollHeight` 是否超过阈值，决定是否显示“展开”按钮。|

#### 1.4 模块依赖
- **Markdown 核心**: `react-markdown`
- **插件**: `remark-gfm` (扩展语法), `remark-math`, `rehype-katex` (数学公式)
- **样式库**: `katex` (CSS), `lucide-react` (图标)
- **内部组件**: [[ImagePreview]]