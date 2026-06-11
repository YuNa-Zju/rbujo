import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { type EntryType } from "../config/entryTheme";

export interface CreateEntryPayload {
  content: string;
  entry_type: EntryType;
  status?: "open" | "completed" | "cancelled" | "forward" | "future";
  target_date?: string | null;
  is_future?: boolean;
  target_month?: string | null;
  tags?: string[];
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
  tags?: string[];
}

export interface ImportResponse {
  success: boolean;
  message: string;
  inserted_count: number;
  updated_count: number;
  skipped_count: number;
  inserted_ids: string[];
}

type SearchMode = "text" | "regex" | "semantic";

interface SearchResult {
  entry: any;
  score: number;
  match_type: string;
  snippet: string;
}

const normalizeEntry = (entry: any) => {
  if (!entry) return entry;
  return {
    ...entry,
    date: entry.date ?? entry.target_date ?? null,
    tags: Array.isArray(entry.tags) ? entry.tags : [],
  };
};

const normalizeEntries = (entries: any[]) => entries.map(normalizeEntry);

const normalizeMigrationResult = (result: any) => {
  const updatedSource = normalizeEntry(result.updated_source);
  const createdEntry = normalizeEntry(result.created_entry);
  return {
    success: true,
    updated_source: updatedSource,
    created_entry: createdEntry,
    new_entry: createdEntry,
  };
};

const saveBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const entriesToMarkdown = (entries: any[]) => {
  const grouped = new Map<string, any[]>();
  normalizeEntries(entries).forEach((entry) => {
    const key =
      entry.target_date || entry.target_month || (entry.is_future ? "Future" : "Undated");
    grouped.set(key, [...(grouped.get(key) || []), entry]);
  });

  return Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, items]) => {
      const body = items
        .map((entry) => {
          const marker =
            entry.entry_type === "task" ? "- [ ]" : entry.entry_type === "event" ? "- o" : "-";
          const status = entry.status && entry.status !== "open" ? ` (${entry.status})` : "";
          const tags = Array.isArray(entry.tags) && entry.tags.length > 0
            ? `\n  Tags: ${entry.tags.map((tag: string) => `#${tag}`).join(" ")}`
            : "";
          return `${marker} ${entry.content}${status}${tags}`;
        })
        .join("\n");
      return `## ${key}\n\n${body}`;
    })
    .join("\n\n");
};

