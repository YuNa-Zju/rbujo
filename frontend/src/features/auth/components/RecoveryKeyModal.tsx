import { useRef, useImperativeHandle, forwardRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ShieldAlert,
  Copy,
  Check,
  KeyRound,
  AlertTriangle,
} from "lucide-react";
import { useTranslation } from "../../../hooks/useTranslation";

export interface RecoveryKeyModalRef {
  open: (key: string) => void;
}

interface Props {
  onClose?: () => void;
}

const RecoveryKeyModal = forwardRef<RecoveryKeyModalRef, Props>(
  ({ onClose }, ref) => {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const { t } = useTranslation();
    const [recoveryKey, setRecoveryKey] = useState("");
    const [copied, setCopied] = useState(false);

    useImperativeHandle(ref, () => ({
      open: (key: string) => {
        setRecoveryKey(key);
        dialogRef.current?.showModal();
      },
    }));

    const handleCopy = () => {
      if (!recoveryKey) return;
      navigator.clipboard.writeText(recoveryKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

    const handleClose = () => {
      dialogRef.current?.close();
      if (onClose) onClose();
    };

    return createPortal(
      <dialog
        ref={dialogRef}
        className="modal modal-bottom sm:modal-middle"
        onCancel={(e) => e.preventDefault()}
      >
        <div className="modal-box w-[calc(100%-2rem)] max-w-md p-0 bg-base-100 shadow-2xl rounded-[2rem] border border-base-content/5 overflow-hidden m-4 relative z-10">
          {/* === Header: 红色/警告风格 (Eye-catching yet elegant) === */}
          {/* 使用 error/5 背景，既有红色氛围，又不会在暗黑模式下刺眼 */}
          <div className="bg-error/5 px-6 py-6 border-b border-error/10 sticky top-0 z-20 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-error/10 text-error flex items-center justify-center shadow-sm border border-error/10 shrink-0">
              <ShieldAlert size={26} strokeWidth={2.5} />
            </div>
            <div>
              <h3 className="font-bold text-lg text-base-content leading-tight">
                {t.auth?.recoveryTitle || "Save Recovery Key"}
              </h3>
              {/* 副标题使用红色，强调重要性 */}
              <p className="text-xs text-error font-bold mt-1 uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle size={10} strokeWidth={3} />
                {t.auth?.critical || "Critical: Do Not Lose"}
              </p>
            </div>
          </div>

          <div className="p-6 pt-6 space-y-6">
            {/* Description Box */}
            <div className="bg-base-200/50 p-4 rounded-2xl text-xs text-base-content/70 leading-relaxed border border-base-content/5">
              {t.auth?.recoveryDesc ||
                "We do not store your password. If you forget it, you must use this key to reset it. Please save it securely."}
            </div>

            {/* Key Display Area */}
            <div className="flex flex-col gap-3">
              <div
                className={`relative group p-2 rounded-2xl border-2 border-dashed border-error/20 bg-base-100`}
              >
                <div className="flex items-center justify-between p-4 gap-3 bg-base-200/30 rounded-xl overflow-hidden group-hover:bg-base-200/50 transition-colors">
                  <KeyRound size={20} className="text-error/60 shrink-0" />
                  {/* 字体颜色使用红色，再次强调 */}
                  <code className="flex-1 font-mono text-lg font-bold text-center text-error tracking-wider break-all selection:bg-error/20">
                    {recoveryKey}
                  </code>
                </div>
              </div>

              <button
                onClick={handleCopy}
                className={`btn btn-outline border-base-200 hover:border-error/20 bg-base-100 hover:bg-error/5 text-base-content/70 w-full rounded-xl gap-2 font-bold shadow-sm active:scale-[0.98] transition-all h-11 min-h-0 ${
                  copied
                    ? "text-success! border-success! bg-success/5!"
                    : "hover:text-error!"
                }`}
              >
                {copied ? (
                  <Check size={16} strokeWidth={3} />
                ) : (
                  <Copy size={16} />
                )}
                {copied
                  ? t.common?.copied || "Copied"
                  : t.common?.copy || "Copy Key"}
              </button>
            </div>

            <div className="divider my-0 opacity-10"></div>

            {/* 底部按钮使用 Error 风格，但稍微深一点，或者使用 Neutral 黑/白 保持沉稳 */}
            <button
              onClick={handleClose}
              // 这里用 btn-error 会非常醒目，如果你觉得太红了，可以换回 btn-neutral
              className="btn btn-block btn-error h-12 rounded-xl text-white shadow-lg shadow-error/20 hover:shadow-error/30 font-bold text-base"
            >
              {t.auth?.iHaveSaved || "I have saved it securely"}
            </button>
          </div>
        </div>

        {/* ✅ 标准 DaisyUI 遮罩，同步关闭 */}
        <form method="dialog" className="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>,
      document.body,
    );
  },
);

export default RecoveryKeyModal;
