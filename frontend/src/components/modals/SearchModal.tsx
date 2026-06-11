import { useRef, useState, useEffect, useCallback } from "react";
import {
  Search,
  X,
  Hash,
  Code,
  Sparkles,
  Calendar,
  ArrowRight,
  Loader2,
  SearchX,
  Filter,
} from "lucide-react";
import { ENTRY_THEME, type EntryType } from "../../config/entryTheme";
import { entryService } from "../../services/entryService";
import { useTranslation } from "../../hooks/useTranslation";
import { useEntryNavigation } from "../../hooks/useEntryNavigation";
import { EntryCard } from "../DraggableEntryCard";
import { useAppTheme } from "../../hooks/useAppTheme"; // ✅ 1. 引入 AppTheme
import { entryEventBus } from "../../lib/entryEventBus";
import { EscModalWrapper } from "../common/EscModalWrapper"; // ✅ 2. 引入 EscWrapper

interface Props {
  isOpen: boolean;
  initialQuery?: string | null;
  onClose: () => void;
}

const SearchModal = ({ isOpen, initialQuery, onClose }: Props) => {
  const { t } = useTranslation();
  const { handleJump } = useEntryNavigation();
  const inputRef = useRef<HTMLInputElement>(null);

  // ✅ 3. 获取主题样式
  const { styles, isDark } = useAppTheme();

  // 动画状态
  const [isActive, setIsActive] = useState(false);

  // 搜索状态
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"text" | "regex" | "semantic">("text");
  const [selectedTypes, setSelectedTypes] = useState<EntryType[]>([
    "task",
    "idea",
    "event",
  ]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const pendingJumpRef = useRef<{ date: string | null } | null>(null);

  // --- 初始化与事件监听 ---
  useEffect(() => {
    if (isOpen && typeof initialQuery === "string") {
      setQuery(initialQuery);
    }
  }, [isOpen, initialQuery]);

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => {
        setIsActive(true);
        setTimeout(() => inputRef.current?.focus(), 100);
      });
    } else {
      setIsActive(false);
      const timer = setTimeout(() => {
        setQuery("");
        setResults([]);
        setMode("text");
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleClose = useCallback(() => {
    setIsActive(false);
    setTimeout(() => {
      onClose();
      if (pendingJumpRef.current) {
        handleJump(pendingJumpRef.current.date);
        pendingJumpRef.current = null;
      }
    }, 300);
  }, [onClose, handleJump]);

  const handleJumpToDate = (dateStr: string | null) => {
    pendingJumpRef.current = { date: dateStr || null };
    handleClose();
  };

  // ✅ 4. 移除手动的 ESC 和 CLOSE_MODALS 监听
  // EscModalWrapper 会自动处理这些逻辑

  // --- 搜索逻辑 ---
  const toggleType = (type: EntryType) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  };

  const performSearch = useCallback(async () => {
    if (!query.trim() && !startDate && !endDate) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const data = await entryService.search({
        q: query,
        mode: mode,
        entry_type: selectedTypes.length > 0 ? selectedTypes : undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      });
      setResults(data);
    } catch (e) {
      console.error(e);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query, mode, selectedTypes, startDate, endDate]);

  useEffect(() => {
    if (!isOpen) return;
    if (!query && !startDate && !endDate) {
      setResults([]);
      return;
    }
    const timer = setTimeout(performSearch, 400);
    return () => clearTimeout(timer);
  }, [performSearch, query, isOpen, startDate, endDate]);

  // --- 实时过滤 ---
  const checkEntryMatches = useCallback(
    (entry: any) => {
      if (query) {
        const content = entry.content || "";
        if (mode === "text" || mode === "semantic") {
          if (!content.toLowerCase().includes(query.toLowerCase()))
            return false;
        } else {
          try {
            const regex = new RegExp(query, "i");
            if (!regex.test(content)) return false;
          } catch {
            return false;
          }
        }
      }
      if (selectedTypes.length > 0 && !selectedTypes.includes(entry.entry_type))
        return false;
      return true;
    },
    [query, mode, selectedTypes],
  );

  useEffect(() => {
    if (!isOpen) return;
    const handleUpdate = (updatedEntry: any) => {
      setResults((prev) => {
        const exists = prev.some((e) => e.id === updatedEntry.id);
        const matches = checkEntryMatches(updatedEntry);
        if (exists) {
          return matches
            ? prev.map((e) =>
                e.id === updatedEntry.id ? { ...e, ...updatedEntry } : e,
              )
            : prev.filter((e) => e.id !== updatedEntry.id);
        } else if (matches) {
          return [updatedEntry, ...prev];
        }
        return prev;
      });
    };
    const handleDelete = (id: string) => {
      setResults((prev) => prev.filter((e) => e.id !== id));
    };
    entryEventBus.on("entry:update", handleUpdate);
    entryEventBus.on("entry:status_change", handleUpdate);
    entryEventBus.on("entry:delete", handleDelete);
    return () => {
      entryEventBus.off("entry:update", handleUpdate);
      entryEventBus.off("entry:status_change", handleUpdate);
      entryEventBus.off("entry:delete", handleDelete);
    };
  }, [isOpen, checkEntryMatches]);

  const handleRefresh = () => performSearch();

  // --- 局部样式定义 ---
  const modeBtnActive = isDark
    ? "bg-indigo-500/20 text-indigo-300 shadow-sm"
    : "bg-white text-indigo-600 shadow-sm border border-indigo-50";

  const modeBtnInactive = isDark
    ? "text-slate-500 hover:text-slate-300 hover:bg-white/5"
    : "text-slate-400 hover:text-slate-600 hover:bg-white/60";

  const dateInputStyle = isDark
    ? "text-slate-300 bg-white/5 border-transparent focus-within:bg-white/10"
    : "text-slate-600 bg-white border-indigo-50 focus-within:border-indigo-200 focus-within:shadow-sm";

  const filterContainerStyle = isDark
    ? "bg-[#1e293b]/30 border-white/5"
    : "bg-indigo-50/30 border-indigo-50/50";

  const resultsAreaStyle = isDark ? "bg-[#0f172a]" : "bg-[#f8fafc]";

  return (
    // ✅ 5. 接入 EscModalWrapper
    <EscModalWrapper id="SearchModal" isOpen={isOpen} onClose={handleClose}>
      <div
        className={`fixed inset-0 z-[4950] flex flex-col justify-end sm:justify-center items-center isolation-isolate transition-all duration-300 ${
          isActive
            ? "opacity-100 pointer-events-auto backdrop-blur-sm"
            : "opacity-0 pointer-events-none backdrop-blur-none"
        }`}
      >
        {/* Backdrop */}
        <div
          className={`absolute inset-0 transition-opacity ${styles.backdrop}`}
          onClick={handleClose}
        />

        {/* Modal Box */}
        <div
          className={`
            relative w-full max-w-3xl flex flex-col overflow-hidden
            rounded-t-[2.5rem] sm:rounded-[2rem]
            h-[92vh] sm:h-[82vh]
            transform-gpu transition-transform duration-500 cubic-bezier(0.2, 0.8, 0.2, 1)
            ${styles.modal.base} border
            ${
              isActive
                ? "translate-y-0 scale-100"
                : "translate-y-full sm:translate-y-12 sm:scale-95"
            }
          `}
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          {/* Header */}
          <div
            className={`
              flex flex-col z-10 sticky top-0 backdrop-blur-md border-b transition-colors
              ${styles.modal.header}
            `}
          >
            <div className="p-5 pb-2">
              {/* Search Input Container */}
              <div className={styles.form.inputContainer}>
                <Search className="shrink-0 ml-1 opacity-50" size={22} />
                <input
                  ref={inputRef}
                  type="text"
                  className="flex-1 bg-transparent outline-none text-xl font-medium h-full min-w-0 font-lxgw placeholder:opacity-40"
                  placeholder={t.search?.placeholder || "Search entries..."}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <div className="flex items-center gap-2">
                  {loading && (
                    <Loader2
                      className={`animate-spin ${styles.feedback.loadingSpinner}`}
                      size={20}
                    />
                  )}
                  {query ? (
                    <button
                      onClick={() => setQuery("")}
                      className={styles.form.clearBtn}
                    >
                      <X size={18} />
                    </button>
                  ) : (
                    <button
                      onClick={handleClose}
                      className={`px-2 py-1 rounded-md text-[10px] font-bold opacity-50 hover:opacity-100 transition-all ${isDark ? "bg-white/10" : "bg-black/5"}`}
                    >
                      ESC
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Filters */}
            <div className="px-5 pb-5 flex flex-col gap-3">
              <div
                className={`rounded-2xl p-2 flex flex-col sm:flex-row sm:items-center gap-3 border ${filterContainerStyle}`}
              >
                {/* Mode Toggle */}
                <div className="flex gap-1 shrink-0 self-start sm:self-center">
                  <button
                    onClick={() => setMode("text")}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                      mode === "text" ? modeBtnActive : modeBtnInactive
                    }`}
                  >
                    <Hash size={12} strokeWidth={2.5} />{" "}
                    {t.search?.modeText || "Text"}
                  </button>
                  <button
                    onClick={() => setMode("regex")}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                      mode === "regex" ? modeBtnActive : modeBtnInactive
                    }`}
                  >
                    <Code size={12} strokeWidth={2.5} />{" "}
                    {t.search?.modeRegex || "Regex"}
                  </button>
                  <button
                    onClick={() => setMode("semantic")}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                      mode === "semantic" ? modeBtnActive : modeBtnInactive
                    }`}
                  >
                    <Sparkles size={12} strokeWidth={2.5} />{" "}
                    {t.search?.modeSemantic || "Semantic"}
                  </button>
                </div>

                <div
                  className={`hidden sm:block h-6 w-px mx-1 shrink-0 ${isDark ? "bg-white/10" : "bg-indigo-50/50"}`}
                ></div>

                {/* Entry Types */}
                <div className="flex gap-2 overflow-x-auto no-scrollbar w-full sm:w-auto items-center pb-1 sm:pb-0">
                  {(["task", "idea", "event"] as const).map((type) => {
                    const theme = ENTRY_THEME[type];
                    const isActiveType = selectedTypes.includes(type);
                    return (
                      <button
                        key={type}
                        onClick={() => toggleType(type)}
                        className={`
                          flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold shrink-0 transition-all duration-300 border
                          ${
                            isActiveType
                              ? `${theme.activeBg} ${theme.activeText} ${theme.activeBorder}`
                              : `bg-transparent border-transparent ${isDark ? "text-slate-600 hover:bg-white/5" : "text-slate-400 hover:bg-slate-100"} grayscale opacity-70`
                          }
                        `}
                      >
                        <theme.icon size={12} strokeWidth={2.5} />
                        <span className="whitespace-nowrap">
                          {t.common[type]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Date Filters */}
              <div
                className={`rounded-2xl p-2 flex items-center gap-2 border ${filterContainerStyle}`}
              >
                <div
                  className={`flex-1 relative flex items-center rounded-xl px-3 py-2 transition-all ${dateInputStyle}`}
                >
                  <Calendar
                    size={14}
                    className={`shrink-0 mr-2 ${isDark ? "text-indigo-400" : "text-indigo-300"}`}
                  />
                  <input
                    type="date"
                    className={`bg-transparent text-xs font-mono font-medium focus:outline-none p-0 w-full cursor-pointer min-w-0 font-lxgw ${isDark ? "color-schema-dark" : "color-schema-light"}`}
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    style={{ colorScheme: isDark ? "dark" : "light" }}
                  />
                  {startDate && (
                    <button
                      onClick={() => setStartDate("")}
                      className="ml-1 opacity-40 hover:opacity-100 hover:text-red-500"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
                <ArrowRight size={14} className="opacity-20 shrink-0" />
                <div
                  className={`flex-1 relative flex items-center rounded-xl px-3 py-2 transition-all ${dateInputStyle}`}
                >
                  <input
                    type="date"
                    className={`bg-transparent text-xs font-mono font-medium focus:outline-none p-0 w-full cursor-pointer min-w-0 text-right font-lxgw ${isDark ? "color-schema-dark" : "color-schema-light"}`}
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    style={{ colorScheme: isDark ? "dark" : "light" }}
                  />
                  {endDate ? (
                    <button
                      onClick={() => setEndDate("")}
                      className="ml-1 opacity-40 hover:opacity-100 hover:text-red-500"
                    >
                      <X size={12} />
                    </button>
                  ) : (
                    <div className="w-[18px]"></div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Results */}
          <div
            className={`flex-1 overflow-y-auto p-4 sm:p-6 scroll-smooth ${resultsAreaStyle}`}
          >
            {loading ? (
              <div className="flex flex-col items-center justify-center h-64 gap-4 opacity-60">
                <Loader2
                  size={36}
                  className={`animate-spin ${styles.feedback.loadingSpinner}`}
                />
                <span
                  className={`text-xs font-bold tracking-widest uppercase ${styles.feedback.loadingText}`}
                >
                  {t.tag?.scanning || "Searching..."}
                </span>
              </div>
            ) : results.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full pb-24 gap-6 select-none opacity-60">
                <div
                  className={`p-4 rounded-[2rem] border ${styles.feedback.emptyIconBg}`}
                >
                  {query || startDate || endDate ? (
                    <SearchX size={40} className="opacity-50" />
                  ) : (
                    <Filter size={40} className="opacity-50" />
                  )}
                </div>
                <div className="text-center max-w-xs">
                  <p
                    className={`font-serif font-bold text-xl opacity-60 ${styles.feedback.emptyText}`}
                  >
                    {query || startDate || endDate
                      ? t.tag?.noEntries || "No entries found"
                      : t.search?.openTip || "Start typing to search"}
                  </p>
                  <p
                    className={`text-sm mt-2 opacity-40 ${styles.card.textSecondary}`}
                  >
                    {query || startDate || endDate
                      ? t.tag?.tryDifferent || "Try different keywords."
                      : ""}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-8 pb-20">
                <div className="px-2 flex justify-between items-end">
                  <div
                    className={`text-[10px] font-bold uppercase tracking-[0.2em] ${isDark ? "text-indigo-400" : "text-indigo-300"}`}
                  >
                    {results.length}{" "}
                    {t.search?.results || t.common?.results || "results"}
                  </div>
                </div>

                {results.map((entry) => {
                  const dateStr = entry.date || entry.target_date;
                  return (
                    <div key={entry.id} className="relative group pl-4">
                      <div
                        className={`absolute left-[7px] top-8 bottom-[-32px] w-px group-last:hidden ${styles.timeline.line}`}
                      ></div>

                      <div className="flex items-center justify-between mb-3">
                        <div className="relative z-10">
                          <button
                            onClick={() => handleJumpToDate(dateStr)}
                            className={`
                              flex items-center gap-2 pr-4 pl-3 py-1.5 rounded-full transition-all group/btn
                              ${isDark ? "bg-[#1e293b] text-indigo-300 hover:bg-[#283245]" : "bg-white text-indigo-600 shadow-sm hover:shadow-md hover:-translate-y-0.5 border border-indigo-50"}
                            `}
                          >
                            <div
                              className={`w-1.5 h-1.5 rounded-full ${isDark ? "bg-indigo-400" : "bg-indigo-500"}`}
                            ></div>
                            <span className="text-xs font-mono font-bold">
                              {dateStr ||
                                t.addEntry?.futureLogTitle ||
                                "Future Log"}
                            </span>
                            <ArrowRight
                              size={12}
                              className="opacity-0 -ml-2 group-hover/btn:opacity-100 group-hover/btn:ml-0 transition-all duration-300"
                            />
                          </button>
                        </div>
                      </div>

                      <div className="transform transition-transform hover:translate-x-1 duration-300">
                        <EntryCard
                          entry={entry}
                          refresh={handleRefresh}
                          isDragEnabled={false}
                          forceCollapse={false}
                          isTagClickable={false}
                          className={`
                            transition-all duration-300 shadow-sm
                            ${styles.card.style}
                            ${styles.card.hover}
                          `}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </EscModalWrapper>
  );
};

export default SearchModal;
