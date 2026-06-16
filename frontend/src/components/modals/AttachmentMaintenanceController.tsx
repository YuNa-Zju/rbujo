import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Database,
  FileText,
  HardDrive,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { EscModalWrapper } from "../common/EscModalWrapper";
import type { translations } from "../../config/translations";
import { useAppTheme } from "../../hooks/useAppTheme";
import { useTranslation } from "../../hooks/useTranslation";
import { uiEvents } from "../../lib/uiEvents";
import {
  entryService,
  type AttachmentMaintenanceItem,
  type AttachmentMaintenanceSummary,
} from "../../services/entryService";

type AttachmentMaintenanceLabels =
  (typeof translations)["zh"]["attachmentMaintenance"];

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

export default function AttachmentMaintenanceController() {
  const { t } = useTranslation();
  const labels = t.attachmentMaintenance;
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<AttachmentMaintenanceSummary | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSummary(await entryService.getAttachmentMaintenanceSummary());
    } catch (nextError) {
      console.error("Attachment maintenance summary failed", nextError);
      setError(labels?.loadFailed || "Failed to read attachment statistics");
    } finally {
      setLoading(false);
    }
  }, [labels?.loadFailed]);

  const openPanel = useCallback(() => {
    setOpen(true);
    void loadSummary();
  }, [loadSummary]);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  useEffect(() => {
    uiEvents.on("OPEN_ATTACHMENT_MAINTENANCE", openPanel);
    return () => {
      uiEvents.off("OPEN_ATTACHMENT_MAINTENANCE", openPanel);
    };
  }, [openPanel]);

  return (
    <AttachmentMaintenanceModal
      open={open}
      summary={summary}
      loading={loading}
      error={error}
      labels={labels}
      onClose={close}
      onRefresh={loadSummary}
    />
  );
}

function AttachmentMaintenanceModal({
  open,
  summary,
  loading,
  error,
  labels,
  onClose,
  onRefresh,
}: {
  open: boolean;
  summary: AttachmentMaintenanceSummary | null;
  loading: boolean;
  error: string | null;
  labels: AttachmentMaintenanceLabels;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const { styles } = useAppTheme();
  const [expandedUploads, setExpandedUploads] = useState<Set<string>>(
    () => new Set(),
  );
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
                relative flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border shadow-2xl
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
                <div className="grid gap-3 sm:grid-cols-3">
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
                  <div
                    className="mt-4 rounded-2xl border border-error/20 bg-error/10 px-4 py-3 text-sm font-medium text-error"
                  >
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
                                    {upload.relative_path}
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
                                <span className="w-16 text-right text-xs font-bold text-base-content/60">
                                  {formatBytes(upload.size)}
                                </span>
                              </div>
                            </button>
                            {expanded && (
                              <AttachmentReferenceList
                                upload={upload}
                                labels={labels}
                              />
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
                <div
                  className={`mt-3 text-xs font-medium leading-relaxed ${styles.card.textSecondary}`}
                >
                  {labels.cleanupHint}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-base-content/10 px-6 py-4">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm rounded-full"
                  onClick={onRefresh}
                  disabled={loading}
                >
                  <RefreshCw size={15} />
                  {labels.refresh}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm rounded-full"
                  onClick={onClose}
                >
                  {labels.close}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </EscModalWrapper>
  );
}

function AttachmentReferenceList({
  upload,
  labels,
}: {
  upload: AttachmentMaintenanceItem;
  labels: AttachmentMaintenanceLabels;
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
          {upload.references.map((reference) => (
            <div
              key={reference.entry_id}
              className="rounded-lg bg-base-200/45 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-xs font-bold">
                  {formatReferenceDate(reference, labels)}
                </span>
                <span className="shrink-0 rounded-full bg-base-content/10 px-2 py-0.5 text-[10px] font-bold uppercase text-base-content/60">
                  {reference.entry_type}
                </span>
              </div>
              <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-base-content/60">
                {reference.preview || labels.emptyPreview}
              </div>
            </div>
          ))}
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
