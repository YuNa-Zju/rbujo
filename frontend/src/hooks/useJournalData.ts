import { useState, useEffect, useCallback } from "react";
import {
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
  startOfYear,
  endOfYear,
  subMonths,
  subWeeks,
} from "date-fns";
import { entryService, type DayOverview } from "../services/entryService";
import { cacheStorage } from "../utils/cacheStorage";
import { entryEventBus } from "../lib/entryEventBus";

type OverviewCache = Record<string, DayOverview[]>;
type EntryCache = Record<string, any[]>;

const getEntryDateKey = (entry: any): string | null => {
  const rawDate = entry?.target_date ?? entry?.date;
  if (!rawDate) return null;
  if (typeof rawDate === "string") return rawDate.split("T")[0];
  return format(new Date(rawDate), "yyyy-MM-dd");
};

const mergeEntryForCache = (current: any | undefined, update: any) => {
  const merged = { ...(current || {}), ...update };
  if (
    update &&
    Object.prototype.hasOwnProperty.call(update, "content") &&
    update.content !== current?.content &&
    !Object.prototype.hasOwnProperty.call(update, "summary")
  ) {
    delete merged.summary;
  }
  return merged;
};

const upsertDailyEntry = (cache: EntryCache, update: any): EntryCache => {
  if (!update?.id) return cache;

  let existingDate: string | null = null;
  let existingEntry: any | undefined;
  for (const [dateKey, entries] of Object.entries(cache)) {
    const match = entries.find((entry: any) => entry.id === update.id);
    if (match) {
      existingDate = dateKey;
      existingEntry = match;
      break;
    }
  }

  const merged = mergeEntryForCache(existingEntry, update);
  const targetDate = getEntryDateKey(merged) || existingDate;
  if (!targetDate) return cache;

  const nextCache = { ...cache };
  if (existingDate && existingDate !== targetDate) {
    nextCache[existingDate] = (nextCache[existingDate] || []).filter(
      (entry: any) => entry.id !== update.id,
    );
  }

  const targetEntries = nextCache[targetDate] || [];
  nextCache[targetDate] = targetEntries.some((entry: any) => entry.id === update.id)
    ? targetEntries.map((entry: any) => (entry.id === update.id ? merged : entry))
    : [merged, ...targetEntries];
  return nextCache;
};

const removeDailyEntry = (cache: EntryCache, id: string): EntryCache => {
  let changed = false;
  const nextCache: EntryCache = {};
  for (const [dateKey, entries] of Object.entries(cache)) {
    const filtered = entries.filter((entry: any) => entry.id !== id);
    nextCache[dateKey] = filtered;
    changed ||= filtered.length !== entries.length;
  }
  return changed ? nextCache : cache;
};

const findOverviewDot = (cache: OverviewCache, id: string) => {
  for (const [dateKey, entries] of Object.entries(cache)) {
    const match = entries.find((entry) => entry.id === id);
    if (match) return { dateKey, dot: match };
  }
  return null;
};

const upsertOverviewEntry = (cache: OverviewCache, update: any): OverviewCache => {
  if (!update?.id) return cache;
  const existing = findOverviewDot(cache, update.id);
  const targetDate = getEntryDateKey(update) || existing?.dateKey;
  if (!targetDate) return cache;

  const nextCache: OverviewCache = {};
  for (const [dateKey, entries] of Object.entries(cache)) {
    nextCache[dateKey] = entries.filter((entry) => entry.id !== update.id);
  }

  if (update.archived_at) return nextCache;

  const dot: DayOverview = {
    id: update.id,
    type: update.entry_type ?? update.type ?? existing?.dot.type ?? "task",
    status: update.status ?? existing?.dot.status ?? "open",
  };
  const targetEntries = [...(nextCache[targetDate] || [])];
  const existingIndex = targetEntries.findIndex((entry) => entry.id === dot.id);
  if (existingIndex >= 0) {
    targetEntries.splice(existingIndex, 1, dot);
  } else {
    targetEntries.unshift(dot);
  }
  nextCache[targetDate] = targetEntries;
  return nextCache;
};

const removeOverviewEntry = (cache: OverviewCache, id: string): OverviewCache => {
  const nextCache: OverviewCache = {};
  for (const [dateKey, entries] of Object.entries(cache)) {
    nextCache[dateKey] = entries.filter((entry) => entry.id !== id);
  }
  return nextCache;
};

