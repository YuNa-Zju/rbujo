import { AnimatePresence, motion } from "framer-motion";
import { listen } from "@tauri-apps/api/event";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Database,
  FileText,
  FolderOpen,
  HardDrive,
  Loader2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { EscModalWrapper } from "../common/EscModalWrapper";
import type { translations } from "../../config/translations";
import { useAppTheme } from "../../hooks/useAppTheme";
import { useTranslation } from "../../hooks/useTranslation";
import { uiEvents } from "../../lib/uiEvents";
import {
  entryService,
  type AttachmentMaintenanceItem,
  type AttachmentMaintenanceSummary,
  type MarkdownWorkspace,
} from "../../services/entryService";

type AttachmentMaintenanceLabels =
  (typeof translations)["zh"]["attachmentMaintenance"];

const PRIMARY_ATTACHMENT_PATH_PREFIX = "attachments/";

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
};

const openableDailyReferenceDate = (
  reference: AttachmentMaintenanceItem["references"][number],
) => {
  if (reference.archived_at) return null;
  return reference.target_date || null;
};

const attachmentDisplayPath = (upload: AttachmentMaintenanceItem) =>
  upload.relative_path ||
  `${PRIMARY_ATTACHMENT_PATH_PREFIX}${upload.filename || "attachment"}`;

export default function AttachmentMaintenanceController() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const labels = t.attachmentMaintenance;
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<AttachmentMaintenanceSummary | null>(
    null,
  );
  const [workspace, setWorkspace] = useState<MarkdownWorkspace | null>(null);
  const [loading, setLoading] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [openingFolder, setOpeningFolder] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStorage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextSummary, nextWorkspace] = await Promise.all([
        entryService.getAttachmentMaintenanceSummary(),
        entryService.getMarkdownWorkspace(),
      ]);
      setSummary(nextSummary);
      setWorkspace(nextWorkspace);
    } catch (nextError) {
      console.error("Storage maintenance summary failed", nextError);
      setError(labels?.loadFailed || "Failed to read storage statistics");
    } finally {
      setLoading(false);
    }
  }, [labels?.loadFailed]);

  const openPanel = useCallback(() => {
    setOpen(true);
    void loadStorage();
  }, [loadStorage]);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  const chooseWorkspace = useCallback(async () => {
    setChoosing(true);
    setError(null);
    try {
      const nextWorkspace = await entryService.chooseMarkdownWorkspace();
      if (nextWorkspace) setWorkspace(nextWorkspace);
    } catch (nextError) {
      console.error("Markdown workspace choose failed", nextError);
      setError(labels.chooseFailed);
    } finally {
      setChoosing(false);
    }
  }, [labels.chooseFailed]);

  const openWorkspace = useCallback(async () => {
    setOpeningFolder(true);
    setError(null);
    try {
      const nextWorkspace = await entryService.openMarkdownWorkspace();
      setWorkspace(nextWorkspace);
    } catch (nextError) {
      console.error("Markdown workspace open failed", nextError);
      setError(labels.openFolderFailed);
    } finally {
      setOpeningFolder(false);
    }
  }, [labels.openFolderFailed]);

  const openReference = useCallback(
    (reference: AttachmentMaintenanceItem["references"][number]) => {
      const targetDate = openableDailyReferenceDate(reference);
      if (!targetDate) return;
      close();
      navigate(`/daily/${targetDate}`, {
        state: { focus: reference.entry_id, t: Date.now() },
      });
    },
    [close, navigate],
  );

  useEffect(() => {
    uiEvents.on("OPEN_ATTACHMENT_MAINTENANCE", openPanel);
    return () => {
      uiEvents.off("OPEN_ATTACHMENT_MAINTENANCE", openPanel);
    };
  }, [openPanel]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    const register = async () => {
      try {
        unlisten = await listen("menu:attachment-maintenance", () => {
          uiEvents.emit("OPEN_ATTACHMENT_MAINTENANCE");
        });
      } catch (error) {
        console.warn("Native storage menu listener registration failed", error);
        return;
      }

      if (disposed && unlisten) {
        unlisten();
      }
    };

    register();
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  return (
    <AttachmentMaintenanceModal
      open={open}
      summary={summary}
      workspace={workspace}
      loading={loading}
      choosing={choosing}
      openingFolder={openingFolder}
      error={error}
      labels={labels}
      onChooseWorkspace={chooseWorkspace}
      onOpenWorkspace={openWorkspace}
      onOpenReference={openReference}
      onClose={close}
    />
  );
}

