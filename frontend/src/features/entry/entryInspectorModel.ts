import type { EntryType } from "../../config/entryTheme";
import type { UpdateEntryPayload } from "../../services/entryService";
import { getSmartSummary } from "../../utils/markdownUtils.ts";

export type InspectorRouteTarget =
  | {
      kind: "daily";
      date: string;
      label: string;
      disabled: false;
    }
  | {
      kind: "future";
      date: null;
      label: string;
      disabled: false;
    }
  | {
      kind: "none";
      date: null;
      label: string;
      disabled: true;
    };

export interface InspectorDraft {
  content: string;
  entryType: EntryType;
  status: string;
  tags: string[];
}

export interface InspectorDraftPatch {
  content?: string;
  entryType?: EntryType;
  status?: string;
  tags?: string[];
}

export interface InspectorStackState {
  entries: any[];
  index: number;
}

const FUTURE_STATUSES = new Set(["future", "migrated_future"]);
const EDITABLE_STATUSES = new Set(["open", "completed", "cancelled"]);

const normalizeDateValue = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.includes("T") ? trimmed.split("T")[0] : trimmed;
};

export function getInspectorRouteTarget(entry: any): InspectorRouteTarget {
  const dailyDate = normalizeDateValue(entry?.target_date ?? entry?.date);
  if (dailyDate) {
    return {
      kind: "daily",
      date: dailyDate,
      label: dailyDate,
      disabled: false,
    };
  }

  const isFuture =
    Boolean(entry?.is_future) ||
    Boolean(entry?.target_month) ||
    FUTURE_STATUSES.has(String(entry?.status ?? ""));
  if (isFuture) {
    return {
      kind: "future",
      date: null,
      label: entry?.target_month || "Future",
      disabled: false,
    };
  }

  return {
    kind: "none",
    date: null,
    label: "未安排",
    disabled: true,
  };
}

export function mergeInspectorEntry(current: any, updated: any) {
  if (!current || !updated || current.id !== updated.id) return current;
  const merged = { ...current, ...updated };
  if (
    Object.prototype.hasOwnProperty.call(updated, "content") &&
    updated.content !== current.content &&
    !Object.prototype.hasOwnProperty.call(updated, "summary")
  ) {
    delete merged.summary;
  }
  return merged;
}

export function getInspectorDisplayText(entry: any): string {
  const contentSummary = getSmartSummary(entry?.content || "").text;
  if (contentSummary && contentSummary !== "新条目") return contentSummary;
  const summaryText = entry?.summary?.text;
  if (typeof summaryText === "string" && summaryText.trim()) {
    return getSmartSummary(summaryText).text;
  }
  return "Untitled";
}

export function buildInspectorDraft(entry: any): InspectorDraft {
  return {
    content: entry?.content || "",
    entryType: (entry?.entry_type || "task") as EntryType,
    status: entry?.status || "open",
    tags: Array.isArray(entry?.tags) ? entry.tags : [],
  };
}

export function buildInspectorUpdatePayload(
  draft: InspectorDraft,
  patch: InspectorDraftPatch = {},
): UpdateEntryPayload {
  const content = patch.content ?? draft.content;
  const entryType = patch.entryType ?? draft.entryType;
  const status = patch.status ?? draft.status;
  const tags = patch.tags ?? draft.tags;

  const payload: UpdateEntryPayload = {
    content,
    entry_type: entryType,
    tags,
  };

  if (EDITABLE_STATUSES.has(status)) {
    payload.status = status;
  }

  return payload;
}

export function createInspectorStack(entry: any | null): InspectorStackState {
  return {
    entries: entry ? [entry] : [],
    index: entry ? 0 : -1,
  };
}

export function pushInspectorStack(
  state: InspectorStackState,
  entry: any,
): InspectorStackState {
  if (!entry) return state;
  const current = state.entries[state.index];
  if (current?.id === entry.id) return state;

  const entries = state.entries.slice(0, state.index + 1);
  entries.push(entry);

  return {
    entries,
    index: entries.length - 1,
  };
}

export function moveInspectorStack(
  state: InspectorStackState,
  delta: number,
): InspectorStackState {
  if (state.entries.length === 0) return state;
  const nextIndex = Math.max(
    0,
    Math.min(state.entries.length - 1, state.index + delta),
  );
  return {
    ...state,
    index: nextIndex,
  };
}
