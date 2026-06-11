# 前端文档

前端位于 `frontend/`，是 Vite + React + TypeScript 应用。当前要求是保留既有视觉风格，只替换后端接入方式和部署路径。

## 技术栈

- React 19 + React Router。
- Vite 7。
- Tailwind CSS 4 + DaisyUI。
- Framer Motion、lucide-react、cmdk。
- Axios 统一请求封装。
- Markdown 渲染使用 react-markdown、remark、rehype、KaTeX。

## 运行和构建

开发:

```bash
cd frontend
npm ci
npm run dev
```

Rust 后端默认运行在 `http://127.0.0.1:10001`，Vite dev server 会把 `/api` 代理到该地址。

构建:

```bash
cd frontend
npm run build
```

构建产物输出到 `frontend/dist`。Rust 服务启动时如果发现 `frontend/dist/index.html`，会直接托管该 SPA。

## 部署路径

- 页面部署在根路径 `/`。
- React Router 不使用 basename。
- 静态资源由 Vite 以 `/assets/*` 形式引用。
- 所有 API 请求走 `/api/*`。
- 上传文件访问路径为 `/static/uploads/*`。

## API Client

统一入口是 `frontend/src/lib/api.ts`。

- 默认 base URL: `/api`。
- 可用 `VITE_API_BASE_URL` 覆盖，例如跨域调试时使用完整 URL。
- 请求拦截器自动从 `localStorage.token` 注入 Bearer token。
- 响应拦截器遇到 `401` 时，使用 `localStorage.refresh_token` 调 `/auth/refresh`。
- refresh 失败后清理本地会话并触发 `sessionExpired` 事件。

业务代码不要直接使用 `fetch` 或裸 `axios` 访问后端；新增后端调用应放在 `services/` 或通过现有 service 扩展。

## 路由结构

- `/login`: 登录/注册页。
- `/`: 私有日历主页。
- `/daily/:dateStr`: 私有每日记录页。
- 其他路径 fallback 到 `/`。

`PrivateRoute` 负责登录态检查。

## 主要 Service

### `authService`

负责:

- 注册: `POST /auth/register`。
- 登录: `POST /auth/token`。
- 登出: `POST /auth/logout`，后端为无状态兼容端点。
- 当前用户: `GET /users/me`。
- 恢复密钥校验、重置密码、修改密码。

### `entryService`

负责:

- 创建、更新、删除条目。
- 日期迁移、Future Log 迁移、reopen。
- reorder。
- 搜索。
- Daily Log、Future Log、range/month overview。
- `.bjk` 备份导入导出和 ZIP/Markdown 下载。

### `dataBackupService`

前端 `.bjk` 备份格式:

- header: `BUJO_SECURE_BACKUP_V1`。
- data: 后端 `/entries/all` 返回的条目数组。
- 内容 gzip 后再 Base64 存入文件。

导入后使用后端返回的 `inserted_ids` 支持撤回导入。

## 视觉风格约束

当前改造不调整 UI 风格。

保持不变:

- Calendar、Daily、Entry card、Modal、Markdown editor 的布局和动效。
- Tailwind/DaisyUI 主题体系。
- `useAppTheme`、`entryTheme`、颜色配置、字体资源。
- 图标和按钮视觉语言。
- 中英文翻译内容，除非 API 路径说明必须变化。

允许变更:

- API base URL。
- 部署 basename。
- 与 Rust 后端兼容所需的非视觉逻辑。

## 与 Rust 后端的兼容点

- `users/me.calendar_feed_url` 已是完整订阅地址，可直接展示和复制。
- `migrated_to_month` 是后端新增字段，旧前端不强依赖；后续如果要显示迁移目标月份，应优先使用该字段。
