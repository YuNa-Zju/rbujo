import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { addDays, format, parseISO } from "date-fns";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Circle,
  Edit3,
  ExternalLink,
  FileText,
  Hash,
  Link2,
  Loader2,
  RotateCcw,
  Save,
  Tag,
  Undo2,
  XCircle,
} from "lucide-react";
import MarkdownViewer from "../../components/MarkdownViewer";
import MarkdownToolbar from "../../components/shared/MarkdownToolbar";
import TagInput from "../../components/shared/TagInput";
import TypeSelector from "../../components/shared/TypeSelector";
import { ENTRY_THEME, type EntryType } from "../../config/entryTheme";
import { useTagCache } from "../../context/TagCacheContext";
import { useEntryNavigation } from "../../hooks/useEntryNavigation";
import { entryEventBus, type MigratePayload } from "../../lib/entryEventBus";
import { entryService } from "../../services/entryService";
import { canToggleEntryStatus } from "../entry/entryStatusPolicy";
import EntryDisplay from "../entry/EntryDisplay";
import { useEntryActions } from "../entry/useEntryActions";
import {
  FUTURE_TARGET_CUSTOM,
  FUTURE_TARGET_UNDETERMINED,
  buildFutureTargetOptions,
  resolveFutureTargetMonth,
  type FutureTargetValue,
} from "./workbenchScheduleModel";
import {
  buildInspectorDraft,
  buildInspectorUpdatePayload,
  createInspectorStack,
  getInspectorDisplayText,
  getInspectorRouteTarget,
  mergeInspectorEntry,
  moveInspectorStack,
  pushInspectorStack,
  type InspectorDraft,
} from "../entry/entryInspectorModel";

interface WorkbenchDetailProps {
  entry: any | null;
  onBack: () => void;
}

const EMPTY_ENTRY = {
  id: "",
  content: "",
  entry_type: "task",
  status: "open",
  tags: [],
};

const statusOptions = [
  {
    value: "open",
    label: "Open",
    icon: Circle,
    selectedClass:
      "border-primary/25 bg-primary/10 text-primary shadow-sm shadow-primary/10",
  },
  {
    value: "completed",
    label: "Done",
    icon: CheckCircle2,
    selectedClass:
      "border-success/25 bg-success/10 text-success shadow-sm shadow-success/10",
  },
  {
    value: "cancelled",
    label: "Cancelled",
    icon: XCircle,
    selectedClass:
      "border-error/25 bg-error/10 text-error shadow-sm shadow-error/10",
  },
];

