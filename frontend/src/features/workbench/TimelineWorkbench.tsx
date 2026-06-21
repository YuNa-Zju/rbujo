import { useCallback, useMemo, useState } from "react";
import {
  addDays,
  differenceInCalendarDays,
  format,
  isSameDay,
  parseISO,
} from "date-fns";
import { zhCN, enUS } from "date-fns/locale";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  Search,
  X,
} from "lucide-react";
import { useModalController } from "../../context/ModalControllerContext";
import { useEntryNavigation } from "../../hooks/useEntryNavigation";
import { useTranslation } from "../../hooks/useTranslation";
import { ENTRY_THEME, type EntryType } from "../../config/entryTheme";
import EntryDisplay from "../entry/EntryDisplay";
import WorkbenchDetail from "./WorkbenchDetail";
import { useTimelineEntries } from "./useTimelineEntries";

export default function TimelineWorkbench() {
  const {
    workbench,
    openWorkbenchEntry,
    returnWorkbenchTimeline,
    setWorkbenchCollapsed,
    setWorkbenchWidth,
  } = useModalController();
  const { t, lang } = useTranslation();
  const { handleJump } = useEntryNavigation();
  const dateLocale = lang === "zh" ? zhCN : enUS;
  const [query, setQuery] = useState("");
  const { loading, groupedEntries, sortedDates } = useTimelineEntries(query);

  const mode = workbench.mode;
  const isTimelineMode = mode === "timeline";
  const isDetailMode = mode === "detail";

  const panelWidth = workbench.collapsed ? 60 : workbench.width;

  const handleResizeStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (workbench.collapsed) return;
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = workbench.width;

      const handleMove = (moveEvent: PointerEvent) => {
        setWorkbenchWidth(startWidth + startX - moveEvent.clientX);
      };
      const handleUp = () => {
        document.removeEventListener("pointermove", handleMove);
        document.removeEventListener("pointerup", handleUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor = "ew-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("pointermove", handleMove);
      document.addEventListener("pointerup", handleUp, { once: true });
    },
    [setWorkbenchWidth, workbench.collapsed, workbench.width],
  );

  const dateLabel = useCallback(
    (dateStr: string) => {
      const date = parseISO(dateStr);
      const today = new Date();
      if (isSameDay(date, today)) return t.common?.today || "Today";
      if (isSameDay(date, addDays(today, 1))) {
        return t.timeline?.tomorrow || "Tomorrow";
      }
      return format(date, "EEEE", { locale: dateLocale });
    },
    [dateLocale, t],
  );

  const totalCount = useMemo(
    () =>
      sortedDates.reduce(
        (count, dateStr) => count + (groupedEntries[dateStr]?.length || 0),
        0,
      ),
    [groupedEntries, sortedDates],
  );

  if (workbench.collapsed) {
    return (
      <aside
        className="relative z-30 flex h-full shrink-0 flex-col items-center border-l border-base-200/70 bg-base-100/90 py-3 shadow-xl shadow-base-content/5 backdrop-blur-xl"
        style={{ width: panelWidth }}
      >
        <button
          type="button"
          className="btn btn-ghost btn-sm h-10 w-10 rounded-2xl p-0 text-base-content/60"
          onClick={() => setWorkbenchCollapsed(false)}
          title="展开时间线"
          aria-label="展开时间线"
        >
          <PanelRightOpen size={18} />
        </button>
        <div className="mt-4 flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Clock size={18} />
        </div>
        <div className="mt-3 [writing-mode:vertical-rl] text-[11px] font-semibold uppercase tracking-normal text-base-content/40">
          Timeline
        </div>
      </aside>
    );
  }

  return (
    <aside
      className="relative z-30 flex h-full shrink-0 flex-col border-l border-base-200/70 bg-base-100/95 shadow-xl shadow-base-content/5 backdrop-blur-xl"
      style={{ width: panelWidth }}
    >
      <div
        className="workbench-resize-handle absolute -left-1 top-0 z-10 h-full w-2 cursor-ew-resize"
        onPointerDown={handleResizeStart}
        aria-hidden
      />

      {isTimelineMode && (
        <div className="flex min-h-0 flex-1 flex-col">
          <header className="border-b border-base-200/70 px-4 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[1.15rem] border border-base-content/5 bg-primary/10 text-primary">
                <Clock size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-serif text-lg font-bold leading-none">
                  {t.timeline?.title || "Timeline"}
                </h2>
                <p className="mt-1 text-xs font-medium text-base-content/40">
                  {totalCount} open tasks
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm h-9 w-9 rounded-2xl p-0 text-base-content/55"
                onClick={() => setWorkbenchCollapsed(true)}
                title="收起"
                aria-label="收起"
              >
                <PanelRightClose size={17} />
              </button>
            </div>

            <label className="mt-3 flex h-10 items-center gap-2 rounded-2xl border border-base-200 bg-base-200/35 px-3 text-sm text-base-content/60">
              <Search size={15} />
              <input
                type="text"
                className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-base-content/30"
                placeholder={t.timeline?.placeholder || "Search timeline..."}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {query && (
                <button
                  type="button"
                  className="rounded-full p-1 hover:bg-base-content/10"
                  onClick={() => setQuery("")}
                  title="清空"
                  aria-label="清空"
                >
                  <X size={13} />
                </button>
              )}
            </label>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto bg-base-200/20 px-4 py-4">
            {loading ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-base-content/45">
                <Loader2 size={22} className="animate-spin" />
                <span className="text-xs font-semibold uppercase tracking-normal">
                  Syncing
                </span>
              </div>
            ) : sortedDates.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-sm text-base-content/45">
                <CalendarDays size={28} />
                <span>{query ? t.timeline?.noResults : t.timeline?.empty}</span>
              </div>
            ) : (
              <div className="space-y-6 pb-8">
                {sortedDates.map((dateStr, index) => {
                  const entries = groupedEntries[dateStr] || [];
                  const date = parseISO(dateStr);
                  const isToday = isSameDay(date, new Date());
                  const daysLeft = differenceInCalendarDays(date, new Date());
                  const isLastDate = index === sortedDates.length - 1;

                  return (
                    <section key={dateStr} className="relative">
                      <div
                        className={`absolute bottom-[-1.5rem] left-2 top-9 w-px bg-base-300/70 ${
                          isLastDate ? "hidden" : ""
                        }`}
                      />
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <button
                          type="button"
                          className="group flex min-w-0 items-center gap-3 text-left"
                          onClick={() => handleJump(dateStr)}
                        >
                          <span
                            className={`h-4 w-4 rounded-full border-2 ${
                              isToday
                                ? "border-primary bg-primary"
                                : "border-base-content/25 bg-base-100"
                            }`}
                          />
                          <span className="min-w-0">
                            <span className="block truncate font-serif text-base font-bold leading-tight">
                              {format(date, "MMM dd", { locale: dateLocale })}
                            </span>
                            <span className="block truncate text-[11px] font-semibold uppercase tracking-normal text-base-content/40">
                              {dateLabel(dateStr)}
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs h-7 min-h-0 rounded-full px-2 text-base-content/45 hover:text-primary"
                          onClick={() => handleJump(dateStr)}
                          title="跳到当天"
                          aria-label="跳到当天"
                        >
                          {daysLeft > 0 && (
                            <span className="font-mono text-[10px]">
                              {daysLeft}d
                            </span>
                          )}
                          <ExternalLink size={12} />
                        </button>
                      </div>

                      <div className="space-y-2 pl-7">
                        {entries.map((entry) => {
                          const theme =
                            ENTRY_THEME[entry.entry_type as EntryType] ||
                            ENTRY_THEME.task;
                          return (
                            <button
                              key={entry.id}
                              type="button"
                              className="relative w-full overflow-hidden rounded-2xl border border-base-200 bg-base-100 px-4 py-3 pl-6 text-left shadow-sm shadow-base-content/5 transition hover:-translate-y-0.5 hover:border-primary/25 hover:bg-primary/5 hover:shadow-md"
                              onClick={() => openWorkbenchEntry(entry)}
                            >
                              <span
                                className={`absolute bottom-3 left-2 top-3 w-1.5 rounded-full ${theme.sideBar}`}
                              />
                              <EntryDisplay
                                content={entry.content || ""}
                                tags={entry.tags || []}
                                status={entry.status || "open"}
                                isTask={entry.entry_type === "task"}
                                entryType={entry.entry_type || "task"}
                                backendSummary={entry.summary}
                                forceCollapse
                                disableOverflowCheck
                                isTagClickable={false}
                                readOnly
                              />
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {isDetailMode && (
        <WorkbenchDetail
          entry={workbench.entry}
          onBack={returnWorkbenchTimeline}
        />
      )}

      <div className="flex h-9 shrink-0 items-center justify-between border-t border-base-200/70 bg-base-100/90 px-3 text-[11px] text-base-content/35">
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full px-2 py-1 hover:bg-base-content/5 hover:text-base-content/60"
          onClick={returnWorkbenchTimeline}
          disabled={isTimelineMode}
        >
          <ChevronLeft size={12} />
          Timeline
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full px-2 py-1 hover:bg-base-content/5 hover:text-base-content/60"
          onClick={() => setWorkbenchCollapsed(true)}
        >
          <ChevronRight size={12} />
          收起
        </button>
      </div>
    </aside>
  );
}
