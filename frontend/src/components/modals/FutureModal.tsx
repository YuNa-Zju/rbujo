import { type RefObject } from "react";
import { CalendarClock, X, Sparkles, CalendarDays } from "lucide-react";
import { useTranslation } from "../../hooks/useTranslation";

interface Props {
  dialogRef: RefObject<HTMLDialogElement | null>;
  futureMonth: string;
  setFutureMonth: (month: string) => void;
  onConfirm: (isSomeday: boolean) => void;
  loading: boolean;
}

export default function FutureModal({
  dialogRef,
  futureMonth,
  setFutureMonth,
  onConfirm,
  loading,
}: Props) {
  const { t } = useTranslation();

  const isSomeday = !futureMonth;

  return (
    <dialog
      ref={dialogRef}
      className="modal modal-bottom sm:modal-middle"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="modal-box p-6 rounded-t-3xl sm:rounded-3xl shadow-2xl bg-base-100">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-bold text-xl flex items-center gap-2 text-amber-500">
            <CalendarClock size={24} /> {t.entry.futureTitle}
          </h3>
          <form method="dialog">
            <button className="btn btn-sm btn-circle btn-ghost text-base-content/50 hover:bg-base-200">
              <X size={20} />
            </button>
          </form>
        </div>

        {/* Content Cards */}
        <div className="flex flex-col gap-4 mb-8">
          {/* Option 1: Month Card */}
          <div
            className={`
              relative w-full p-4 rounded-2xl border-2 transition-all duration-200 flex items-center gap-4 text-left
              ${
                !isSomeday
                  ? "border-amber-500 bg-amber-500/5 shadow-sm"
                  : "border-base-200 bg-base-100 hover:border-base-300 hover:bg-base-200/30"
              }
            `}
          >
            {/* 🔥 核心修复：添加 showPicker() 并在 onClick 中调用 */}
            <input
              type="month"
              className="absolute inset-0 w-full h-full opacity-0 z-10 cursor-pointer"
              value={futureMonth}
              onChange={(e) => {
                setFutureMonth(e.target.value);
              }}
              onClick={(e) => {
                e.stopPropagation();
                // ✅ 修复 Desktop 端：强制弹出月份选择器
                try {
                  if (typeof e.currentTarget.showPicker === "function") {
                    e.currentTarget.showPicker();
                  }
                } catch (error) {
                  console.warn("showPicker not supported", error);
                }
              }}
            />

            {/* Icon */}
            <div
              className={`
              p-3 rounded-full transition-colors shrink-0
              ${!isSomeday ? "bg-amber-500 text-white" : "bg-base-200 text-base-content/50"}
            `}
            >
              <CalendarDays size={20} />
            </div>

            {/* Text */}
            <div className="flex flex-col items-start flex-1 min-w-0">
              <span
                className={`font-bold text-lg ${!isSomeday ? "text-amber-600 dark:text-amber-400" : "text-base-content/80"}`}
              >
                {t.entry.futureMonth}
              </span>
              <span className="text-sm font-mono opacity-60 truncate">
                {futureMonth || "Tap to select date..."}
              </span>
            </div>

            {/* 选中指示器 */}
            <div
              className={`
              w-5 h-5 rounded-full border-2 flex items-center justify-center ml-2 transition-all shrink-0
              ${!isSomeday ? "border-amber-500" : "border-base-300"}
            `}
            >
              {!isSomeday && (
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              )}
            </div>
          </div>

          {/* Option 2: Someday Card */}
          <button
            onClick={() => setFutureMonth("")}
            className={`
              relative w-full p-4 rounded-2xl border-2 transition-all duration-200 flex items-center gap-4 text-left z-20
              ${
                isSomeday
                  ? "border-amber-500 bg-amber-500/5 shadow-sm"
                  : "border-base-200 bg-base-100 hover:border-base-300 hover:bg-base-200/30"
              }
            `}
          >
            <div
              className={`
              p-3 rounded-full transition-colors shrink-0
              ${isSomeday ? "bg-amber-500 text-white" : "bg-base-200 text-base-content/50"}
            `}
            >
              <Sparkles size={20} />
            </div>

            <div className="flex flex-col flex-1">
              <span
                className={`font-bold text-lg ${isSomeday ? "text-amber-600 dark:text-amber-400" : "text-base-content/80"}`}
              >
                {t.entry.futureSomeday}
              </span>
            </div>

            <div
              className={`
              w-5 h-5 rounded-full border-2 flex items-center justify-center ml-2 transition-all
              ${isSomeday ? "border-amber-500" : "border-base-300"}
            `}
            >
              {isSomeday && (
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              )}
            </div>
          </button>
        </div>

        {/* Actions */}
        <div className="modal-action mt-0">
          <form method="dialog">
            <button className="btn btn-ghost rounded-full px-6 font-normal">
              {t.common.cancel}
            </button>
          </form>
          <button
            className="btn btn-warning bg-amber-500 hover:bg-amber-600 border-none rounded-full px-8 text-white shadow-lg shadow-amber-500/20"
            onClick={() => onConfirm(isSomeday)}
            disabled={loading}
          >
            {loading && <span className="loading loading-spinner loading-xs" />}
            {t.entry.futureConfirm}
          </button>
        </div>
      </div>

      <form method="dialog" className="modal-backdrop">
        <button>close</button>
      </form>
    </dialog>
  );
}
