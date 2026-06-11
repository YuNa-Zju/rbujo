import {
  useEffect,
  useState,
  useMemo,
  useCallback,
  forwardRef,
  useImperativeHandle,
  useRef,
} from "react";
import { useLocation } from "react-router-dom";
import {
  format,
  addDays,
  isSameDay,
  parseISO,
  differenceInDays,
  isValid,
} from "date-fns";
import { zhCN, enUS } from "date-fns/locale";
import { Search, Clock, X, Filter, CalendarDays } from "lucide-react";

import { useTranslation } from "../../hooks/useTranslation";
import { entryService } from "../../services/entryService";
import { useEntryNavigation } from "../../hooks/useEntryNavigation";
import DraggableEntryCard from "../DraggableEntryCard";
import { entryEventBus, type MigratePayload } from "../../lib/entryEventBus";
import { useAppTheme } from "../../hooks/useAppTheme"; // ✅ 1. 引入 Theme Hook
import { EscModalWrapper } from "../common/EscModalWrapper"; // ✅ 2. 引入 EscWrapper

export interface TimelineModalRef {
  open: () => void;
  close: () => void;
}

const TimelineModal = forwardRef<TimelineModalRef, any>((_, ref) => {
  const { t, lang } = useTranslation();
  const { handleJump } = useEntryNavigation();
  const dateLocale = lang === "zh" ? zhCN : enUS;
  const location = useLocation();

  // ✅ 3. 获取样式
  const { styles } = useAppTheme();

  // --- 状态管理 ---

  // 1. 挂载与动画状态
  const [isMounted, setIsMounted] = useState(false);
  const [isActive, setIsActive] = useState(false);

  // 2. 数据状态
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [groupedEntries, setGroupedEntries] = useState<Record<string, any[]>>(
    {},
  );

  // 3. 引用与 DOM
  const pendingJumpRef = useRef<string | null>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(
    null,
  );

  // 初始化 Portal 容器
  useEffect(() => {
    setPortalContainer(document.getElementById("modal-root"));
  }, []);

  // --- 业务逻辑 ---

  // 判断条目是否应在时间轴显示
  const isEntryVisible = useCallback((entry: any) => {
    if (entry.entry_type !== "task") return false;
    if (entry.status !== "open") return false;
    // 必须有目标日期
    const dateKey = entry.target_date || entry.date;
    return !!dateKey;
  }, []);

  // 获取 API 数据
  const fetchTimeline = useCallback(async () => {
    if (!isMounted) return;

    setLoading(true);
    try {
      const today = new Date();
      const endDate = addDays(today, 60); // 获取未来 60 天

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
    } finally {
      setLoading(false);
    }
  }, [query, isEntryVisible, isMounted]);

  // --- 打开/关闭控制 ---

  const openModal = useCallback(() => {
    pendingJumpRef.current = null;
    if (isMounted) return;

    setIsMounted(true);

    // 双重 RAF 确保 DOM 挂载后再触发动画类名
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsActive(true);
      });
    });
  }, [isMounted]);

  const closeModal = useCallback(() => {
    setIsActive(false); // 触发退出动画

    // 等待动画结束后卸载组件
    setTimeout(() => {
      setIsMounted(false);
      setQuery(""); // 清空搜索

      // 处理待执行的跳转
      if (pendingJumpRef.current) {
        handleJump(pendingJumpRef.current);
        pendingJumpRef.current = null;
      }
    }, 300);
  }, [handleJump]);

  // 暴露给父组件的方法
  useImperativeHandle(ref, () => ({
    open: openModal,
    close: closeModal,
  }));

  // --- 副作用监听 ---

  // 1. 路由变化时自动关闭
  useEffect(() => {
    if (isMounted) closeModal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // ✅ 4. 移除 entryEventBus 和 window keydown 监听
  // 因为 EscModalWrapper 会自动处理 ESC 按键和全局关闭信号

  // 2. 防抖搜索 + 初始数据加载
  useEffect(() => {
    if (!isMounted) return;

    const timer = setTimeout(() => {
      fetchTimeline();
    }, 400);

    return () => clearTimeout(timer);
  }, [fetchTimeline, query, isMounted]);

  // --- EventBus 数据同步逻辑 (完整版) ---

  const getEntryDate = (entry: any) => {
    const d = entry.target_date || entry.date;
    if (!d) return null;
    return typeof d === "string" ? d.split("T")[0] : format(d, "yyyy-MM-dd");
  };

  useEffect(() => {
    if (!isMounted) return;

    // 处理新增/更新
    const handleBusUpdate = (payload: any) => {
      setGroupedEntries((prev) => {
        const next = { ...prev };
        let oldDateKey = null;
        let oldEntry = null;

        // 1. 在现有列表中查找该条目（为了处理日期变更的情况）
        for (const k of Object.keys(next)) {
          const found = next[k].find((e) => e.id === payload.id);
          if (found) {
            oldDateKey = k;
            oldEntry = found;
            break;
          }
        }

        // 2. 合并最新数据
        const finalEntry = oldEntry ? { ...oldEntry, ...payload } : payload;
        const isVisible = isEntryVisible(finalEntry);
        const newDateKey = getEntryDate(finalEntry);

        // 3. 如果之前存在，先移除（因为可能日期变了，或者状态变为不可见）
        if (oldDateKey) {
          next[oldDateKey] = next[oldDateKey].filter(
            (e) => e.id !== payload.id,
          );
          if (next[oldDateKey].length === 0) delete next[oldDateKey];
        }

        // 4. 如果当前可见且有日期，添加到对应分组
        if (isVisible && newDateKey) {
          const list = next[newDateKey] || [];
          // 防止重复添加
          if (!list.some((e) => e.id === finalEntry.id)) {
            next[newDateKey] = [finalEntry, ...list];
          } else {
            // 如果已存在（同一天更新内容），则替换
            next[newDateKey] = list.map((e) =>
              e.id === finalEntry.id ? finalEntry : e,
            );
          }
        }

        return next;
      });
    };

    // 处理删除
    const handleBusDelete = (id: string) => {
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

    // 处理迁移
    const handleBusMigrate = (payload: MigratePayload) => {
      // 迁移源通常会变为 completed/migrated，可能会从 timeline 消失
      handleBusUpdate(payload.source);
      // 迁移目标是新条目，可能会出现在 timeline
      if (payload.target) handleBusUpdate(payload.target);
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
  }, [isEntryVisible, isMounted]);

  // --- 辅助计算 ---

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

  const handleSafeJump = (dateStr: string) => {
    pendingJumpRef.current = dateStr;
    closeModal();
  };

  if (!isMounted || !portalContainer) return null;

  return (
    // ✅ 5. 接入 EscModalWrapper
    <EscModalWrapper id="TimelineModal" isOpen={isMounted} onClose={closeModal}>
      <div
        className={`fixed inset-0 z-[5000] flex flex-col justify-end sm:flex-row sm:justify-end items-center sm:items-stretch isolation-isolate transition-all duration-500 ease-out ${
          isActive
            ? "opacity-100 pointer-events-auto backdrop-blur-sm"
            : "opacity-0 pointer-events-none backdrop-blur-none"
        }`}
      >
        {/* Backdrop */}
        <div
          className={`absolute inset-0 transition-opacity duration-500 ${styles.backdrop}`}
          onClick={closeModal}
        />

        {/* Modal Box */}
        <div
          className={`
            ${styles.modal.layout} h-[92dvh]
            ${styles.modal.base}
            rounded-t-[2rem] sm:rounded-none sm:rounded-l-3xl sm:w-[480px] sm:h-full sm:max-h-none border-l
            transform-gpu transition-transform duration-500 cubic-bezier(0.2, 0.8, 0.2, 1)
            ${
              isActive
                ? "translate-y-0 sm:translate-x-0"
                : "translate-y-full sm:translate-y-0 sm:translate-x-full"
            }
          `}
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          {/* Header */}
          <div className={styles.modal.header}>
            <div className="flex justify-between items-center">
              <h2
                className={`text-2xl font-serif font-bold flex items-center gap-3 tracking-tight ${styles.modal.title}`}
              >
                <div
                  className={`p-2.5 rounded-2xl border shadow-sm ${styles.modal.iconBox}`}
                >
                  <Clock strokeWidth={2.5} size={22} />
                </div>
                <span
                  className={`text-transparent bg-clip-text bg-gradient-to-br ${styles.timeline.titleGradient}`}
                >
                  {t.timeline?.title || "Timeline"}
                </span>
              </h2>
              <button onClick={closeModal} className={styles.modal.closeBtn}>
                <X size={22} />
              </button>
            </div>

            {/* Search Bar */}
            <div className={styles.form.inputContainer}>
              <Search size={18} className="opacity-70" />
              <input
                type="text"
                className={styles.form.input}
                placeholder={t.timeline?.placeholder || "Search timeline..."}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className={styles.form.clearBtn}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* List Content */}
          <div
            className="flex-1 overflow-y-auto scroll-smooth w-full relative p-4 pb-20 sm:px-6"
            style={{
              touchAction: "pan-y",
              overscrollBehavior: "contain",
              WebkitOverflowScrolling: "touch",
            }}
          >
            {loading ? (
              <div className="flex flex-col items-center justify-center py-24 gap-4 opacity-60">
                <div
                  className={`loading loading-ring loading-md ${styles.feedback.loadingSpinner}`}
                ></div>
                <span
                  className={`text-xs font-bold tracking-widest uppercase ${styles.feedback.loadingText}`}
                >
                  Syncing...
                </span>
              </div>
            ) : sortedDates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 gap-4 select-none opacity-60">
                <div
                  className={`p-4 rounded-full ${styles.feedback.emptyIconBg}`}
                >
                  <Filter size={32} />
                </div>
                <p
                  className={`font-serif italic text-sm ${styles.feedback.emptyText}`}
                >
                  {query ? t.timeline?.noResults : t.timeline?.empty}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-8 pt-2">
                {sortedDates.map((dateStr) => {
                  const entries = groupedEntries[dateStr] || [];
                  const dateObj = parseISO(dateStr);
                  const isToday = isSameDay(dateObj, new Date());
                  const daysLeft = differenceInDays(
                    dateObj,
                    new Date().setHours(0, 0, 0, 0),
                  );

                  return (
                    <div key={dateStr} className="relative group">
                      {/* Line Connector */}
                      <div
                        className={`absolute left-[7.5px] top-8 bottom-[-32px] w-px group-last:hidden ${styles.timeline.line}`}
                      ></div>

                      {/* Date Header */}
                      <div
                        className="flex items-center justify-between mb-3 cursor-pointer select-none"
                        onClick={() => handleSafeJump(dateStr)}
                      >
                        <div className="flex items-center gap-4">
                          {/* Dot (Only Ring) */}
                          <div
                            className={
                              isToday
                                ? styles.timeline.dotToday
                                : styles.timeline.dotNormal
                            }
                          ></div>

                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <span
                                className={`font-serif text-xl font-bold leading-none tracking-tight transition-colors ${
                                  isToday
                                    ? styles.timeline.dateToday
                                    : styles.timeline.dateMain
                                }`}
                              >
                                {format(dateObj, "MMM dd")}
                              </span>
                              {isToday && (
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${styles.timeline.todayBadge}`}
                                >
                                  Today
                                </span>
                              )}
                            </div>
                            <span
                              className={`text-[11px] font-bold uppercase tracking-widest mt-0.5 ${styles.timeline.dateSub}`}
                            >
                              {getDateLabel(dateStr)}
                            </span>
                          </div>
                        </div>
                        {daysLeft > 0 && (
                          <div
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-medium ${styles.timeline.daysLeftBadge}`}
                          >
                            <CalendarDays size={10} />
                            <span>
                              {daysLeft} {t.timeline?.daysLeft || "days left"}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Entries */}
                      <div className="flex flex-col gap-3 pl-8">
                        {entries.map((entry) => (
                          <div
                            key={entry.id}
                            className="transform transition-transform hover:translate-x-1 duration-300"
                          >
                            <DraggableEntryCard
                              entry={entry}
                              refresh={() => {}}
                              isDragEnabled={false}
                              className={`
                                transition-all duration-300
                                ${styles.card.style}
                                ${styles.card.hover}
                              `}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}

                <div className="flex justify-center py-12 opacity-70">
                  <div className={styles.timeline.endMarker}>
                    <span>●</span>
                    <span>{t.timeline?.endOfRange || "End of 60 days"}</span>
                    <span>●</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </EscModalWrapper>
  );
});

export default TimelineModal;
