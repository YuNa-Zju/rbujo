# 当前 REST API 文档

本文档以 Rust/Axum 后端当前实现为准。推荐所有客户端使用 `/api/*` 路径；根路径 `/` 由前端 SPA 托管。

## 通用约定

- Base URL: `http://localhost:10001/api`。
- 认证方式: `Authorization: Bearer <access_token>`。
- 日期格式: `YYYY-MM-DD`。
- 月份格式: `YYYY-MM`。
- 条目类型: `task`, `idea`, `event`。
- 条目状态: `open`, `completed`, `cancelled`, `forward`, `future`。
- 错误响应: `{ "detail": "..." }`。
- 常见状态码: `400` 参数错误，`401` 未认证或 token 无效，`404` 资源不存在，`500` 服务端错误。

## Health

### `GET /api`

返回服务状态。

```json
{ "message": "System is running" }
```

## Authentication

### `POST /api/auth/register`

注册用户。请求体为 JSON。

```json
{ "username": "alice", "password": "secret" }
```

响应:

```json
{
  "access_token": "...",
  "refresh_token": "...",
  "token_type": "bearer",
  "recovery_key": "rK-...."
}
```

### `POST /api/auth/token`

登录。推荐请求体为 `application/x-www-form-urlencoded`:

```text
username=alice&password=secret
```

为了兼容旧客户端，后端也接受 `multipart/form-data` 和 JSON:

```json
{ "username": "alice", "password": "secret" }
```

响应同 register，但 `recovery_key` 为 `null`。错误账号密码返回 `401`，不应返回 `415`。

### `POST /api/auth/refresh`

刷新 token。请求体:

```json
{ "refresh_token": "..." }
```

响应返回新的 access token 和 refresh token。

### `POST /api/auth/logout`

无状态登出兼容端点。当前服务不保存 token 黑名单，直接返回 `204 No Content`。

### `POST /api/auth/verify-recovery`

校验恢复密钥。

```json
{ "username": "alice", "recovery_key": "rK-...." }
```

成功响应:

```json
{ "message": "Key is valid" }
```

### `POST /api/auth/reset-password`

用恢复密钥重置密码。

```json
{
  "username": "alice",
  "recovery_key": "rK-....",
  "new_password": "new-secret"
}
```

响应:

```json
{ "message": "Password reset successfully", "new_recovery_key": "rK-...." }
```

### `POST /api/auth/change-password`

需要 Bearer token。请求体:

```json
{ "old_password": "old", "new_password": "new" }
```

响应:

```json
{ "message": "Password changed successfully", "new_recovery_key": "rK-...." }
```

## User

### `GET /api/users/me`

需要 Bearer token。响应:

```json
{
  "username": "alice",
  "id": 1,
  "calendar_feed_url": "http://localhost:10001/api/calendar/feed/<token>.ics"
}
```

`calendar_feed_url` 由后端 `API_BASE_URL` 环境变量生成，`API_BASE_URL` 只应包含公开 origin，不包含 `/api`。

## Entries

### Entry Response

主要条目响应字段:

```json
{
  "id": "uuid",
  "content": "text",
  "entry_type": "task",
  "status": "open",
  "target_date": "2026-06-09",
  "target_month": null,
  "is_future": false,
  "migrated_to_date": null,
  "migrated_to_month": null,
  "from_date": null,
  "position": 0,
  "created_at": "2026-06-09 12:00:00"
}
```

### `POST /api/entries`

需要 Bearer token。创建条目。

```json
{
  "content": "写周报",
  "entry_type": "task",
  "target_date": "2026-06-09",
  "target_month": null,
  "is_future": false
}
```

目标字段优先级: `target_date` > `target_month` > `is_future` > 今天。

### `PATCH /api/entries/{entry_id}`

需要 Bearer token。通用更新接口，支持内容、类型、状态、日期、Future Log 移动和兼容迁移字段。

常用请求体:

```json
{ "content": "新内容", "entry_type": "idea" }
```

完成/取消:

```json
{ "status": "completed" }
```

迁移到某天:

