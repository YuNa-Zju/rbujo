# 15 Update And Menu

## 入口文件

- `frontend/src/features/calendar/components/HeaderActionTrigger.tsx`
- `frontend/src/features/calendar/components/UserMenu.tsx`
- `frontend/src/components/modals/cmdk/GlobalCommandPalette.tsx`
- `frontend/src/components/modals/UpdateCheckController.tsx`
- `frontend/src/components/modals/VersionInfoController.tsx`
- `frontend/src/components/modals/SettingsModalController.tsx`
- `frontend/src/components/NativeMenuBridge.tsx`
- `src-tauri/src/lib.rs`

## 职责

本模块统一应用入口：右上角按钮、右上角菜单、命令面板、原生菜单、设置弹窗、更新弹窗和版本信息弹窗。

## 顶部快捷入口

`HeaderActionTrigger` 提供：

- Timeline。
- Future Log。
- Search / cmdk。
- UserMenu。

它通过 `uiEvents` 打开 Timeline/Future Log，通过 `ModalControllerContext` 打开命令面板。主题样式会监听 `documentElement` 的 `data-theme` 和 class。

## 右上角 UserMenu

菜单分两组：

Data：

- Archive。
- Backup & Export。
- Storage。

App：

- Settings。
- Check for Updates。
- Version Info。
- Theme。
- Language。

除 Archive 是路由跳转外，其余都发 `uiEvents`。这保证入口和 [[12-entry-actions-modals]] 的全局弹窗保持一致。

## Settings 弹窗

`SettingsModalController` 监听：

- `OPEN_SETTINGS`
- `menu:settings`

设置页目前是入口集合，不直接保存复杂设置：

- Storage。
- Backup。
- Check for Updates。
- Version Info。
- Theme。
- Language。

## 命令面板

`GlobalCommandPalette` 使用 `cmdk`，挂载到 `document.body`。

入口包括：

- Daily entries。
- New Daily。
- New Future。
- Timeline。
- Future Log。
- Search。
- Archive。
- Backup。
- Storage。
- Tag suggestions。
- Settings。
- Check Update。
- Version Info。
- Theme。
- Language。

快捷键：

- `Cmd/Ctrl + K` 打开/关闭。
- 非输入框内 `S` 打开搜索。
- 非输入框内 `N` 新建当天条目。

## 原生菜单

原生菜单由 [[01-desktop-shell]] 构造，发 `menu:*` 事件。前端各控制器分别监听：

- `menu:archive` -> `NativeMenuBridge` 跳转 Archive。
- `menu:check-update` -> `UpdateCheckController` 发 `OPEN_CHECK_UPDATE`。
- `menu:version-info` -> `VersionInfoController` 发 `OPEN_VERSION_INFO`。
- `menu:settings` -> `SettingsModalController`。
- 其他打开类事件由 `ModalControllerContext` 或对应 Controller 接住。

## 更新检测

`UpdateCheckController`：

1. 启动时调用 `checkForUpdates("startup")`。
2. 手动菜单调用 `checkForUpdates("manual")`。
3. 非 Tauri 或非 production 返回 unsupported。
4. 如果可更新，弹出更新弹窗。
5. 点击暂不更新后，当前版本写入 localStorage；启动检查同版本不再弹。
6. 手动检查会忽略暂不更新记录。

安装：

- 调用 `install_update`。
- 监听 `update:download-progress`。
- 弹窗显示下载进度条。
- 安装完成后应用重启。

更新日志：

- 优先使用 release body。
- 空 body 时显示“这次更新没有提供更新日志。”
- 使用 `MarkdownViewer` 渲染。

## 版本信息

`VersionInfoController`：

- 监听 `OPEN_VERSION_INFO` 和 `menu:version-info`。
- Tauri 环境调用 `getVersion()`。
- Web preview 显示 `Web Preview`。
- 最近一次更新日志用 `MarkdownViewer` 渲染。

## 对接注意

- 新增菜单项时需要同步四处：右上角菜单、cmdk、原生菜单、控制器监听。
- 新增弹窗入口时优先发 `uiEvents`，不要让多个入口直接操作同一 state。
- 更新相关 UI 必须保持当前版本、最新版本和 release notes 可见。
- 原生菜单只做事件转发，不承载复杂业务逻辑。
