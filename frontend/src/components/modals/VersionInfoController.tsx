import { getVersion } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";
import { AnimatePresence, motion } from "framer-motion";
import { Info, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { EscModalWrapper } from "../common/EscModalWrapper";
import MarkdownViewer from "../MarkdownViewer";
import { useAppTheme } from "../../hooks/useAppTheme";
import { uiEvents } from "../../lib/uiEvents";

const RECENT_RELEASE_NOTES = `## 最近一次更新

- 软件名称统一为子弹笔记。
- Future Log 改为 Planning / Completed 双 tab。
- 归档按时间分组，支持多选恢复或永久删除。
- 修复 Windows 正式版启动时附带命令行窗口的问题。
- 版本与更新弹窗样式重新整理。`;

const VERSION_NOTES_MARKDOWN_STYLES = `
  .version-release-notes.prose-custom-scale h2,
  .version-release-notes.prose-custom-scale h3 {
    font-size: 0.95rem !important;
    line-height: 1.4 !important;
    margin: 0 0 0.5rem !important;
    padding: 0 !important;
    border: 0 !important;
    background: transparent !important;
    text-align: left !important;
  }

  .version-release-notes.prose-custom-scale p,
  .version-release-notes.prose-custom-scale li {
    font-size: 0.875rem !important;
    line-height: 1.65 !important;
    margin-bottom: 0.45rem !important;
    text-align: left !important;
  }

  .version-release-notes.prose-custom-scale ul {
    margin: 0.35rem 0 0 1.1rem !important;
    padding-left: 0.55rem !important;
  }
`;

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
                relative w-full max-w-md overflow-hidden rounded-3xl border p-6 shadow-2xl
                ${styles.modal.base}
              `}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Info size={22} />
                  </div>

                  <div className="min-w-0">
                    <p
                      className={`text-xs font-bold uppercase tracking-[0.18em] ${styles.card.textSecondary}`}
                    >
                      子弹笔记
                    </p>
                    <h2 className={`mt-1 text-lg font-bold ${styles.modal.title}`}>
                      版本信息
                    </h2>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="btn btn-ghost btn-sm btn-circle shrink-0"
                  aria-label="关闭"
                >
                  <X size={16} />
                </button>
              </div>

              <div
                className={`
                  mt-5 w-full rounded-2xl border px-4 py-3
                  ${styles.card.bg} ${styles.card.border}
                `}
              >
                <div
                  className={`text-[11px] font-bold ${styles.card.textSecondary}`}
                >
                  当前版本
                </div>
                <div
                  className={`mt-1 flex min-h-8 items-center font-mono text-xl font-bold ${styles.card.textPrimary}`}
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

              <div
                className={`
                  mt-4 rounded-2xl border p-4
                  ${styles.card.bg} ${styles.card.border}
                `}
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className={`text-sm font-bold ${styles.modal.title}`}>
                    最近一次更新
                  </span>
                  <span
                    className={`rounded-full bg-base-200/60 px-2 py-0.5 text-[11px] font-semibold ${styles.card.textSecondary}`}
                  >
                    Release Notes
                  </span>
                </div>
                <MarkdownViewer
                  content={RECENT_RELEASE_NOTES}
                  disableOverflowCheck
                  isTagClickable={false}
                  readOnly
                  entryType="event"
                  className="version-release-notes"
                />
                <style>{VERSION_NOTES_MARKDOWN_STYLES}</style>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </EscModalWrapper>
  );
}
