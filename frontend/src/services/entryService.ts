import api from "../lib/api";
import { type EntryType } from "../config/entryTheme";

export interface CreateEntryPayload {
  content: string;
  entry_type: EntryType;
  status: "open" | "completed" | "cancelled" | "forward" | "future";
  target_date?: string | null;
  is_future?: boolean;
  target_month?: string | null;
}

export interface UpdateEntryPayload {
  content?: string;
  entry_type?: EntryType;
  status?: string;
  target_date?: string | null;
  migration_date?: string;
  migration_month?: string | null;
  is_future?: boolean;
  target_month?: string | null;
}

export interface ShareEntryResponse {
  share_url: string;
  [key: string]: any;
}

// 公开分享页面的数据结构
export interface SharedEntryData {
  content: string;
  entry_type: EntryType;
  status: string;
  created_at: string;
  author_name: string;
  author_avatar: string;
}

export interface ImportResponse {
  success: boolean;
  message: string; // 后端返回的汇总消息
  inserted_count: number; // 新增数
  updated_count: number; // 更新数
  skipped_count: number; // 跳过数
  inserted_ids: string[]; // 纯净的撤回名单
}

export const entryService = {
  create: async (payload: CreateEntryPayload) => {
    const response = await api.post("/entries", payload);
    return response.data;
  },

  update: async (id: string, payload: UpdateEntryPayload) => {
    const response = await api.patch(`/entries/${id}`, payload);
    return response.data;
  },

  toggleStatus: async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === "open" ? "completed" : "open";
    return entryService.update(id, { status: newStatus });
  },

  // --- Daily Log 专用 ---

  migrate: async (id: string, date: string) => {
    const response = await api.post(`/entries/${id}/migrate`, {
      target_date: date,
    });
    return response.data;
  },

  reopen: async (id: string) => {
    const response = await api.post(`/log/reopen/${id}`);
    return response.data;
  },

  moveToFuture: async (id: string, month: string | null) => {
    return entryService.update(id, {
      status: "future",
      migration_month: month,
    });
  },

  // --- Future Log 专用 ---

  rescheduleFutureEntry: async (id: string, date: string) => {
    return entryService.update(id, {
      is_future: false,
      status: "open",
      target_date: date,
      target_month: null,
    });
  },

  moveFutureEntry: async (id: string, month: string | null) => {
    return entryService.update(id, {
      is_future: true,
      status: "open",
      target_date: null,
      target_month: month,
    });
  },

  delete: async (id: string, hard: boolean = false) => {
    if (hard) await api.delete(`/entries/${id}`);
    else await api.patch(`/entries/${id}`, { status: "cancelled" });
  },

  reorder: async (entryIds: string[]) => {
    await api.patch("/entries/reorder", { entry_ids: entryIds });
  },

  search: async (params: {
    q?: string;
    mode?: "text" | "regex";
    entry_type?: string[];
    start_date?: string;
    end_date?: string;
    status?: string;
  }) => {
    const response = await api.get("/entries/search", {
      params,
      paramsSerializer: {
        indexes: null,
      },
    });
    return Array.isArray(response.data)
      ? response.data
      : response.data?.data || [];
  },

  // --- Share 专用 ---

  share: async (id: string) => {
    const response = await api.post<ShareEntryResponse>(`/entries/${id}/share`);
    return response.data;
  },

  getSharedEntry: async (token: string) => {
    const response = await api.get<SharedEntryData>(`/share/${token}`);
    return response.data;
  },

  // --- Lists & Overview ---

  getFutureLog: async () => {
    const response = await api.get("/log/future");
    const data = response.data;
    let allItems: any[] = [];
    if (data.future_log && Array.isArray(data.future_log))
      allItems = allItems.concat(data.future_log);
    if (data.monthly_log && typeof data.monthly_log === "object") {
      Object.values(data.monthly_log).forEach((monthItems: any) => {
        if (Array.isArray(monthItems)) allItems = allItems.concat(monthItems);
      });
    }
    return allItems;
  },

  getRangeOverview: async (startDate: string, endDate: string) => {
    const response = await api.get("/log/range_overview", {
      params: { start_date: startDate, end_date: endDate },
    });
    return response.data;
  },

  getDailyEntries: async (dateStr: string) => {
    const response = await api.get<any[]>(`/log/daily/${dateStr}`);
    return response.data;
  },

  // ==========================================
  // ✅ Backup & Restore (Import / Export)
  // ==========================================

  // 1. 全量导出 (用于生成 .bjk 文件)
  getAllForBackup: async () => {
    const response = await api.get<any[]>("/entries/all");
    return response.data;
  },

  // 2. 批量导入 (返回插入的 ID 列表，用于 Undo)
  bulkImport: async (entries: any[]) => {
    const response = await api.post<ImportResponse>("/entries/import", {
      entries,
    });
    return response.data;
  },

  // 3. 批量撤回 (根据 ID 删除)
  batchDelete: async (ids: string[]) => {
    if (!ids || ids.length === 0) return;
    await api.post("/entries/batch-delete", { ids });
  },

  // 2. ✅ 新增: 下载 ZIP 归档 (Markdown 格式)
  downloadBackup: async () => {
    try {
      const response = await api.get("/export/zip", {
        responseType: "blob", // 关键：告诉 axios 这是一个二进制流
      });

      // 创建 Blob 对象
      const blob = new Blob([response.data], { type: "application/zip" });

      // 创建临时的 URL 对象
      const url = window.URL.createObjectURL(blob);

      // 创建隐藏的 <a> 标签触发下载
      const link = document.createElement("a");
      link.href = url;
      // 这里的命名只是个保底，后端通常会在 Content-Disposition Header 中指定文件名
      link.setAttribute(
        "download",
        `bujo_backup_${new Date().toISOString().split("T")[0]}.zip`,
      );
      document.body.appendChild(link);
      link.click();

      // 清理
      link.remove();
      window.URL.revokeObjectURL(url);

      return true;
    } catch (error) {
      console.error("ZIP Export failed:", error);
      throw error;
    }
  },
};