```json
{ "status": "forward", "migration_date": "2026-06-10" }
```

迁移到 Future Log 月份:

```json
{ "status": "future", "migration_month": "2026-07" }
```

把活跃 Future Log 条目移动到月份或待定:

```json
{ "status": "open", "is_future": true, "target_month": "2026-07", "target_date": null }
```

### `DELETE /api/entries/{entry_id}`

需要 Bearer token。硬删除条目及其迁移子链。成功返回 `204`。

### `POST /api/entries/{entry_id}/migrate`

需要 Bearer token。专用按日期迁移接口。

```json
{ "target_date": "2026-06-10" }
```

响应包含新条目和更新后的源条目:

```json
{ "success": true, "new_entry": {}, "updated_source": {} }
```

### `POST /api/log/reopen/{entry_id}`

需要 Bearer token。撤销迁移，删除源条目的迁移子链，将源条目恢复为 `open`。

```json
{ "success": true, "updated_entry": {}, "deleted_entries": [] }
```

### `PATCH /api/entries/reorder`

需要 Bearer token。批量更新当前列表排序。

```json
{ "entry_ids": ["id1", "id2"] }
```

成功返回 `204`。

## Logs and Views

### `GET /api/log/daily/{date}`

需要 Bearer token。返回某日条目列表。

### `GET /api/log/future`

需要 Bearer token。返回 Future Log。

```json
{
  "future_log": [],
  "monthly_log": {
    "2026-07": []
  }
}
```

### `POST /api/log/future/batch_update`

需要 Bearer token。批量更新 Future Log 布局和排序。

```json
{
  "layout": {
    "undetermined": ["id1"],
    "2026-07": ["id2", "id3"]
  }
}
```

`undetermined` 或 `null` 表示待定 Future Log。

### `GET /api/log/month_overview/{YYYY-MM}`

需要 Bearer token。返回月份概览，按日期分组。

```json
{
  "2026-06-09": [
    { "id": "...", "type": "task", "status": "open" }
  ]
}
```

### `GET /api/log/range_overview?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD`

需要 Bearer token。返回日期范围内未迁移的条目摘要。

## Search

### `GET /api/entries/search`

需要 Bearer token。参数:

- `q`: 搜索文本，可为空。
- `mode`: `text` 或 `regex`。
- `entry_type`: 可重复参数，例如 `entry_type=task&entry_type=idea`。
- `start_date`, `end_date`: 可选日期范围。

后端会清理 Markdown 标记后匹配正文，并过滤 `forward`/`future` 迁移痕迹。

## Upload

### `POST /api/upload`

需要 Bearer token。`multipart/form-data` 上传字段为 `file`。响应:

```json
{ "url": "http://localhost:10001/static/uploads/1/file.png" }
```

上传文件保存在 `uploads/{user_id}/`，由 `/static/uploads/*` 提供访问。

## Import and Export

### `GET /api/entries/all`

需要 Bearer token。返回当前用户全部条目，用于 `.bjk` 备份。

### `POST /api/entries/import`

需要 Bearer token。批量导入条目。

```json
{ "entries": [ { "id": "...", "content": "...", "entry_type": "task", "status": "open", "created_at": "...", "is_future": false } ] }
```

响应:

```json
{
  "success": true,
  "message": "Imported 1 new, updated 0, skipped 0.",
  "inserted_count": 1,
  "updated_count": 0,
  "skipped_count": 0,
  "inserted_ids": ["..."]
}
```

### `POST /api/entries/batch-delete`

需要 Bearer token。批量删除当前用户条目，用于撤回导入。

```json
{ "ids": ["id1", "id2"] }
```

成功返回 `204`。

### `GET /api/export/markdown`

需要 Bearer token。下载单个 Markdown 备份文件。

### `GET /api/export/zip`

需要 Bearer token。下载按 Daily/Monthly/Future Log 归档的 ZIP。

## Calendar Feed

### `GET /api/calendar/feed/{token}.ics`

公开接口。token 由 `GET /api/users/me` 返回。成功返回 `text/calendar`，无效 token 返回 `403`。
