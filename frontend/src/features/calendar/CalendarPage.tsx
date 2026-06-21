import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { createPortal } from "react-dom";
import { addWeeks, format, subWeeks } from "date-fns";
import { zhCN, enUS } from "date-fns/locale";
import {
  Plus,
  MapPin,
  ArrowDownUp,
  Check,
  FilePenLine,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "../../hooks/useTranslation";
import { useTagPreloader } from "../../hooks/useTagPreloader";
import { useCalendarState } from "../../hooks/useCalendarState";
import { useJournalData } from "../../hooks/useJournalData";

// ✅ 引入 UI 总线
import { uiEvents } from "../../lib/uiEvents";

// ✅ 引入新组件
import HeaderActionTrigger from "./components/HeaderActionTrigger";

import YearGrid from "./components/YearGrid";
import SwipeCalendarSurface from "./components/SwipeCalendarSurface";
import DailySheetCard from "./components/DailySheetCard";
import { getCalendarResponsiveMetrics } from "./calendarResponsiveLayout";
import DraggableEntryCard, {
  EntryCard,
} from "../../components/DraggableEntryCard";

import {
  DndContext,
  closestCenter,
  MouseSensor,
  useSensor,
  useSensors,
  TouchSensor,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
  defaultDropAnimationSideEffects,
  MeasuringStrategy,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { entryService } from "../../services/entryService";

const getViewportHeight = () =>
  typeof window === "undefined" ? 900 : window.innerHeight;

export default function CalendarPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, lang } = useTranslation();
  const dateLocale = lang === "zh" ? zhCN : enUS;

  const {
    currentDate,
    selectedDate,
    navDirection,
    viewMode,
    setViewMode,
    setLastViewMode,
    setCurrentDate,
    handleDateClick,
    handleMonthClick,
    handleNav,
    handleJumpToDate,
    toggleViewMode,
  } = useCalendarState();

  const [viewportHeight, setViewportHeight] = useState(getViewportHeight);
  const calendarResponsiveMetrics = getCalendarResponsiveMetrics(viewportHeight);
  const isAutoCompactWeek =
    viewMode === "month" && calendarResponsiveMetrics.forceWeekView;
  const calendarDisplayMode = isAutoCompactWeek ? "week" : viewMode;

  const {
    dailyCache,
    overviewCache,
    yearOverview,
    loadingList,
    handleSilentRefresh,
    setDailyCache,
    setOverviewCache,
  } = useJournalData(selectedDate, currentDate, calendarDisplayMode);

  const [activeItem, setActiveItem] = useState<any | null>(null);
  const [isManualSorting, setIsManualSorting] = useState(false);
  const [dragWidth, setDragWidth] = useState<number | undefined>(undefined);
  const [openSelectedMarkdown, setOpenSelectedMarkdown] = useState(false);

  // ✅ 监听路由参数打开 Future Log
  useEffect(() => {
    const handleResize = () => setViewportHeight(getViewportHeight());
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const state = location.state as any;
    if (state?.openFutureLog) {
      uiEvents.emit("OPEN_FUTURE_LOG");
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location, navigate]);

  const collapseCalendar = () => {
    if (isAutoCompactWeek) return;
    if (viewMode !== "month") return;
    setCurrentDate(selectedDate);
    setLastViewMode("month");
    setViewMode("week");
  };

  const expandCalendar = () => {
    if (viewMode !== "week") return;
    setCurrentDate(selectedDate);
    setLastViewMode("week");
    setViewMode("month");
  };

  const toggleCalendarHeight = () => {
    if (isAutoCompactWeek) return;
    if (viewMode === "month") {
      collapseCalendar();
      return;
    }
    if (viewMode === "week") {
      expandCalendar();
    }
  };

  const handleCalendarNav = (direction: "prev" | "next") => {
    if (isAutoCompactWeek) {
      const nextDate =
        direction === "prev" ? subWeeks(selectedDate, 1) : addWeeks(selectedDate, 1);
      handleJumpToDate(nextDate);
      return;
    }
    handleNav(direction);
  };

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 6 },
    }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    const item = dailyCache[format(selectedDate, "yyyy-MM-dd")]?.find(
      (e: any) => e.id === event.active.id,
    );
    if (item) {
      setActiveItem(item);
      const el = document.getElementById(event.active.id as string);
      if (el) setDragWidth(el.offsetWidth);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveItem(null);
    setDragWidth(undefined);

    if (over && active.id !== over.id) {
      const dStr = format(selectedDate, "yyyy-MM-dd");
      const currentList = dailyCache[dStr] || [];
      const previousList = [...currentList];
      const oldIndex = currentList.findIndex((i: any) => i.id === active.id);
      const newIndex = currentList.findIndex((i: any) => i.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newItems = arrayMove(currentList, oldIndex, newIndex);
        setDailyCache((prev) => ({ ...prev, [dStr]: newItems }));

        setOverviewCache((prev) => {
          if (!prev[dStr]) return prev;
          const newDots = newItems.map((item) => ({
            id: item.id,
            type: item.entry_type,
            status: item.status,
          }));
          return { ...prev, [dStr]: newDots };
        });

        try {
          const orderedIds = newItems.map((i: any) => i.id);
          await entryService.reorder(orderedIds);
        } catch (e) {
          console.error("Reorder failed", e);
          setDailyCache((prev) => ({ ...prev, [dStr]: previousList }));
          handleSilentRefresh();
        }
      }
    }
  };

  const currentDailyEntries =
    dailyCache[format(selectedDate, "yyyy-MM-dd")] || [];
  useTagPreloader(currentDailyEntries);

  const handleOpenSelectedMarkdown = async () => {
    if (openSelectedMarkdown) return;
    setOpenSelectedMarkdown(true);
    try {
      await entryService.openDailyMarkdown(format(selectedDate, "yyyy-MM-dd"));
    } catch (error) {
      console.error("Failed to open selected daily markdown", error);
      alert(
        t.daily.openMarkdownFailed ||
          "Failed to open the Markdown file. Please try again.",
      );
    } finally {
      setOpenSelectedMarkdown(false);
    }
  };

  return (
    <div
      className="relative h-full w-full bg-base-100 overflow-hidden flex flex-col overscroll-none"
      style={{ touchAction: "pan-y" }}
    >
      <div className="flex-none z-50 bg-base-100 shadow-sm relative">
        <div className="h-[56px] flex items-center justify-between px-2 border-b border-base-200">
          <div className="flex-none w-10"></div>
          <motion.div
            className="flex flex-col items-center cursor-pointer active:opacity-70 select-none"
            onClick={toggleViewMode}
            whileTap={{ scale: 0.95 }}
          >
            <span className="text-lg font-serif font-bold leading-none capitalize">
              {viewMode === "year"
                ? format(currentDate, "yyyy")
                : format(currentDate, "MMMM yyyy", { locale: dateLocale })}
            </span>
            <span className="text-[10px] text-gray-400 uppercase tracking-widest mt-0.5">
              {
                t.calendar[
                  calendarDisplayMode === "year"
                    ? "yearView"
                    : calendarDisplayMode === "month"
                      ? "monthView"
                      : "weekView"
                ]
              }
            </span>
          </motion.div>

          <div className="flex-none flex items-center gap-0.5">
            <button
              className="btn btn-sm btn-ghost text-primary gap-1 px-2"
              onClick={() => handleJumpToDate(new Date())}
            >
              <MapPin size={20} />
            </button>

            {/* ✅ 替换为新的抽象组件 */}
            <HeaderActionTrigger />
          </div>
        </div>

        <AnimatePresence mode="wait">
          {calendarDisplayMode !== "year" && (
            <motion.div
              layout
              key="card-stack-calendar"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="px-4 pt-2 pb-1"
            >
              <SwipeCalendarSurface
                viewMode={calendarDisplayMode as "month" | "week"}
                currentDate={currentDate}
                selectedDate={selectedDate}
                overviewCache={overviewCache}
                onDateClick={handleDateClick}
                onNavigate={handleCalendarNav}
                navDirection={navDirection}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="calendar-daily-scroll-region flex-1 relative w-full min-h-0 bg-base-100 flex flex-col overflow-hidden no-scrollbar overscroll-contain px-4 pb-4">
        <AnimatePresence mode="wait">
          {viewMode === "year" ? (
            <motion.div
              key="year-view"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="absolute inset-0 overflow-y-auto no-scrollbar p-2 sm:p-4 pb-4 overscroll-contain"
            >
              <YearGrid
                currentDate={currentDate}
                overviewMap={yearOverview}
                onDateClick={handleDateClick}
                onMonthClick={handleMonthClick}
              />
            </motion.div>
          ) : (
            <motion.div
              key="daily-view"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.2 }}
              className="flex min-h-0 w-full flex-1 flex-col"
            >
              <DailySheetCard
                viewMode={calendarDisplayMode as "month" | "week"}
                isManualSorting={isManualSorting}
                onCollapseCalendar={collapseCalendar}
                onExpandCalendar={expandCalendar}
                onToggleCalendar={toggleCalendarHeight}
                calendarToggleDisabled={isAutoCompactWeek}
                calendarToggleLabel={
                  isAutoCompactWeek
                    ? "Month view returns when this window is taller"
                    : undefined
                }
                title={
                  <h2
                    className="flex min-w-0 cursor-pointer items-center gap-2 truncate font-serif text-2xl font-bold capitalize text-base-content"
                    onClick={() =>
                      navigate(`/daily/${format(selectedDate, "yyyy-MM-dd")}`)
                    }
                  >
                    {isManualSorting ? (
                      <span className="flex items-center gap-2 text-xl text-primary">
                        <ArrowDownUp size={20} /> Sorting...
                      </span>
                    ) : (
                      <>
                        {format(selectedDate, "MMM d, EEEE", {
                          locale: dateLocale,
                        })}{" "}
                        <span className="text-base-content/30">›</span>
                      </>
                    )}
                  </h2>
                }
                actions={
                  <>
                    <button
                      type="button"
                      className="btn btn-sm btn-circle border bg-base-100 shadow-sm"
                      onClick={handleOpenSelectedMarkdown}
                      disabled={openSelectedMarkdown}
                      title={
                        t.daily.openMarkdown || "Open Markdown in default editor"
                      }
                      aria-label={
                        t.daily.openMarkdown || "Open Markdown in default editor"
                      }
                    >
                      <FilePenLine size={16} />
                    </button>
                    {currentDailyEntries.length > 1 && (
                      <button
                        className={`btn btn-sm btn-circle border shadow-sm transition-all ${
                          isManualSorting ? "btn-primary" : "bg-base-100"
                        }`}
                        onClick={() => setIsManualSorting(!isManualSorting)}
                      >
                        {isManualSorting ? (
                          <Check size={16} />
                        ) : (
                          <ArrowDownUp size={16} />
                        )}
                      </button>
                    )}
                  </>
                }
                footer={
                  !isManualSorting && currentDailyEntries.length > 0 ? (
                    <button
                      className="btn btn-primary h-11 w-full rounded-full text-base font-bold shadow-[0_12px_20px_rgba(99,102,241,0.24)] active:scale-[0.98]"
                      onClick={() =>
                        uiEvents.emit("OPEN_ADD_ENTRY", {
                          date: selectedDate,
                          mode: "daily",
                        })
                      }
                    >
                      <Plus size={22} />
                      <span>{t.calendar.newEntry}</span>
                    </button>
                  ) : null
                }
              >
                <div
                  className={`flex min-h-0 h-full w-full flex-col overscroll-contain px-4 ${
                    currentDailyEntries.length === 0
                      ? "overflow-hidden"
                      : "overflow-y-auto no-scrollbar"
                  } ${currentDailyEntries.length > 0 ? "pb-4" : "pb-4"}`}
                  onScroll={(e) => e.stopPropagation()}
                >
                  <div className="h-4 w-full shrink-0" />

                  {loadingList ? (
                    <div className="flex justify-center py-10">
                      <span className="loading loading-dots loading-md text-gray-400"></span>
                    </div>
                  ) : (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      measuring={{
                        droppable: { strategy: MeasuringStrategy.Always },
                      }}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      modifiers={[restrictToVerticalAxis]}
                      autoScroll={{
                        threshold: { x: 0, y: 0.1 },
                        acceleration: 20,
                      }}
                    >
                      <SortableContext
                        items={currentDailyEntries.map((e: any) => e.id)}
                        strategy={verticalListSortingStrategy}
                        disabled={!isManualSorting}
                      >
                        {currentDailyEntries.map((entry: any) => (
                          <DraggableEntryCard
                            key={entry.id}
                            entry={entry}
                            refresh={handleSilentRefresh}
                            isDragEnabled={isManualSorting}
                            forceCollapse={isManualSorting}
                          />
                        ))}
                      </SortableContext>

                      {createPortal(
                        <DragOverlay
                          dropAnimation={{
                            sideEffects: defaultDropAnimationSideEffects({
                              styles: { active: { opacity: "0.3" } },
                            }),
                            duration: 200,
                            easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)",
                          }}
                          zIndex={1000}
                          className="pointer-events-none"
                        >
                          {activeItem && (
                            <div
                              style={{
                                width: dragWidth ? `${dragWidth}px` : "100%",
                                backgroundColor: "var(--b1)",
                                borderRadius: "0.75rem",
                                boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
                              }}
                            >
                              <EntryCard
                                entry={activeItem}
                                refresh={() => {}}
                                isOverlay
                                forceCollapse
                                isDragEnabled={true}
                                disableOverflowCheck={true}
                              />
                            </div>
                          )}
                        </DragOverlay>,
                        document.body,
                      )}
                    </DndContext>
                  )}

                  {!loadingList && currentDailyEntries.length === 0 && (
                    <div className="flex min-h-0 flex-1 flex-col p-1 animate-in fade-in zoom-in duration-500">
                      <button
                        onClick={() =>
                          uiEvents.emit("OPEN_ADD_ENTRY", {
                            date: selectedDate,
                            mode: "daily",
                          })
                        }
                        className="group flex min-h-[220px] flex-1 cursor-pointer flex-col items-center justify-center gap-5 rounded-[2rem] border-2 border-dashed border-base-300 transition-all duration-300 hover:border-primary/30 hover:bg-base-200/30 active:scale-[0.99] [@media(max-height:720px)]:min-h-[160px] [@media(max-height:640px)]:min-h-[132px]"
                      >
                        <div className="relative">
                          <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-transparent bg-base-200 transition-all duration-300 group-hover:border-base-200 group-hover:bg-base-100 group-hover:shadow-sm">
                            <Plus
                              size={32}
                              strokeWidth={1.5}
                              className="text-base-content/30 transition-colors duration-300 group-hover:scale-110 group-hover:text-primary"
                            />
                          </div>
                        </div>
                        <div className="space-y-1 text-center">
                          <h3 className="font-serif text-2xl italic text-base-content/40 transition-colors duration-300 group-hover:text-base-content/70">
                            {t.calendar?.emptyState || "The page is empty."}
                          </h3>
                        </div>
                      </button>
                    </div>
                  )}
                </div>
              </DailySheetCard>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
