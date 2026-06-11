### 1. 技术文档：ImagePreview
**文件路径**: `src/components/ImagePreview.tsx` (假设路径)
#### 1.1 功能描述
`ImagePreview` 是一个全屏模态组件，用于查看高清图片。它提供了类似原生相册的交互体验，包括：
- **深色背景遮罩**：带有模糊效果的黑色背景，聚焦视觉中心。
- **手势/鼠标交互**：支持图片的平移（Pan）和缩放（Zoom）。
- **旋转功能**：支持以 90 度为单位旋转图片。
- **智能关闭逻辑**：
    - 点击背景关闭。
    - 区分“点击”和“拖拽”操作，防止用户在拖拽图片时意外关闭窗口。
- **悬浮工具栏**：提供重置、放大、缩小、旋转和关闭按钮
#### 1.2 核心函数与逻辑

|**函数名**|**作用**|
|---|---|
|**`handlePointerDown`**|记录鼠标/触摸按下的初始坐标 (`clickStartPos`)，重置关闭标记。用于区分用户是想“点击关闭”还是“拖拽图片”。|
|**`handlePointerUp`**|计算鼠标抬起的位移 (`delta`)。如果位移小于 5px（判定为点击而非拖拽），且点击目标不是工具栏或图片本身，则标记 `shouldClose` 为 true。|
|**`handleClick`**|响应 React 的合成点击事件。如果 `shouldClose` 标记为 true，则调用 `onClose` 关闭组件。|
|**`useEffect` (Body Lock)**|组件挂载时设置 `document.body.style.overflow = "hidden"` 禁止背景滚动，卸载时恢复。|

#### 1.3 模块依赖 (项目内)
- **无**：此组件是一个纯 UI 组件，不依赖项目内的 `hooks`、`services` 或其他自定义模块（除了 React 自身的 Hooks）。