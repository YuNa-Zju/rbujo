import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { AnimatePresence, motion } from "framer-motion";
import { Download, Loader2, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";

import { EscModalWrapper } from "../common/EscModalWrapper";
import { useAppTheme } from "../../hooks/useAppTheme";
import {
  checkForUpdates,
  dismissUpdate,
  installUpdate,
  type UpdateMetadata,
} from "../../services/updateService";
import type { UpdateCheckSource } from "../../services/updatePromptPolicy";

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
        toast.error("检查更新失败，请稍后重试");
      }
    } finally {
      checkingRef.current = false;
    }
  }, []);

  useEffect(() => {
    void runCheck("startup");
  }, [runCheck]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    const register = async () => {
      try {
        unlisten = await listen("menu:check-update", () => {
          void runCheck("manual");
        });
      } catch {
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
  }, [runCheck]);

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
                relative w-full max-w-md overflow-hidden rounded-3xl border p-6 shadow-2xl
                ${styles.modal.base}
              `}
            >
              <button
                type="button"
                onClick={onClose}
                disabled={installing}
                className="btn btn-ghost btn-sm btn-circle absolute right-4 top-4"
                aria-label="暂不更新"
              >
                <X size={16} />
              </button>

              <div className="flex items-start gap-4 pr-8">
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
                    当前版本 {update.currentVersion}，可更新到 {update.version}。
                    更新会自动下载并安装，完成后应用会重启。
                  </p>
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