export function useJournalData(
  selectedDate: Date,
  currentDate: Date,
  viewMode: string,
) {
  const [dailyCache, setDailyCache] = useState<Record<string, any[]>>({});
  const [overviewCache, setOverviewCache] = useState<OverviewCache>({});
  const [yearOverview, setYearOverview] = useState<OverviewCache>({});
  const [loadingList, setLoadingList] = useState(false);
  const [isCacheLoaded, setIsCacheLoaded] = useState(false);

  useEffect(() => {
    const loadCache = async () => {
      try {
        const daily = await cacheStorage.loadDaily();
        if (daily && Object.keys(daily).length) setDailyCache(daily);
      } catch (e) {
        console.error("Cache load failed", e);
      } finally {
        setIsCacheLoaded(true);
      }
    };
    loadCache();
  }, []);

  useEffect(() => {
    if (isCacheLoaded) cacheStorage.saveDaily(dailyCache);
  }, [dailyCache, isCacheLoaded]);

  const refreshCalendarOverview = useCallback(async () => {
    const rangeStart =
      viewMode === "week"
        ? startOfWeek(subWeeks(currentDate, 1), { weekStartsOn: 1 })
        : startOfMonth(subMonths(currentDate, 1));
    const rangeEnd =
      viewMode === "week"
        ? endOfWeek(addWeeks(currentDate, 1), { weekStartsOn: 1 })
        : endOfMonth(addMonths(currentDate, 1));
    const data = await entryService.getRangeOverview(
      format(rangeStart, "yyyy-MM-dd"),
      format(rangeEnd, "yyyy-MM-dd"),
    );
    setOverviewCache(data);
  }, [currentDate, viewMode]);

  const refreshYearOverview = useCallback(async () => {
    const start = format(startOfYear(currentDate), "yyyy-MM-dd");
    const end = format(endOfYear(currentDate), "yyyy-MM-dd");
    const data = await entryService.getRangeOverview(start, end);
    setYearOverview(data);
  }, [currentDate]);

  useEffect(() => {
    if (viewMode === "year" || !isCacheLoaded) return;
    refreshCalendarOverview().catch(console.error);
  }, [refreshCalendarOverview, viewMode, isCacheLoaded]);

  useEffect(() => {
    if (viewMode === "year" || !isCacheLoaded) return;

    const dateKey = format(selectedDate, "yyyy-MM-dd");
    if (!dailyCache[dateKey]) {
      setLoadingList(true);
    }

    const fetchDaily = async () => {
      try {
        const newData = (await entryService.getDailyEntries(dateKey)) || [];
        setDailyCache((prev) => {
          if (JSON.stringify(prev[dateKey]) !== JSON.stringify(newData)) {
            return { ...prev, [dateKey]: newData };
          }
          return prev;
        });
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingList(false);
      }
    };

    fetchDaily();
  }, [selectedDate, viewMode, isCacheLoaded]);

  useEffect(() => {
    if (viewMode !== "year") return;
    refreshYearOverview().catch(console.error);
  }, [refreshYearOverview, viewMode]);

  const handleSilentRefresh = useCallback(() => {
    if (viewMode === "year") {
      refreshYearOverview().catch(console.error);
      return;
    }

    const dateKey = format(selectedDate, "yyyy-MM-dd");
    entryService
      .getDailyEntries(dateKey)
      .then((data) => setDailyCache((prev) => ({ ...prev, [dateKey]: data })))
      .catch(console.error);
    refreshCalendarOverview().catch(console.error);
  }, [refreshCalendarOverview, refreshYearOverview, viewMode, selectedDate]);

  const handleInvalidateOverviewCache = useCallback(() => {
    if (viewMode === "year") {
      refreshYearOverview().catch(console.error);
    } else {
      refreshCalendarOverview().catch(console.error);
    }
  }, [refreshCalendarOverview, refreshYearOverview, viewMode]);

  const handleOptimisticCreate = useCallback((entry: any) => {
    setDailyCache((prev) => upsertDailyEntry(prev, entry));
    setOverviewCache((prev) => upsertOverviewEntry(prev, entry));
    setYearOverview((prev) => upsertOverviewEntry(prev, entry));
  }, []);

  const handleOptimisticUpdate = useCallback((entry: any) => {
    setDailyCache((prev) => upsertDailyEntry(prev, entry));
    setOverviewCache((prev) => upsertOverviewEntry(prev, entry));
    setYearOverview((prev) => upsertOverviewEntry(prev, entry));
  }, []);

  const handleOptimisticDelete = useCallback((payload: any) => {
    const id = typeof payload === "string" ? payload : payload?.id;
    if (!id) return;
    setDailyCache((prev) => removeDailyEntry(prev, id));
    setOverviewCache((prev) => removeOverviewEntry(prev, id));
    setYearOverview((prev) => removeOverviewEntry(prev, id));
  }, []);

  const handleOptimisticMigrate = useCallback(
    (payload: any) => {
      if (!payload) return;
      if (payload.source) handleOptimisticUpdate(payload.source);
      if (payload.target) handleOptimisticCreate(payload.target);
    },
    [handleOptimisticCreate, handleOptimisticUpdate],
  );

  useEffect(() => {
    if (viewMode === "year" || !isCacheLoaded) return;
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        handleSilentRefresh();
      }
    };
    window.addEventListener("focus", handleSilentRefresh);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("focus", handleSilentRefresh);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [handleSilentRefresh, isCacheLoaded, viewMode]);

  useEffect(() => {
    if (!isCacheLoaded) return;
    entryEventBus.on("entry:reload_needed", handleSilentRefresh);
    entryEventBus.on("entry:invalidate_overview_cache", handleInvalidateOverviewCache);
    entryEventBus.on("entry:create", handleOptimisticCreate);
    entryEventBus.on("entry:update", handleOptimisticUpdate);
    entryEventBus.on("entry:status_change", handleOptimisticUpdate);
    entryEventBus.on("entry:delete", handleOptimisticDelete);
    entryEventBus.on("entry:migrate", handleOptimisticMigrate);
    return () => {
      entryEventBus.off("entry:reload_needed", handleSilentRefresh);
      entryEventBus.off(
        "entry:invalidate_overview_cache",
        handleInvalidateOverviewCache,
      );
      entryEventBus.off("entry:create", handleOptimisticCreate);
      entryEventBus.off("entry:update", handleOptimisticUpdate);
      entryEventBus.off("entry:status_change", handleOptimisticUpdate);
      entryEventBus.off("entry:delete", handleOptimisticDelete);
      entryEventBus.off("entry:migrate", handleOptimisticMigrate);
    };
  }, [
    handleInvalidateOverviewCache,
    handleOptimisticCreate,
    handleOptimisticDelete,
    handleOptimisticMigrate,
    handleOptimisticUpdate,
    handleSilentRefresh,
    isCacheLoaded,
  ]);

  return {
    dailyCache,
    overviewCache,
    yearOverview,
    loadingList,
    handleSilentRefresh,
    setDailyCache,
    setOverviewCache,
  };
}
