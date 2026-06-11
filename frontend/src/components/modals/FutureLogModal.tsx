import { useState, useEffect, useCallback } from "react";
import {
  X,
  CalendarCheck,
  Plus,
  CalendarDays,
  Clock,
  ListTodo,
} from "lucide-react";
import { useTranslation } from "../../hooks/useTranslation";
import { format } from "date-fns";
import { entryService } from "../../services/entryService";
import { zhCN, enUS } from "date-fns/locale";
import DraggableEntryCard from "../DraggableEntryCard";

import {
  entryEventBus,
  type CloseModalsPayload,
  type MigratePayload,
} from "../../lib/entryEventBus";
import { uiEvents } from "../../lib/uiEvents";

type YearGroup = Record<string, any[]>;
type FutureLayout = {
  undetermined: any[];
  months: Record<number, YearGroup>;
};

interface Props {
  onClose: () => void;
}

// ✅ 1. 核心 Hook：监听 <head> 标签上的 data-theme
const useHeadTheme = () => {
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    // 锁定 <head> 标签
    const target = document.documentElement;

    const updateTheme = () => {
      const val = target.getAttribute("data-theme");
      console.log(val);
      // 如果没有值，尝试检测系统偏好，或者默认为 light
      if (val) {
        setTheme(val);
      } else {
        const sysDark = window.matchMedia(
          "(prefers-color-scheme: dark)",
        ).matches;
        setTheme(sysDark ? "dark" : "light");
      }
    };

    updateTheme(); // 初始化

    const observer = new MutationObserver(updateTheme);
    observer.observe(target, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => observer.disconnect();
  }, []);

  return theme;
};

