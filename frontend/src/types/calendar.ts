export type ViewMode = "month" | "week" | "year";

export type EntryType = "task" | "idea" | "event";

export interface DayOverview {
  id: string;
  type: EntryType;
  status: "open" | "completed" | "cancelled" | "forward" | "future";
}

// 缓存结构：Key是日期字符串 (YYYY-MM-DD), Value是该日的任务列表
export type OverviewCache = Record<string, DayOverview[]>;