export const entryService = {
  create: async (payload: CreateEntryPayload) => {
    const entry = await invoke<any>("create_entry", {
      input: {
        content: payload.content,
        entry_type: payload.entry_type,
        target_date: payload.target_date ?? null,
        target_month: payload.target_month ?? null,
        is_future: Boolean(payload.is_future),
        tags: payload.tags ?? [],
      },
    });
    return normalizeEntry(entry);
  },

  update: async (id: string, payload: UpdateEntryPayload) => {
    const entry = await invoke<any>("update_entry", {
      id,
      patch: {
        content: payload.content,
        entry_type: payload.entry_type,
        status: payload.status,
        target_date: payload.target_date ?? undefined,
        target_month: payload.target_month ?? undefined,
        is_future: payload.is_future,
        tags: payload.tags,
      },
    });
    return normalizeEntry(entry);
  },

  toggleStatus: async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === "open" ? "completed" : "open";
    return entryService.update(id, { status: newStatus });
  },

  migrate: async (id: string, date: string) => {
    const result = await invoke<any>("migrate_entry_to_date", {
      id,
      targetDate: date,
    });
    return normalizeMigrationResult(result);
  },

  reopen: async (id: string) => {
    const result = await invoke<any>("reopen_entry", { id });
    return {
      ...result,
      updated_entry: normalizeEntry(result.updated_entry),
    };
  },

  moveToFuture: async (id: string, month: string | null) => {
    const result = await invoke<any>("migrate_entry_to_future", {
      id,
      targetMonth: month,
    });
    return normalizeMigrationResult(result).new_entry;
  },

  rescheduleFutureEntry: async (id: string, date: string) => {
    const result = await invoke<any>("migrate_entry_to_date", {
      id,
      targetDate: date,
    });
    return normalizeMigrationResult(result).new_entry;
  },

  moveFutureEntry: async (id: string, month: string | null) => {
    const entry = await invoke<any>("move_future_entry", {
      id,
      targetMonth: month,
    });
    return normalizeEntry(entry);
  },

  delete: async (id: string, hard: boolean = false) => {
    if (hard) {
      await invoke<void>("delete_entry", { id });
    } else {
      await entryService.update(id, { status: "cancelled" });
    }
  },

  archive: async (id: string) => {
    const entry = await invoke<any>("archive_entry", { id });
    return normalizeEntry(entry);
  },

  unarchive: async (id: string) => {
    const entry = await invoke<any>("unarchive_entry", { id });
    return normalizeEntry(entry);
  },

  reorder: async (entryIds: string[]) => {
    await invoke<void>("reorder_entries", { entryIds });
  },

  search: async (params: {
    q?: string;
    mode?: SearchMode;
    entry_type?: string[];
    start_date?: string;
    end_date?: string;
    status?: string;
    include_archived?: boolean;
    limit?: number;
    tags?: string[];
  }) => {
    const results = await invoke<SearchResult[]>("search_entries", {
      options: {
        query: params.q ?? "",
        mode: params.mode ?? "text",
        include_archived: Boolean(params.include_archived),
        entry_type: params.entry_type ?? [],
        tags: params.tags ?? [],
        start_date: params.start_date ?? null,
        end_date: params.end_date ?? null,
        limit: params.limit ?? 80,
      },
    });
    return results
      .map((result) => ({
        ...normalizeEntry(result.entry),
        _search: {
          score: result.score,
          type: result.match_type,
          snippet: result.snippet,
        },
      }))
      .filter((entry) => !params.status || entry.status === params.status);
  },

  listTags: async () => {
    return invoke<string[]>("list_tags");
  },

  getFutureLog: async () => {
    const data = await invoke<any>("get_future_log", {
      includeArchived: false,
    });
    const allItems: any[] = [];
    if (Array.isArray(data.future_log)) {
      allItems.push(...normalizeEntries(data.future_log));
    }
    if (data.monthly_log && typeof data.monthly_log === "object") {
      Object.values(data.monthly_log).forEach((monthItems: any) => {
        if (Array.isArray(monthItems)) allItems.push(...normalizeEntries(monthItems));
      });
    }
    return allItems;
  },

  getRangeOverview: async (startDate: string, endDate: string) => {
    return invoke<any[]>("get_range_overview", {
      startDate,
      endDate,
      includeArchived: false,
    });
  },

  getMonthOverview: async (month: string) => {
    return invoke<Record<string, any[]>>("get_month_overview", {
      month,
      includeArchived: false,
    });
  },

  getDailyEntries: async (dateStr: string, includeArchived = false) => {
    const entries = await invoke<any[]>("get_daily_log", {
      date: dateStr,
      includeArchived,
    });
    return normalizeEntries(entries);
  },

  getAllForBackup: async () => {
    return invoke<any[]>("get_all_entries_for_backup");
  },

  bulkImport: async (entries: any[]) => {
    return invoke<ImportResponse>("import_entries", { entries });
  },

  batchDelete: async (ids: string[]) => {
    if (!ids || ids.length === 0) return;
    await invoke<void>("batch_delete_entries", { ids });
  },

  uploadFile: async (file: File) => {
    const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
    const stored = await invoke<{ relative_path: string; absolute_path: string }>(
      "store_upload",
      {
        filename: file.name,
        bytes,
      },
    );
    return {
      ...stored,
      url: convertFileSrc(stored.absolute_path),
    };
  },

  downloadBackup: async () => {
    const entries = await entryService.getAllForBackup();
    const markdown = entriesToMarkdown(entries);
    const dateStr = new Date().toISOString().split("T")[0];
    saveBlob(
      new Blob([markdown], { type: "text/markdown;charset=utf-8" }),
      `bujo_archive_${dateStr}.md`,
    );
    return true;
  },

};
