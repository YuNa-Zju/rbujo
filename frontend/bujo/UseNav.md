#### 1. 概述 (Overview)
`useEntryNavigation` 是一个用于处理条目跳转逻辑的自定义 Hook。它封装了复杂的路由判断逻辑，根据条目类型（Daily Log 或 Future Log）和当前所在页面，决定是将用户导航到日历视图、每日详情页，还是打开 Future Log 模态框。
#### 2. 核心功能
- **统一跳转接口**: 提供唯一的 `handleJump(targetDate)` 方法，组件无需关心底层路由逻辑。
- **智能上下文判断**:
    - **首页上下文**: 如果用户在首页，跳转仅更新路由 State（触发日历定位或弹窗），避免页面重载。
    - **非首页上下文**: 如果用户在其他页面（如 `/timeline`, `/search`），则执行路由跳转。
- **状态同步**: 在跳转前将目标日期写入 `sessionStorage`，确保日历组件加载时能自动聚焦到目标日期。

#### 3. API 定义
```typescript
const { handleJump } = useEntryNavigation();
```

|**函数名**|**参数**|**类型**|**描述**|
|---|---|---|---|
|**`handleJump`**|`targetDate`|`string \| null \| undefined`|目标日期字符串 (ISO 格式或 YYYY-MM-DD)。<br><br>  <br><br>如果为空或无效，视为跳转到 **Future Log**。<br><br>  <br><br>如果有值，视为跳转到 **Daily Log**。|

#### 4. 逻辑流程图
1. **输入检查**: `targetDate` 是否有效？
    - **无效 (Future Log)**:
        - 当前是首页 (`/`) -> `Maps("/", { state: { openFutureLog: true } })`
        - 非首页 -> 跳转回首页并携带 State。
    - **有效 (Daily Log)**:
        - 保存日期到 `sessionStorage.setItem("calendar_focus_date", date)`
        - 当前是首页 (`/`) -> `Maps("/", { state: { focusDate: targetDate } })` (日历定位)。
        - 非首页 -> `Maps("/daily/${targetDate}")` (进入每日详情页)。