function AttachmentMaintenanceModal({
  open,
  summary,
  workspace,
  loading,
  choosing,
  openingFolder,
  error,
  labels,
  onChooseWorkspace,
  onOpenWorkspace,
  onOpenReference,
  onClose,
}: {
  open: boolean;
  summary: AttachmentMaintenanceSummary | null;
  workspace: MarkdownWorkspace | null;
  loading: boolean;
  choosing: boolean;
  openingFolder: boolean;
  error: string | null;
  labels: AttachmentMaintenanceLabels;
  onChooseWorkspace: () => void;
  onOpenWorkspace: () => void;
  onOpenReference: (
    reference: AttachmentMaintenanceItem["references"][number],
  ) => void;
  onClose: () => void;
}) {
  const { styles } = useAppTheme();
  const [expandedUploads, setExpandedUploads] = useState<Set<string>>(
    () => new Set(),
  );
  const workspacePath = workspace ? workspace.absolute_path : "-";
  const uploads = useMemo(() => {
    return [...(summary?.uploads ?? [])].sort((left, right) => {
      if (left.referenced !== right.referenced) return left.referenced ? 1 : -1;
      return right.size - left.size;
    });
  }, [summary]);
  const toggleUpload = useCallback((relativePath: string) => {
    setExpandedUploads((current) => {
      const next = new Set(current);
      if (next.has(relativePath)) {
        next.delete(relativePath);
      } else {
        next.add(relativePath);
      }
      return next;
    });
  }, []);

  return (
    <EscModalWrapper
      id="AttachmentMaintenanceModal"
      isOpen={open}
      onClose={onClose}
    >
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[6500] flex items-center justify-center p-4 isolation-isolate">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={`absolute inset-0 ${styles.backdrop}`}
              onClick={onClose}
            />

            <motion.div
              initial={{ scale: 0.96, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0, y: 12 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              className={`
                relative flex max-h-[min(88dvh,760px)] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border shadow-2xl
                ${styles.modal.base}
              `}
            >
              <div className="flex items-start justify-between gap-4 border-b border-base-content/10 px-6 py-5">
                <div className="flex min-w-0 items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <HardDrive size={22} />
                  </div>
                  <div className="min-w-0">
                    <p
                      className={`text-xs font-bold uppercase tracking-[0.18em] ${styles.card.textSecondary}`}
                    >
                      {labels.subtitle}
                    </p>
                    <h2 className={`mt-1 text-lg font-bold ${styles.modal.title}`}>
                      {labels.title}
                    </h2>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="btn btn-ghost btn-sm btn-circle shrink-0"
                  aria-label={labels.close}
                >
                  <X size={16} />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                <DailyRootPathCard
                  labels={labels}
                  workspacePath={workspacePath}
                  loading={loading}
                  choosing={choosing}
                  openingFolder={openingFolder}
                  isDefault={workspace?.is_default ?? false}
                  onOpenWorkspace={onOpenWorkspace}
                  onChooseWorkspace={onChooseWorkspace}
                />

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <MetricCard
                    icon={Database}
                    label={labels.totalUsage}
                    value={formatBytes(summary?.total_bytes ?? 0)}
                    detail={labels.fileCount.replace(
                      "{{count}}",
                      String(summary?.total_count ?? 0),
                    )}
                  />
                  <MetricCard
                    icon={CheckCircle2}
                    label={labels.referencedUsage}
                    value={formatBytes(summary?.referenced_bytes ?? 0)}
                    detail={labels.fileCount.replace(
                      "{{count}}",
                      String(summary?.referenced_count ?? 0),
                    )}
                  />
                  <MetricCard
                    icon={AlertTriangle}
                    label={labels.orphanedUsage}
                    value={formatBytes(summary?.orphaned_bytes ?? 0)}
                    detail={labels.fileCount.replace(
                      "{{count}}",
                      String(summary?.orphaned_count ?? 0),
                    )}
                    warning={(summary?.orphaned_count ?? 0) > 0}
                  />
                </div>

                {error && (
                  <div className="mt-4 rounded-2xl border border-error/20 bg-error/10 px-4 py-3 text-sm font-medium text-error">
                    {error}
                  </div>
                )}

                <div
                  className={`mt-4 rounded-2xl border ${styles.card.bg} ${styles.card.border}`}
                >
                  <div className="flex items-center justify-between gap-3 border-b border-base-content/10 px-4 py-3">
                    <span className={`text-sm font-bold ${styles.modal.title}`}>
                      {labels.attachmentList}
                    </span>
                    {loading && <Loader2 size={16} className="animate-spin" />}
                  </div>
                  <div className="max-h-72 overflow-y-auto p-2">
                    {uploads.length === 0 && !loading ? (
                      <div
                        className={`px-3 py-8 text-center text-sm ${styles.card.textSecondary}`}
                      >
                        {labels.empty}
                      </div>
                    ) : (
                      uploads.map((upload) => {
                        const expanded = expandedUploads.has(upload.relative_path);
                        return (
                          <div
                            key={upload.relative_path}
                            className="rounded-xl hover:bg-base-200/50"
                          >
                            <button
                              type="button"
                              className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left"
                              onClick={() => toggleUpload(upload.relative_path)}
                              aria-expanded={expanded}
                              title={
                                expanded
                                  ? labels.hideReferences
                                  : labels.showReferences
                              }
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                {expanded ? (
                                  <ChevronDown
                                    size={15}
                                    className="shrink-0 text-base-content/45"
                                  />
                                ) : (
                                  <ChevronRight
                                    size={15}
                                    className="shrink-0 text-base-content/45"
                                  />
                                )}
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-semibold">
                                    {upload.original_filename || upload.filename}
                                  </div>
                                  <div
                                    className={`mt-0.5 truncate text-[11px] font-mono ${styles.card.textSecondary}`}
                                  >
                                    {attachmentDisplayPath(upload)}
                                  </div>
                                </div>
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                <span
                                  className={`rounded-full px-2 py-1 text-[11px] font-bold ${
                                    upload.referenced
                                      ? "bg-success/10 text-success"
                                      : "bg-warning/10 text-warning"
                                  }`}
                                >
                                  {upload.referenced
                                    ? labels.referenced.replace(
                                        "{{count}}",
                                        String(upload.reference_count),
                                      )
                                    : labels.orphaned}
                                </span>
                                {upload.archived_reference_count > 0 && (
                                  <span className="rounded-full bg-base-content/10 px-2 py-1 text-[11px] font-bold text-base-content/55">
                                    {labels.archivedReferenced.replace(
                                      "{{count}}",
                                      String(upload.archived_reference_count),
                                    )}
                                  </span>
                                )}
                                <span className="w-16 text-right text-xs font-bold text-base-content/60">
                                  {formatBytes(upload.size)}
                                </span>
                              </div>
                            </button>
                            {expanded && (
                              <AttachmentReferenceList
                                upload={upload}
                                labels={labels}
                                onOpenReference={onOpenReference}
                              />
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </EscModalWrapper>
  );
}

function DailyRootPathCard({
  labels,
  workspacePath,
  loading,
  choosing,
  openingFolder,
  isDefault,
  onOpenWorkspace,
  onChooseWorkspace,
}: {
  labels: AttachmentMaintenanceLabels;
  workspacePath: string;
  loading: boolean;
  choosing: boolean;
  openingFolder: boolean;
  isDefault: boolean;
  onOpenWorkspace: () => void;
  onChooseWorkspace: () => void;
}) {
  return (
    <div className="rounded-2xl border border-base-content/10 bg-base-100/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <FolderOpen size={16} className="shrink-0 text-primary/75" />
          <div className="min-w-0">
            <div className="text-sm font-bold">{labels.dailyFolder}</div>
            <div className="mt-0.5 text-[11px] font-medium text-base-content/45">
              {isDefault ? labels.defaultBadge : labels.customBadge}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="btn btn-ghost btn-sm rounded-full"
            onClick={onOpenWorkspace}
            disabled={loading || openingFolder}
          >
            {openingFolder ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <FolderOpen size={15} />
            )}
            {labels.openFolder}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm rounded-full"
            onClick={onChooseWorkspace}
            disabled={loading || choosing}
          >
            {choosing ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <FolderOpen size={15} />
            )}
            {labels.changePath}
          </button>
        </div>
      </div>
      <div className="mt-3 rounded-xl bg-base-200/45 px-3 py-2 font-mono text-xs leading-relaxed text-base-content/70">
        {loading ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 size={13} className="animate-spin" />
            {labels.loading}
          </span>
        ) : (
          workspacePath
        )}
      </div>
    </div>
  );
}

function AttachmentReferenceList({
  upload,
  labels,
  onOpenReference,
}: {
  upload: AttachmentMaintenanceItem;
  labels: AttachmentMaintenanceLabels;
  onOpenReference: (
    reference: AttachmentMaintenanceItem["references"][number],
  ) => void;
}) {
  return (
    <div className="mx-3 mb-3 rounded-xl border border-base-content/10 bg-base-100/50 px-3 py-2">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-base-content/45">
        <FileText size={13} />
        {labels.referencesHeader}
      </div>
      {upload.references.length === 0 ? (
        <div className="py-2 text-xs font-medium text-base-content/45">
          {labels.noReferences}
        </div>
      ) : (
        <div className="space-y-2">
          {upload.references.map((reference) => {
            const targetDate = formatReferenceDate(reference, labels);
            const canOpen = Boolean(openableDailyReferenceDate(reference));
            return (
              <button
                key={reference.entry_id}
                type="button"
                className="w-full rounded-lg bg-base-200/45 px-3 py-2 text-left transition-colors hover:bg-base-200"
                onClick={() => canOpen && onOpenReference(reference)}
                disabled={!canOpen}
                title={
                  canOpen
                    ? labels.openReference
                    : labels.openReferenceUnavailable
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-xs font-bold">
                    {targetDate}
                  </span>
                  <span className="shrink-0 rounded-full bg-base-content/10 px-2 py-0.5 text-[10px] font-bold uppercase text-base-content/60">
                    {reference.entry_type}
                  </span>
                </div>
                <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-base-content/60">
                  {reference.preview || labels.emptyPreview}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatReferenceDate(
  reference: AttachmentMaintenanceItem["references"][number],
  labels: AttachmentMaintenanceLabels,
) {
  if (reference.target_date) return reference.target_date;
  if (reference.target_month) return reference.target_month;
  if (reference.created_at) return reference.created_at.slice(0, 10);
  return labels.unknownDate;
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  warning = false,
}: {
  icon: typeof Database;
  label: string;
  value: string;
  detail: string;
  warning?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-base-content/10 bg-base-100/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-bold text-base-content/50">{label}</span>
        <Icon
          size={16}
          className={warning ? "text-warning" : "text-primary/70"}
        />
      </div>
      <div className="mt-2 text-xl font-black tracking-tight">{value}</div>
      <div className="mt-1 text-xs font-medium text-base-content/45">
        {detail}
      </div>
    </div>
  );
}
