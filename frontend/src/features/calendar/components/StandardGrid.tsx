import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  format,
  getDay,
} from "date-fns";
import clsx from "clsx";
import { useTranslation } from "../../../hooks/useTranslation";
import CalendarDots from "./CalendarDots";

export default function StandardGrid({
  viewMode,
  currentDate,
  selectedDate,
  overviewCache,
  onDateClick,
}: any) {
  const { t } = useTranslation();
  let daysToRender: Date[] = [];
  let startDayOffset = 0;

  if (viewMode === "month") {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    daysToRender = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const dayNum = getDay(monthStart);
    startDayOffset = dayNum === 0 ? 6 : dayNum - 1;
  } else {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
    daysToRender = eachDayOfInterval({ start: weekStart, end: weekEnd });
  }

  const weekDays = [
    t.calendar?.week?.mon || "一",
    t.calendar?.week?.tue || "二",
    t.calendar?.week?.wed || "三",
    t.calendar?.week?.thu || "四",
    t.calendar?.week?.fri || "五",
    t.calendar?.week?.sat || "六",
    t.calendar?.week?.sun || "日",
  ];

  return (
    <div className="bg-base-100 pb-4 pt-2 select-none">
      <div className="grid grid-cols-7 text-center text-xs font-bold text-base-content/40 mb-2">
        {weekDays.map((d, i) => (
          <div key={i}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1 px-2">
        {viewMode === "month" &&
          Array.from({ length: startDayOffset }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}
        {daysToRender.map((day) => {
          const isSelected = isSameDay(day, selectedDate);
          const isTodayDate = isToday(day);
          const isOtherMonth =
            viewMode === "month" && !isSameMonth(day, currentDate);
          const dateStr = format(day, "yyyy-MM-dd");
          return (
            <div
              key={day.toString()}
              onClick={() => onDateClick(day)}
              className={clsx(
                "flex flex-col items-center cursor-pointer p-1 relative rounded-lg active:scale-90 transition-all duration-200",
                isOtherMonth ? "opacity-30" : "opacity-100",
              )}
            >
              <div
                className={clsx(
                  "w-8 h-8 flex items-center justify-center rounded-full text-sm transition-all duration-300",
                  isSelected
                    ? "bg-neutral text-neutral-content font-bold scale-110 shadow-lg shadow-neutral/20"
                    : isTodayDate
                      ? "bg-primary/10 font-bold text-primary"
                      : "text-base-content hover:bg-base-200",
                )}
              >
                {format(day, "d")}
              </div>
              <CalendarDots
                items={overviewCache[dateStr] || []}
                dateKey={dateStr}
                viewMode={viewMode}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
