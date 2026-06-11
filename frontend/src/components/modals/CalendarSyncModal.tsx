import { useRef, useImperativeHandle, forwardRef, useState } from "react";
import { createPortal } from "react-dom"; // ✅ 引入 createPortal
import {
  X,
  Copy,
  Globe,
  Calendar as CalendarIcon,
  Smartphone,
  ChevronRight,
  Info,
} from "lucide-react";
import { useTranslation } from "../../hooks/useTranslation";

// --- SVG Icons (保持不变) ---
const AppleLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
  </svg>
);

const GoogleLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className}>
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </svg>
);

export interface CalendarSyncModalRef {
  open: () => void;
}

const CalendarSyncModal = forwardRef<CalendarSyncModalRef, any>((_, ref) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { t } = useTranslation();

  const [feedUrl, setFeedUrl] = useState("");
  const [loading, setLoading] = useState(false);

  useImperativeHandle(ref, () => ({
    open: () => {
      dialogRef.current?.showModal();
      fetchLink();
    },
  }));

  const fetchLink = async () => {
    if (feedUrl) return;
    setLoading(true);
    setFeedUrl("");
    setLoading(false);
  };

  const handleCopy = () => {
    if (!feedUrl) return;
    navigator.clipboard.writeText(feedUrl);
  };

  const getWebcalLink = () => {
    if (!feedUrl) return "";
    return feedUrl.replace(/^https?:\/\//, "webcal://");
  };

  // 优化后的步骤条组件
  const StepItem = ({
    num,
    text,
    isLast,
  }: {
    num: number;
    text: string;
    isLast?: boolean;
  }) => (
    <div className="relative pl-8 pb-4 group last:pb-0">
      {/* 连接线 */}
      {!isLast && (
        <div className="absolute left-[11px] top-6 bottom-0 w-px bg-base-300 group-hover:bg-primary/20 transition-colors" />
      )}
      {/* 数字圆圈 */}
      <div className="absolute left-0 top-1 w-[22px] h-[22px] rounded-full bg-base-200 border border-base-300 flex items-center justify-center z-10 group-hover:border-primary/50 group-hover:bg-primary/5 transition-all shadow-sm">
        {/* ✅ 硬编码修复: Step 文字建议只显示数字，或者在 t 中定义 */}
        <span className="text-[10px] font-bold text-base-content/60 group-hover:text-primary">
          {num}
        </span>
      </div>
      {/* 文字内容 */}
      <p className="text-xs text-base-content/80 leading-relaxed pt-1">
        {text}
      </p>
    </div>
  );

  // 🚀 核心修改：使用 createPortal 将 Dialog 渲染到 document.body
  // 这样可以避免父级 overflow:hidden 导致的弹窗显示不全或 z-index 问题
  return createPortal(
    <dialog
      ref={dialogRef}
      className="modal modal-bottom sm:modal-middle backdrop-blur-sm"
      onClick={(e) => {
        // 点击背景关闭
        if (e.target === dialogRef.current) {
          dialogRef.current?.close();
        }
      }}
    >
      <div className="modal-box w-[calc(100%-2rem)] max-w-lg p-0 bg-base-100 shadow-2xl rounded-[2rem] overflow-hidden m-4 border border-base-content/5">
        {/* Header */}
        <div className="bg-base-100 px-6 py-5 flex justify-between items-start sticky top-0 z-20">
          <div className="flex gap-4 items-center">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/10 to-transparent flex items-center justify-center text-primary shadow-sm border border-primary/10">
              <CalendarIcon size={24} strokeWidth={2} />
            </div>
            <div>
              <h3 className="font-bold text-xl leading-tight text-base-content">
                {t.ics?.title || "Calendar Sync"}
              </h3>
              {/* ✅ 硬编码修复 */}
              <p className="text-xs text-base-content/50 mt-1 font-medium">
                {t.ics?.subtitle || "Sync with your lifestyle"}
              </p>
            </div>
          </div>

          <form method="dialog">
            <button className="btn btn-sm btn-circle btn-ghost bg-base-200/50 hover:bg-base-200 border border-transparent hover:border-base-300 transition-all text-base-content/60">
              <X size={18} />
            </button>
          </form>
        </div>

        {/* Scrollable Content */}
        <div className="px-6 pb-8 pt-2 overflow-y-auto max-h-[70vh]">
          <p className="text-sm text-base-content/70 leading-relaxed mb-6">
            {t.ics?.desc ||
              "Local desktop data is stored on this device. Calendar subscription export is not enabled in this build."}
          </p>

          <div className="alert rounded-2xl bg-info/10 border-info/20 text-info mb-6">
            <Info size={18} />
            <span className="text-sm font-medium">
              Desktop local mode keeps calendar data private and does not expose
              a public subscription URL.
            </span>
          </div>

          <div className="space-y-6">
            {/* Primary Action */}
            <div className="flex flex-col gap-2">
              <a
                href={getWebcalLink()}
                className={`btn btn-primary w-full h-12 shadow-lg shadow-primary/20 border-none relative overflow-hidden group rounded-xl ${
                  !feedUrl || loading ? "btn-disabled opacity-50" : ""
                }`}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] animate-[shimmer_3s_infinite]" />
                <div className="flex items-center gap-2 z-10">
                  <Smartphone size={18} />
                  {/* ✅ 硬编码修复 */}
                  <span className="font-bold">
                    {t.ics?.add || "Add to Calendar"}
                  </span>
                  <ChevronRight
                    size={14}
                    className="opacity-70 group-hover:translate-x-0.5 transition-transform"
                  />
                </div>
              </a>
            </div>

            {/* Link Copy Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                {/* ✅ 硬编码修复 */}
                <label className="text-[10px] font-bold text-base-content/40 uppercase tracking-widest">
                  {t.ics?.urlLabel || "Subscription URL"}
                </label>
              </div>
              <div className="flex items-center gap-2 bg-base-200/40 p-1.5 rounded-xl border border-base-200 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition-all">
                <div className="pl-2.5 text-base-content/30">
                  <Globe size={16} />
                </div>
                <input
                  type="text"
                  readOnly
                  // ✅ 硬编码修复
                  value={
                    loading ? t.ics?.generating || "Generating..." : feedUrl
                  }
                  className="bg-transparent border-none outline-none text-xs flex-1 text-base-content/70 font-mono w-full min-w-0 h-9"
                  onClick={(e) => e.currentTarget.select()}
                />
                <button
                  className={`btn btn-sm h-9 min-h-0 px-4 rounded-lg font-medium transition-all shadow-sm ${
                    "bg-base-100 hover:bg-white border-base-200 hover:border-base-300 text-base-content/70"
                  }`}
                  onClick={handleCopy}
                  disabled={loading || !feedUrl}
                >
                  <Copy size={14} />
                  {/* ✅ 硬编码修复 */}
                  <span className="text-xs ml-1.5">
                    {t.common?.copy || "Copy"}
                  </span>
                </button>
              </div>
            </div>

            {/* ✅ 硬编码修复 */}
            <div className="divider text-xs text-base-content/20 my-4 font-mono uppercase tracking-widest">
              {t.ics?.setupGuide || "Setup Guide"}
            </div>

            {/* Instructions Grid */}
            <div className="grid grid-cols-1 gap-4">
              {/* Apple Card */}
              <div className="bg-base-100 rounded-2xl p-5 border border-base-200/80 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-2 mb-4 pb-3 border-b border-base-100">
                  <AppleLogo className="w-5 h-5 text-base-content" />
                  <span className="font-bold text-sm text-base-content/90">
                    {t.ics?.ios?.title}
                  </span>
                </div>
                <div className="pt-1">
                  <StepItem num={1} text={t.ics?.ios?.step1} />
                  <StepItem num={2} text={t.ics?.ios?.step2} />
                  <StepItem num={3} text={t.ics?.ios?.step3} isLast />
                </div>
              </div>

              {/* Google Card */}
              <div className="bg-base-100 rounded-2xl p-5 border border-base-200/80 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-2 mb-4 pb-3 border-b border-base-100">
                  <GoogleLogo className="w-5 h-5" />
                  <span className="font-bold text-sm text-base-content/90">
                    {t.ics?.google?.title}
                  </span>
                </div>
                <div className="pt-1">
                  <StepItem num={1} text={t.ics?.google?.step1} />
                  <StepItem num={2} text={t.ics?.google?.step2} />
                  <StepItem num={3} text={t.ics?.google?.step3} isLast />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Backdrop Close */}
      <form
        method="dialog"
        className="modal-backdrop bg-black/30 backdrop-blur-[2px]"
      >
        <button>close</button>
      </form>
    </dialog>,
    document.body, // 挂载目标
  );
});

export default CalendarSyncModal;
