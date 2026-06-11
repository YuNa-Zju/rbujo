import { useMemo } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isToday,
  getDaysInMonth,
} from "date-fns";
import { zhCN, enUS } from "date-fns/locale";
import { motion } from "framer-motion";
import { useTranslation } from "../../../hooks/useTranslation";

interface YearGridProps {
  currentDate: Date;
  entries: any[];
  onDateClick: (date: Date) => void;
  onMonthClick: (date: Date) => void;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

export default function YearGrid({
  currentDate,
  entries,
  onDateClick,
  onMonthClick,
}: YearGridProps) {
  const { lang } = useTranslation();
  const dateLocale = lang === "zh" ? zhCN : enUS;

  const months = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        return new Date(currentDate.getFullYear(), i, 1);
      }),
    [currentDate],
  );

  const entryMap = useMemo(() => {
    const map = new Map<string, any[]>();
    entries.forEach((e) => {
      if (e.target_date) {
        if (!map.has(e.target_date)) map.set(e.target_date, []);
        map.get(e.target_date)?.push(e);
      }
    });
    return map;
  }, [entries]);

  return (
    <motion.div
      // ✅ 修复：移除 h-full 和 overflow 限制，让内容自然撑开，由父级 Scroll
      className="w-full"
      key={currentDate.getFullYear()}
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
        {months.map((monthDate) => (
          <MonthHeatmapCard
            key={monthDate.toISOString()}
            monthDate={monthDate}
            entryMap={entryMap}
            locale={dateLocale}
            onDateClick={onDateClick}
            onMonthClick={onMonthClick}
          />
        ))}
      </div>
    </motion.div>
  );
}

function MonthHeatmapCard({
  monthDate,
  entryMap,
  locale,
  onDateClick,
  onMonthClick,
}: any) {
  const days = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfMonth(monthDate),
        end: endOfMonth(monthDate),
      }),
    [monthDate],
  );

  const totalDays = getDaysInMonth(monthDate);

  const monthActivity = days.reduce((acc: number, day: Date) => {
    const dateStr = format(day, "yyyy-MM-dd");
    return acc + (entryMap.get(dateStr)?.length || 0);
  }, 0);

  return (
    <motion.div
      variants={itemVariants}
      className="bg-base-100/60 backdrop-blur-md rounded-xl border border-base-200/80 hover:border-primary/30 hover:shadow-md transition-all duration-300 overflow-hidden flex flex-col"
    >
      <div
        className="px-4 py-3 flex justify-between items-center cursor-pointer active:bg-base-200/30 transition-colors"
        onClick={() => onMonthClick(monthDate)}
      >
        <div className="flex items-baseline gap-2">
          <span className="text-base font-bold text-base-content/90">
            {format(monthDate, "MMMM", { locale })}
          </span>
          <span className="text-[10px] text-base-content/30 font-mono font-bold tracking-wider">
            {totalDays}D
          </span>
        </div>
        {monthActivity > 0 && (
          <div className="badge badge-xs bg-base-200/80 text-base-content/50 border-0 font-mono">
            {monthActivity}
          </div>
        )}
      </div>

      <div className="px-4 pb-4 pt-0">
        <div className="h-8 w-full flex rounded-lg overflow-hidden bg-base-200/30 ring-1 ring-base-200/60">
          {days.map((day: Date) => {
            const dateStr = format(day, "yyyy-MM-dd");
            const count = entryMap.get(dateStr)?.length || 0;
            const isTodayFlag = isToday(day);

            // Opacity Logic: 0.3 ~ 1.0 based on activity
            const opacity = count > 0 ? Math.min(0.3 + count * 0.2, 1) : 0;

            return (
              <div
                key={dateStr}
                onClick={(e) => {
                  e.stopPropagation();
                  onDateClick(day);
                }}
                className="flex-1 h-full relative group cursor-pointer border-r border-base-100/10 last:border-0"
              >
                <div
                  className={`absolute inset-0 ${isTodayFlag ? "bg-secondary" : "bg-primary"}`}
                  style={{ opacity: isTodayFlag ? 1 : opacity }}
                />
                {isTodayFlag && (
                  <div className="absolute inset-0 bg-white/30 animate-pulse" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
