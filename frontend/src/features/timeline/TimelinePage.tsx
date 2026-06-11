import { useEffect, useState, useMemo, useCallback } from "react";
import {
  format,
  addDays,
  isSameDay,
  parseISO,
  differenceInDays,
  isValid,
} from "date-fns";
import { zhCN, enUS } from "date-fns/locale";
import { Search, Clock, X, Filter } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { useTranslation } from "../../hooks/useTranslation";
import { entryService } from "../../services/entryService";
import { useEntryNavigation } from "../../hooks/useEntryNavigation";
import DraggableEntryCard from "../../components/DraggableEntryCard";
import { entryEventBus, type MigratePayload } from "../../lib/entryEventBus";

// 动画配置
const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 70, damping: 20 },
  },
};

export default function TimelinePage() {
  const { t, lang } = useTranslation();
  const { handleJump } = useEntryNavigation();
  const dateLocale = lang === "zh" ? zhCN : enUS;

  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [groupedEntries, setGroupedEntries] = useState<Record<string, any[]>>(
    {},
  );

  const glassTheme = {
    primary:
      "bg-indigo-500/15 border-indigo-500/30 text-indigo-600 dark:text-indigo-400",
    primaryBorder: "border-indigo-500/30",
    primaryText: "text-indigo-600 dark:text-indigo-400",
    primaryDot: "bg-indigo-500",
    neutral: "bg-base-content/5 border-base-content/10 text-base-content/40",
    neutralHover: "hover:bg-base-content/10 hover:text-base-content/60",
  };

  // ✅ 核心过滤器
  const isEntryVisible = useCallback((entry: any) => {
    // 必须是 Task
    if (entry.entry_type !== "task") return false;
    // 必须是 Open
    if (entry.status !== "open") return false;
    // 必须有日期
    const dateKey = entry.target_date || entry.date;
    if (!dateKey) return false;

    return true;
  }, []);

  const fetchTimeline = useCallback(async () => {
    try {
      const today = new Date();
      const endDate = addDays(today, 60);

      const data = await entryService.search({
        q: query,
        start_date: format(today, "yyyy-MM-dd"),
        end_date: format(endDate, "yyyy-MM-dd"),
      });

      const groups: Record<string, any[]> = {};
      if (Array.isArray(data)) {
        data.forEach((item: any) => {
          if (!isEntryVisible(item)) return;
          const dateKey = item.target_date || item.date;
          if (!groups[dateKey]) groups[dateKey] = [];
          groups[dateKey].push(item);
        });
      }
      setGroupedEntries(groups);
    } catch (error) {
      console.error("Timeline load failed", error);
    }
  }, [query, isEntryVisible]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(true);
      fetchTimeline().finally(() => setLoading(false));
    }, 400);
    return () => clearTimeout(timer);
  }, [fetchTimeline]);

  // --- EventBus Listeners ---

  const getEntryDate = (entry: any) => {
    const d = entry.target_date || entry.date;
    if (!d) return null;
    return typeof d === "string" ? d.split("T")[0] : format(d, "yyyy-MM-dd");
  };

  useEffect(() => {
    // 统一处理 Create / Update / StatusChange
    const handleBusUpdate = (payload: any) => {
      console.log("Timeline Event Rx:", payload);

      setGroupedEntries((prev) => {
        const next = { ...prev };
        let oldDateKey = null;
        let oldEntry = null;

        // 1. 在现有数据中查找旧条目 (全量扫描)
        for (const k of Object.keys(next)) {
          const found = next[k].find((e) => e.id === payload.id);
          if (found) {
            oldDateKey = k;
            oldEntry = found;
            break;
          }
        }

        // 2. 数据合并 (关键修复：防止部分更新导致信息丢失)
        // 如果找到了旧数据，合并它；如果是新数据，直接用 payload
        const finalEntry = oldEntry ? { ...oldEntry, ...payload } : payload;

        // 3. 判断是否可见
        const isVisible = isEntryVisible(finalEntry);
        const newDateKey = getEntryDate(finalEntry);

        console.log("   -> Merge Result:", {
          id: finalEntry.id,
          type: finalEntry.entry_type,
          status: finalEntry.status,
          isVisible,
        });

        // 4. 执行移除 (如果之前存在)
        // 只要存在旧数据，先移除，稍后如果可见再添加 (处理跨天移动或属性变更)
        if (oldDateKey) {
          next[oldDateKey] = next[oldDateKey].filter(
            (e) => e.id !== payload.id,
          );
          if (next[oldDateKey].length === 0) delete next[oldDateKey];
        }

        // 5. 执行插入 (如果可见且有日期)
        if (isVisible && newDateKey) {
          const list = next[newDateKey] || [];
          // 防止重复 (虽然上面移除了，但如果是新日期，需要确保不重复)
          if (!list.some((e) => e.id === finalEntry.id)) {
            next[newDateKey] = [finalEntry, ...list];
          }
        }

        return next;
      });
    };

    const handleBusDelete = (id: string) => {
      console.log("Timeline Delete Rx:", id);
      setGroupedEntries((prev) => {
        const next = { ...prev };
        let hasChanges = false;
        Object.keys(next).forEach((dateKey) => {
          const originalLen = next[dateKey].length;
          next[dateKey] = next[dateKey].filter((e) => e.id !== id);
          if (next[dateKey].length !== originalLen) {
            hasChanges = true;
            if (next[dateKey].length === 0) delete next[dateKey];
          }
        });
        return hasChanges ? next : prev;
      });
    };

    const handleBusMigrate = (payload: MigratePayload) => {
      console.log("Timeline Migrate Rx:", payload);
      handleBusUpdate(payload.source);
      if (payload.target) {
        handleBusUpdate(payload.target);
      }
    };

    entryEventBus.on("entry:create", handleBusUpdate);
    entryEventBus.on("entry:update", handleBusUpdate);
    entryEventBus.on("entry:status_change", handleBusUpdate);
    entryEventBus.on("entry:delete", handleBusDelete);
    entryEventBus.on("entry:migrate", handleBusMigrate);

    return () => {
      entryEventBus.off("entry:create", handleBusUpdate);
      entryEventBus.off("entry:update", handleBusUpdate);
      entryEventBus.off("entry:status_change", handleBusUpdate);
      entryEventBus.off("entry:delete", handleBusDelete);
      entryEventBus.off("entry:migrate", handleBusMigrate);
    };
  }, [isEntryVisible]);

  // --- Rendering Helpers ---
  const sortedDates = useMemo(() => {
    const dates = Object.keys(groupedEntries);
    const uniqueDates = Array.from(new Set(dates)).filter((d) =>
      isValid(parseISO(d)),
    );
    return uniqueDates.sort();
  }, [groupedEntries]);

  const getDateLabel = (dateStr: string) => {
    if (!isValid(parseISO(dateStr))) return dateStr;
    const date = parseISO(dateStr);
    const today = new Date();
    if (isSameDay(date, today)) return t.common?.today || "Today";
    if (isSameDay(date, addDays(today, 1)))
      return t.timeline?.tomorrow || "Tomorrow";
    return format(date, "EEEE", { locale: dateLocale });
  };

  const getDaysLeft = (dateStr: string) => {
    if (!isValid(parseISO(dateStr))) return 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = parseISO(dateStr);
    return differenceInDays(target, today);
  };

  return (
    <div
      className="flex flex-col w-full h-[100dvh] bg-base-100 overflow-hidden relative overscroll-none"
      style={{ touchAction: "pan-y" }}
    >
      <div className="absolute inset-0 bg-base-100 dark:bg-base-900 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/5 to-transparent pointer-events-none" />

      {/* Header */}
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="shrink-0 z-30 bg-base-100/80 dark:bg-base-900/80 backdrop-blur-xl pt-6 pb-4 border-b border-base-content/5"
      >
        <div className="max-w-4xl mx-auto px-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="select-none">
            <h2
              className={`text-3xl font-serif font-bold flex items-center gap-3 tracking-tight ${glassTheme.primaryText}`}
            >
              <Clock className="opacity-80" strokeWidth={2} size={28} />
              <span className="text-base-content">
                {t.timeline?.title || "Timeline"}
              </span>
            </h2>
            <p className="text-xs font-bold text-base-content/40 font-mono mt-1.5 ml-1 tracking-widest uppercase">
              {t.timeline?.subtitle || "Next 60 Days Overview"}
            </p>
          </div>

          <div className="relative w-full md:w-72 group">
            <div
              className={`
              flex items-center gap-3 px-5 py-3 rounded-full
              border transition-all duration-300
              bg-base-200/40 border-transparent
              focus-within:bg-base-100 focus-within:shadow-xl focus-within:${glassTheme.primaryBorder} focus-within:ring-4 focus-within:ring-indigo-500/5
              dark:bg-base-800/50 dark:focus-within:bg-base-800
            `}
            >
              <Search
                size={18}
                className={`text-base-content/30 group-focus-within:${glassTheme.primaryText} transition-colors`}
              />
              <input
                type="text"
                className="bg-transparent border-none outline-none text-sm w-full placeholder:text-base-content/20 font-medium text-base-content"
                placeholder={t.timeline?.placeholder || "Search timeline..."}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="btn btn-circle btn-ghost btn-xs min-h-0 h-5 w-5 hover:bg-base-content/10"
                >
                  <X size={12} className="text-base-content/50" />
                </button>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Content */}
      <div
        className="flex-1 overflow-y-auto scroll-smooth w-full relative"
        id="timeline-scroll-container"
      >
        <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">
          {loading ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-32 gap-6 opacity-40"
            >
              <div
                className={`loading loading-ring loading-lg ${glassTheme.primaryText}`}
              ></div>
              <span className="text-xs font-mono tracking-widest uppercase text-base-content/50">
                {t.timeline?.loading || "Syncing..."}
              </span>
            </motion.div>
          ) : sortedDates.length === 0 ? (
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5 }}
              className="flex flex-col items-center justify-center py-32 gap-6 select-none"
            >
              <div className="w-24 h-24 bg-base-200/30 rounded-full flex items-center justify-center border border-base-content/5 shadow-inner">
                <Filter size={36} className="text-base-content/10" />
              </div>
              <p className="text-base-content/30 font-serif italic text-lg">
                {query
                  ? t.timeline?.noResults || "No tasks match your filter."
                  : t.timeline?.empty || "Your future is clear."}
              </p>
            </motion.div>
          ) : (
            <motion.ul
              variants={containerVariants}
              initial="hidden"
              animate="show"
              className="timeline timeline-snap-icon max-md:timeline-compact timeline-vertical pb-32"
            >
              <AnimatePresence mode="popLayout">
                {sortedDates.map((dateStr, index) => {
                  const entries = groupedEntries[dateStr] || [];
                  const dateObj = parseISO(dateStr);
                  const isToday = isSameDay(dateObj, new Date());
                  const daysLeft = getDaysLeft(dateStr);
                  const label = getDateLabel(dateStr);

                  return (
                    <motion.li
                      key={dateStr}
                      variants={itemVariants}
                      layout
                      initial="hidden"
                      animate="show"
                      exit="hidden"
                      className="relative group/timeline-item"
                    >
                      {index !== 0 && (
                        <hr className="bg-base-content/10 w-px" />
                      )}

                      <div className="timeline-middle mx-4 md:mx-6">
                        {isToday ? (
                          <div
                            className="relative flex items-center justify-center w-8 h-8 cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleJump(dateStr);
                            }}
                          >
                            <div
                              className={`absolute inset-0 rounded-full ${glassTheme.primaryDot} opacity-20 animate-ping`}
                            />
                            <div
                              className={`absolute inset-0 rounded-full ${glassTheme.primaryDot} opacity-30 blur-[4px]`}
                            />
                            <div
                              className={`relative w-4 h-4 rounded-full ${glassTheme.primaryDot} shadow-[0_0_15px_rgba(99,102,241,0.5)] border-2 border-base-100 dark:border-base-900`}
                            />
                          </div>
                        ) : (
                          <div
                            className={`w-2.5 h-2.5 rounded-full border-[1.5px] border-base-content/20 bg-base-100 dark:bg-base-900 group-hover/timeline-item:${glassTheme.primaryBorder} group-hover/timeline-item:bg-indigo-500/20 transition-all duration-500`}
                          />
                        )}
                      </div>

                      <div
                        className="timeline-start md:text-end mb-8 md:mb-0 pt-0.5 flex flex-col items-start md:items-end cursor-pointer group/date select-none active:scale-95 transition-transform"
                        onClick={() => handleJump(dateStr)}
                      >
                        <div
                          className={`font-serif text-3xl md:text-4xl font-bold leading-none tracking-tight transition-colors duration-300 ${isToday ? `${glassTheme.primaryText} drop-shadow-sm` : `text-base-content/70 group-hover/date:${glassTheme.primaryText}`}`}
                        >
                          {format(dateObj, "MMM dd")}
                        </div>
                        <div className="flex items-center gap-2 mt-2 md:flex-row-reverse flex-wrap justify-end">
                          {isToday ? (
                            <span
                              className={`badge h-6 px-3 rounded-full font-bold text-[11px] tracking-wide border shadow-md shadow-indigo-500/10 backdrop-blur-md transition-all duration-300 cursor-default hover:scale-105 hover:brightness-110 ${glassTheme.primary}`}
                            >
                              {t.timeline?.today || "TODAY"}
                            </span>
                          ) : (
                            daysLeft > 0 && (
                              <span
                                className={`badge h-6 px-3 rounded-full font-mono text-[11px] border backdrop-blur-sm transition-all duration-300 cursor-default shadow-sm hover:scale-105 hover:shadow-md ${glassTheme.neutral} ${glassTheme.neutralHover} hover:border-indigo-500/30 hover:text-indigo-500`}
                              >
                                {daysLeft} {t.timeline?.daysLeft || "days left"}
                              </span>
                            )
                          )}
                          <span className="text-xs font-bold text-base-content/30 uppercase tracking-widest group-hover/date:text-base-content/50 transition-colors">
                            {label}
                          </span>
                        </div>
                      </div>

                      <div className="timeline-end mb-12 w-full max-w-xl">
                        {entries.length > 0 ? (
                          <div className="flex flex-col gap-4">
                            {entries.map((entry) => (
                              <motion.div
                                key={entry.id}
                                whileHover={{ x: 4 }}
                                transition={{ type: "spring", stiffness: 300 }}
                              >
                                <DraggableEntryCard
                                  entry={entry}
                                  refresh={() => {}}
                                  isDragEnabled={false}
                                />
                              </motion.div>
                            ))}
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center py-8 px-6 border-2 border-dashed border-base-content/10 rounded-2xl bg-base-200/20 text-center select-none group/empty hover:border-indigo-500/20 hover:bg-indigo-500/5 transition-all duration-300">
                            <span className="text-sm font-bold text-base-content/30 italic group-hover/empty:text-base-content/50 transition-colors">
                              {t.timeline?.noEntry || "No tasks scheduled."}
                            </span>
                          </div>
                        )}
                      </div>
                      <hr className="bg-base-content/10 w-px" />
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </motion.ul>
          )}

          {!loading && sortedDates.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="flex justify-center -mt-6"
            >
              <div className="px-4 py-1 rounded-full border border-base-content/10 bg-base-100/50 backdrop-blur text-[10px] font-mono text-base-content/30 tracking-widest uppercase">
                {t.timeline?.endOfRange || "End of 60 days"}
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
