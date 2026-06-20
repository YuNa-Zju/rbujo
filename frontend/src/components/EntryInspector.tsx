import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import {
  Archive,
  ArrowRight,
  CalendarClock,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
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
  X,
  XCircle,
} from "lucide-react";
import MarkdownViewer from "./MarkdownViewer";
import TagInput from "./shared/TagInput";
import TypeSelector from "./shared/TypeSelector";
import { entryService } from "../services/entryService";
import { ENTRY_THEME, type EntryType } from "../config/entryTheme";
import { useEntryNavigation } from "../hooks/useEntryNavigation";
import { useEntryActions } from "../features/entry/useEntryActions";
import { canToggleEntryStatus } from "../features/entry/entryStatusPolicy";
import { useTagCache } from "../context/TagCacheContext";
import {
  buildInspectorDraft,
  buildInspectorUpdatePayload,
  createInspectorStack,
  getInspectorRouteTarget,
  mergeInspectorEntry,
  moveInspectorStack,
  pushInspectorStack,
  type InspectorDraft,
} from "../features/entry/entryInspectorModel";
import { entryEventBus, type MigratePayload } from "../lib/entryEventBus";

interface EntryInspectorProps {
  open: boolean;
  entry: any | null;
  onClose: () => void;
}

const EMPTY_ENTRY = {
  id: "",
  content: "",
  entry_type: "task",
  status: "open",
  tags: [],
};

const statusOptions = [
  { value: "open", label: "Open" },
  { value: "completed", label: "Done" },
  { value: "cancelled", label: "Cancelled" },
];

