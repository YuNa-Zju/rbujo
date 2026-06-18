import { useRef, type WheelEvent } from "react";
import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { zhCN, enUS } from "date-fns/locale";
import { motion, type PanInfo } from "framer-motion";
import clsx from "clsx";
import { useTranslation } from "../../../hooks/useTranslation";
import CalendarDots from "./CalendarDots";
import type { DayOverview } from "./CalendarDots";

export const CALENDAR_PAGE_OFFSETS = [-1, 0, 1];
export const DAY_BUTTON_SIZE_CLASS = "w-7 h-7";
export const CALENDAR_DOTS_POSITION_CLASS =
  "calendar-day-dots absolute bottom-0 left-1/2 h-2.5 -translate-x-1/2";
export const MONTH_SURFACE_HEIGHT = 340;
export const WEEK_SURFACE_HEIGHT = 168;
export const MONTH_CARD_MIN_HEIGHT = 292;
export const WEEK_CARD_MIN_HEIGHT = 116;
export const CALENDAR_CARD_WIDTH_STYLE = "min(920px, calc(100% - 7rem))";
export const CALENDAR_CARD_RADIUS_CLASS = "rounded-[1.75rem] overflow-hidden";
export const SIDE_PAGE_OPACITY = 0.56;
export const SIDE_PAGE_TRANSLATE_PERCENT = "50%";
export const NAVIGATION_ANIMATION_DISTANCE = "7%";

type ViewMode = "month" | "week";
type NavDirection = "prev" | "next" | null;

interface SwipeCalendarSurfaceProps {
  viewMode: ViewMode;
  currentDate: Date;
  selectedDate: Date;
  overviewCache: Record<string, DayOverview[]>;
  onDateClick: (date: Date) => void;
  onNavigate: (direction: "prev" | "next") => void;
  navDirection?: NavDirection;
}

const NAVIGATE_DISTANCE_THRESHOLD = 82;
const NAVIGATE_VELOCITY_THRESHOLD = 520;
const WHEEL_NAVIGATION_COOLDOWN_MS = 420;

function pageDateForOffset(date: Date, viewMode: ViewMode, offset: number) {
  return viewMode === "month" ? addMonths(date, offset) : addWeeks(date, offset);
}

