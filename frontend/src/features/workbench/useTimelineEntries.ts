import { useCallback, useEffect, useMemo, useState } from "react";
import { format, isValid, parseISO } from "date-fns";
import { entryService } from "../../services/entryService";
import { entryEventBus, type MigratePayload } from "../../lib/entryEventBus";

const TIMELINE_SEARCH_LIMIT = 10000;

const getEntryDate = (entry: any) => {
  const dateValue = entry?.target_date || entry?.date;
  if (!dateValue) return null;
  return typeof dateValue === "string"
    ? dateValue.split("T")[0]
    : format(dateValue, "yyyy-MM-dd");
};

const isEntryVisible = (entry: any) => {
  if (entry?.entry_type !== "task") return false;
  if (entry?.status !== "open") return false;
  return Boolean(getEntryDate(entry));
};

const mergeEntryIntoGroups = (
  groupedEntries: Record<string, any[]>,
  payload: any,
) => {
  const next: Record<string, any[]> = {};
  let previousEntry: any | null = null;

  Object.entries(groupedEntries).forEach(([dateKey, entries]) => {
    const filtered = entries.filter((entry) => {
      if (entry.id !== payload?.id) return true;
      previousEntry = entry;
      return false;
    });
    if (filtered.length > 0) next[dateKey] = filtered;
  });

  const finalEntry = previousEntry ? { ...previousEntry, ...payload } : payload;
  const nextDateKey = getEntryDate(finalEntry);
  if (isEntryVisible(finalEntry) && nextDateKey) {
    next[nextDateKey] = [finalEntry, ...(next[nextDateKey] || [])];
  }

  return next;
};

export function useTimelineEntries(query: string) {
  const [loading, setLoading] = useState(false);
  const [groupedEntries, setGroupedEntries] = useState<Record<string, any[]>>(
    {},
  );

  const fetchTimeline = useCallback(async () => {
    setLoading(true);
    try {
      const data = await entryService.search({
        q: query,
        mode: query.trim() ? "semantic" : "text",
        entry_type: ["task"],
        status: "open",
        limit: TIMELINE_SEARCH_LIMIT,
      });

      const groups: Record<string, any[]> = {};
      if (Array.isArray(data)) {
        data.forEach((item) => {
          if (!isEntryVisible(item)) return;
          const dateKey = getEntryDate(item);
          if (!dateKey) return;
          groups[dateKey] = [...(groups[dateKey] || []), item];
        });
      }

      setGroupedEntries(groups);
    } catch (error) {
      console.error("Timeline workbench load failed", error);
      setGroupedEntries({});
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const timer = window.setTimeout(fetchTimeline, query.trim() ? 350 : 0);
    return () => window.clearTimeout(timer);
  }, [fetchTimeline, query]);

  useEffect(() => {
    const handleBusUpdate = (payload: any) => {
      setGroupedEntries((current) => mergeEntryIntoGroups(current, payload));
    };
    const handleBusDelete = (id: string) => {
      setGroupedEntries((current) => {
        const next: Record<string, any[]> = {};
        Object.entries(current).forEach(([dateKey, entries]) => {
          const filtered = entries.filter((entry) => entry.id !== id);
          if (filtered.length > 0) next[dateKey] = filtered;
        });
        return next;
      });
    };
    const handleBusMigrate = (payload: MigratePayload) => {
      if (payload?.source) handleBusUpdate(payload.source);
      if (payload?.target) handleBusUpdate(payload.target);
    };
    const handleReload = () => {
      void fetchTimeline();
    };

    entryEventBus.on("entry:create", handleBusUpdate);
    entryEventBus.on("entry:update", handleBusUpdate);
    entryEventBus.on("entry:status_change", handleBusUpdate);
    entryEventBus.on("entry:delete", handleBusDelete);
    entryEventBus.on("entry:migrate", handleBusMigrate);
    entryEventBus.on("entry:reload_needed", handleReload);

    return () => {
      entryEventBus.off("entry:create", handleBusUpdate);
      entryEventBus.off("entry:update", handleBusUpdate);
      entryEventBus.off("entry:status_change", handleBusUpdate);
      entryEventBus.off("entry:delete", handleBusDelete);
      entryEventBus.off("entry:migrate", handleBusMigrate);
      entryEventBus.off("entry:reload_needed", handleReload);
    };
  }, [fetchTimeline]);

  const sortedDates = useMemo(() => {
    return Object.keys(groupedEntries)
      .filter((date) => isValid(parseISO(date)))
      .sort();
  }, [groupedEntries]);

  return {
    loading,
    groupedEntries,
    sortedDates,
    refreshTimeline: fetchTimeline,
  };
}
