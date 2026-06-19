# 14 Search Tags Cache

## 入口文件

- `src/local.rs`
- `frontend/src/components/modals/SearchModal.tsx`
- `frontend/src/components/modals/TagSearchModal.tsx`
- `frontend/src/context/TagCacheContext.tsx`
- `frontend/src/utils/cacheStorage.ts`
- `frontend/src/components/modals/cmdk/GlobalCommandPalette.tsx`

## 职责

搜索和标签模块负责全文/正则/语义搜索、标签列表、标签缓存、标签重命名和命令面板中的标签建议。

## 后端搜索

[[03-local-backend]] 的 `search_entries` 先基于 Entry 类型、标签、日期、状态和归档条件取候选，再按搜索模式处理。

`search_entries` 支持：

- text
- regex
- semantic
- type filter
- tags filter
- date range
- include archived

semantic 模式走 Rust 后端：

- 模型资源位于 `src-tauri/resources/semantic/bge-small-zh-v1.5`，随 Tauri bundle 打包。
- 推理层使用 Candle 加载 `model.safetensors`，tokenizer 使用本地 `tokenizer.json`。
- query 会加 BGE 检索指令；entry 内容不加指令。
- entry embedding 缓存在 SQLite `semantic_embeddings` 表中，内容变化后按 sha 自动重算。
- 当前不引入独立向量数据库；个人手帐规模下直接对候选集做精确余弦排序。

## SearchModal

搜索弹窗调用 [[10-service-layer]] 的 `search`。

它支持：

- 查询文本。
- text / regex / semantic 模式切换。
- 类型筛选。
- 标签筛选。
- 日期筛选。
- 搜索结果中直接使用 `EntryCard`。

当 `entryEventBus` 有变更时，搜索结果会局部更新或重新搜索。

## TagCacheContext

提供：

- `allTags`
- `refreshTags`
- `prefetch(tag)`
- `getCachedResults(tag)`
- `clearCache`

初始化时会调用 `entryService.listTags()`。

当 entries 发生变化时，它监听：

- `entry:create`
- `entry:update`
- `entry:delete`
- `entry:status_change`
- `entry:migrate`

然后刷新标签列表，并重新拉取已经打开过的 tag 搜索结果。

## TagSearchModal

标签搜索窗口：

- 展示某个标签下的 entries。
- 使用 `TagCacheContext` 缓存。
- 支持双击标签名进入重命名。
- 重命名调用 `entryService.renameTag(old, next)`。
- 成功后清缓存、刷新 tag 列表、预取新标签、触发 entries reload。

重命名发生在标签关系表层面，影响所有涉及该标签的条目。

## 命令面板标签建议

`GlobalCommandPalette` 在打开时刷新 tags。

建议规则：

- 空输入时显示前 8 个排序后的标签。
- 输入后按大小写不敏感包含匹配。
- startsWith 的候选排在前面。
- 选择后发 `OPEN_TAG_SEARCH`。

## Daily cache

`cacheStorage` 当前使用 `idb-keyval` 保存 `bullet_daily_cache`，主要给 [[11-calendar-daily-pages]] 和 cmdk 读取今日条目用。

它只缓存前端展示数据，不是权威数据源。权威数据仍来自 [[03-local-backend]]。

## 对接注意

- 新增 entry 字段如果要参与搜索，需要更新后端查询逻辑。
- 标签重命名后要刷新 `TagCacheContext` 和当前页面数据。
- 搜索结果中的操作也必须走 [[12-entry-actions-modals]]，不要绕过状态机。
- 大规模搜索优化应优先放 Rust/SQLite，而不是前端过滤全量 entries。
