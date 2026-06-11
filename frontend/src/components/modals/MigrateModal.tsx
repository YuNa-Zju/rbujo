import { type RefObject } from "react";
import { ArrowRight, X, CalendarDays } from "lucide-react";
import { useTranslation } from "../../hooks/useTranslation";

interface Props {
  dialogRef: RefObject<HTMLDialogElement | null>;
  dateInput: string;
  setDateInput: (date: string) => void;
  onConfirm: () => void;
  loading: boolean;
}

export default function MigrateModal({
  dialogRef,
  dateInput,
  setDateInput,
  onConfirm,
  loading,
}: Props) {
  const { t } = useTranslation();

  return (
    <dialog
      ref={dialogRef}
      className="modal modal-bottom sm:modal-middle"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="modal-box p-6 rounded-t-3xl sm:rounded-3xl shadow-2xl bg-base-100">
        {/* Header - Info Theme (Blue) */}
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-bold text-xl flex items-center gap-2 text-info">
            <ArrowRight size={24} strokeWidth={2.5} /> {t.entry.migrateTitle}
          </h3>
          <form method="dialog">
            <button className="btn btn-sm btn-circle btn-ghost text-base-content/50 hover:bg-base-200">
              <X size={20} />
            </button>
          </form>
        </div>

        {/* Description */}
        <p className="text-base text-base-content/70 mb-4 font-medium px-1">
          {t.entry.migrateDesc}
        </p>

        {/* Date Picker Card */}
        <div className="flex flex-col gap-4 mb-8">
          <div
            className={`
              relative w-full p-4 rounded-2xl border-2 transition-all duration-200 flex items-center gap-4 text-left
              ${
                dateInput
                  ? "border-info bg-info/5 shadow-sm"
                  : "border-base-200 bg-base-100 hover:border-base-300 hover:bg-base-200/30"
              }
            `}
          >
            {/* 🔥 核心修复：添加 showPicker() 调用 */}
            <input
              type="date"
              className="absolute inset-0 w-full h-full opacity-0 z-10 cursor-pointer"
              value={dateInput}
              onChange={(e) => setDateInput(e.target.value)}
              onClick={(e) => {
                e.stopPropagation();
                // ✅ 修复 Desktop 端：强制弹出日历选择器
                // 桌面浏览器点击 input 默认只是聚焦输入文字，必须调用 showPicker 才能弹出日历面板
                try {
                  if (typeof e.currentTarget.showPicker === "function") {
                    e.currentTarget.showPicker();
                  }
                } catch (error) {
                  // Fallback: 某些旧环境可能不支持，忽略错误保持默认行为
                  console.warn("showPicker not supported", error);
                }
              }}
            />

            {/* Icon */}
            <div
              className={`
              p-3 rounded-full transition-colors shrink-0
              ${dateInput ? "bg-info text-white" : "bg-base-200 text-base-content/50"}
            `}
            >
              <CalendarDays size={20} />
            </div>

            {/* Text Display */}
            <div className="flex flex-col items-start flex-1 min-w-0">
              <span
                className={`font-bold text-lg ${dateInput ? "text-info" : "text-base-content/80"}`}
              >
                {t.entry.migrateDateLabel || "Target Date"}
              </span>
              <span className="text-sm font-mono opacity-60 truncate">
                {dateInput || "Select a date..."}
              </span>
            </div>

            {/* 选中指示器 */}
            <div
              className={`
              w-5 h-5 rounded-full border-2 flex items-center justify-center ml-2 transition-all shrink-0
              ${dateInput ? "border-info" : "border-base-300"}
            `}
            >
              {dateInput && (
                <div className="w-2.5 h-2.5 rounded-full bg-info" />
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="modal-action mt-0">
          <form method="dialog">
            <button className="btn btn-ghost rounded-full px-6 font-normal">
              {t.common.cancel}
            </button>
          </form>
          <button
            className="btn btn-info bg-info hover:bg-info-focus border-none rounded-full px-8 text-white shadow-lg shadow-info/20"
            onClick={onConfirm}
            disabled={loading || !dateInput}
          >
            {loading && <span className="loading loading-spinner loading-xs" />}
            {t.entry.migrateConfirm}
          </button>
        </div>
      </div>

      <form method="dialog" className="modal-backdrop">
        <button>close</button>
      </form>
    </dialog>
  );
}
