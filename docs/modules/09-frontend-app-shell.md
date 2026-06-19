# 09 Frontend App Shell

## 入口文件

- `frontend/src/App.tsx`
- `frontend/src/main.tsx`
- `frontend/src/context/*`
- `frontend/src/components/modals/GlobalModalHost.tsx`

## 职责

前端应用壳负责 Provider、路由、全局弹窗宿主、命令面板、原生菜单桥接和 toast。实际数据调用通过 [[10-service-layer]]，页面逻辑拆到 [[11-calendar-daily-pages]]、[[12-entry-actions-modals]]、[[13-future-log-archive]]。

## Provider 层级

`App.tsx` 的核心层级：

```text
EntryModalProvider
  BrowserRouter
    ModalControllerProvider
      NativeMenuBridge
      routes
      GlobalCommandPalette
      GlobalModalHost
      Toaster
```

说明：

- `EntryModalProvider` 是较早的 entry modal context，仍包裹应用。
- `ModalControllerProvider` 是当前主要的全局弹窗状态入口。
- `GlobalModalHost` 统一挂载 Add/Search/Tag/Future/Timeline/Backup/Update/Settings/BJK 等弹窗。
- `GlobalCommandPalette` 是 cmdk 命令面板。
- `NativeMenuBridge` 处理原生菜单中需要路由跳转的事件。

## 路由

| 路由 | 页面 | 模块 |
| --- | --- | --- |
| `/` | `CalendarPage` | [[11-calendar-daily-pages]] |
| `/daily/:dateStr` | `DailyPage` | [[11-calendar-daily-pages]] |
| `/archive` | `ArchivePage` | [[13-future-log-archive]] |
| fallback | 重定向首页 | [[11-calendar-daily-pages]] |

## 懒加载

全局命令面板、路由页面和部分弹窗使用 lazy import，减少首屏 bundle 压力。页面层应避免直接引入大模块，尤其是 Markdown 渲染、备份、图片预览等重组件。

## 全局弹窗宿主

`GlobalModalHost` 读取 `ModalControllerContext` 中的状态：

- search
- tagSearch
- futureLogOpen
- backupOpen
- addEntryRequest
- entryActionRequest
- timelineRequestId

再打开对应弹窗或 dialog。更新、版本信息、附件维护、设置、BJK 导入这些控制器常驻宿主中，自己监听 `uiEvents` 或 Tauri event。

弹窗和 ESC 规则见 [[12-entry-actions-modals]]。

## 与 Tauri 的连接

前端应用壳本身不直接处理业务数据。与 Tauri 相关的入口主要是：

- `NativeMenuBridge` 监听 `menu:archive`。
- 各 Controller 监听自己的 `menu:*` 或 `file:open-bjk` 事件。
- service 层使用 `invoke`。见 [[10-service-layer]]。

## 对接注意

- 新增全局弹窗时，优先挂到 `GlobalModalHost`，并用 `EscModalWrapper`。
- 新增菜单入口时，右上角菜单、cmdk、原生菜单最好统一发同一个 `uiEvents`。
- 新增页面时，先确认它是否需要 `entryEventBus` 订阅和缓存同步。
- 不要在页面组件中散落 Tauri `invoke`，统一进 [[10-service-layer]]。
