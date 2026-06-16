import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, FolderOpen, Loader2, Settings, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { EscModalWrapper } from "../common/EscModalWrapper";
import type { translations } from "../../config/translations";
import { useAppTheme } from "../../hooks/useAppTheme";
import { useTranslation } from "../../hooks/useTranslation";
import { uiEvents } from "../../lib/uiEvents";
import {
  entryService,
  type MarkdownWorkspace,
} from "../../services/entryService";

type MarkdownSettingsLabels = (typeof translations)["zh"]["markdownSettings"];

export default function MarkdownSettingsController() {
  const { t } = useTranslation();
  const labels = t.markdownSettings;
  const [open, setOpen] = useState(false);
  const [workspace, setWorkspace] = useState<MarkdownWorkspace | null>(null);
  const [loading, setLoading] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setWorkspace(await entryService.getMarkdownWorkspace());
    } catch (nextError) {
      console.error("Markdown workspace settings failed", nextError);
      setError(labels.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [labels.loadFailed]);

  const openPanel = useCallback(() => {
    setOpen(true);
    void loadWorkspace();
  }, [loadWorkspace]);

  const close = useCallback(() => setOpen(false), []);

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

  useEffect(() => {
    uiEvents.on("OPEN_MARKDOWN_SETTINGS", openPanel);
    return () => {
      uiEvents.off("OPEN_MARKDOWN_SETTINGS", openPanel);
    };
  }, [openPanel]);

  return (
    <MarkdownSettingsModal
      open={open}
      labels={labels}
      workspace={workspace}
      loading={loading}
      choosing={choosing}
      error={error}
      onChoose={chooseWorkspace}
      onClose={close}
    />
  );
}

function MarkdownSettingsModal({
  open,
  labels,
  workspace,
  loading,
  choosing,
  error,
  onChoose,
  onClose,
}: {
  open: boolean;
  labels: MarkdownSettingsLabels;
  workspace: MarkdownWorkspace | null;
  loading: boolean;
  choosing: boolean;
  error: string | null;
  onChoose: () => void;
  onClose: () => void;
}) {
  const { styles } = useAppTheme();

  return (
    <EscModalWrapper
      id="MarkdownSettingsModal"
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
              className={`relative flex w-full max-w-xl flex-col overflow-hidden rounded-3xl border shadow-2xl ${styles.modal.base}`}
            >
              <div className="flex items-start justify-between gap-4 border-b border-base-content/10 px-6 py-5">
                <div className="flex min-w-0 items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Settings size={22} />
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

              <div className="space-y-4 px-6 py-5">
                <div
                  className={`rounded-2xl border p-4 ${styles.card.bg} ${styles.card.border}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <FolderOpen size={16} className="text-primary/75" />
                      <span className="text-sm font-bold">
                        {labels.workspaceLabel}
                      </span>
                    </div>
                    {workspace?.is_default && (
                      <span className="rounded-full bg-primary/10 px-2 py-1 text-[11px] font-bold text-primary">
                        {labels.defaultBadge}
                      </span>
                    )}
                  </div>
                  <div className="mt-3 rounded-xl bg-base-200/45 px-3 py-2 font-mono text-xs leading-relaxed text-base-content/70">
                    {loading ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 size={13} className="animate-spin" />
                        {labels.choosing}
                      </span>
                    ) : (
                      workspace?.absolute_path || "-"
                    )}
                  </div>
                  <p
                    className={`mt-3 text-xs font-medium leading-relaxed ${styles.card.textSecondary}`}
                  >
                    {labels.description}
                  </p>
                </div>

                {error && (
                  <div className="rounded-2xl border border-error/20 bg-error/10 px-4 py-3 text-sm font-medium text-error">
                    {error}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-base-content/10 px-6 py-4">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm rounded-full"
                  onClick={onClose}
                >
                  {labels.close}
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm rounded-full"
                  onClick={onChoose}
                  disabled={loading || choosing}
                >
                  {choosing ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={15} />
                  )}
                  {choosing ? labels.choosing : labels.chooseFolder}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </EscModalWrapper>
  );
}
