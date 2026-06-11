import { useRef, useImperativeHandle, forwardRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Copy,
  Check,
  Globe,
  Link as LinkIcon,
  AlertCircle,
  X,
  ExternalLink,
} from "lucide-react";
import { entryService } from "../../services/entryService";
import { useTranslation } from "../../hooks/useTranslation";
import { ENTRY_THEME } from "../../config/entryTheme";
import { useAppTheme } from "../../hooks/useAppTheme"; // ✅ 1. 引入 Hook

export interface ShareEntryModalRef {
  open: (entryId: string) => void;
}

interface ShareEntryModalProps {
  onClose?: () => void;
}

const ShareEntryModal = forwardRef<ShareEntryModalRef, ShareEntryModalProps>(
  ({ onClose }, ref) => {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const { t } = useTranslation();

    // ✅ 2. 获取主题样式
    const { styles, isDark } = useAppTheme();

    const [link, setLink] = useState("");
    const [loading, setLoading] = useState(false);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState("");

    const theme = ENTRY_THEME.task;

    useImperativeHandle(ref, () => ({
      open: (id: string) => {
        setLink("");
        setCopied(false);
        setError("");
        dialogRef.current?.showModal();
        generateLink(id);
      },
    }));

    const generateLink = async (id: string) => {
      setLoading(true);
      setError("");
      try {
        const data = await entryService.share(id);
        setLink(data.share_url);
      } catch (e) {
        console.error("Generate share link failed:", e);
        setError(t.share?.error || "Create share link failed");
      } finally {
        setLoading(false);
      }
    };

    const copyToClipboard = () => {
      if (!link) return;
      navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

    const handleDialogClose = () => {
      if (onClose) onClose();
    };

    return createPortal(
      <dialog
        ref={dialogRef}
        onClose={handleDialogClose}
        className="modal modal-bottom sm:modal-middle transition-all duration-300"
        onClick={(e) =>
          e.target === dialogRef.current && dialogRef.current?.close()
        }
      >
        {/* ✅ 3. 应用统一的 Modal 样式 */}
        <div
          className={`
            modal-box p-0
            ${styles.modal.base}
            rounded-t-[2.5rem] sm:rounded-[2.5rem]
            overflow-hidden relative z-10
          `}
        >
          {/* Header Section */}
          {/* 使用 styles.modal.header，但由于 ShareModal 结构特殊（无 border-b，且有背景图），我们组合使用 */}
          <div className="px-8 pt-10 pb-6 flex items-start justify-between">
            <div className="flex items-center gap-5">
              <div
                className={`w-16 h-16 shrink-0 rounded-[1.5rem] flex items-center justify-center shadow-sm ${styles.modal.iconBox}`}
              >
                <Globe size={32} strokeWidth={2.5} />
              </div>
              <div className="min-w-0">
                <h3
                  className={`font-black text-2xl tracking-tight ${styles.modal.title}`}
                >
                  {t.share.title}
                </h3>
                <p
                  className={`text-base mt-1 font-medium ${styles.modal.subtitle}`}
                >
                  {t.share.desc}
                </p>
              </div>
            </div>
            <form method="dialog">
              <button className={styles.modal.closeBtn}>
                <X size={22} />
              </button>
            </form>
          </div>

          <div className="px-8 pb-10 space-y-8">
            {/* Error Alert */}
            {error && (
              <div className="alert alert-error py-4 rounded-2xl bg-error/10 border-error/20 text-error flex items-center gap-3 animate-in fade-in zoom-in-95">
                <AlertCircle size={20} />
                <span className="font-bold">{error}</span>
              </div>
            )}

            {/* Input Area */}
            <div className="space-y-4">
              <div className="flex justify-between items-center px-1">
                <label
                  className={`text-[11px] font-black uppercase tracking-[0.2em] ${styles.card.textSecondary}`}
                >
                  {t.share.public}
                </label>

                {/* 预览小胶囊 */}
                {link && (
                  <button
                    onClick={() => window.open(link, "_blank")}
                    className={`
                      flex items-center gap-1.5 px-4 py-1.5 rounded-full border transition-all active:scale-95
                      ${
                        isDark
                          ? "bg-indigo-500/10 text-indigo-300 border-indigo-500/20 hover:bg-indigo-500/20"
                          : "bg-indigo-50 text-indigo-600 border-indigo-100 hover:bg-indigo-100"
                      }
                    `}
                  >
                    <span className="text-sm font-bold">{t.share.preview}</span>
                    <ExternalLink size={14} strokeWidth={2.5} />
                  </button>
                )}
              </div>

              {/* ✅ 4. 使用统一的 Input 样式容器 */}
              <div className={styles.form.inputContainer}>
                <div
                  className={`transition-colors ${link ? "text-indigo-500" : "opacity-30"}`}
                >
                  <LinkIcon size={20} strokeWidth={2.5} />
                </div>
                <input
                  type="text"
                  readOnly
                  value={loading ? t.share.generating || "Generating..." : link}
                  className={`
                    ${styles.form.input}
                    ${link ? "font-medium" : "animate-pulse opacity-50"}
                  `}
                  placeholder={t.share.placeholder}
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4">
              <form method="dialog" className="flex-1">
                <button
                  className={`btn btn-ghost w-full h-14 rounded-2xl font-bold text-base ${isDark ? "text-slate-400 hover:bg-white/5" : "text-slate-500 hover:bg-slate-100"}`}
                >
                  {t.common.close}
                </button>
              </form>

              <button
                className={`
                  btn flex-[2.5] h-14 rounded-2xl text-white border-none shadow-lg
                  transition-all active:scale-95 text-base font-bold
                  ${
                    copied
                      ? "btn-success shadow-success/20"
                      : `${theme.btnBg} shadow-primary/20`
                  }
                  ${
                    !link || loading
                      ? "opacity-50 cursor-not-allowed"
                      : "hover:brightness-105"
                  }
                `}
                onClick={copyToClipboard}
                disabled={!link || loading}
              >
                {copied ? (
                  <div className="flex items-center gap-2 animate-in zoom-in-95">
                    <Check size={20} strokeWidth={3} />
                    <span>{t.share.copied}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Copy size={20} strokeWidth={2.5} />
                    <span>{t.share.copy}</span>
                  </div>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Backdrop */}
        <form method="dialog" className={`modal-backdrop ${styles.backdrop}`}>
          <button className="cursor-default outline-none">close</button>
        </form>
      </dialog>,
      document.body,
    );
  },
);

export default ShareEntryModal;