const normalizeTag = (value: string) =>
  value
    .trim()
    .replace(/^#+/, "")
    .replace(/^[,，;；:：\s]+|[,，;；:：\s]+$/g, "");

export default function EntryInspector({
  open,
  entry,
  onClose,
}: EntryInspectorProps) {
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

  const { handleJump } = useEntryNavigation();
  const { allTags, refreshTags } = useTagCache();

  const refreshEntryViews = useCallback(() => {
    entryEventBus.emit("entry:reload_needed");
  }, []);

  const entryActions = useEntryActions(
    activeEntry || EMPTY_ENTRY,
    refreshEntryViews,
    {},
  );

  const visible = open && Boolean(activeEntry);
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
  }, []);

  const canEdit = Boolean(activeEntry?.id) && !activeEntry?.archived_at;
  const canToggleStatus =
    canEdit && activeEntry ? canToggleEntryStatus(activeEntry) : false;
  const isTask = activeEntry?.entry_type === "task";
  const isCompletedTask = isTask && activeEntry?.status === "completed";
  const contentReadOnly =
    Boolean(activeEntry?.archived_at) || activeEntry?.status === "cancelled";

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

  const canEditDraftStatus = useMemo(
    () => statusOptions.some((option) => option.value === draft.status),
    [draft.status],
  );

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
  }, [entry?.id, open, showEntry]);

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
      if (deletedId !== activeEntry.id) return;
      setActiveEntry(null);
      onClose();
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
  }, [activeEntry, isEditing, onClose]);

  useEffect(() => {
    let cancelled = false;
    if (!visible || !activeEntry?.id) {
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
  }, [activeEntry?.id, visible]);

  useEffect(() => {
    if (!visible) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, visible]);

  const handleBackdropClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) onClose();
    },
    [onClose],
  );

  const handleJumpClick = useCallback(() => {
    if (routeTarget.disabled) return;
    handleJump(routeTarget.kind === "daily" ? routeTarget.date : null);
    onClose();
  }, [handleJump, onClose, routeTarget]);

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
      console.error("Failed to save inspector edit", error);
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

  const handleCopy = useCallback(() => {
    if (!activeEntry?.content) return;
    void navigator.clipboard?.writeText(activeEntry.content);
  }, [activeEntry?.content]);

  const headerTitle =
    activeEntry?.summary?.text || activeEntry?.content || "Untitled";

  return (
    <div
      className={`fixed inset-0 z-40 bg-transparent transition-[visibility] ${
        visible ? "pointer-events-auto visible" : "pointer-events-none invisible"
      }`}
      aria-hidden={!visible}
      onClick={handleBackdropClick}
    >
      <aside
        className={`absolute right-0 top-0 h-dvh w-[400px] max-w-[calc(100vw-20px)] border-l border-base-200 bg-base-100/95 shadow-2xl backdrop-blur-xl transition-transform duration-200 ease-out ${
          visible ? "translate-x-0" : "translate-x-full"
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        {visible && activeEntry && (
          <div className="flex h-full flex-col">
            <header className="flex items-start gap-3 border-b border-base-200 px-4 py-4">
              <div
                className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${theme.softBg}`}
              >
                <theme.icon
                  size={18}
                  className={theme.color}
                  strokeWidth={2.5}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-normal text-base-content/40">
                  <span>{activeEntry.entry_type}</span>
                  <span className="h-1 w-1 rounded-full bg-base-content/20" />
                  <span>{activeEntry.status}</span>
                </div>
                <h2 className="mt-1 line-clamp-2 text-base font-semibold leading-snug text-base-content">
                  {headerTitle}
                </h2>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm h-8 w-8 rounded-full p-0"
                onClick={onClose}
                aria-label="Close inspector"
                title="Close"
              >
                <X size={16} />
              </button>
            </header>

            <div className="flex flex-wrap items-center gap-1.5 border-b border-base-200 bg-base-200/25 px-4 py-2">
              <InspectorActionButton
                icon={<ChevronLeft size={15} />}
                label="上一步"
                onClick={() => handleHistoryMove(-1)}
                disabled={entryStack.index <= 0}
              />
              <InspectorActionButton
                icon={<ChevronRight size={15} />}
                label="下一步"
                onClick={() => handleHistoryMove(1)}
                disabled={
                  entryStack.index < 0 ||
                  entryStack.index >= entryStack.entries.length - 1
                }
              />
              <div className="mx-1 h-5 w-px bg-base-300/80" />
              <InspectorActionButton
                icon={<ExternalLink size={15} />}
                label="打开"
                onClick={handleJumpClick}
                disabled={routeTarget.disabled}
              />
              {!isEditing ? (
                <InspectorActionButton
                  icon={<Edit3 size={15} />}
                  label="编辑"
                  onClick={handleStartEdit}
                  disabled={!canEdit}
                />
              ) : (
                <>
                  <InspectorActionButton
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
                  <InspectorActionButton
                    icon={<Undo2 size={15} />}
                    label="取消编辑"
                    onClick={handleCancelEdit}
                    disabled={saving}
                  />
                </>
              )}

              <div className="mx-1 h-5 w-px bg-base-300/80" />

              {isTask && (
                <InspectorActionButton
                  icon={
                    isCompletedTask ? (
                      <RotateCcw size={15} />
                    ) : (
                      <Check size={15} />
                    )
                  }
                  label={isCompletedTask ? "重新打开" : "完成"}
                  onClick={entryActions.handleStatusToggle}
                  disabled={!canToggleStatus || isEditing || entryActions.loading}
                  className={
                    isCompletedTask
                      ? "text-warning hover:bg-warning/10"
                      : "text-success hover:bg-success/10"
                  }
                />
              )}
              {isTask && activeEntry.status === "open" && (
                <>
                  <InspectorActionButton
                    icon={<ArrowRight size={15} />}
                    label="迁移"
                    onClick={entryActions.actions.openMigrate}
                    disabled={isEditing || entryActions.loading}
                    className="text-info hover:bg-info/10"
                  />
                  <InspectorActionButton
                    icon={<CalendarClock size={15} />}
                    label="移到 Future"
                    onClick={entryActions.actions.openFuture}
                    disabled={isEditing || entryActions.loading}
                    className="text-amber-500 hover:bg-amber-500/10"
                  />
                </>
              )}

              <div className="mx-1 h-5 w-px bg-base-300/80" />

              <InspectorActionButton
                icon={<Copy size={15} />}
                label="复制"
                onClick={handleCopy}
                disabled={!activeEntry.content}
              />
              {!activeEntry.archived_at && (
                <InspectorActionButton
                  icon={<Archive size={15} />}
                  label="归档"
                  onClick={entryActions.actions.performArchive}
                  disabled={isEditing || entryActions.loading}
                />
              )}
              {activeEntry.status !== "cancelled" && (
                <InspectorActionButton
                  icon={<XCircle size={15} />}
                  label="取消"
                  onClick={entryActions.actions.performCancel}
                  disabled={isEditing || entryActions.loading}
                  className="text-error hover:bg-error/10"
                />
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-base-200/20 px-4 py-4">
              <section className="space-y-2 rounded-2xl border border-base-200 bg-base-100 p-3 shadow-sm shadow-base-content/5">
                <InspectorMeta icon={<CalendarDays size={14} />} label="时间">
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
                </InspectorMeta>
                {activeEntry.created_at && (
                  <InspectorMeta icon={<Clock3 size={14} />} label="创建">
                    {activeEntry.created_at}
                  </InspectorMeta>
                )}
                {activeEntry.tags?.length > 0 && !isEditing && (
                  <InspectorMeta icon={<Hash size={14} />} label="标签">
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
                  </InspectorMeta>
                )}
              </section>

              {isEditing ? (
                <section className="mt-4 space-y-3 rounded-2xl border border-base-200 bg-base-100 p-3 shadow-sm shadow-base-content/5">
                  <TypeSelector
                    currentType={draft.entryType}
                    onChange={(entryType) =>
                      setDraft((current) => ({ ...current, entryType }))
                    }
                  />

                  <div className="space-y-1">
                    <label className="flex flex-col gap-1 text-xs font-semibold text-base-content/45">
                      Status
                      {canEditDraftStatus ? (
                        <select
                          className="select select-bordered select-sm w-full rounded-xl bg-base-100 text-sm text-base-content"
                          value={draft.status}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              status: event.target.value,
                            }))
                          }
                        >
                          {statusOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="inline-flex w-fit rounded-full border border-base-200 bg-base-200/50 px-3 py-1 text-xs font-semibold text-base-content/50">
                          {draft.status}
                        </span>
                      )}
                    </label>
                  </div>

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

                  <textarea
                    className="textarea textarea-bordered min-h-56 w-full resize-y rounded-2xl bg-base-100 text-sm leading-relaxed focus:outline-none"
                    value={draft.content}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        content: event.target.value,
                      }))
                    }
                  />
                </section>
              ) : (
                <section className="mt-5">
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-normal text-base-content/40">
                    <FileText size={13} />
                    内容
                  </div>
                  <div className="rounded-2xl border border-base-200 bg-base-100 p-3 shadow-sm shadow-base-content/5">
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
                      ENTRY_THEME[item.entry_type as EntryType] ||
                      ENTRY_THEME.task;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className="w-full rounded-2xl border border-base-200 bg-base-100 px-4 py-3 text-left shadow-sm shadow-base-content/5 transition hover:-translate-y-0.5 hover:border-primary/25 hover:bg-primary/5 hover:shadow-md"
                        onClick={() => handleOpenRelated(item)}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${itemTheme.dotColor}`}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold text-base-content">
                              {item.summary?.text || item.content || "Untitled"}
                            </div>
                            <div className="mt-1 truncate text-xs text-base-content/45">
                              {item._search?.snippet || item.content}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function InspectorActionButton({
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
      className={`btn btn-ghost btn-sm h-8 w-8 shrink-0 rounded-full p-0 text-base-content/55 hover:text-base-content ${className}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      {icon}
    </button>
  );
}

function InspectorMeta({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2 text-sm">
      <div className="flex items-center gap-1.5 text-base-content/40">
        {icon}
        <span>{label}</span>
      </div>
      <div className="min-w-0 text-base-content/75">{children}</div>
    </div>
  );
}