function daysForPage(date: Date, viewMode: ViewMode) {
  if (viewMode === "week") {
    const weekStart = startOfWeek(date, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  }

  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(date);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = [];
  for (let day = gridStart; day <= gridEnd; day = addDays(day, 1)) {
    days.push(day);
  }
  while (days.length < 42) {
    days.push(addDays(days[days.length - 1], 1));
  }
  return days.slice(0, 42);
}

function cardAnimateForOffset(offset: number) {
  if (offset === 0) return { x: "0%", scale: 1, opacity: 1, rotateY: 0 };
  return {
    x: offset < 0 ? `-${SIDE_PAGE_TRANSLATE_PERCENT}` : SIDE_PAGE_TRANSLATE_PERCENT,
    scale: 0.92,
    opacity: SIDE_PAGE_OPACITY,
    rotateY: offset < 0 ? 10 : -10,
  };
}

function currentCardInitial(navDirection: NavDirection) {
  if (!navDirection) return false;
  return {
    x: navDirection === "next" ? NAVIGATION_ANIMATION_DISTANCE : `-${NAVIGATION_ANIMATION_DISTANCE}`,
    scale: 0.97,
    opacity: 0.78,
    rotateY: navDirection === "next" ? -4 : 4,
  };
}

export default function SwipeCalendarSurface({
  viewMode,
  currentDate,
  selectedDate,
  overviewCache,
  onDateClick,
  onNavigate,
  navDirection = null,
}: SwipeCalendarSurfaceProps) {
  const { t, lang } = useTranslation();
  const locale = lang === "zh" ? zhCN : enUS;
  const lastWheelNavigationAt = useRef(0);

  const weekDays = [
    t.calendar?.week?.mon || "一",
    t.calendar?.week?.tue || "二",
    t.calendar?.week?.wed || "三",
    t.calendar?.week?.thu || "四",
    t.calendar?.week?.fri || "五",
    t.calendar?.week?.sat || "六",
    t.calendar?.week?.sun || "日",
  ];

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (
      info.offset.x <= -NAVIGATE_DISTANCE_THRESHOLD ||
      info.velocity.x <= -NAVIGATE_VELOCITY_THRESHOLD
    ) {
      onNavigate("next");
      return;
    }
    if (
      info.offset.x >= NAVIGATE_DISTANCE_THRESHOLD ||
      info.velocity.x >= NAVIGATE_VELOCITY_THRESHOLD
    ) {
      onNavigate("prev");
    }
  };

  const handleWheel = (event: WheelEvent<HTMLElement>) => {
    const horizontal = Math.abs(event.deltaX) >= Math.abs(event.deltaY)
      && Math.abs(event.deltaX) >= 24;
    const vertical = Math.abs(event.deltaY) > Math.abs(event.deltaX)
      && Math.abs(event.deltaY) >= 24;
    if (!horizontal && !vertical) {
      return;
    }
    event.preventDefault();
    const now = Date.now();
    if (now - lastWheelNavigationAt.current < WHEEL_NAVIGATION_COOLDOWN_MS) {
      return;
    }
    lastWheelNavigationAt.current = now;
    if (vertical) {
      onNavigate(event.deltaY > 0 ? "next" : "prev");
      return;
    }
    onNavigate(event.deltaX > 0 ? "next" : "prev");
  };

  return (
    <motion.section
      layout
      onWheel={handleWheel}
      animate={{ height: viewMode === "week" ? WEEK_SURFACE_HEIGHT : MONTH_SURFACE_HEIGHT }}
      transition={{ type: "spring", stiffness: 420, damping: 38 }}
      className="relative w-full overflow-hidden rounded-[2rem] border border-base-200/80 bg-base-100/80 shadow-[0_18px_55px_rgba(15,23,42,0.08)]"
      style={{ perspective: 1100 }}
    >
      <div className="relative h-full">
        {CALENDAR_PAGE_OFFSETS.map((offset) => {
          const pageDate = pageDateForOffset(currentDate, viewMode, offset);
          const pageDays = daysForPage(pageDate, viewMode);
          const isCurrentPage = offset === 0;
          const showDotsOnSidePages = true;

          return (
            <motion.div
              key={`${viewMode}-${format(pageDate, "yyyy-MM-dd")}-${offset}`}
              drag="x"
              dragDirectionLock
              dragMomentum={false}
              dragElastic={0.08}
              dragListener={isCurrentPage}
              onDragEnd={isCurrentPage ? handleDragEnd : undefined}
              onClick={!isCurrentPage ? () => onNavigate(offset < 0 ? "prev" : "next") : undefined}
              initial={isCurrentPage ? currentCardInitial(navDirection) : false}
              animate={cardAnimateForOffset(offset)}
              transition={{ type: "spring", stiffness: 360, damping: 36 }}
              className={clsx(
                CALENDAR_CARD_RADIUS_CLASS,
                "absolute left-1/2 top-6 -translate-x-1/2 border bg-base-100 p-4 shadow-[0_18px_44px_rgba(15,23,42,0.10)]",
                isCurrentPage
                  ? "z-20 border-base-200/90"
                  : "z-0 cursor-pointer border-base-200/60 bg-base-200/25",
              )}
              style={{
                width: CALENDAR_CARD_WIDTH_STYLE,
                minHeight: viewMode === "week" ? WEEK_CARD_MIN_HEIGHT : MONTH_CARD_MIN_HEIGHT,
              }}
            >
              <div className="mb-1.5 flex items-baseline justify-between px-1">
                <span className="font-serif text-base font-bold capitalize text-base-content/85">
                  {format(pageDate, viewMode === "week" ? "MMM d" : "MMMM yyyy", {
                    locale,
                  })}
                </span>
                <span className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-base-content/30">
                  {viewMode === "week" ? "7D" : "6W"}
                </span>
              </div>

              <div className="grid grid-cols-7 text-center text-[10px] font-black text-base-content/35">
                {weekDays.map((day) => (
                  <div key={day}>{day}</div>
                ))}
              </div>

              <div className="mt-1 grid grid-cols-7 gap-y-0">
                {pageDays.map((day) => {
                  const dateKey = format(day, "yyyy-MM-dd");
                  const selected = isSameDay(day, selectedDate);
                  const today = isToday(day);
                  const outsideMonth = viewMode === "month" && !isSameMonth(day, pageDate);

                  return (
                    <button
                      key={dateKey}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => isCurrentPage && onDateClick(day)}
                      className={clsx(
                        "group relative flex h-[38px] min-w-0 flex-col items-center justify-start rounded-2xl px-0.5 pt-0 text-center transition-transform active:scale-95",
                        outsideMonth && "opacity-35",
                        !isCurrentPage && "pointer-events-none",
                      )}
                    >
                      <span
                        className={clsx(
                          DAY_BUTTON_SIZE_CLASS,
                          "flex shrink-0 items-center justify-center rounded-full text-xs font-black transition-colors",
                          selected
                            ? "bg-primary text-primary-content shadow-[0_10px_20px_rgba(99,102,241,0.32)]"
                            : today
                              ? "bg-primary/10 text-primary ring-1 ring-primary/20"
                              : "text-base-content/75 group-hover:bg-base-200/70",
                        )}
                      >
                        {format(day, "d")}
                      </span>
                      <div
                        className={clsx(
                          CALENDAR_DOTS_POSITION_CLASS,
                          !isCurrentPage && "calendar-side-page-dots opacity-95",
                        )}
                      >
                        {(isCurrentPage || showDotsOnSidePages) && (
                          <CalendarDots
                            items={overviewCache[dateKey] || []}
                            dateKey={dateKey}
                            viewMode={viewMode}
                          />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.section>
  );
}
