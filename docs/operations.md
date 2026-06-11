# 长期运营文档

本文档用于日常运行、发布、备份、恢复和故障处理。

## 运行方式

默认配置在 `.env` 中:

```env
DATABASE_URL="sqlite://bullet_journal_v2.db"
API_BASE_URL="http://localhost:10001"
BIND_ADDR="0.0.0.0:10001"
```

启动源码版本:

```bash
cargo run -- serve
```

启动根目录二进制:

```bash
./rbullet-journal serve
```

服务入口:

- 前端: `http://localhost:10001/`
- API: `http://localhost:10001/api`
- 上传文件: `http://localhost:10001/static/uploads/...`

## 构建和替换二进制

构建 release:

```bash
cargo build --release
```

更新根目录二进制:

```bash
cp target/release/rbullet-journal ./rbullet-journal
```

确认版本二进制能启动:

```bash
./rbullet-journal serve
```

如果线上使用 systemd 或其他进程管理器，替换二进制后需要重启服务。

## 前端发布

构建前端:

```bash
cd frontend
npm ci
npm run build
cd ..
```

Rust 服务会托管 `frontend/dist`。前端运行在根路径 `/`，API 固定走 `/api`。

## 数据库文件

当前正式数据库:

- `bullet_journal_v2.db`

旧库迁移完成后不再使用:

- `bullet_journal.db`
- `bullet_journal_1.db`

`.env` 必须指向 `sqlite://bullet_journal_v2.db`。

## 备份

SQLite 是单文件数据库。建议在升级前备份:

```bash
cp bullet_journal_v2.db backups/bullet_journal_v2_$(date +%Y%m%d_%H%M%S).db
```

如果没有 `backups/` 目录:

```bash
mkdir -p backups
```

上传文件也应备份:

```bash
cp -a uploads backups/uploads_$(date +%Y%m%d_%H%M%S)
```

## 恢复

停止服务后恢复数据库:

```bash
cp backups/<backup-db>.db bullet_journal_v2.db
```

恢复上传目录:

```bash
rm -rf uploads
cp -a backups/<backup-uploads> uploads
```

恢复后重新启动服务。

## 旧库删除策略

只有在以下条件全部满足后删除旧库:

- `bullet_journal_v2.db` 已生成。
- 迁移报告 entries/shared_links 数量符合预期。
- 不变量检查通过。
- 服务使用 `bullet_journal_v2.db` 启动成功。
- 登录、列表、Future Log、上传、分享基本功能 smoke test 通过。

删除旧库:

```bash
rm bullet_journal.db bullet_journal_1.db
```

删除后如需再次迁移，只能从外部备份恢复旧库。

## 常见故障

### 登录返回 415

原因通常是 `/api/auth/token` 请求 Content-Type 不兼容。当前后端已支持:

- `application/x-www-form-urlencoded`
- `multipart/form-data`
- `application/json`

前端当前使用 `application/x-www-form-urlencoded`。如果仍返回 415，说明运行的二进制不是最新版本，需要重新执行:

```bash
cargo build --release
cp target/release/rbullet-journal ./rbullet-journal
```

### 前端白屏或资源 404

检查:

- 是否执行了 `cd frontend && npm run build`。
- `frontend/dist/index.html` 是否存在。
- `index.html` 中资源路径是否是 `/assets/...`。

### API 可用但页面不能刷新

这通常是 SPA fallback 问题。当前 Rust 服务会把非 `/api`、非 `/static/uploads` 路径 fallback 到 `frontend/dist/index.html`。

### 日历订阅 URL 错误

检查 `.env` 中 `API_BASE_URL`。它应是公开 origin，例如:

```env
API_BASE_URL="https://example.com"
```

不要写成 `https://example.com/api`。
