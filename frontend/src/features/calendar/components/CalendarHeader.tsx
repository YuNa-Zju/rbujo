import {
  ChevronLeft,
  ChevronRight,
  Calendar, // ✅ 回到今日：使用日历图标
  ListTodo, // ✅ FutureLog：使用 Todo 列表图标
  Search,
} from "lucide-react";
import { format } from "date-fns";
import { useTranslation } from "../../../hooks/useTranslation";
import { zhCN, enUS } from "date-fns/locale";
import UserMenu from "./UserMenu";

interface Props {
  currentDate: Date;
  viewMode: "year" | "month" | "week";
  onViewModeChange: (mode: "year" | "month" | "week") => void;
  onNav: (dir: "prev" | "next") => void;
  onToday: () => void;
  onFutureLog: () => void;
  onSearch: () => void;
}

export default function CalendarHeader({
  currentDate,
  viewMode,
  onViewModeChange,
  onNav,
  onToday,
  onFutureLog,
  onSearch,
}: Props) {
  const { t, lang } = useTranslation();
  const dateLocale = lang === "zh" ? zhCN : enUS;

  return (
    <div className="flex-none h-16 flex items-center justify-between px-2 sm:px-4 border-b border-base-200 bg-base-100 z-50">
      <div className="w-10"></div> {/* Spacer */}
      {/* Title & View Switcher */}
      <div
        className="flex flex-col items-center cursor-pointer active:opacity-70 select-none group"
        onClick={() => {
          if (viewMode === "year") onViewModeChange("month");
          else onViewModeChange("year");
        }}
      >
        <span className="text-xl font-serif font-bold leading-none capitalize group-hover:text-primary transition-colors">
          {viewMode === "year"
            ? format(currentDate, "yyyy")
            : format(currentDate, "MMMM yyyy", { locale: dateLocale })}
        </span>
        <span className="text-[10px] text-base-content/40 uppercase tracking-widest mt-0.5 font-bold">
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
      </div>
      {/* Actions */}
      <div className="flex items-center gap-1">
        <div className="hidden md:flex items-center bg-base-200/50 rounded-full p-0.5 border border-base-content/5 mr-2">
          <button
            className="btn btn-ghost btn-circle btn-xs hover:bg-base-300"
            onClick={() => onNav("prev")}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            className="btn btn-ghost btn-circle btn-xs hover:bg-base-300"
            onClick={() => onNav("next")}
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <button
          className="btn btn-sm btn-ghost btn-square text-primary"
          onClick={onToday}
          title="Back to Today" // 更新 tooltip
        >
          {/* ✅ 优化：使用 Calendar 图标代表“今日/当前” */}
          <Calendar size={20} strokeWidth={2.5} />
        </button>
        <button
          // ✅ 优化：颜色改为深琥珀色 (amber-600)，比 yellow 更深邃高级
          className="btn btn-sm btn-ghost btn-square text-amber-600 hover:bg-amber-50"
          onClick={onFutureLog}
          title="Future Log"
        >
          {/* ✅ 优化：使用 ListTodo 图标代表 Future Log 待办 */}
          <ListTodo size={20} strokeWidth={2.5} />
        </button>
        <button
          className="btn btn-sm btn-ghost btn-square text-base-content/70"
          onClick={onSearch}
          title="Search"
        >
          <Search size={20} />
        </button>
        <UserMenu />
      </div>
    </div>
  );
}
