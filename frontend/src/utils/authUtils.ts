import { cacheStorage } from "./cacheStorage";

export const clearUserSession = async () => {
  // 1. 清除核心 Auth 信息
  localStorage.removeItem("token");
  localStorage.removeItem("refresh_token");
  localStorage.removeItem("user");

  // 2. 清除日历/视图状态 (可选，保留用户偏好)
  // sessionStorage 一般存的是“本次会话”的临时状态，建议清理
  sessionStorage.removeItem("calendar_focus_date");
  localStorage.removeItem("calendar_view_mode");
  localStorage.removeItem("bujo_last_import_ids");

  // 3. 清除 IndexedDB
  try {
    await cacheStorage.clearAll();
  } catch (e) {
    console.error("Failed to clear cache db", e);
  }
};
