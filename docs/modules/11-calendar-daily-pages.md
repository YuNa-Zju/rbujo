# 11 Calendar Daily Pages

## 入口文件

- `frontend/src/pages/CalendarPage.tsx`
- `frontend/src/pages/DailyPage.tsx`
- `frontend/src/hooks/useCalendarState.ts`
- `frontend/src/hooks/useJournalData.ts`
- `frontend/src/features/calendar/*`

## 职责

日历页和日记页是主工作区。它们负责日期选择、周/月/年视图、日历点点、当天条目列表、手动排序、打开 Markdown 和新建条目入口。

## `useCalendarState`

管理：

- `currentDate`
- `selectedDate`
- `viewMode`: `year | month | week`
- `lastViewMode`
- `navDirection`

初始化来源：

1. route state 的 `focusDate`。
2. `sessionStorage.calendar_focus_date`。
3. 今天。

它还会保存 `calendar_view_mode`，让用户下次打开时保持周/月视图。

## `useJournalData`

负责主页面数据：

- 从 `cacheStorage` 读 Daily cache，先渲染本地缓存。
- 通过 [[10-service-layer]] 拉取 fresh daily entries。
- 根据当前周/月预取 overview。
- 对 prev/current/next 卡片预渲染日期范围。
- Year view 拉取全年 overview。

监听 [[12-entry-actions-modals]] 的 `entryEventBus`：

- `entry:reload_needed`
- `entry:invalidate_overview_cache`
- `entry:create`
- `entry:update`
- `entry:status_change`
- `entry:delete`
- `entry:migrate`

这些事件会更新当天列表和日历点点。

## CalendarPage

主要能力：

- 显示周/月/年日历。
- 左右切换日期范围。
- 通过下方卡片和小条切换周/月视图。
- 显示 `DailySheetCard`。
- 打开当天 Markdown。
- 新建条目。
- 手动排序。

排序使用 `@dnd-kit`，完成后调用 `entryService.reorder`。排序成功后要保持点点顺序与条目顺序一致。

## DailyPage

路由 `/daily/:dateStr`，适合查看具体日期。

能力：

- 拉取当前/前一天/后一天 daily entries。
- 使用本地 cache 先显示。
- 支持类型过滤。
- 支持排序模式：默认、时间、类型。
- 默认且无过滤时支持手动排序。
- focus/visibility 变化时刷新当前日期，确保外部 Markdown 编辑能及时导入。

## 日历点点

overview 来自 [[03-local-backend]] 的 `get_month_overview` 或 `get_range_overview`。

点点通常表达：

- open task
- completed task
- event
- idea
- migrated/future/cancelled 等状态摘要

点点顺序应跟该日条目排序保持一致。写操作后要同步刷新 overview cache。

## 打开 Markdown

主页和 Daily 页都通过 `entryService.openDailyMarkdown(date)` 打开当天文件。后端会先写回最新 Markdown，再调用系统打开。详见 [[06-markdown-sync]]。

## 与弹窗的关系

- 新建按钮发 `uiEvents.OPEN_ADD_ENTRY`。
- 编辑、迁移、删除、Future 操作从 Entry card 发到 [[12-entry-actions-modals]]。
- 搜索、Future Log、Timeline、菜单入口在 [[15-update-and-menu]]。

## 对接注意

- 新增影响 entries 的操作时，要同时维护 daily entries cache 和 overview dots。
- 外部 Markdown 编辑依赖页面刷新触发后端导入，不要绕过 `get_daily_log`。
- 手动排序只应在默认列表下启用，否则 position 和展示顺序会不一致。
- 日历动画和预渲染不要改变 overview 数据语义，只改变展示。
