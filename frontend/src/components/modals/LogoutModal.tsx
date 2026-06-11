import { forwardRef, useImperativeHandle, useRef } from "react";
import { LogOut } from "lucide-react";
import { useTranslation } from "../../hooks/useTranslation";

// ✅ 1. 定义 Ref 接口，让父组件知道有哪些方法可用
export interface LogoutModalRef {
  showModal: () => void;
  close: () => void;
}

interface LogoutModalProps {
  onConfirm: () => void;
}

// ✅ 2. 泛型改为 LogoutModalRef
const LogoutModal = forwardRef<LogoutModalRef, LogoutModalProps>(
  ({ onConfirm }, ref) => {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const { t } = useTranslation();

    // ✅ 3. 在 useImperativeHandle 中暴露 close 方法
    useImperativeHandle(ref, () => ({
      showModal: () => dialogRef.current?.showModal(),
      close: () => dialogRef.current?.close(), // 👈 加上这行！
    }));

    return (
      <dialog
        ref={dialogRef}
        className="modal modal-bottom sm:modal-middle backdrop:bg-black/60 transition-all"
      >
        <div className="modal-box p-0 bg-transparent shadow-none border-none w-full max-w-sm mx-auto overflow-visible">
          {/* 卡片主体 */}
          <div className="bg-base-100/90 backdrop-blur-xl rounded-[2rem] p-6 shadow-2xl border border-white/10 flex flex-col items-center gap-4 relative overflow-hidden">
            {/* 装饰背景光 */}
            <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-error/10 to-transparent pointer-events-none" />

            {/* 图标 */}
            <div className="w-20 h-20 rounded-full bg-base-100 flex items-center justify-center shadow-lg shadow-error/10 z-10 mt-4 ring-4 ring-base-100/50">
              <div className="w-14 h-14 rounded-full bg-error/10 flex items-center justify-center text-error">
                <LogOut size={28} strokeWidth={2.5} />
              </div>
            </div>

            {/* 文本 */}
            <div className="text-center z-10 mt-2">
              <h3 className="text-xl font-bold text-base-content mb-2">
                {t.calendar?.logout || "Log out?"}
              </h3>
              <p className="text-sm text-base-content/60 leading-relaxed px-4">
                {t.common?.logoutConfirm ||
                  "Are you sure you want to exit? Your local data will be cleared."}
              </p>
            </div>

            {/* 按钮组 */}
            <div className="flex flex-col w-full gap-3 mt-4 z-10">
              <button
                onClick={onConfirm}
                className="btn btn-error h-12 rounded-2xl w-full text-white shadow-lg shadow-error/30 border-0 font-bold text-base"
              >
                {t.calendar?.logout || "Yes, Logout"}
              </button>
              <form method="dialog" className="w-full">
                <button className="btn btn-ghost h-12 rounded-2xl w-full text-base-content/60 hover:bg-base-200 font-medium">
                  {t.common?.cancel || "Cancel"}
                </button>
              </form>
            </div>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>
    );
  },
);

export default LogoutModal;
