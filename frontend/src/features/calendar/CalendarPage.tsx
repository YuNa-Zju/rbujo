import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import { zhCN, enUS } from "date-fns/locale";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  MapPin,
  ArrowDownUp,
  Check,
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

import CalendarGrid from "./components/StandardGrid";
import YearGrid from "./components/YearGrid";
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

export default function CalendarPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, lang } = useTranslation();
  const dateLocale = lang === "zh" ? zhCN : enUS;

  const {
    currentDate,
    selectedDate,
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

  const {
    dailyCache,
    overviewCache,
    yearEntries,
    loadingList,
    handleSilentRefresh,
    setDailyCache,
    setOverviewCache,
  } = useJournalData(selectedDate, currentDate, viewMode);

  const [activeItem, setActiveItem] = useState<any | null>(null);
  const [isManualSorting, setIsManualSorting] = useState(false);
  const [dragWidth, setDragWidth] = useState<number | undefined>(undefined);

  // ✅ 监听路由参数打开 Future Log
  useEffect(() => {
    const state = location.state as any;
    if (state?.openFutureLog) {
      uiEvents.emit("OPEN_FUTURE_LOG");
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location, navigate]);

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX;
    touchStartY.current = e.targetTouches[0].clientY;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartX.current || !touchStartY.current) return;
    const dX = touchStartX.current - e.changedTouches[0].clientX;
    const dY = touchStartY.current - e.changedTouches[0].clientY;
    if (Math.abs(dX) > Math.abs(dY)) {
      if (Math.abs(dX) > 50) handleNav(dX > 0 ? "next" : "prev");
    } else {
      if (Math.abs(dY) > 50) {
        if (dY > 0 && viewMode === "month") {
          setCurrentDate(selectedDate);
          setLastViewMode("month");
          setViewMode("week");
        } else if (dY < 0 && viewMode === "week") {
          setCurrentDate(selectedDate);
          setLastViewMode("week");
          setViewMode("month");
        }
      }
    }
    touchStartX.current = null;
    touchStartY.current = null;
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

  return (
    <div
      className="fixed inset-0 w-full h-[100dvh] bg-base-100 overflow-hidden flex flex-col overscroll-none"
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
                  viewMode === "year"
                    ? "yearView"
                    : viewMode === "month"
                      ? "monthView"
                      : "weekView"
                ]
              }
            </span>
          </motion.div>

          <div className="flex-none flex items-center gap-0.5">
            <div className="hidden md:flex items-center bg-base-200/50 rounded-full p-0.5 border border-base-content/5 mr-2">
              <button
                className="btn btn-ghost btn-circle btn-xs hover:bg-base-300"
                onClick={() => handleNav("prev")}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                className="btn btn-ghost btn-circle btn-xs hover:bg-base-300"
                onClick={() => handleNav("next")}
              >
                <ChevronRight size={18} />
              </button>
            </div>
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
          {viewMode !== "year" && (
            <motion.div
              layout
              key={`calendar-grid-${viewMode}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="border-b border-base-200/50 overflow-hidden"
              onTouchStart={onTouchStart}
              onTouchEnd={onTouchEnd}
            >
              <CalendarGrid
                viewMode={viewMode as any}
                currentDate={currentDate}
                selectedDate={selectedDate}
                overviewCache={overviewCache}
                onDateClick={handleDateClick}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="flex-1 relative w-full h-full min-h-0 bg-base-100 flex flex-col overflow-hidden">
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
                entries={yearEntries}
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
              className="flex flex-col h-full w-full"
            >
              <div className="flex-none z-40 px-4 py-3 border-b border-base-content/5 bg-base-100/80 flex justify-between items-center transition-all backdrop-blur-md h-[56px]">
                <h2
                  className="text-2xl font-serif font-bold text-base-content cursor-pointer flex items-center gap-2 capitalize truncate"
                  onClick={() =>
                    navigate(`/daily/${format(selectedDate, "yyyy-MM-dd")}`)
                  }
                >
                  {isManualSorting ? (
                    <span className="text-primary flex items-center gap-2 text-xl">
                      <ArrowDownUp size={20} /> Sorting...
                    </span>
                  ) : (
                    <>
                      {format(selectedDate, "MMM d, EEEE", {
                        locale: dateLocale,
                      })}{" "}
                      <ChevronRight size={18} className="opacity-30" />
                    </>
                  )}
                </h2>
                {currentDailyEntries.length > 1 && (
                  <button
                    className={`btn btn-sm btn-circle border shadow-sm transition-all ${isManualSorting ? "btn-primary" : "bg-base-100"}`}
                    onClick={() => setIsManualSorting(!isManualSorting)}
                  >
                    {isManualSorting ? (
                      <Check size={16} />
                    ) : (
                      <ArrowDownUp size={16} />
                    )}
                  </button>
                )}
              </div>

              <div
                className={`flex-1 px-4 overscroll-contain w-full ${
                  currentDailyEntries.length === 0
                    ? "overflow-hidden"
                    : "overflow-y-auto no-scrollbar"
                } ${currentDailyEntries.length > 0 ? "pb-32" : "pb-4"}`}
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
                  <div className="h-full w-full flex flex-col p-1 animate-in fade-in zoom-in duration-500">
                    <button
                      // ✅ 触发新建笔记 (传入当前日期)
                      onClick={() =>
                        uiEvents.emit("OPEN_ADD_ENTRY", {
                          date: selectedDate,
                          mode: "daily",
                        })
                      }
                      className="group flex-1 w-full border-2 border-dashed border-base-300 rounded-4xl flex flex-col items-center justify-center gap-5 transition-all duration-300 hover:border-primary/30 hover:bg-base-200/30 active:scale-[0.99] cursor-pointer min-h-[200px]"
                    >
                      <div className="relative">
                        <div className="relative w-20 h-20 bg-base-200 rounded-full flex items-center justify-center group-hover:bg-base-100 group-hover:shadow-sm transition-all duration-300 border border-transparent group-hover:border-base-200">
                          <Plus
                            size={32}
                            strokeWidth={1.5}
                            className="text-base-content/30 group-hover:text-primary transition-colors duration-300 group-hover:scale-110 transform"
                          />
                        </div>
                      </div>
                      <div className="text-center space-y-1">
                        <h3 className="font-serif italic text-2xl text-base-content/40 group-hover:text-base-content/70 transition-colors duration-300">
                          {t.calendar?.emptyState || "The page is empty."}
                        </h3>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {viewMode !== "year" &&
          !isManualSorting &&
          currentDailyEntries.length > 0 && (
            <motion.div
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              className="absolute bottom-0 left-0 right-0 p-4 bg-linear-to-t from-base-100 via-base-100/90 to-transparent z-50 pointer-events-none flex justify-center items-end h-32 pb-8"
            >
              <button
                className="pointer-events-auto btn btn-primary w-full max-w-sm rounded-full text-lg h-14 gap-2 active:scale-95 transition-transform"
                // ✅ 触发新建笔记
                onClick={() =>
                  uiEvents.emit("OPEN_ADD_ENTRY", {
                    date: selectedDate,
                    mode: "daily",
                  })
                }
              >
                <Plus size={24} />{" "}
                <span className="font-bold">{t.calendar.newEntry}</span>
              </button>
            </motion.div>
          )}
      </AnimatePresence>
    </div>
  );
}
