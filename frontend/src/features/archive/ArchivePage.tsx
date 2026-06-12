import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Archive,
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CalendarDays,
  ChevronDown,
  Loader2,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { createPortal } from "react-dom";
import { entryService } from "../../services/entryService";
import { EntryCard } from "../../components/DraggableEntryCard";
import { entryEventBus } from "../../lib/entryEventBus";
import HeaderActionTrigger from "../calendar/components/HeaderActionTrigger";
import { useTranslation } from "../../hooks/useTranslation";
import { buildArchiveSections } from "./archiveSections";

export default function ArchivePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const [entries, setEntries] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [deleteRequest, setDeleteRequest] = useState<any[] | null>(null);

  const loadArchived = useCallback(async () => {
    setLoading(true);
    try {
      const data = await entryService.search({
        q: "",
        include_archived: true,
        limit: 1000,
      });
      setEntries(data);
    } catch (error) {
      console.error("Load archive failed", error);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadArchived();
  }, [loadArchived]);

  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        navigate("/");
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [navigate]);

  const focusId = useMemo(
    () => new URLSearchParams(location.search).get("focus"),
    [location.search],
  );

  const filteredEntries = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return entries;
    return entries.filter((entry) =>
      `${entry.content} ${entry.target_date ?? ""} ${entry.target_month ?? ""}`
        .toLowerCase()
        .includes(keyword),
    );
  }, [entries, query]);

  const archiveSections = useMemo(
    () => buildArchiveSections(filteredEntries, new Date().getFullYear()),
    [filteredEntries],
  );

  const visibleEntries = useMemo(
    () => [
      ...archiveSections.expiredFuture,
      ...archiveSections.months.flatMap((section) => section.entries),
    ],
    [archiveSections],
  );

  useEffect(() => {
    const visibleIds = new Set(visibleEntries.map((entry) => entry.id));
    setSelectedIds((current) => {
      const next = new Set([...current].filter((id) => visibleIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [visibleEntries]);

  const selectedEntries = useMemo(
    () => visibleEntries.filter((entry) => selectedIds.has(entry.id)),
    [selectedIds, visibleEntries],
  );

  const restorableSelectedEntries = useMemo(
    () =>
      selectedEntries.filter(
        (entry) => entry.canRestore !== false && Boolean(entry.archived_at),
      ),
    [selectedEntries],
  );

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectEntries = (targetEntries: any[], checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      targetEntries.forEach((entry) => {
        if (checked) {
          next.add(entry.id);
        } else {
          next.delete(entry.id);
        }
      });
      return next;
    });
  };

  const removeEntriesLocally = (ids: string[]) => {
    const idSet = new Set(ids);
    setEntries((prev) => prev.filter((item) => !idSet.has(item.id)));
    setSelectedIds((current) => {
      const next = new Set(current);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  };

  const handleUnarchive = async (entry: any) => {
    if (entry.canRestore === false || !entry.archived_at) return;
    const restored = await entryService.unarchive(entry.id);
    removeEntriesLocally([entry.id]);
    entryEventBus.emit("entry:update", restored);
    if (restored.source_entry_id) {
      entryEventBus.emit("entry:update", {
        id: restored.source_entry_id,
        migrated_to_archived_at: null,
      });
    }
  };

  const requestDelete = (entry: any) => {
    setDeleteRequest([entry]);
  };

  const handleDelete = async (
    entry: any,
    options: { confirm?: boolean; refresh?: boolean } = {},
  ) => {
    if (options.confirm !== false) {
      requestDelete(entry);
      return;
    }

    try {
      await entryService.delete(entry.id, true);
    } catch (error) {
      if (!String(error).toLowerCase().includes("not found")) {
        throw error;
      }
    }

    removeEntriesLocally([entry.id]);
    entryEventBus.emit("entry:delete", entry.id);
    if (entry.source_entry_id) {
      entryEventBus.emit("entry:update", {
        id: entry.source_entry_id,
        status: "open",
        migrated_to_date: null,
        migrated_to_month: null,
        migrated_to_entry_id: null,
        migrated_to_archived_at: null,
        target_month: null,
      });
    }
    if (options.refresh !== false) {
      await loadArchived();
    }
  };

  const handleBulkRestore = async () => {
    if (restorableSelectedEntries.length === 0) return;
    const entriesToRestore = [...restorableSelectedEntries];
    setBulkLoading(true);
    try {
      for (const entry of entriesToRestore) {
        await handleUnarchive(entry);
      }
      await loadArchived();
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedEntries.length === 0) return;
    setDeleteRequest([...selectedEntries]);
  };

  const confirmDeleteRequest = async () => {
    if (!deleteRequest || deleteRequest.length === 0) return;
    const entriesToDelete = [...deleteRequest];
    setBulkLoading(true);
    try {
      for (const entry of entriesToDelete) {
        await handleDelete(entry, { confirm: false, refresh: false });
      }
      await loadArchived();
      setDeleteRequest(null);
    } finally {
      setBulkLoading(false);
    }
  };

  const handleJump = (entry: any) => {
    if (entry.target_date) {
      navigate(`/daily/${entry.target_date}`);
    }
  };

  const hasArchiveContent = visibleEntries.length > 0;

  return (
    <div className="fixed inset-0 flex h-[100dvh] w-full flex-col overflow-hidden bg-base-100">
      <div className="z-[100] grid h-14 flex-none grid-cols-[1fr_auto_1fr] items-center border-b border-base-200/50 bg-base-100/80 px-2 backdrop-blur-md sm:px-4">
        <div className="flex justify-start">
          <button
            className="btn btn-ghost btn-circle btn-sm text-base-content/60"
            onClick={() => navigate("/")}
            title={t.common?.back || "Back"}
          >
            <ArrowLeft size={20} />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <Archive size={18} className="text-primary" />
          <span className="font-serif text-lg font-bold">
            {t.archivePage?.title || t.common?.archive || "Archive"}
          </span>
        </div>
        <div className="flex items-center justify-end">
          <HeaderActionTrigger />
        </div>
      </div>

      <main className="flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-4xl px-4 py-6">
          <div className="sticky top-0 z-20 space-y-3 bg-base-100/95 pb-4 backdrop-blur-sm">
            <div className="flex items-center gap-3 rounded-2xl border border-base-300/40 bg-base-200/60 px-4 py-3">
              <Search size={18} className="shrink-0 text-base-content/40" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={
                  t.archivePage?.searchPlaceholder || "Search archived entries"
                }
                className="w-full bg-transparent text-sm font-medium outline-none"
              />
            </div>

            {selectedEntries.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/10 bg-primary/5 px-4 py-3">
                <span className="text-sm font-bold text-primary">
                  已选择 {selectedEntries.length} 条
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-sm rounded-full"
                    disabled={
                      bulkLoading || restorableSelectedEntries.length === 0
                    }
                    onClick={handleBulkRestore}
                  >
                    <RotateCcw size={15} />
                    恢复 {restorableSelectedEntries.length || ""}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm rounded-full text-error"
                    disabled={bulkLoading}
                    onClick={handleBulkDelete}
                  >
                    <Trash2 size={15} />
                    永久删除
                  </button>
                </div>
              </div>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-32 text-base-content/40">
              <Loader2 size={28} className="animate-spin" />
            </div>
          ) : !hasArchiveContent ? (
            <div className="flex select-none flex-col items-center justify-center py-32 text-base-content/30">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-base-200/70">
                <Archive size={26} />
              </div>
              <p className="font-serif text-xl italic">
                {t.archivePage?.empty || "No archived entries"}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-5 pb-24">
              {archiveSections.expiredFuture.length > 0 && (
                <ArchiveSection
                  title="过期 Future Log"
                  description="这些计划已经不属于当前年份，只能查看或永久删除。"
                  icon={<CalendarClock size={17} />}
                  entries={archiveSections.expiredFuture}
                  selectedIds={selectedIds}
                  focusId={focusId}
                  muted
                  onSelect={toggleSelected}
                  onSelectAll={selectEntries}
                  onRestore={handleUnarchive}
                  onDelete={handleDelete}
                  onJump={handleJump}
                  refresh={loadArchived}
                />
              )}

              {archiveSections.months.map((section) => (
                <details
                  key={section.month}
                  className="group rounded-3xl border border-base-200 bg-base-100 shadow-sm"
                  open
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm"
                        checked={section.entries.every((entry) =>
                          selectedIds.has(entry.id),
                        )}
                        onChange={(event) =>
                          selectEntries(section.entries, event.target.checked)
                        }
                        onClick={(event) => event.stopPropagation()}
                      />
                      <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <CalendarDays size={17} />
                      </div>
                      <div className="min-w-0">
                        <div className="font-mono text-sm font-bold">
                          {section.month}
                        </div>
                        <div className="text-xs font-medium text-base-content/45">
                          {section.entries.length} 条归档
                        </div>
                      </div>
                    </div>
                    <ChevronDown
                      size={18}
                      className="shrink-0 text-base-content/40 transition-transform group-open:rotate-180"
                    />
                  </summary>
                  <div className="border-t border-base-200/70 px-4 pb-4 pt-3">
                    <ArchiveEntryList
                      entries={section.entries}
                      selectedIds={selectedIds}
                      focusId={focusId}
                      onSelect={toggleSelected}
                      onRestore={handleUnarchive}
                      onDelete={handleDelete}
                      onJump={handleJump}
                      refresh={loadArchived}
                    />
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>
      </main>
      <ArchiveDeleteConfirm
        open={Boolean(deleteRequest)}
        count={deleteRequest?.length ?? 0}
        loading={bulkLoading}
        onCancel={() => {
          if (!bulkLoading) setDeleteRequest(null);
        }}
        onConfirm={confirmDeleteRequest}
      />
    </div>
  );
}

function ArchiveSection({
  title,
  description,
  icon,
  entries,
  selectedIds,
  focusId,
  muted = false,
  onSelect,
  onSelectAll,
  onRestore,
  onDelete,
  onJump,
  refresh,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  entries: any[];
  selectedIds: Set<string>;
  focusId: string | null;
  muted?: boolean;
  onSelect: (id: string) => void;
  onSelectAll: (entries: any[], checked: boolean) => void;
  onRestore: (entry: any) => void;
  onDelete: (entry: any) => void;
  onJump: (entry: any) => void;
  refresh: () => void;
}) {
  return (
    <section
      className={`rounded-3xl border p-4 shadow-sm ${
        muted
          ? "border-base-300 bg-base-200/45"
          : "border-base-200 bg-base-100"
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <input
            type="checkbox"
            className="checkbox checkbox-sm"
            checked={entries.every((entry) => selectedIds.has(entry.id))}
            onChange={(event) => onSelectAll(entries, event.target.checked)}
            onClick={(event) => event.stopPropagation()}
          />
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-base-100/80 text-base-content/55">
            {icon}
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold text-base-content/70">
              {title}
            </h2>
            <p className="text-xs font-medium text-base-content/45">
              {description}
            </p>
          </div>
        </div>
        <span className="rounded-full bg-base-100/80 px-2.5 py-1 font-mono text-[11px] font-bold text-base-content/45">
          {entries.length}
        </span>
      </div>
      <ArchiveEntryList
        entries={entries}
        selectedIds={selectedIds}
        focusId={focusId}
        muted={muted}
        onSelect={onSelect}
        onRestore={onRestore}
        onDelete={onDelete}
        onJump={onJump}
        refresh={refresh}
      />
    </section>
  );
}

function ArchiveEntryList({
  entries,
  selectedIds,
  focusId,
  muted = false,
  onSelect,
  onRestore,
  onDelete,
  onJump,
  refresh,
}: {
  entries: any[];
  selectedIds: Set<string>;
  focusId: string | null;
  muted?: boolean;
  onSelect: (id: string) => void;
  onRestore: (entry: any) => void;
  onDelete: (entry: any) => void;
  onJump: (entry: any) => void;
  refresh: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {entries.map((entry) => (
        <div
          key={entry.id}
          className={`group rounded-3xl transition-all ${
            focusId === entry.id
              ? "ring-2 ring-primary/60 ring-offset-4 ring-offset-base-100"
              : ""
          }`}
        >
          <div className="mb-2 flex items-center justify-between gap-3 px-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs font-mono font-bold text-base-content/45">
              <input
                type="checkbox"
                className="checkbox checkbox-xs"
                checked={selectedIds.has(entry.id)}
                onChange={() => onSelect(entry.id)}
                onClick={(event) => event.stopPropagation()}
              />
              <button
                type="button"
                onClick={() => onJump(entry)}
                className="flex items-center gap-1.5 transition-colors hover:text-primary"
              >
                <CalendarDays size={13} />
                {entry.target_date || entry.target_month || "Future"}
              </button>
              {entry.from_date && (
                <span className="rounded-full bg-base-200/70 px-2 py-0.5">
                  From {entry.from_date}
                </span>
              )}
              {(entry.migrated_to_date || entry.migrated_to_month) && (
                <span className="rounded-full bg-base-200/70 px-2 py-0.5">
                  To {entry.migrated_to_date || entry.migrated_to_month}
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {entry.canRestore !== false && (
                <button
                  type="button"
                  className="btn btn-xs btn-ghost rounded-full gap-1"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRestore(entry);
                  }}
                  title="Restore"
                >
                  <RotateCcw size={13} />
                  <span className="hidden sm:inline">Restore</span>
                </button>
              )}
              <button
                type="button"
                className="btn btn-xs btn-ghost rounded-full text-error"
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete(entry);
                }}
                title="Delete permanently"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
          <EntryCard
            entry={entry}
            refresh={refresh}
            isDragEnabled={false}
            forceCollapse={false}
            hideActions
            readOnly
            isTagClickable={false}
            className={
              muted
                ? "!border-base-300 !bg-base-100/60 !shadow-none grayscale-[0.25]"
                : ""
            }
          />
        </div>
      ))}
    </div>
  );
}

function ArchiveDeleteConfirm({
  open,
  count,
  loading,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  count: number;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-base-300/35 backdrop-blur-sm"
        aria-label="Close delete confirmation"
        onClick={onCancel}
        disabled={loading}
      />
      <div className="relative w-full max-w-sm rounded-[2rem] border border-error/15 bg-base-100 p-6 text-center shadow-2xl">
        <button
          type="button"
          className="btn btn-ghost btn-circle btn-sm absolute right-3 top-3 text-base-content/45"
          onClick={onCancel}
          disabled={loading}
        >
          <X size={16} />
        </button>
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-error/10 text-error">
          <AlertTriangle size={26} />
        </div>
        <h3 className="text-lg font-bold">永久删除归档条目？</h3>
        <p className="mt-2 text-sm font-medium leading-relaxed text-base-content/55">
          将彻底删除 {count} 条记录，此操作不能撤回。
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            className="btn rounded-full"
            onClick={onCancel}
            disabled={loading}
          >
            取消
          </button>
          <button
            type="button"
            className="btn btn-error rounded-full text-error-content"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            删除
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
