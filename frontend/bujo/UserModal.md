#### 1. 组件概述
`UserMenu` 是应用的全局用户菜单组件，通常位于页面的右上角。它以用户头像为触发器，点击后展开一个下拉菜单。 它不仅仅是一个简单的导航列表，而是集成了应用的核心设置功能，包括：
- **用户身份展示**: 显示当前登录用户的首字母缩写。
- **数据导出**: 将日记数据导出为 Markdown 文件。
- **主题切换**: 在 Light / Dark / System 模式之间循环切换。
- **语言切换**: 在中英文之间切换。
- **页面导航**: **(本次新增)** 快速跳转到 Timeline 视图。
- **安全退出**: 唤起登出确认模态框。
#### 2. 核心功能与逻辑

| **功能点**  | **实现方式**                                                                                   |
| -------- | ------------------------------------------------------------------------------------------ |
| **头像生成** | 从 `localStorage` 获取用户信息，截取用户名的前两个字符并转大写 (`avatarLetter`)。如果无头像则显示默认 User 图标。               |
| **主题切换** | 调用 `useTheme` hook 的 `cycleTheme` 方法，并根据当前 `themeMode` 显示对应的图标 (Sun/Moon/Monitor) 和状态胶囊。   |
| **语言切换** | 调用 `useTranslation` hook 的 `toggleLang` 方法。利用 `LANG_MAP` 字典将 `zh/en` 代码映射为更友好的 `CN/EN` 显示。 |
| **数据导出** | 直接绑定 `exportToMarkdown` 工具函数。                                                              |
| **路由跳转** | **(新增)** 使用 `useNavigate` 实现页面内部跳转（到 Timeline）。                                            |
| **登出**   | 使用 `useRef` 控制 `LogoutModal` 的显示，确认后调用 `useAuth().logout()`。                               |

#### 3. 依赖模块
- **Hooks**: `useTheme`, `useTranslation`, `useAuth`, `useNavigate` (React Router)。
- **组件**: `LogoutModal`。
- **工具**: `exportToMarkdown`。