import { useEffect, useState, useRef, useMemo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { createPortal } from "react-dom";
import {
  Plus,
  ArrowDownUp,
  PenLine,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  LayoutGrid,
  List,
  Clock, // 用于排序图标
  Check,
} from "lucide-react";
import { format, addDays, subDays, parseISO, isValid } from "date-fns";
import { useTranslation } from "../../hooks/useTranslation";
import { ENTRY_THEME, type EntryType } from "../../config/entryTheme";
import { entryService } from "../../services/entryService";
import { entryEventBus, type MigratePayload } from "../../lib/entryEventBus";
import { uiEvents } from "../../lib/uiEvents";
import { cacheStorage } from "../../utils/cacheStorage";

// ✅ 引入统一的 Header Action 组件
import HeaderActionTrigger from "../calendar/components/HeaderActionTrigger";

import DraggableEntryCard from "../../components/DraggableEntryCard";

import {
  DndContext,
  closestCenter,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragOverlay,
  defaultDropAnimationSideEffects,
  type DragStartEvent,
  type DragEndEvent,
  type DropAnimation,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";

type SortMode = "default" | "time" | "type";

export default function DailyPage() {
  const { dateStr } = useParams<{ dateStr: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { t, lang } = useTranslation();

  // --- State ---
  const [dailyCache, setDailyCache] = useState<Record<string, any[]>>({});
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});
  const [isCacheLoaded, setIsCacheLoaded] = useState(false);

  // --- DND State ---
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragWidth, setDragWidth] = useState<number | undefined>(undefined);
  const touchStartX = useRef<number | null>(null);

  // --- Filters & Sorting ---
  const [activeFilters, setActiveFilters] = useState<Set<EntryType>>(
    new Set(["task", "idea", "event"]),
  );
  const [sortMode, setSortMode] = useState<SortMode>("default");
  const [isManualSorting, setIsManualSorting] = useState(false);

  // --- Date Logic ---
  const viewDate = dateStr || format(new Date(), "yyyy-MM-dd");
  const dateObj = parseISO(viewDate);
  const isValidDate = isValid(dateObj);
  const dateDisplay = isValidDate
    ? dateObj.toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US", {
        month: "long",
        day: "numeric",
        weekday: "long",
      })
    : "Invalid Date";

  const slideDirection = location.state?.direction || null;

  // --- Persistence Logic ---
  useEffect(() => {
    const loadCache = async () => {
      try {
        const cached = await cacheStorage.loadDaily();
        if (cached && Object.keys(cached).length > 0) {
          setDailyCache(cached);
        }
      } catch (e) {
        console.error("Failed to load daily cache", e);
      } finally {
        setIsCacheLoaded(true);
      }
    };
    loadCache();
  }, []);

  useEffect(() => {
    if (isCacheLoaded) {
      cacheStorage.saveDaily(dailyCache);
    }
  }, [dailyCache, isCacheLoaded]);

  // --- Data Fetching ---
  const fetchDateData = async (targetDateStr: string, force = false) => {
    if (!force && (dailyCache[targetDateStr] || loadingMap[targetDateStr]))
      return;
    if (!isCacheLoaded && !force) return;

    setLoadingMap((prev) => ({ ...prev, [targetDateStr]: true }));
    try {
      const res = await entryService.search({
        start_date: targetDateStr,
        end_date: targetDateStr,
      });
      setDailyCache((prev) => ({ ...prev, [targetDateStr]: res || [] }));
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMap((prev) => ({ ...prev, [targetDateStr]: false }));
    }
  };

  useEffect(() => {
    if (isValidDate && isCacheLoaded) {
      fetchDateData(viewDate);
      fetchDateData(format(subDays(dateObj, 1), "yyyy-MM-dd"));
      fetchDateData(format(addDays(dateObj, 1), "yyyy-MM-dd"));
    }
    if (location.state?.direction) {
      const timer = setTimeout(
        () => navigate(location.pathname, { replace: true, state: {} }),
        500,
      );
      return () => clearTimeout(timer);
    }
  }, [viewDate, isCacheLoaded]);

  useEffect(() => setIsManualSorting(false), [viewDate]);

  // --- Handlers ---
  const navigateToDate = (targetDate: Date) => {
    const targetStr = format(targetDate, "yyyy-MM-dd");
    if (targetStr === viewDate) return;
    const dir = targetStr > viewDate ? "right" : "left";
    sessionStorage.setItem("calendar_focus_date", targetStr);
    navigate(`/daily/${targetStr}`, { state: { direction: dir } });
  };

  const currentEntries = dailyCache[viewDate] || [];
  const isLoading = loadingMap[viewDate];
  const canDrag =
    sortMode === "default" && activeFilters.size === 3 && isManualSorting;

  const processedEntries = useMemo(() => {
    const filtered = currentEntries.filter((entry) =>
      activeFilters.has(entry.entry_type),
    );
    if (sortMode === "time") {
      return [...filtered].sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
    } else if (sortMode === "type") {
      const typeOrder = { task: 0, idea: 1, event: 2 };
      return [...filtered].sort(
        (a, b) =>
          typeOrder[a.entry_type as keyof typeof typeOrder] -
          typeOrder[b.entry_type as keyof typeof typeOrder],
      );
    }
    return filtered;
  }, [currentEntries, activeFilters, sortMode]);

  // --- EventBus 数据同步 ---
  const getEntryDateKey = (entry: any) => {
    const d = entry.date || entry.target_date;
    if (!d) return viewDate;
    return typeof d === "string"
      ? d.split("T")[0]
      : format(new Date(d), "yyyy-MM-dd");
  };

  useEffect(() => {
    const handleCreate = (newEntry: any) => {
      const dStr = getEntryDateKey(newEntry);
      setDailyCache((prev) => {
        const oldList = prev[dStr] || [];
        if (oldList.some((e) => e.id === newEntry.id)) return prev;
        return { ...prev, [dStr]: [newEntry, ...oldList] };
      });
    };

    const handleUpdate = (updated: any) => {
      const dStr = getEntryDateKey(updated);
      setDailyCache((prev) => {
        const list = prev[dStr];
        if (!list) return prev;
        return {
          ...prev,
          [dStr]: list.map((i: any) =>
            i.id === updated.id ? { ...i, ...updated } : i,
          ),
        };
      });
    };

    const handleDelete = (id: string) => {
      setDailyCache((prev) => {
        const newState = { ...prev };
        Object.keys(newState).forEach((key) => {
          newState[key] = newState[key].filter((i) => i.id !== id);
        });
        return newState;
      });
    };

    const handleMigrate = (payload: MigratePayload) => {
      handleUpdate(payload.source);
      const targetDateStr = payload.date.split("T")[0];
      setDailyCache((prev) => {
        const currentList = prev[targetDateStr] || [];
        if (currentList.some((e) => e.id === payload.target.id)) return prev;
        return { ...prev, [targetDateStr]: [payload.target, ...currentList] };
      });
    };

    entryEventBus.on("entry:create", handleCreate);
    entryEventBus.on("entry:update", handleUpdate);
    entryEventBus.on("entry:status_change", handleUpdate);
    entryEventBus.on("entry:delete", handleDelete);
    entryEventBus.on("entry:migrate", handleMigrate);

    return () => {
      entryEventBus.off("entry:create", handleCreate);
      entryEventBus.off("entry:update", handleUpdate);
      entryEventBus.off("entry:status_change", handleUpdate);
      entryEventBus.off("entry:delete", handleDelete);
      entryEventBus.off("entry:migrate", handleMigrate);
    };
  }, [viewDate]);

  // --- DND Sensors & Handlers ---
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 10 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 8 },
    }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
    const element = document.getElementById(event.active.id as string);
    if (element) setDragWidth(element.offsetWidth);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setDragWidth(undefined);
    if (over && active.id !== over.id) {
      const oldIndex = currentEntries.findIndex((i) => i.id === active.id);
      const newIndex = currentEntries.findIndex((i) => i.id === over.id);
      const newItems = arrayMove(currentEntries, oldIndex, newIndex);
      setDailyCache((prev) => ({ ...prev, [viewDate]: newItems }));
      try {
        await entryService.reorder(newItems.map((i) => i.id));
      } catch {
        fetchDateData(viewDate, true);
      }
    }
  };

  const dropAnimationConfig: DropAnimation = {
    sideEffects: defaultDropAnimationSideEffects({
      styles: { active: { opacity: "0.3" } },
    }),
    duration: 200,
    easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)",
  };

  return (
    <div
      className="fixed inset-0 w-full h-full bg-base-100 overflow-hidden flex flex-col"
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        if (!touchStartX.current) return;
        const diff = touchStartX.current - e.changedTouches[0].clientX;
        if (Math.abs(diff) > 70) {
          if (diff > 0) navigateToDate(addDays(dateObj, 1));
          else navigateToDate(subDays(dateObj, 1));
        }
        touchStartX.current = null;
      }}
    >
      {/* Header */}
      <div className="flex-none h-14 grid grid-cols-[1fr_auto_1fr] items-center px-2 sm:px-4 border-b border-base-200/50 bg-base-100/80 backdrop-blur-md z-[100] relative">
        {/* ✅ 左侧：返回 + 回首页 (放在一起更合理) */}
        <div className="flex justify-start items-center gap-1">
          <button
            className="btn btn-ghost btn-circle btn-sm text-base-content/60"
            onClick={() => navigate("/")}
            title="Back"
          >
            <ArrowLeft size={20} />
          </button>
        </div>

        {/* 中间：日期导航 (保持不变) */}
        <div className="flex justify-center px-1">
          <div className="flex items-center bg-base-200/60 rounded-full p-0.5 border border-base-content/5 shadow-sm max-w-full overflow-hidden">
            <button
              className="btn btn-ghost btn-circle btn-xs shrink-0"
              onClick={() => navigateToDate(subDays(dateObj, 1))}
            >
              <ChevronLeft size={16} />
            </button>
            <div className="relative flex flex-col items-center justify-center px-3 py-0.5 hover:bg-base-content/10 rounded-lg transition-colors cursor-pointer group">
              <input
                type="date"
                className="absolute inset-0 opacity-0 cursor-pointer z-10"
                value={viewDate}
                onChange={(e) =>
                  isValid(parseISO(e.target.value)) &&
                  navigateToDate(parseISO(e.target.value))
                }
              />
              <span className="text-[9px] font-bold text-base-content/40 uppercase tracking-[0.15em] leading-none mb-0.5 group-hover:text-primary transition-colors">
                {t.daily.title || "DAILY LOG"}
              </span>
              <span className="text-xs font-black text-base-content font-mono tracking-tighter leading-none">
                {viewDate}
              </span>
            </div>
            <button
              className="btn btn-ghost btn-circle btn-xs shrink-0"
              onClick={() => navigateToDate(addDays(dateObj, 1))}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* ✅ 右侧：只保留操作触发器 */}
        <div className="flex items-center justify-end">
          {/* 统一的功能入口 */}
          <HeaderActionTrigger />
        </div>
      </div>
      {/* Main Content */}
      <div
        key={viewDate}
        className={`flex-1 overflow-y-auto overscroll-contain pb-safe scroll-smooth relative z-0 ${
          slideDirection === "right"
            ? "animate-page-in-right"
            : slideDirection === "left"
              ? "animate-page-in-left"
              : ""
        }`}
      >
        <div className="px-4 py-8 max-w-3xl mx-auto w-full">
          {isLoading && currentEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-40">
              <span className="loading loading-dots loading-lg text-base-content/20"></span>
            </div>
          ) : (
            <>
              <h1 className="text-3xl sm:text-4xl font-serif font-bold text-base-content mb-8 px-2 capitalize tracking-tight transition-all">
                {isManualSorting ? (
                  <span className="text-primary flex items-center gap-2 animate-in fade-in slide-in-from-left-2">
                    <ArrowDownUp size={28} /> {t.daily.sorting || "Sorting..."}
                  </span>
                ) : (
                  dateDisplay
                )}
              </h1>

              {/* Sticky Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-8 px-1 sticky top-0 z-[40] py-2 bg-base-100/95 backdrop-blur-sm transition-all">
                <div className="flex items-center gap-2">
                  <div
                    className={`flex items-center gap-2 p-1 transition-opacity duration-300 ${isManualSorting ? "opacity-50 pointer-events-none" : "opacity-100"}`}
                  >
                    {(Object.values(ENTRY_THEME) as any[]).map((theme) => {
                      const isActive = activeFilters.has(
                        theme.key as EntryType,
                      );
                      return (
                        <button
                          key={theme.key}
                          onClick={() => {
                            const next = new Set(activeFilters);
                            if (isActive) {
                              next.delete(theme.key as EntryType);
                            } else {
                              next.add(theme.key as EntryType);
                            }
                            setActiveFilters(next);
                          }}
                          className={`btn btn-sm border-0 gap-1.5 transition-all duration-200 rounded-full px-4 shadow-sm ${isActive ? `${theme.activeBg} ${theme.activeText} shadow-md scale-105` : "bg-base-200 text-base-content/60 hover:bg-base-300"}`}
                        >
                          <theme.icon
                            size={14}
                            strokeWidth={isActive ? 3 : 2}
                          />
                          <span className="font-bold text-xs hidden sm:inline">
                            {
                              t.common[
                                theme.key as Exclude<
                                  keyof typeof t.common,
                                  "theme"
                                >
                              ]
                            }
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {sortMode === "default" && (
                    <button
                      className={`btn btn-sm btn-circle border shadow-sm transition-all duration-300 ${isManualSorting ? "btn-primary text-primary-content border-primary" : "bg-base-100 text-base-content/70 border-base-200 hover:bg-base-200"}`}
                      onClick={() => setIsManualSorting(!isManualSorting)}
                    >
                      {isManualSorting ? (
                        <Check size={16} strokeWidth={3} />
                      ) : (
                        <ArrowDownUp size={16} />
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      const modes: SortMode[] = ["default", "time", "type"];
                      setSortMode(
                        modes[(modes.indexOf(sortMode) + 1) % modes.length],
                      );
                    }}
                    disabled={isManualSorting}
                    className={`btn btn-sm gap-2 border shadow-sm transition-all min-w-[90px] justify-center rounded-lg ${sortMode !== "default" ? "bg-neutral text-neutral-content border-neutral" : "bg-base-100 text-base-content/70 border-base-200"} ${isManualSorting ? "opacity-50" : ""}`}
                  >
                    {sortMode === "time" ? (
                      <Clock size={16} />
                    ) : sortMode === "type" ? (
                      <LayoutGrid size={16} />
                    ) : (
                      <List size={16} className="opacity-50" />
                    )}
                    <span className="text-xs font-bold">
                      {t.daily[
                        `sort${sortMode.charAt(0).toUpperCase() + sortMode.slice(1)}` as keyof typeof t.daily
                      ] || sortMode}
                    </span>
                  </button>
                </div>
              </div>

              {/* List Wrapper */}
              <div className="flex flex-col gap-3 pb-40 min-h-[50vh]">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  modifiers={[restrictToVerticalAxis]}
                >
                  <SortableContext
                    items={processedEntries.map((e) => e.id)}
                    strategy={verticalListSortingStrategy}
                    disabled={!canDrag}
                  >
                    {processedEntries.length > 0 ? (
                      processedEntries.map((entry) => (
                        <DraggableEntryCard
                          key={entry.id}
                          entry={entry}
                          isDragEnabled={canDrag}
                          refresh={() => fetchDateData(viewDate, true)}
                          forceCollapse={isManualSorting}
                        />
                      ))
                    ) : (
                      <div className="flex flex-col items-center justify-center text-base-content/20 py-24 select-none">
                        <div className="w-16 h-16 rounded-full bg-base-200/50 flex items-center justify-center mb-4 ring-4 ring-base-200/20">
                          <PenLine
                            size={24}
                            className="opacity-40 text-primary"
                          />
                        </div>
                        <p className="font-serif italic text-lg opacity-60">
                          {t.daily.empty || "No entries yet"}
                        </p>
                      </div>
                    )}
                  </SortableContext>

                  {createPortal(
                    <DragOverlay
                      zIndex={1000}
                      dropAnimation={dropAnimationConfig}
                    >
                      {activeId && (
                        <div
                          style={{ width: dragWidth }}
                          className="cursor-grabbing"
                        >
                          <DraggableEntryCard
                            entry={currentEntries.find(
                              (e) => e.id === activeId,
                            )}
                            isDragEnabled={false}
                            refresh={() => {}}
                            isOverlay={true}
                            forceCollapse={true}
                          />
                        </div>
                      )}
                    </DragOverlay>,
                    document.body,
                  )}
                </DndContext>
              </div>
            </>
          )}
        </div>
      </div>

      {/* FAB (Add Entry) */}
      {!isManualSorting && (
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-base-100 via-base-100/95 to-transparent z-[50] pointer-events-none flex justify-center items-end h-32 pb-8">
          <button
            className="pointer-events-auto btn btn-primary w-full max-w-sm shadow-xl rounded-full text-lg h-14 gap-2 active:scale-95"
            onClick={() =>
              uiEvents.emit("OPEN_ADD_ENTRY", { date: dateObj, mode: "daily" })
            }
          >
            <Plus size={24} />
            <span className="font-bold">{t.calendar.newEntry}</span>
          </button>
        </div>
      )}
    </div>
  );
}
