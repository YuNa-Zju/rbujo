import { useState, useEffect, useCallback } from "react"; // ✅ 引入 useRef
import { format, startOfYear, endOfYear } from "date-fns";
import api from "../lib/api";
import { entryService } from "../services/entryService";
import { cacheStorage } from "../utils/cacheStorage";
import { entryEventBus, type MigratePayload } from "../lib/entryEventBus";
import { type DayOverview } from "../features/calendar/components/CalendarDots";

export function useJournalData(
  selectedDate: Date,
  currentDate: Date,
  viewMode: string,
) {
  const [dailyCache, setDailyCache] = useState<Record<string, any[]>>({});
  const [overviewCache, setOverviewCache] = useState<
    Record<string, DayOverview[]>
  >({});
  const [yearEntries, setYearEntries] = useState<any[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [isCacheLoaded, setIsCacheLoaded] = useState(false);

  // 1. Load Cache
  useEffect(() => {
    const loadCache = async () => {
      try {
        const [daily, overview] = await Promise.all([
          cacheStorage.loadDaily(),
          cacheStorage.loadOverview(),
        ]);
        if (daily && Object.keys(daily).length) setDailyCache(daily);
        if (overview && Object.keys(overview).length)
          setOverviewCache(overview);
      } catch (e) {
        console.error("Cache load failed", e);
      } finally {
        setIsCacheLoaded(true);
      }
    };
    loadCache();
  }, []);

  // 2. Save Cache
  useEffect(() => {
    if (isCacheLoaded) cacheStorage.saveDaily(dailyCache);
  }, [dailyCache, isCacheLoaded]);

  useEffect(() => {
    if (isCacheLoaded) cacheStorage.saveOverview(overviewCache);
  }, [overviewCache, isCacheLoaded]);

  // 3. API Fetching - Overview
  useEffect(() => {
    if (viewMode === "year" || !isCacheLoaded) return;
    const fetchOverview = async () => {
      try {
        const res = await api.get(
          `/log/month_overview/${format(currentDate, "yyyy-MM")}`,
        );
        setOverviewCache((prev) => ({ ...prev, ...res.data }));
      } catch (e) {
        console.error(e);
      }
    };
    fetchOverview();
  }, [currentDate, viewMode, isCacheLoaded]);

  // 🔴 4. API Fetching - Daily (核心修复)
  useEffect(() => {
    if (viewMode === "year" || !isCacheLoaded) return;

    const dStr = format(selectedDate, "yyyy-MM-dd");

    // 逻辑变更：即使缓存里有数据，也要静默刷新，因为可能在别的页面被改了
    // 只有当缓存完全为空时，才显示 Loading 转圈
    if (!dailyCache[dStr]) {
      setLoadingList(true);
    }

    const fetchDaily = async () => {
      try {
        const res = await api.get(`/log/daily/${dStr}`);
        const newData = res.data || [];

        setDailyCache((prev) => {
          // 只有当数据真的变了才更新 State，防止死循环
          if (JSON.stringify(prev[dStr]) !== JSON.stringify(newData)) {
            return { ...prev, [dStr]: newData };
          }
          return prev;
        });

        // 同步更新 overview dots
        setOverviewCache((prev) => {
          const dots = newData.map((e: any) => ({
            id: e.id,
            type: e.entry_type,
            status: e.status,
          }));
          return { ...prev, [dStr]: dots };
        });
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingList(false);
      }
    };

    fetchDaily();

    // ⚠️ 关键：移除 dailyCache 依赖，防止 fetch -> setDailyCache -> effect -> fetch 的死循环
    // 我们只在 selectedDate 或 viewMode 变化时重新请求
  }, [selectedDate, viewMode, isCacheLoaded]); // ❌ Removed dailyCache dependency

  // Year View Fetching
  useEffect(() => {
    if (viewMode !== "year") return;
    const fetchYear = async () => {
      try {
        const start = format(startOfYear(currentDate), "yyyy-MM-dd");
        const end = format(endOfYear(currentDate), "yyyy-MM-dd");
        const data = await entryService.getRangeOverview(start, end);
        setYearEntries(data);
      } catch (e) {
        console.error(e);
      }
    };
    fetchYear();
  }, [currentDate, viewMode]);

  const handleSilentRefresh = useCallback(() => {
    const dStr = format(selectedDate, "yyyy-MM-dd");
    api
      .get(`/log/daily/${dStr}`)
      .then((res) => setDailyCache((prev) => ({ ...prev, [dStr]: res.data })));
    api
      .get(`/log/month_overview/${format(currentDate, "yyyy-MM")}`)
      .then((res) => setOverviewCache((prev) => ({ ...prev, ...res.data })));
  }, [viewMode, currentDate, selectedDate]);

  // -------------------------------------------------------------------------
  // ✅ 5. EventBus Logic (保持之前的修复)
  // -------------------------------------------------------------------------

  const getEntryDateKey = (entry: any): string | null => {
    if (entry.date)
      return typeof entry.date === "string"
        ? entry.date.split("T")[0]
        : format(new Date(entry.date), "yyyy-MM-dd");
    if (entry.target_date)
      return typeof entry.target_date === "string"
        ? entry.target_date.split("T")[0]
        : format(new Date(entry.target_date), "yyyy-MM-dd");
    return null;
  };

  useEffect(() => {
    const handleUpdate = (updatedPayload: any) => {
      const targetId = updatedPayload.id;
      // console.log("🔄 [UseJournal] Update Rx:", updatedPayload);

      setDailyCache((prev) => {
        const newState = { ...prev };
        let hasChanges = false;
        let existingEntry = null;
        let existingDateKey = null;

        for (const dateKey of Object.keys(newState)) {
          const found = newState[dateKey].find((e) => e.id === targetId);
          if (found) {
            existingEntry = found;
            existingDateKey = dateKey;
            break;
          }
        }

        const finalEntry = existingEntry
          ? { ...existingEntry, ...updatedPayload }
          : updatedPayload;

        const dateKey = getEntryDateKey(finalEntry);
        if (dateKey && !finalEntry.date) {
          finalEntry.date = dateKey;
        }

        if (existingEntry) {
          if (dateKey && dateKey !== existingDateKey) {
            // 跨天移动
            newState[existingDateKey!] = newState[existingDateKey!].filter(
              (e) => e.id !== targetId,
            );
            const newList = newState[dateKey] || [];
            newState[dateKey] = [finalEntry, ...newList];
            hasChanges = true;
          } else if (dateKey && dateKey === existingDateKey) {
            // 原地更新
            const list = newState[dateKey];
            const index = list.findIndex((e) => e.id === targetId);
            if (index !== -1) {
              const newList = [...list];
              newList[index] = finalEntry;
              newState[dateKey] = newList;
              hasChanges = true;
            }
          } else {
            // 移除 (无日期)
            newState[existingDateKey!] = newState[existingDateKey!].filter(
              (e) => e.id !== targetId,
            );
            hasChanges = true;
          }
        } else {
          // 新增
          if (dateKey) {
            const list = newState[dateKey] || [];
            if (!list.some((e) => e.id === targetId)) {
              newState[dateKey] = [finalEntry, ...list];
              hasChanges = true;
            }
          }
        }
        return hasChanges ? newState : prev;
      });

      // Overview Dots Update
      setOverviewCache((prev) => {
        const newState = { ...prev };
        let hasChanges = false;

        let existingDateKey = null;
        for (const dateKey of Object.keys(newState)) {
          if (newState[dateKey].some((d) => d.id === targetId)) {
            existingDateKey = dateKey;
            break;
          }
        }

        const targetDateKey =
          getEntryDateKey(updatedPayload) || existingDateKey;

        if (
          existingDateKey &&
          targetDateKey &&
          existingDateKey !== targetDateKey
        ) {
          newState[existingDateKey] = newState[existingDateKey].filter(
            (d) => d.id !== targetId,
          );
          const dots = newState[targetDateKey] || [];
          newState[targetDateKey] = [
            {
              id: targetId,
              type: updatedPayload.entry_type || "task",
              status: updatedPayload.status || "open",
            },
            ...dots,
          ];
          hasChanges = true;
        } else if (targetDateKey) {
          const dots = newState[targetDateKey] || [];
          const index = dots.findIndex((d) => d.id === targetId);
          if (index !== -1) {
            const oldDot = dots[index];
            const newDot = {
              ...oldDot,
              type: updatedPayload.entry_type ?? oldDot.type,
              status: updatedPayload.status ?? oldDot.status,
            };
            if (
              oldDot.type !== newDot.type ||
              oldDot.status !== newDot.status
            ) {
              const newDots = [...dots];
              newDots[index] = newDot;
              newState[targetDateKey] = newDots;
              hasChanges = true;
            }
          } else if (updatedPayload.entry_type && updatedPayload.status) {
            newState[targetDateKey] = [
              {
                id: targetId,
                type: updatedPayload.entry_type,
                status: updatedPayload.status,
              },
              ...dots,
            ];
            hasChanges = true;
          }
        } else if (existingDateKey && !targetDateKey) {
          newState[existingDateKey] = newState[existingDateKey].filter(
            (d) => d.id !== targetId,
          );
          hasChanges = true;
        }
        return hasChanges ? newState : prev;
      });
    };

    const handleDelete = (id: string) => {
      setDailyCache((prev) => {
        const newState = { ...prev };
        let hasChanges = false;
        Object.keys(newState).forEach((key) => {
          if (newState[key].some((e) => e.id === id)) {
            newState[key] = newState[key].filter((i) => i.id !== id);
            hasChanges = true;
          }
        });
        return hasChanges ? newState : prev;
      });
      setOverviewCache((prev) => {
        const newState = { ...prev };
        let hasChanges = false;
        Object.keys(newState).forEach((key) => {
          if (newState[key].some((d) => d.id === id)) {
            newState[key] = newState[key].filter((d) => d.id !== id);
            hasChanges = true;
          }
        });
        return hasChanges ? newState : prev;
      });
    };

    const handleMigrate = (payload: MigratePayload) => {
      handleUpdate(payload.source);
      if (payload.target) handleUpdate(payload.target);
    };

    entryEventBus.on("entry:create", handleUpdate);
    entryEventBus.on("entry:update", handleUpdate);
    entryEventBus.on("entry:status_change", handleUpdate);
    entryEventBus.on("entry:delete", handleDelete);
    entryEventBus.on("entry:migrate", handleMigrate);

    return () => {
      entryEventBus.off("entry:create", handleUpdate);
      entryEventBus.off("entry:update", handleUpdate);
      entryEventBus.off("entry:status_change", handleUpdate);
      entryEventBus.off("entry:delete", handleDelete);
      entryEventBus.off("entry:migrate", handleMigrate);
    };
  }, []);

  return {
    dailyCache,
    overviewCache,
    yearEntries,
    loadingList,
    handleSilentRefresh,
    setDailyCache,
    setOverviewCache,
  };
}
