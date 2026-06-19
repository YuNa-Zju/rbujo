# 06 Markdown Sync

## 入口文件

- `src/local.rs`
- `src/db.rs`
- 前端入口：[[11-calendar-daily-pages]], [[10-service-layer]]

## 职责

Markdown 同步把 SQLite 中的 Daily/Future 条目映射到用户可读写的 Markdown 文件，并在用户外部编辑文件后导入变更。它是 BuJo 本地优先和未来多端同步的关键模块。

## 工作区结构

当前标准结构：

```text
<workspace>/
  Daily/
    2026/
      06/
        2026-06-18.md
  Future/
    2026/
      06.md
    Future.md
  attachments/
```

旧结构仍可读取：

- `Daily/YYYY-MM/YYYY-MM-DD.md`
- `Daily/YYYY-MM-DD.md`

工作区路径和 macOS bookmark 存在 [[04-sqlite-schema]] 的 `app_settings`。

## Daily 读取流程

`get_daily_log(date, include_archived)`：

1. 检查 `Daily/YYYY/MM/YYYY-MM-DD.md` 是否存在。
2. 用 mtime 和 sha256 对比 `daily_markdown_sync_state`。
3. 如果文件变更，调用 `import_daily_markdown_if_changed`。
4. 导入后写回标准格式，更新同步状态和 line hash。
5. 查询 SQLite entries，返回给 [[10-service-layer]]。

## Daily 写回流程

`write_daily_markdown_file(date)`：

1. 从 SQLite 查询该日 entries。
2. 按 position 和创建时间排序。
3. 渲染 Markdown 文件。
4. 更新文件级状态：路径、mtime、sha256。
5. 更新行级状态：`entry_id`、`line_hash`、`line_index`、`content`。

## 外部编辑导入

外部编辑后，后端会解析 Markdown 行并匹配既有 entries。

匹配信息来源：

- 之前写回时记录的 `daily_markdown_entry_sync_state`。
- 当前文件每一行的 hash。
- 现有 entry 的内容、标签和相似度。
- LCS 顺序匹配，减少重排时误判。

导入动作：

- 匹配到旧 entry：更新内容、状态、标签、类型。
- 新行：创建新 entry。
- 旧 entry 在文件中消失：按 Markdown 导入删除逻辑处理。

这个流程让用户可以直接编辑 Markdown，并在重新打开或刷新时同步回 BuJo。

## Future Markdown

Future 有两类文件：

- `Future/Future.md`：Someday。
- `Future/YYYY/MM.md`：某年某月。

`get_future_log` 会调用 `import_future_markdown_files_if_changed`，再写回 `write_future_markdown_files`。

Future 解析和 Daily 类似，但 scope key 不同：

- Someday 使用 `future:someday`。
- 月度使用 `future:YYYY-MM`。

Future 条目的位置和状态见 [[05-entry-state-machine]] 与 [[13-future-log-archive]]。

## Markdown 渲染约定

任务状态：

- open task：`- [ ] 内容`
- completed task：`- [x] 内容`
- event：`- o 内容`
- idea：`- 内容`
- cancelled：追加 `(cancelled)`

标签：

```markdown
Tags: #tag1 #tag2
```

迁移指针：

- `Migrated to [[Daily/...|YYYY-MM-DD]]`
- `Migrated to [[Future/...|YYYY-MM]]`
- `Migrated to Future Log`

附件链接保持相对路径，例如：

```markdown
![image](attachments/xxx.webp)
[file.pdf](attachments/xxx.pdf)
```

附件规则见 [[07-attachments]]。

## 缓存与刷新

后端通过文件 mtime + sha256 判断是否需要导入。前端通过 [[11-calendar-daily-pages]] 的 focus/visibility 和 `entryEventBus` 触发重拉。

影响 overview dots 的变更要额外发：

- `entry:reload_needed`
- `entry:invalidate_overview_cache`

## 对接注意

- 新增 Markdown 语法时要同时改解析、渲染和 line hash 逻辑。
- 修改 Entry 状态时要确认渲染语法能表达该状态。
- 修改附件目录或链接格式时要同步 [[07-attachments]]、Markdown 导出和 BJK 导入重写。
- 导入不要只按纯文本全量覆盖，否则会破坏 position、迁移链和附件清理。
