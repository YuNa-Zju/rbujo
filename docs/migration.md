# 数据库迁移与 Future Log 逻辑

本文档说明旧 SQLite 数据库迁移到 Rust 新 schema 的规则。迁移器在 Rust 二进制中，不再依赖 Python 脚本。

## 命令

先 dry-run 查看报告，不写目标库:

```bash
cargo run -- migrate-db --source bullet_journal.db --target bullet_journal_v2.db --dry-run
```

生成新库:

```bash
cargo run -- migrate-db --source bullet_journal.db --target bullet_journal_v2.db
```

如果目标库已存在并确认要替换:

```bash
cargo run -- migrate-db --source bullet_journal.db --target bullet_journal_v2.db --force
```

迁移器不会覆盖 source 数据库。默认服务数据库为 `sqlite://bullet_journal_v2.db`。

## 新 schema 核心字段

`entries` 关键字段:

- `id`: 文本 UUID，主键。
- `content`: 条目内容。
- `entry_type`: `task`, `idea`, `event`。
- `status`: `open`, `completed`, `cancelled`, `forward`, `future`。
- `target_date`: 活跃条目的具体日期。
- `target_month`: 活跃 Future Log 条目的月份桶。
- `is_future`: 当前条目是否活跃在 Future Log。
- `source_entry_id`: 迁移链来源条目。
- `from_date`: 子条目来自哪个日期。
- `migrated_to_date`: 源条目迁移到的日期。
- `migrated_to_month`: 源条目迁移到的 Future Log 月份。
- `position`: 同一列表容器内排序。
- `owner_id`: 必填用户 ID。

## Future Log 语义

新逻辑把“活跃位置”和“迁移历史”分开，避免旧库中 `target_month` 同时承担两个含义。

活跃 Future Log 条目:

- `status` 通常是 `open`, `completed`, `cancelled`。
- `is_future = 1`。
- `target_date IS NULL`。
- `target_month = NULL` 表示待定 Future Log。
- `target_month = YYYY-MM` 表示某个月的 Future Log。

迁移到 Future Log 的源条目:

- `status = future`。
- `is_future = 0`。
- `target_month IS NULL`。
- `migrated_to_month = YYYY-MM` 或 `NULL`。
- 它只是历史痕迹，不应出现在活跃 Future Log 列表中。

迁移到日期的源条目:

- `status = forward`。
- `migrated_to_date = YYYY-MM-DD`。
- 子条目通过 `source_entry_id` 指回源条目。

## 迁移器修复规则

### 用户和归属

- 保留旧 `users` 表中的用户 ID、用户名和 bcrypt 密码哈希。
- `owner_id` 为空或指向不存在用户的 entries 不丢弃，统一挂到自动用户 `legacy_import`。
- `legacy_import` 使用禁用密码占位，不能直接登录；需要时可用 `cargo run -- users passwd legacy_import <new_password>` 设置密码。

### 字段归一化

- 缺失列按新 schema 默认值补齐。
- 空内容变成空字符串。
- 非法 `entry_type` 归一为 `task`。
- 非法 `status` 归一为 `open`，兼容旧写法 `migrated`、`migrated_forward`、`migrated_future`。
- `created_at` 为 `YYYY-MM-DD` 时补成 `YYYY-MM-DD 00:00:00`。
- 日期和月份只保留合法 `YYYY-MM-DD` / `YYYY-MM`。
- 空或重复 entry id 会生成新的 UUID。

### Future Log 修复

- 旧 `status=future` 且 `target_month=YYYY-MM` 的源条目，会把月份移动到 `migrated_to_month`，并清空 `target_month`。
- 旧 `status=future` 但没有月份时，迁移器会尝试从其迁移子条目的 `target_month` 推断 `migrated_to_month`。
- 活跃 Future Log 条目保留为 `is_future=1`，`target_date=NULL`，`target_month` 表示月份桶或 `NULL` 表示待定。
- `status=forward` 缺少 `migrated_to_date` 时，迁移器会尝试从迁移子条目的 `target_date` 推断。

### 排序和分享链接

- `position` 会按 owner、日期/月桶、Future Log 状态重新编号，避免旧库大量 `0` 导致排序不稳定。
- `shared_links.target_id` 统一为 TEXT，继续指向新 entry id。
- target entry 不存在的分享链接会跳过。

## 迁移后的检查

建议执行:

```bash
sqlite3 bullet_journal_v2.db "select 'users', count(*) from users union all select 'entries', count(*) from entries union all select 'shared_links', count(*) from shared_links;"
sqlite3 bullet_journal_v2.db "select count(*) from entries where owner_id is null;"
sqlite3 bullet_journal_v2.db "select count(*) from entries where is_future=1 and target_date is not null;"
sqlite3 bullet_journal_v2.db "select count(*) from entries where status='future' and target_month is not null;"
```

期望后三个检查都返回 `0`。

## 删除旧库

确认迁移和 smoke test 全部通过后，可以删除旧数据库文件。当前正式库是 `bullet_journal_v2.db`。

```bash
rm bullet_journal.db bullet_journal_1.db
```

删除前请确认不再需要从旧库重新迁移；删除后只能从外部备份恢复。

## 运行新库

```bash
cargo run -- serve
```

默认读取 `.env` 或内置默认值:

- `DATABASE_URL=sqlite://bullet_journal_v2.db`
- `BIND_ADDR=0.0.0.0:10001`
- `API_BASE_URL=http://localhost:10001`
