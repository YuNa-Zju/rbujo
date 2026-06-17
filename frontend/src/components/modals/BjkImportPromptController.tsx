import { listen } from "@tauri-apps/api/event";
import { AnimatePresence, motion } from "framer-motion";
import { FileArchive, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { EscModalWrapper } from "../common/EscModalWrapper";
import { useAppTheme } from "../../hooks/useAppTheme";
import { useTranslation } from "../../hooks/useTranslation";
import { dataBackupService } from "../../services/dataBackupService";
import {
  entryService,
  type PendingBjkImport,
} from "../../services/entryService";

const UNDO_STORAGE_KEY = "bujo_last_import_ids";

type ImportStatus = "idle" | "loading" | "success" | "error";

export default function BjkImportPromptController() {
  const { t } = useTranslation();
  const { styles } = useAppTheme();
  const [pending, setPending] = useState<PendingBjkImport | null>(null);
  const [status, setStatus] = useState<ImportStatus>("idle");
  const [message, setMessage] = useState("");
  const statusRef = useRef<ImportStatus>("idle");

  const setImportStatus = useCallback((nextStatus: ImportStatus) => {
    statusRef.current = nextStatus;
    setStatus(nextStatus);
  }, []);

  const openPrompt = useCallback(
    (payload: PendingBjkImport | null | undefined) => {
      if (!payload?.path) return;
      if (statusRef.current === "loading") {
        entryService.clearPendingBjkImport(payload.token).catch((error) => {
          console.warn("Ignored pending BJK import cleanup failed", error);
        });
        return;
      }
      setPending(payload);
      setImportStatus("idle");
      setMessage("");
    },
    [setImportStatus],
  );

  const close = useCallback(() => {
    if (statusRef.current === "loading") return;
    const token = pending?.token;
    setPending(null);
    setImportStatus("idle");
    setMessage("");
    if (token) {
      entryService.clearPendingBjkImport(token).catch((error) => {
        console.warn("Pending BJK import cleanup failed", error);
      });
    }
  }, [pending, setImportStatus]);

  useEffect(() => {
    entryService
      .takePendingBjkImport()
      .then(openPrompt)
      .catch((error) => {
        console.warn("Pending BJK import check failed", error);
      });
  }, [openPrompt]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    const register = async () => {
      try {
        unlisten = await listen<PendingBjkImport>("file:open-bjk", (event) => {
          openPrompt(event.payload);
        });
      } catch (error) {
        console.warn("BJK file-open listener registration failed", error);
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
  }, [openPrompt]);

  const confirmImport = async () => {
    if (!pending) return;
    if (statusRef.current === "loading") return;

    setImportStatus("loading");
    setMessage(t.backup?.externalImportReading || "Reading backup...");

    try {
      const file = await entryService.readBjkImportFile(
        pending.path,
        pending.token,
      );
      const result = await dataBackupService.importBjkArchive(
        new Uint8Array(file.bytes),
      );
      const insertedIds = result.insertedIds || [];
      const changedCount = result.count + result.updated_count;

      if (insertedIds.length > 0) {
        localStorage.setItem(UNDO_STORAGE_KEY, JSON.stringify(insertedIds));
      } else {
        localStorage.removeItem(UNDO_STORAGE_KEY);
      }
      await entryService.clearPendingBjkImport(pending.token);

      setImportStatus("success");
      setMessage(
        (t.backup?.externalImportSuccess || "Imported {{count}} entries.")
          .replace("{{count}}", String(changedCount)),
      );
      window.setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (error) {
      console.error("BJK import failed", error);
      setImportStatus("error");
      setMessage(t.backup?.externalImportError || t.backup?.error || "Import failed.");
    }
  };

  const open = Boolean(pending);
  const filename = pending?.filename || "backup.bjk";
  const description = (t.backup?.externalImportDesc || "Import {{filename}}?")
    .replace("{{filename}}", filename);

  return (
    <EscModalWrapper id="BjkImportPrompt" isOpen={open} onClose={close}>
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[6600] flex items-center justify-center p-4 isolation-isolate">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={`absolute inset-0 ${styles.backdrop}`}
              onClick={close}
            />

            <motion.div
              initial={{ scale: 0.96, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0, y: 12 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              className={`
                relative w-full max-w-md overflow-hidden rounded-3xl border p-6 shadow-2xl
                ${styles.modal.base}
              `}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <FileArchive size={22} />
                  </div>
                  <div className="min-w-0">
                    <p
                      className={`text-xs font-bold uppercase tracking-[0.18em] ${styles.card.textSecondary}`}
                    >
                      .bjk
                    </p>
                    <h2 className={`mt-1 text-lg font-bold ${styles.modal.title}`}>
                      {t.backup?.externalImportTitle || "Import backup?"}
                    </h2>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={close}
                  disabled={status === "loading"}
                  className="btn btn-ghost btn-sm btn-circle shrink-0"
                  aria-label={t.common?.close || "Close"}
                >
                  <X size={16} />
                </button>
              </div>

              <div
                className={`
                  mt-5 rounded-2xl border p-4
                  ${styles.card.bg} ${styles.card.border}
                `}
              >
                <div className={`truncate text-base font-bold ${styles.card.textPrimary}`}>
                  {filename}
                </div>
                <p
                  className={`mt-2 text-sm font-medium leading-relaxed ${styles.card.textSecondary}`}
                >
                  {description}
                </p>
                {pending?.path && (
                  <p
                    className={`mt-3 truncate font-mono text-xs ${styles.card.textSecondary}`}
                    title={pending.path}
                  >
                    {pending.path}
                  </p>
                )}
              </div>

              {message && (
                <div
                  className={`
                    mt-4 rounded-2xl border px-4 py-3 text-sm font-semibold
                    ${
                      status === "error"
                        ? "border-error/30 bg-error/10 text-error"
                        : status === "success"
                          ? "border-success/30 bg-success/10 text-success"
                          : `${styles.card.bg} ${styles.card.border} ${styles.card.textSecondary}`
                    }
                  `}
                >
                  {message}
                </div>
              )}

              <div className="mt-6 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={close}
                  disabled={status === "loading"}
                  className={`btn rounded-full font-bold ${styles.card.textSecondary}`}
                >
                  {t.backup?.externalImportCancel || "Not now"}
                </button>
                <button
                  type="button"
                  onClick={confirmImport}
                  disabled={status === "loading" || status === "success"}
                  className="btn btn-primary rounded-full font-bold shadow-lg shadow-primary/20"
                >
                  {status === "loading" && (
                    <Loader2 className="animate-spin" size={16} />
                  )}
                  {t.backup?.externalImportConfirm || "Import"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </EscModalWrapper>
  );
}
