// src/utils/cacheStorage.ts
import { get, set, del } from "idb-keyval";

const DAILY_CACHE_KEY = "bullet_daily_cache";

export const cacheStorage = {
  // --- 读取 ---
  async loadDaily() {
    return (await get(DAILY_CACHE_KEY)) || {};
  },

  // --- 写入 (建议在 UI 层做防抖，或者这里直接存) ---
  async saveDaily(data: any) {
    if (!data) return;
    await set(DAILY_CACHE_KEY, data);
  },

  // --- 清除 (用于 Logout) ---
  async clearAll() {
    await del(DAILY_CACHE_KEY);
    // 或者直接清空该数据库的所有 key：
    // await clear();
  },
};