const normalizeTag = (value: string) =>
  value
    .trim()
    .replace(/^#+/, "")
    .replace(/^[,，;；:：\s]+|[,，;；:：\s]+$/g, "");

const getDefaultMigrateDate = (entry: any) => {
  let baseDate = new Date();
  if (entry?.target_date) baseDate = parseISO(entry.target_date);
  else if (entry?.date) baseDate = parseISO(entry.date);
  return format(addDays(baseDate, 1), "yyyy-MM-dd");
};

const currentMonthValue = () => format(new Date(), "yyyy-MM");

const getDefaultFutureTargetValue = (entry: any): FutureTargetValue => {
  if (entry?.is_future && !entry?.target_month) return FUTURE_TARGET_UNDETERMINED;
  return entry?.target_month || currentMonthValue();
};

export default function WorkbenchDetail({
  entry,
  onBack,
}: WorkbenchDetailProps) {
  const [activeEntry, setActiveEntry] = useState<any | null>(entry);
  const [related, setRelated] = useState<any[]>([]);
  const [entryStack, setEntryStack] = useState(() =>
    createInspectorStack(entry),
  );
  const [loadingRelated, setLoadingRelated] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<InspectorDraft>(() =>
    buildInspectorDraft(entry),
  );
  const [tagDraft, setTagDraft] = useState("");
  const [tagInputFocused, setTagInputFocused] = useState(false);
  const [highlightedTagSuggestionIndex, setHighlightedTagSuggestionIndex] =
    useState(-1);
  const [inlineScheduleMode, setInlineScheduleMode] = useState<
    "migrate" | "future" | null
  >(null);
  const [dateInput, setDateInput] = useState(() => getDefaultMigrateDate(entry));
  const [futureTargetValue, setFutureTargetValue] = useState<FutureTargetValue>(
    () => getDefaultFutureTargetValue(entry),
  );
  const [customFutureMonth, setCustomFutureMonth] = useState(
    () => entry?.target_month || currentMonthValue(),
  );
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { handleJump } = useEntryNavigation();
  const { allTags, refreshTags } = useTagCache();
  const futureTargetOptions = useMemo(() => buildFutureTargetOptions(), []);

  const refreshEntryViews = useCallback(() => {
    entryEventBus.emit("entry:reload_needed");
  }, []);

  const entryActions = useEntryActions(
    activeEntry || EMPTY_ENTRY,
    refreshEntryViews,
    {},
  );

  const routeTarget = useMemo(
    () => getInspectorRouteTarget(activeEntry),
    [activeEntry],
  );

  const theme = useMemo(() => {
    if (!activeEntry) return ENTRY_THEME.task;
    return (
      ENTRY_THEME[activeEntry.entry_type as EntryType] || ENTRY_THEME.task
    );
  }, [activeEntry]);

  const showEntry = useCallback((nextEntry: any | null) => {
    setActiveEntry(nextEntry);
    setRelated([]);
    setIsEditing(false);
    setSaving(false);
    setDraft(buildInspectorDraft(nextEntry));
    setTagDraft("");
    setTagInputFocused(false);
    setHighlightedTagSuggestionIndex(-1);
    setInlineScheduleMode(null);
    setDateInput(getDefaultMigrateDate(nextEntry));
    setFutureTargetValue(getDefaultFutureTargetValue(nextEntry));
    setCustomFutureMonth(nextEntry?.target_month || currentMonthValue());
  }, []);

  const canEdit = Boolean(activeEntry?.id) && !activeEntry?.archived_at;
  const canToggleStatus =
    canEdit && activeEntry ? canToggleEntryStatus(activeEntry) : false;
  const isTask = activeEntry?.entry_type === "task";
  const isCompletedTask = isTask && activeEntry?.status === "completed";
  const isClosedTask = isTask && activeEntry?.status !== "open";
  const contentReadOnly =
    Boolean(activeEntry?.archived_at) || activeEntry?.status === "cancelled";

  const canEditDraftStatus = useMemo(
    () => statusOptions.some((option) => option.value === draft.status),
    [draft.status],
  );

  const filteredTagSuggestions = useMemo(() => {
    if (!tagInputFocused) return [];
    const needle = normalizeTag(tagDraft).toLowerCase();
    return allTags
      .filter(
        (tag) =>
          !draft.tags.some((item) => item.toLowerCase() === tag.toLowerCase()),
      )
      .filter((tag) => !needle || tag.toLowerCase().includes(needle))
      .sort((a, b) => {
        if (!needle) return a.localeCompare(b);
        const aStarts = a.toLowerCase().startsWith(needle);
        const bStarts = b.toLowerCase().startsWith(needle);
        if (aStarts === bStarts) return a.localeCompare(b);
        return aStarts ? -1 : 1;
      });
  }, [allTags, draft.tags, tagDraft, tagInputFocused]);

  useEffect(() => {
    setHighlightedTagSuggestionIndex((current) => {
      if (filteredTagSuggestions.length === 0) return -1;
      if (current >= filteredTagSuggestions.length) return -1;
      return current;
    });
  }, [filteredTagSuggestions.length]);

  useEffect(() => {
    showEntry(entry);
    setEntryStack(createInspectorStack(entry));
  }, [entry?.id, showEntry]);

  useEffect(() => {
    if (!activeEntry?.id) return;

    const handleUpdate = (updatedEntry: any) => {
      if (!updatedEntry || updatedEntry.id !== activeEntry.id) return;
      const nextEntry = mergeInspectorEntry(activeEntry, updatedEntry);
      setEntryStack((current) => ({
        ...current,
        entries: current.entries.map((item) =>
          item?.id === updatedEntry.id
            ? mergeInspectorEntry(item, updatedEntry)
            : item,
        ),
      }));
      setActiveEntry(nextEntry);
      if (!isEditing) setDraft(buildInspectorDraft(nextEntry));
    };

    const handleDelete = (deletedId: string) => {
      setEntryStack((current) => {
        const entries = current.entries.filter((item) => item?.id !== deletedId);
        return {
          entries,
          index:
            entries.length === 0
              ? -1
              : Math.min(current.index, entries.length - 1),
        };
      });
      if (deletedId === activeEntry.id) setActiveEntry(null);
    };

    const handleMigrate = (payload: MigratePayload) => {
      if (payload?.source?.id === activeEntry.id) handleUpdate(payload.source);
      if (payload?.target?.id === activeEntry.id) handleUpdate(payload.target);
    };

    entryEventBus.on("entry:update", handleUpdate);
    entryEventBus.on("entry:status_change", handleUpdate);
    entryEventBus.on("entry:delete", handleDelete);
    entryEventBus.on("entry:migrate", handleMigrate);
    return () => {
      entryEventBus.off("entry:update", handleUpdate);
      entryEventBus.off("entry:status_change", handleUpdate);
      entryEventBus.off("entry:delete", handleDelete);
      entryEventBus.off("entry:migrate", handleMigrate);
    };
  }, [activeEntry, isEditing]);

  useEffect(() => {
    let cancelled = false;
    if (!activeEntry?.id) {
      setRelated([]);
      return () => {
        cancelled = true;
      };
    }

    setLoadingRelated(true);
    entryService
      .getRelatedEntries(activeEntry.id, 5)
      .then((items) => {
        if (!cancelled) setRelated(items);
      })
      .catch((error) => {
        console.error("Failed to load related entries", error);
        if (!cancelled) setRelated([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingRelated(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeEntry?.id]);

  const handleJumpClick = useCallback(() => {
    if (routeTarget.disabled) return;
    handleJump(routeTarget.kind === "daily" ? routeTarget.date : null);
  }, [handleJump, routeTarget]);

  const handleHistoryMove = useCallback(
    (delta: number) => {
      const nextStack = moveInspectorStack(entryStack, delta);
      setEntryStack(nextStack);
      showEntry(nextStack.entries[nextStack.index] || null);
    },
    [entryStack, showEntry],
  );

  const handleOpenRelated = useCallback(
    (item: any) => {
      const nextStack = pushInspectorStack(entryStack, item);
      setEntryStack(nextStack);
      showEntry(nextStack.entries[nextStack.index] || null);
    },
    [entryStack, showEntry],
  );

  const handleStartEdit = useCallback(() => {
    if (!activeEntry || !canEdit) return;
    setDraft(buildInspectorDraft(activeEntry));
    setTagDraft("");
    setTagInputFocused(false);
    setHighlightedTagSuggestionIndex(-1);
    setInlineScheduleMode(null);
    setIsEditing(true);
    void refreshTags();
  }, [activeEntry, canEdit, refreshTags]);

  const handleCancelEdit = useCallback(() => {
    setDraft(buildInspectorDraft(activeEntry));
    setTagDraft("");
    setIsEditing(false);
  }, [activeEntry]);

  const addTag = useCallback((value: string) => {
    const tag = normalizeTag(value);
    if (!tag || /\s/.test(tag)) return;
    setDraft((current) => {
      if (
        current.tags.some((item) => item.toLowerCase() === tag.toLowerCase())
      ) {
        return current;
      }
      return { ...current, tags: [...current.tags, tag] };
    });
    setTagDraft("");
    setHighlightedTagSuggestionIndex(-1);
  }, []);

  const removeTag = useCallback((tag: string) => {
    setDraft((current) => ({
      ...current,
      tags: current.tags.filter((item) => item !== tag),
    }));
  }, []);

  const finalizedTags = useCallback(() => {
    const pending = normalizeTag(tagDraft);
    if (!pending || /\s/.test(pending)) return draft.tags;
    if (
      draft.tags.some((item) => item.toLowerCase() === pending.toLowerCase())
    ) {
      return draft.tags;
    }
    return [...draft.tags, pending];
  }, [draft.tags, tagDraft]);

  const handleSaveEdit = useCallback(async () => {
    if (!activeEntry || saving || !draft.content.trim()) return;
    const nextTags = finalizedTags();
    const nextDraft = { ...draft, tags: nextTags };
    const payload = buildInspectorUpdatePayload(nextDraft);
    const optimistic = mergeInspectorEntry(activeEntry, {
      id: activeEntry.id,
      content: payload.content,
      entry_type: payload.entry_type,
      status: payload.status ?? activeEntry.status,
      target_date: payload.target_date ?? activeEntry.target_date,
      is_future: payload.is_future ?? activeEntry.is_future,
      tags: nextTags,
    });

    setSaving(true);
    setDraft(nextDraft);
    setTagDraft("");
    setActiveEntry(optimistic);
    entryEventBus.emit("entry:update", optimistic);

    try {
      const updated = await entryService.update(activeEntry.id, payload);
      setActiveEntry(updated);
      setDraft(buildInspectorDraft(updated));
      entryEventBus.emit("entry:update", updated);
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to save workbench edit", error);
      setActiveEntry(activeEntry);
      entryEventBus.emit("entry:reload_needed");
    } finally {
      setSaving(false);
    }
  }, [activeEntry, draft, finalizedTags, saving]);

  const handleTaskToggle = useCallback(
    (newContent: string) => {
      if (!activeEntry) return;
      setActiveEntry(
        mergeInspectorEntry(activeEntry, {
          id: activeEntry.id,
          content: newContent,
        }),
      );
      entryActions.handleTaskToggle(newContent);
    },
    [activeEntry, entryActions],
  );

  const openInlineSchedule = useCallback(
    (mode: "migrate" | "future") => {
      if (!activeEntry) return;
      setIsEditing(false);
      setInlineScheduleMode((current) => (current === mode ? null : mode));
      setDateInput(getDefaultMigrateDate(activeEntry));
      setFutureTargetValue(getDefaultFutureTargetValue(activeEntry));
      setCustomFutureMonth(activeEntry.target_month || currentMonthValue());
    },
    [activeEntry],
  );

  const handleConfirmMigrate = useCallback(async () => {
    if (!activeEntry || !dateInput || scheduleLoading) return;
    setScheduleLoading(true);

    try {
      if (activeEntry.is_future) {
        entryEventBus.emit("entry:delete", activeEntry.id);
        const response = await entryService.rescheduleFutureEntry(
          activeEntry.id,
          dateInput,
        );

        if (activeEntry.source_entry_id) {
          entryEventBus.emit("entry:update", {
            id: activeEntry.source_entry_id,
            status: "migrated_forward",
            migrated_to_date: dateInput,
            target_month: null,
          });
        }

        const target = { ...response, is_future: false, status: "open" };
        entryEventBus.emit("entry:migrate", {
          source: { ...activeEntry, status: "migrated_forward" },
          target,
          date: dateInput,
        });
        showEntry(target);
      } else {
        const result = await entryService.migrate(activeEntry.id, dateInput);
        entryEventBus.emit("entry:migrate", {
          source: result.updated_source,
          target: result.new_entry,
          date: dateInput,
        });
        showEntry(result.new_entry || result.updated_source);
      }
      setInlineScheduleMode(null);
    } catch (error) {
      console.error("Workbench migrate failed", error);
    } finally {
      setScheduleLoading(false);
    }
  }, [activeEntry, dateInput, scheduleLoading, showEntry]);

  const handleConfirmFuture = useCallback(async () => {
    if (!activeEntry || scheduleLoading) return;
    setScheduleLoading(true);
    const targetMonth = resolveFutureTargetMonth(
      futureTargetValue,
      customFutureMonth,
    );

    try {
      if (activeEntry.is_future) {
        const response = await entryService.moveFutureEntry(
          activeEntry.id,
          targetMonth,
        );
        if (activeEntry.source_entry_id) {
          entryEventBus.emit("entry:update", {
            id: activeEntry.source_entry_id,
            target_month: targetMonth,
          });
        }
        entryEventBus.emit("entry:update", response);
        showEntry(response);
      } else {
        const result = await entryService.moveToFutureWithSource(
          activeEntry.id,
          targetMonth,
        );
        const stubEntry = result.updated_source;
        const futureEntry = {
          ...result.new_entry,
          is_future: true,
          target_month: targetMonth,
        };

        entryEventBus.emit("entry:status_change", stubEntry);
        entryEventBus.emit("entry:migrate", {
          source: stubEntry,
          target: futureEntry,
          date: targetMonth || "Someday",
        });
        entryEventBus.emit("entry:create", futureEntry);
        showEntry(futureEntry);
      }
      setInlineScheduleMode(null);
    } catch (error) {
      console.error("Workbench future action failed", error);
    } finally {
      setScheduleLoading(false);
    }
  }, [
    activeEntry,
    customFutureMonth,
    futureTargetValue,
    scheduleLoading,
    showEntry,
  ]);

  if (!activeEntry) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center text-sm text-base-content/45">
        选择一条笔记查看详情
      </div>
    );
  }

  const headerTitle = getInspectorDisplayText(activeEntry);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-base-200/25">
      <header className="shrink-0 border-b border-base-200/70 bg-base-100/95 px-4 pb-3 pt-4 shadow-sm shadow-base-content/5">
        <div className="flex items-start gap-3">
          <button
            type="button"
            className="btn btn-ghost btn-sm h-9 w-9 shrink-0 rounded-2xl p-0"
            onClick={onBack}
            title="返回时间线"
            aria-label="返回时间线"
          >
            <ArrowLeft size={17} />
          </button>
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[1.15rem] border border-base-content/5 shadow-sm shadow-base-content/5 ${theme.softBg}`}
          >
            <theme.icon size={18} className={theme.color} strokeWidth={2.5} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold uppercase tracking-normal text-base-content/40">
              <span>{activeEntry.entry_type}</span>
              <span className="h-1 w-1 rounded-full bg-base-content/20" />
              <span>{activeEntry.status}</span>
            </div>
            <h2 className="mt-1 line-clamp-2 text-base font-semibold leading-snug text-base-content">
              {headerTitle}
            </h2>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-[repeat(5,minmax(0,2.25rem))] justify-between gap-1.5 rounded-[1.25rem] border border-base-200/80 bg-base-200/35 p-1">
          <WorkbenchIconButton
            icon={<ChevronLeft size={15} />}
            label="上一步"
            onClick={() => handleHistoryMove(-1)}
            disabled={entryStack.index <= 0}
          />
          <WorkbenchIconButton
            icon={<ChevronRight size={15} />}
            label="下一步"
            onClick={() => handleHistoryMove(1)}
            disabled={
              entryStack.index < 0 ||
              entryStack.index >= entryStack.entries.length - 1
            }
          />
          <WorkbenchIconButton
            icon={<ExternalLink size={15} />}
            label="打开"
            onClick={handleJumpClick}
            disabled={routeTarget.disabled}
          />
          {!isEditing ? (
            <WorkbenchIconButton
              icon={<Edit3 size={15} />}
              label="编辑"
              onClick={handleStartEdit}
              disabled={!canEdit}
            />
          ) : (
            <WorkbenchIconButton
              icon={
                saving ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Save size={15} />
                )
              }
              label="保存"
              onClick={handleSaveEdit}
              disabled={saving || !draft.content.trim()}
              className="text-primary hover:bg-primary/10"
            />
          )}
          {isEditing ? (
            <WorkbenchIconButton
              icon={<Undo2 size={15} />}
              label="取消编辑"
              onClick={handleCancelEdit}
              disabled={saving}
            />
          ) : (
            <WorkbenchIconButton
              icon={isClosedTask ? <RotateCcw size={15} /> : <Check size={15} />}
              label={isClosedTask ? "重新打开" : "完成"}
              onClick={entryActions.handleStatusToggle}
              disabled={
                !isTask ||
                !canToggleStatus ||
                entryActions.loading ||
                scheduleLoading
              }
              className={
                isCompletedTask
                  ? "text-warning hover:bg-warning/10"
                  : "text-success hover:bg-success/10"
              }
            />
          )}
        </div>

        {isTask && activeEntry.status === "open" && !isEditing && (
          <div className="mt-2 grid grid-cols-2 gap-2 rounded-[1.25rem] border border-base-200/70 bg-base-200/30 p-1">
            <button
              type="button"
              className={`btn btn-sm h-9 min-h-0 rounded-2xl border-0 bg-base-100/90 text-xs shadow-sm ${
                inlineScheduleMode === "migrate"
                  ? "text-info ring-1 ring-info/20"
                  : ""
              }`}
              onClick={() => openInlineSchedule("migrate")}
              disabled={scheduleLoading}
            >
              <ArrowRight size={14} />
              迁移
            </button>
            <button
              type="button"
              className={`btn btn-sm h-9 min-h-0 rounded-2xl border-0 bg-base-100/90 text-xs shadow-sm ${
                inlineScheduleMode === "future"
                  ? "text-amber-600 ring-1 ring-amber-400/25"
                  : ""
              }`}
              onClick={() => openInlineSchedule("future")}
              disabled={scheduleLoading}
            >
              <CalendarClock size={14} />
              Future
            </button>
          </div>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <article className="workbench-detail-card relative overflow-hidden rounded-[1.5rem] border border-base-200/80 bg-base-100 shadow-[0_14px_34px_rgba(15,23,42,0.08)]">
          <div
            className={`absolute bottom-4 left-3 top-4 w-1.5 rounded-full ${theme.sideBar}`}
          />
          <div className="space-y-4 px-4 py-4 pl-7">
            <section className="space-y-2">
              <WorkbenchMeta icon={<CalendarDays size={14} />} label="时间">
                <button
                  type="button"
                  className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold transition ${
                    routeTarget.disabled
                      ? "cursor-default bg-base-200/50 text-base-content/45"
                      : "bg-primary/10 text-primary hover:bg-primary/15"
                  }`}
                  onClick={handleJumpClick}
                  disabled={routeTarget.disabled}
                >
                  <span className="truncate">{routeTarget.label}</span>
                  {!routeTarget.disabled && <ExternalLink size={11} />}
                </button>
              </WorkbenchMeta>
              {activeEntry.created_at && (
                <WorkbenchMeta icon={<Clock3 size={14} />} label="创建">
                  {activeEntry.created_at}
                </WorkbenchMeta>
              )}
              {activeEntry.tags?.length > 0 && !isEditing && (
                <WorkbenchMeta icon={<Hash size={14} />} label="标签">
                  <span className="flex flex-wrap gap-1.5">
                    {activeEntry.tags.map((tag: string) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 rounded-full border border-base-200 bg-base-200/40 px-2 py-0.5 text-[11px] font-medium"
                      >
                        <Tag size={10} />
                        {tag}
                      </span>
                    ))}
                  </span>
                </WorkbenchMeta>
              )}
            </section>

            {inlineScheduleMode && (
              <section className="workbench-schedule-card rounded-[1.25rem] border border-base-200/80 bg-base-200/25 p-3 shadow-sm shadow-base-content/5">
                {inlineScheduleMode === "migrate" ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-info">
                      <ArrowRight size={13} />
                      迁移到日期
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr)_36px] gap-2 rounded-2xl border border-info/10 bg-base-100 p-1.5">
                      <input
                        type="date"
                        className="input input-sm min-w-0 rounded-xl border-0 bg-transparent focus:outline-none"
                        value={dateInput}
                        onChange={(event) => setDateInput(event.target.value)}
                      />
                      <button
                        type="button"
                        className="btn btn-primary btn-sm rounded-xl"
                        onClick={handleConfirmMigrate}
                        disabled={scheduleLoading || !dateInput}
                      >
                        {scheduleLoading ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Check size={14} />
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-amber-600">
                      <CalendarClock size={13} />
                      放入 Future
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr)_36px] gap-2 rounded-2xl border border-amber-500/10 bg-base-100 p-1.5">
                      <select
                        className="select select-sm min-w-0 rounded-xl border-0 bg-transparent focus:outline-none"
                        value={futureTargetValue}
                        onChange={(event) =>
                          setFutureTargetValue(event.target.value)
                        }
                      >
                        {futureTargetOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm rounded-xl"
                        onClick={handleConfirmFuture}
                        disabled={
                          scheduleLoading ||
                          (futureTargetValue === FUTURE_TARGET_CUSTOM &&
                            !customFutureMonth)
                        }
                      >
                        {scheduleLoading ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Check size={14} />
                        )}
                      </button>
                    </div>
                    {futureTargetValue === FUTURE_TARGET_CUSTOM && (
                      <input
                        type="month"
                        className="input input-bordered input-sm w-full rounded-2xl bg-base-100"
                        value={customFutureMonth}
                        onChange={(event) =>
                          setCustomFutureMonth(event.target.value)
                        }
                      />
                    )}
                    {futureTargetValue === FUTURE_TARGET_UNDETERMINED && (
                      <p className="px-1 text-[11px] text-base-content/45">
                        将保存到 Future Log 的待定区。
                      </p>
                    )}
                  </div>
                )}
              </section>
            )}

            {isEditing ? (
              <section className="space-y-3">
                <TypeSelector
                  currentType={draft.entryType}
                  onChange={(entryType) =>
                    setDraft((current) => ({ ...current, entryType }))
                  }
                />

                <label className="flex flex-col gap-1 text-xs font-semibold text-base-content/45">
                  Status
                  {canEditDraftStatus ? (
                    <WorkbenchStatusSelector
                      value={draft.status}
                      onChange={(status) =>
                        setDraft((current) => ({
                          ...current,
                          status,
                        }))
                      }
                    />
                  ) : (
                    <span className="inline-flex w-fit rounded-full border border-base-200 bg-base-200/50 px-3 py-1 text-xs font-semibold text-base-content/50">
                      {draft.status}
                    </span>
                  )}
                </label>

                <TagInput
                  tags={draft.tags}
                  draft={tagDraft}
                  suggestions={filteredTagSuggestions}
                  highlightedIndex={highlightedTagSuggestionIndex}
                  placeholder="添加标签"
                  onDraftChange={setTagDraft}
                  onFocusChange={setTagInputFocused}
                  onHighlightChange={setHighlightedTagSuggestionIndex}
                  onAddTag={addTag}
                  onRemoveTag={removeTag}
                  containerClassName="relative rounded-2xl border border-base-200/70 bg-base-200/25 px-3 py-2"
                />

                <div className="overflow-hidden rounded-2xl border border-base-200 bg-base-100 shadow-sm shadow-base-content/5">
                  <MarkdownToolbar
                    textareaRef={textareaRef}
                    value={draft.content}
                    onChange={(content) =>
                      setDraft((current) => ({ ...current, content }))
                    }
                  />
                  <textarea
                    ref={textareaRef}
                    className="block min-h-56 w-full resize-y border-0 bg-transparent px-4 py-3 text-sm font-medium leading-relaxed outline-none placeholder:text-base-content/25 focus:outline-none focus:ring-0"
                    value={draft.content}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        content: event.target.value,
                      }))
                    }
                  />
                </div>
              </section>
            ) : (
              <section>
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-normal text-base-content/40">
                  <FileText size={13} />
                  内容
                </div>
                <div className="rounded-2xl border border-base-200 bg-base-200/25 p-3">
                  <MarkdownViewer
                    content={activeEntry.content || ""}
                    tags={activeEntry.tags || []}
                    entryType={activeEntry.entry_type}
                    disableOverflowCheck
                    readOnly={contentReadOnly}
                    onTaskToggle={contentReadOnly ? undefined : handleTaskToggle}
                    isTagClickable={false}
                    uploadReferences={activeEntry.summary?.uploadReferences}
                    className="text-sm"
                  />
                </div>
              </section>
            )}
          </div>
        </article>

        <section className="mt-5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-normal text-base-content/40">
              <Link2 size={13} />
              Related Notes
            </div>
            {loadingRelated && (
              <span className="loading loading-spinner loading-xs text-base-content/30" />
            )}
          </div>

          <div className="space-y-2">
            {!loadingRelated && related.length === 0 && (
              <div className="rounded-2xl border border-dashed border-base-200 bg-base-100 px-3 py-4 text-sm text-base-content/40">
                暂无明显关联
              </div>
            )}
            {related.map((item) => {
              const itemTheme =
                ENTRY_THEME[item.entry_type as EntryType] || ENTRY_THEME.task;
              return (
                <button
                  key={item.id}
                  type="button"
                  className="relative w-full overflow-hidden rounded-2xl border border-base-200 bg-base-100 px-4 py-3 pl-6 text-left shadow-sm shadow-base-content/5 transition hover:-translate-y-0.5 hover:border-primary/25 hover:bg-primary/5 hover:shadow-md"
                  onClick={() => handleOpenRelated(item)}
                >
                  <div
                    className={`absolute bottom-3 left-2 top-3 w-1.5 rounded-full ${itemTheme.sideBar}`}
                  />
                  <EntryDisplay
                    content={item.content || ""}
                    tags={item.tags || []}
                    status={item.status || "open"}
                    isTask={item.entry_type === "task"}
                    entryType={item.entry_type || "task"}
                    backendSummary={item.summary}
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
      </div>
    </div>
  );
}

function WorkbenchIconButton({
  icon,
  label,
  onClick,
  disabled,
  className = "",
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`btn btn-ghost btn-sm h-9 min-h-0 w-9 rounded-2xl p-0 text-base-content/55 hover:bg-base-100 hover:text-base-content ${className}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      {icon}
    </button>
  );
}

function WorkbenchStatusSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2 rounded-[1.2rem] border border-base-200/70 bg-base-200/30 p-1">
      {statusOptions.map((option) => {
        const selected = value === option.value;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            className={`flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-2xl border px-2 text-xs font-bold transition ${
              selected
                ? option.selectedClass
                : "border-transparent bg-base-100/65 text-base-content/40 hover:bg-base-100 hover:text-base-content/65"
            }`}
            onClick={() => onChange(option.value)}
            aria-pressed={selected}
          >
            <Icon size={14} strokeWidth={selected ? 2.6 : 2.2} />
            <span className="truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function WorkbenchMeta({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-2 text-sm">
      <div className="flex items-center gap-1.5 text-base-content/40">
        {icon}
        <span>{label}</span>
      </div>
      <div className="min-w-0 text-base-content/75">{children}</div>
    </div>
  );
}
