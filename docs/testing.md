# 测试文档

本项目按长期运营维护，任何发布前至少执行本文档中的基础检查。

## 后端测试

格式化:

```bash
cargo fmt --check
```

编译检查:

```bash
cargo check
```

单元测试:

```bash
cargo test
```

当前后端单元测试重点覆盖:

- 登录接口支持 `application/x-www-form-urlencoded`。
- 登录接口兼容旧前端曾使用的 `multipart/form-data`。
- multipart boundary 解析。
- 登录缺字段错误。

这些测试用于防止登录接口再次出现 `415 Unsupported Media Type`。

## 前端测试

安装依赖:

```bash
cd frontend
npm ci
```

生产构建:

```bash
npm run build
```

构建成功标准:

- TypeScript 无错误。
- Vite build 完成。
- `frontend/dist/index.html` 中资源路径为 `/assets/*`。

当前可接受警告:

- DaisyUI 生成 CSS 中的 `@property` 兼容性提示。
- Vite chunk size 提示。

这些不是阻断发布的问题。

## 本地 Smoke Test

启动服务:

```bash
cargo run -- serve
```

默认监听 `http://127.0.0.1:10001`。

检查前端托管:

```bash
curl -i http://127.0.0.1:10001/
curl -i http://127.0.0.1:10001/login
```

期望返回 `200 OK` 和 HTML。

检查 API:

```bash
curl -i http://127.0.0.1:10001/api
curl -i http://127.0.0.1:10001/api/log/future
curl -i -X POST http://127.0.0.1:10001/api/auth/logout
```

期望:

- `/api`: `200 OK`。
- `/api/log/future`: 无 token 时 `401 Unauthorized`。
- `/api/auth/logout`: `204 No Content`。

检查登录 content type:

```bash
curl -i -X POST http://127.0.0.1:10001/api/auth/token   -H 'Content-Type: application/x-www-form-urlencoded'   --data 'username=alice&password=secret'
```

如果账号或密码错误，应返回 `401`，不能返回 `415`。

## 数据库迁移测试

迁移前先 dry-run:

```bash
cargo run -- migrate-db --source bullet_journal.db --target bullet_journal_v2.db --dry-run
```

迁移后检查不变量:

```bash
sqlite3 bullet_journal_v2.db "select count(*) from entries where owner_id is null;"
sqlite3 bullet_journal_v2.db "select count(*) from entries where is_future=1 and target_date is not null;"
sqlite3 bullet_journal_v2.db "select count(*) from entries where status='future' and target_month is not null;"
```

这三个值都应为 `0`。

## 发布前清单

- `cargo fmt --check`
- `cargo check`
- `cargo test`
- `cd frontend && npm run build`
- 启动服务完成 smoke test
- 确认 `.env` 指向 `sqlite://bullet_journal_v2.db`
- 确认根目录二进制已更新
