import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { AnimatePresence, motion } from "framer-motion";
import { Download, Loader2, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";

import { EscModalWrapper } from "../common/EscModalWrapper";
import MarkdownViewer from "../MarkdownViewer";
import { useAppTheme } from "../../hooks/useAppTheme";
import { uiEvents } from "../../lib/uiEvents";
import {
  checkForUpdates,
  dismissUpdate,
  installUpdate,
  type UpdateMetadata,
} from "../../services/updateService";
import { getUpdateCheckFailureMessage } from "../../services/updateCheckErrors";
import type { UpdateCheckSource } from "../../services/updatePromptPolicy";
import { getUpdateReleaseNotes } from "../../services/updateReleaseNotes";

const UPDATE_NOTES_MARKDOWN_STYLES = `
  .update-release-notes.prose-custom-scale h1,
  .update-release-notes.prose-custom-scale h2,
  .update-release-notes.prose-custom-scale h3,
  .update-release-notes.prose-custom-scale h4,
  .update-release-notes.prose-custom-scale h5,
  .update-release-notes.prose-custom-scale h6 {
    font-size: 0.95rem !important;
    line-height: 1.45 !important;
    margin: 0.85rem 0 0.45rem !important;
    padding: 0 !important;
    border: 0 !important;
    background: transparent !important;
    text-align: left !important;
  }

  .update-release-notes.prose-custom-scale h1::after {
    display: none !important;
  }

  .update-release-notes.prose-custom-scale p,
  .update-release-notes.prose-custom-scale li {
    font-size: 0.875rem !important;
    line-height: 1.7 !important;
    margin-bottom: 0.55rem !important;
    text-align: left !important;
  }

  .update-release-notes.prose-custom-scale ul,
  .update-release-notes.prose-custom-scale ol {
    margin: 0.4rem 0 0.75rem 1.1rem !important;
    padding-left: 0.55rem !important;
  }

  .update-release-notes.prose-custom-scale pre {
    margin: 0.65rem 0 !important;
  }
`;

export default function UpdateCheckController() {
  const [update, setUpdate] = useState<UpdateMetadata | null>(null);
  const [installing, setInstalling] = useState(false);
  const checkingRef = useRef(false);

  const runCheck = useCallback(async (source: UpdateCheckSource) => {
    if (checkingRef.current) {
      if (source === "manual") {
        toast("正在检查更新...");
      }
      return;
    }

    checkingRef.current = true;
    const loadingToast =
      source === "manual" ? toast.loading("正在检查更新...") : null;

    try {
      const result = await checkForUpdates(source);

      if (loadingToast) {
        toast.dismiss(loadingToast);
      }

      if (result.status === "available") {
        setUpdate(result.update);
        return;
      }

      if (source === "manual") {
        if (result.status === "none" || result.status === "suppressed") {
          toast.success("已经是最新版本");
        } else if (result.status === "unsupported") {
          toast("安装后的正式版才会检查更新");
        }
      }
    } catch (error) {
      if (loadingToast) {
        toast.dismiss(loadingToast);
      }
      console.warn("Update check failed", error);
      if (source === "manual") {
        toast.error(getUpdateCheckFailureMessage(error));
      }
    } finally {
      checkingRef.current = false;
    }
  }, []);

  useEffect(() => {
    void runCheck("startup");
  }, [runCheck]);

  useEffect(() => {
    const handleCheckUpdate = () => {
      void runCheck("manual");
    };

    uiEvents.on("OPEN_CHECK_UPDATE", handleCheckUpdate);
    return () => {
      uiEvents.off("OPEN_CHECK_UPDATE", handleCheckUpdate);
    };
  }, [runCheck]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    const register = async () => {
      try {
        unlisten = await listen("menu:check-update", () => {
          uiEvents.emit("OPEN_CHECK_UPDATE");
        });
      } catch (error) {
        console.warn("Native update menu listener registration failed", error);
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

  const close = useCallback(() => {
    if (!update || installing) {
      return;
    }
    dismissUpdate(update.version);
    setUpdate(null);
  }, [installing, update]);

  const handleInstall = useCallback(async () => {
    if (!update || installing) {
      return;
    }

    setInstalling(true);
    const toastId = toast.loading("正在下载并安装更新...");
    try {
      await installUpdate();
      toast.success("更新已安装，正在重启应用", { id: toastId });
    } catch (error) {
      console.error("Update install failed", error);
      toast.error("更新安装失败，请稍后重试", { id: toastId });
      setInstalling(false);
    }
  }, [installing, update]);

  return (
    <UpdatePromptModal
      update={update}
      installing={installing}
      onClose={close}
      onInstall={handleInstall}
    />
  );
}

function UpdatePromptModal({
  update,
  installing,
  onClose,
  onInstall,
}: {
  update: UpdateMetadata | null;
  installing: boolean;
  onClose: () => void;
  onInstall: () => void;
}) {
  const { styles } = useAppTheme();
  const open = Boolean(update);
  const releaseNotes = update ? getUpdateReleaseNotes(update) : "";

  return (
    <EscModalWrapper id="UpdatePromptModal" isOpen={open} onClose={onClose}>
      <AnimatePresence>
        {open && update && (
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
                relative w-full max-w-lg overflow-hidden rounded-3xl border p-6 shadow-2xl
                ${styles.modal.base}
              `}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <RefreshCw size={22} />
                  </div>

                  <div className="min-w-0">
                    <h2 className={`text-lg font-bold ${styles.modal.title}`}>
                      发现新版本
                    </h2>
                    <p
                      className={`mt-2 text-sm leading-relaxed ${styles.card.textSecondary}`}
                    >
                      可以安装新的版本。更新会自动下载并安装，完成后应用会重启。
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={installing}
                  className="btn btn-ghost btn-sm btn-circle shrink-0"
                  aria-label="暂不更新"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <VersionBadge label="当前版本" version={update.currentVersion} />
                <VersionBadge label="最新版本" version={update.version} />
              </div>

              <div
                className={`
                  mt-5 rounded-2xl border p-4
                  ${styles.card.bg} ${styles.card.border}
                `}
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className={`text-sm font-bold ${styles.modal.title}`}>
                    更新日志
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${styles.card.textSecondary} bg-base-200/60`}
                  >
                    Markdown
                  </span>
                </div>
                <div className="max-h-64 overflow-y-auto pr-1">
                  <MarkdownViewer
                    content={releaseNotes}
                    disableOverflowCheck
                    isTagClickable={false}
                    readOnly
                    entryType="event"
                    className="update-release-notes"
                  />
                  <style>{UPDATE_NOTES_MARKDOWN_STYLES}</style>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={installing}
                  className={`btn btn-ghost rounded-full font-bold ${styles.card.textSecondary}`}
                >
                  暂不更新
                </button>
                <button
                  type="button"
                  onClick={onInstall}
                  disabled={installing}
                  className="btn btn-primary rounded-full font-bold shadow-lg shadow-primary/20"
                >
                  {installing ? (
                    <Loader2 className="animate-spin" size={16} />
                  ) : (
                    <Download size={16} />
                  )}
                  立即更新
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </EscModalWrapper>
  );
}

function VersionBadge({ label, version }: { label: string; version: string }) {
  const { styles } = useAppTheme();

  return (
    <div
      className={`
        rounded-2xl border px-3 py-2.5
        ${styles.card.bg} ${styles.card.border}
      `}
    >
      <div className={`text-[11px] font-bold ${styles.card.textSecondary}`}>
        {label}
      </div>
      <div className={`mt-1 truncate font-mono text-sm ${styles.card.textPrimary}`}>
        v{version}
      </div>
    </div>
  );
}
