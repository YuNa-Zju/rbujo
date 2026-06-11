import { getVersion } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";
import { AnimatePresence, motion } from "framer-motion";
import { Info, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { EscModalWrapper } from "../common/EscModalWrapper";
import { useAppTheme } from "../../hooks/useAppTheme";
import { uiEvents } from "../../lib/uiEvents";

export default function VersionInfoController() {
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  const openVersionInfo = useCallback(() => {
    setOpen(true);
    setVersion(null);
    setFailed(false);

    if (!isTauri()) {
      setVersion("Web Preview");
      return;
    }

    getVersion()
      .then((currentVersion) => {
        setVersion(currentVersion);
      })
      .catch((error) => {
        console.warn("Version check failed", error);
        setFailed(true);
      });
  }, []);

  useEffect(() => {
    uiEvents.on("OPEN_VERSION_INFO", openVersionInfo);
    return () => {
      uiEvents.off("OPEN_VERSION_INFO", openVersionInfo);
    };
  }, [openVersionInfo]);

  return (
    <VersionInfoModal
      open={open}
      version={version}
      failed={failed}
      onClose={close}
    />
  );
}

function VersionInfoModal({
  open,
  version,
  failed,
  onClose,
}: {
  open: boolean;
  version: string | null;
  failed: boolean;
  onClose: () => void;
}) {
  const { styles } = useAppTheme();

  return (
    <EscModalWrapper id="VersionInfoModal" isOpen={open} onClose={onClose}>
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
                relative w-full max-w-sm overflow-hidden rounded-3xl border p-6 shadow-2xl
                ${styles.modal.base}
              `}
            >
              <button
                type="button"
                onClick={onClose}
                className="btn btn-ghost btn-sm btn-circle absolute right-4 top-4"
                aria-label="关闭"
              >
                <X size={16} />
              </button>

              <div className="flex items-start gap-4 pr-8">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Info size={22} />
                </div>

                <div className="min-w-0">
                  <h2 className={`text-lg font-bold ${styles.modal.title}`}>
                    版本信息
                  </h2>
                  <div
                    className={`
                      mt-4 rounded-2xl border px-4 py-3
                      ${styles.card.bg} ${styles.card.border}
                    `}
                  >
                    <div
                      className={`text-[11px] font-bold ${styles.card.textSecondary}`}
                    >
                      当前版本
                    </div>
                    <div
                      className={`mt-1 flex min-h-7 items-center font-mono text-lg font-bold ${styles.card.textPrimary}`}
                    >
                      {version ? (
                        version === "Web Preview" ? (
                          version
                        ) : (
                          `v${version}`
                        )
                      ) : failed ? (
                        <span className="font-sans text-sm font-semibold">
                          获取版本失败
                        </span>
                      ) : (
                        <Loader2 className="animate-spin" size={18} />
                      )}
                    </div>
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