// ✅ FutureLogSection: 极致的毛玻璃卡片
const FutureLogSection = ({
  title,
  yearGroups,
  flatCount,
  icon: Icon,
  className = "",
  emptyText,
  isSpecial = false,
  isDark, // 传入主题状态
}: any) => {
  const years = Object.keys(yearGroups || {}).sort();

  // --- 样式逻辑 (Glassmorphism) ---

  // 容器：极高的透明度 + 强模糊
  const glassContainer = isDark
    ? "bg-[#202020]/40 border-white/5 shadow-inner shadow-white/5" // 暗色玻璃
    : "bg-white/60 border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)]"; // 亮色玻璃

  const containerBase = `
    relative flex flex-col h-full rounded-[1.5rem] transition-all duration-300
    border backdrop-blur-xl
    ${glassContainer}
  `;

  // 头部：更加通透
  const headerBase = `
    p-4 flex justify-between items-center
    border-b ${isDark ? "border-white/5 bg-white/5" : "border-orange-100/30 bg-white/40"}
    rounded-t-[1.5rem]
  `;

  // 图标颜色
  const iconBoxClass = isSpecial
    ? isDark
      ? "bg-amber-500/20 text-amber-400"
      : "bg-amber-100 text-amber-600"
    : isDark
      ? "bg-orange-500/20 text-orange-400"
      : "bg-orange-50 text-orange-400";

  const titleClass = isDark ? "text-stone-200" : "text-stone-600";

  // 空状态
  if (flatCount === 0) {
    return (
      <div
        className={`${containerBase} ${className} opacity-60 hover:opacity-100`}
      >
        <div className={headerBase}>
          <div className="flex items-center gap-2.5">
            <div className={`p-1.5 rounded-lg ${iconBoxClass}`}>
              <Icon size={16} strokeWidth={2} />
            </div>
            <span
              className={`font-bold text-base font-serif capitalize tracking-wide ${titleClass}`}
            >
              {title}
            </span>
          </div>
        </div>

        <div className="flex-1 min-h-[120px] flex flex-col items-center justify-center p-4 gap-3 select-none">
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center ${isDark ? "bg-white/5 text-white/20" : "bg-orange-50/50 text-orange-200"}`}
          >
            <Icon size={20} />
          </div>
          <span
            className={`text-xs font-medium tracking-wide font-lxgw ${isDark ? "text-white/30" : "text-stone-400"}`}
          >
            {emptyText}
          </span>
        </div>
      </div>
    );
  }

  // 有数据状态
  return (
    <div className={`${containerBase} ${className}`}>
      {/* Header */}
      <div className={headerBase}>
        <div className="flex items-center gap-2.5">
          <div className={`p-1.5 rounded-lg ${iconBoxClass}`}>
            <Icon size={16} strokeWidth={2.5} />
          </div>
          <span
            className={`font-bold text-lg font-serif capitalize tracking-tight ${titleClass}`}
          >
            {title}
          </span>
        </div>
        <span
          className={`px-2.5 py-0.5 rounded-full font-mono text-[11px] font-bold border
          ${
            isDark
              ? "bg-white/10 text-orange-200 border-white/5"
              : "bg-orange-100/50 text-orange-600 border-orange-100"
          }`}
        >
          {flatCount}
        </span>
      </div>

      {/* Body */}
      <div className="p-3 flex-1 min-h-[100px] overflow-y-auto max-h-[400px] overscroll-contain custom-scrollbar">
        <div className="flex flex-col gap-5">
          {years.map((year) => (
            <div key={year} className="flex flex-col gap-2">
              {year !== "undefined" && (
                <div className="flex items-center gap-3 px-1 pt-2 pb-1">
                  <div
                    className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-mono font-bold
                    ${isDark ? "bg-white/10 text-white/50" : "bg-stone-100 text-stone-400"}
                  `}
                  >
                    <Clock size={10} />
                    {year}
                  </div>
                  <div
                    className={`h-px flex-1 ${isDark ? "bg-white/10" : "bg-orange-100/50"}`}
                  ></div>
                </div>
              )}
              {yearGroups[year].map((i: any) => (
                <DraggableEntryCard
                  key={i.id}
                  entry={i}
                  refresh={() => {}}
                  isDragEnabled={false}
                  // ✅ 卡片样式：适配玻璃背景
                  className={`
                    !backdrop-blur-none
                    ${
                      isDark
                        ? "!bg-[#2a2725]/80 !border-white/5 !text-stone-200 hover:!bg-[#35312e]"
                        : "!bg-white/90 !border-orange-100/50 !text-stone-700 hover:!border-orange-200"
                    }
                    !shadow-sm
                  `}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const FutureLogModal = ({ onClose }: Props) => {
  const { t, lang } = useTranslation();

  // ✅ 获取主题状态 (dark | light)
  const currentTheme = useHeadTheme();
  const isDark = currentTheme === "dark";

  const dateLocale = lang === "zh" ? zhCN : enUS;

  const [isActive, setIsActive] = useState(false);
  const [layout, setLayout] = useState<FutureLayout>({
    undetermined: [],
    months: {},
  });
  const monthIndexes = Array.from({ length: 12 }, (_, i) => i);

  useEffect(() => {
    requestAnimationFrame(() => {
      setIsActive(true);
      fetchFutureLog();
    });
  }, []);

  const handleClose = useCallback(() => {
    setIsActive(false);
    setTimeout(() => {
      onClose();
    }, 300);
  }, [onClose]);

  // --- 数据逻辑 (保持不变) ---
  const removeEntryFromLayout = (
    currentLayout: FutureLayout,
    id: string,
  ): FutureLayout => {
    const nextMonths: Record<number, YearGroup> = {};
    Object.keys(currentLayout.months).forEach((k) => {
      const key = Number(k);
      const group = currentLayout.months[key];
      const newGroup: YearGroup = {};
      let hasChanges = false;
      Object.keys(group || {}).forEach((year) => {
        const originalList = group[year];
        const newList = originalList.filter((e: any) => e.id !== id);
        if (newList.length > 0) newGroup[year] = newList;
        if (newList.length !== originalList.length) hasChanges = true;
      });
      nextMonths[key] = hasChanges ? newGroup : group;
    });
    return {
      undetermined: currentLayout.undetermined.filter((e) => e.id !== id),
      months: nextMonths,
    };
  };

  const addToLayoutStruct = (targetLayout: FutureLayout, entry: any) => {
    const tm = entry.target_month;
    if (!tm || tm === "undetermined") {
      if (!targetLayout.undetermined.some((e) => e.id === entry.id)) {
        targetLayout.undetermined = [entry, ...targetLayout.undetermined];
      }
      return;
    }
    try {
      const [yearStr, monthStr] = tm.split("-");
      const monthIndex = parseInt(monthStr, 10) - 1;
      if (monthIndex >= 0 && monthIndex <= 11) {
        if (!targetLayout.months[monthIndex])
          targetLayout.months[monthIndex] = {};
        const currentYearGroup = { ...targetLayout.months[monthIndex] };
        const list = currentYearGroup[yearStr] || [];
        if (!list.some((e) => e.id === entry.id)) {
          currentYearGroup[yearStr] = [entry, ...list];
          targetLayout.months[monthIndex] = currentYearGroup;
        }
      }
    } catch (e) {
      console.error("Error parsing target_month", entry);
    }
  };

  const fetchFutureLog = async () => {
    try {
      const allItems = await entryService.getFutureLog();
      const newLayout: FutureLayout = { undetermined: [], months: {} };
      monthIndexes.forEach((idx) => {
        newLayout.months[idx] = {};
      });
      if (Array.isArray(allItems)) {
        allItems.forEach((item: any) => addToLayoutStruct(newLayout, item));
      }
      setLayout(newLayout);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    const handleUpdate = (updatedEntry: any) => {
      setLayout((prev) => {
        const next = removeEntryFromLayout(prev, updatedEntry.id);
        const isFuture =
          updatedEntry.target_month ||
          updatedEntry.is_future ||
          ["future", "migrated_future"].includes(updatedEntry.status);
        if (isFuture) addToLayoutStruct(next, updatedEntry);
        return next;
      });
    };
    const handleDelete = (id: string) =>
      setLayout((prev) => removeEntryFromLayout(prev, id));
    const handleMigrate = (payload: MigratePayload) => {
      setLayout((prev) => {
        let next = removeEntryFromLayout(prev, payload.source.id);
        if (payload.target) {
          const targetEntry = payload.target;
          next = removeEntryFromLayout(next, targetEntry.id);
          const isFuture =
            targetEntry.target_month ||
            ["future", "migrated_future"].includes(targetEntry.status);
          if (isFuture) addToLayoutStruct(next, targetEntry);
        }
        return next;
      });
    };
    entryEventBus.on("entry:create", handleUpdate);
    entryEventBus.on("entry:update", handleUpdate);
    entryEventBus.on("entry:status_change", handleUpdate);
    entryEventBus.on("entry:delete", handleDelete);
    entryEventBus.on("entry:migrate", handleMigrate);
    const handleCloseSignal = (data?: CloseModalsPayload) => {
      if (data?.except?.includes("FutureLogModal")) return;
      handleClose();
    };
    entryEventBus.on("window:close_all_modals", handleCloseSignal);
    return () => {
      entryEventBus.off("entry:create", handleUpdate);
      entryEventBus.off("entry:update", handleUpdate);
      entryEventBus.off("entry:status_change", handleUpdate);
      entryEventBus.off("entry:delete", handleDelete);
      entryEventBus.off("entry:migrate", handleMigrate);
      entryEventBus.off("window:close_all_modals", handleCloseSignal);
    };
  }, [handleClose]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [handleClose]);

  const filterEntries = (entries: any[]) => {
    return entries.filter((entry) => {
      return entry.status === "open" || entry.status === "future";
    });
  };
  const filterYearGroup = (group: YearGroup) => {
    const newGroup: YearGroup = {};
    Object.keys(group).forEach((year) => {
      const filteredList = filterEntries(group[year]);
      if (filteredList.length > 0) newGroup[year] = filteredList;
    });
    return newGroup;
  };

  const filteredUndetermined = filterEntries(layout.undetermined);
  const undeterminedCount = filteredUndetermined.length;

  return (
    <div
      className={`fixed inset-0 z-[5000] flex flex-col justify-end sm:justify-center items-center isolation-isolate transition-all duration-500 ease-out ${
        isActive
          ? "opacity-100 pointer-events-auto backdrop-blur-sm"
          : "opacity-0 pointer-events-none backdrop-blur-none"
      }`}
    >
      <div
        className="absolute inset-0 bg-stone-200/30 dark:bg-black/60 transition-opacity duration-500"
        onClick={handleClose}
      />

      {/* ✅ 主模态框：Glassmorphism */}
      <div
        className={`
            relative w-full sm:w-11/12 max-w-6xl flex flex-col
            overflow-hidden
            rounded-t-[2.5rem] sm:rounded-[2rem]
            h-[92dvh] sm:h-[85vh]
            transform-gpu transition-transform duration-500 cubic-bezier(0.2, 0.8, 0.2, 1)

            /* Glass Effect Background */
            ${
              isDark
                ? "bg-[#101010]/80 border-white/10 shadow-black/80"
                : "bg-white/80 border-white/40 shadow-orange-900/10"
            }
            backdrop-blur-2xl border

            ${isActive ? "translate-y-0 scale-100" : "translate-y-full sm:translate-y-24 sm:scale-95"}
        `}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* Header Section */}
        <div
          className={`
            px-6 py-5 flex justify-between items-center z-30 shrink-0 sticky top-0
            border-b backdrop-blur-md
            ${
              isDark
                ? "bg-[#101010]/50 border-white/5"
                : "bg-white/50 border-orange-100/30"
            }
        `}
        >
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-2xl shadow-sm border ${
                isDark
                  ? "bg-white/5 border-white/5 text-orange-400"
                  : "bg-gradient-to-br from-orange-100 to-amber-50 border-orange-100/50 text-orange-600"
              }`}
            >
              <CalendarCheck size={22} strokeWidth={2.5} />
            </div>
            <div className="flex flex-col">
              <h3
                className={`font-black text-xl font-serif tracking-tight ${isDark ? "text-stone-100" : "text-stone-800"}`}
              >
                {t.futureLog?.title || "Future Log"}
              </h3>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 items-center">
            <button
              className={`btn btn-sm h-10 px-5 rounded-full border-0 shadow-lg gap-2 transition-transform active:scale-95
                ${isDark ? "bg-orange-600 hover:bg-orange-500 text-white shadow-orange-500/10" : "bg-orange-500 hover:bg-orange-600 text-white shadow-orange-500/20"}
              `}
              onClick={() =>
                uiEvents.emit("OPEN_ADD_ENTRY", { mode: "future" })
              }
            >
              <Plus size={18} strokeWidth={3} />
              <span className="hidden sm:inline font-bold">
                {t.addEntry?.create}
              </span>
            </button>

            <button
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors
                ${isDark ? "bg-white/10 hover:bg-white/20 text-stone-300" : "bg-stone-100 hover:bg-stone-200 text-stone-500"}
              `}
              onClick={handleClose}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div
          className="flex-1 overflow-y-auto px-4 sm:px-8 pt-6 pb-20 scroll-smooth"
          style={{
            touchAction: "pan-y",
            overscrollBehavior: "contain",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {/* ✅ 布局修改：大屏限制为两列 (lg:grid-cols-2) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6 pb-10">
            {/* Someday / Undetermined Box - Full Width */}
            <div className="col-span-1 md:col-span-2">
              <FutureLogSection
                // 传入主题状态
                isDark={isDark}
                className={
                  isDark
                    ? "bg-amber-900/10 border-dashed border-amber-500/20"
                    : "bg-amber-50/40 border-dashed border-amber-200"
                }
                title={t.futureLog.undetermined}
                yearGroups={{ undefined: filteredUndetermined }}
                flatCount={undeterminedCount}
                icon={ListTodo}
                isSpecial={true}
                emptyText={t.futureLog.emptySomeday}
              />
            </div>

            {/* Monthly Grid */}
            {monthIndexes.map((idx) => {
              const dummyDate = new Date(new Date().getFullYear(), idx, 1);
              const title = format(dummyDate, "MMMM", { locale: dateLocale });
              const filteredYearGroups = filterYearGroup(
                layout.months[idx] || {},
              );
              const totalCount = Object.values(filteredYearGroups).reduce(
                (acc, curr) => acc + curr.length,
                0,
              );
              return (
                <FutureLogSection
                  key={idx}
                  isDark={isDark} // 传入主题状态
                  title={title}
                  yearGroups={filteredYearGroups}
                  flatCount={totalCount}
                  icon={CalendarDays}
                  emptyText={t.futureLog.emptyMonth}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FutureLogModal;
