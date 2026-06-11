import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { authEvents } from "../../lib/authEvents";
import { useTranslation } from "../../hooks/useTranslation";

const SessionExpiredModal = () => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  // 1. 监听事件，只负责改变状态
  useEffect(() => {
    const handleExpired = () => {
      console.log("🚨 Session Expired Event Received!"); // 添加日志方便调试
      setIsOpen(true);
    };

    authEvents.on("sessionExpired", handleExpired);

    return () => {
      authEvents.off("sessionExpired", handleExpired);
    };
  }, []);

  // 2. ✅ 核心修复：监听 isOpen 变化，当它变为 true 且 DOM 存在时，打开弹窗
  useEffect(() => {
    if (isOpen && dialogRef.current) {
      if (!dialogRef.current.open) {
        dialogRef.current.showModal();
      }
    }
  }, [isOpen]);

  const handleLogin = () => {
    dialogRef.current?.close();
    setIsOpen(false);
    navigate("/login");
  };

  // 如果没有打开，不渲染 DOM (为了性能和避免遮挡)
  if (!isOpen) return null;

  return createPortal(
    <dialog
      ref={dialogRef}
      className="modal modal-bottom sm:modal-middle"
      onCancel={(e) => e.preventDefault()}
      onClose={() => setIsOpen(false)} // 防止意外关闭导致状态不一致
    >
      <div className="modal-box p-0 w-[calc(100%-2rem)] max-w-sm bg-base-100 rounded-[2rem] shadow-2xl overflow-hidden m-4 border border-base-content/5 relative z-50">
        {/* Header */}
        <div className="bg-error/5 p-6 flex flex-col items-center justify-center text-center border-b border-error/10">
          <div className="w-16 h-16 rounded-full bg-error/10 text-error flex items-center justify-center mb-4 animate-in zoom-in-95 duration-300">
            <LogOut size={32} strokeWidth={2.5} className="ml-1" />
          </div>
          <h3 className="text-xl font-black text-base-content">
            {t.error?.sessionExpired || "Session Expired"}
          </h3>
          <p className="text-sm text-base-content/60 mt-2 font-medium px-4">
            {t.error?.sessionExpiredDesc ||
              "Your login session has timed out. Please log in again to continue."}
          </p>
        </div>

        {/* Action */}
        <div className="p-6">
          <button
            onClick={handleLogin}
            className="btn btn-error w-full h-12 rounded-xl text-white font-bold shadow-lg shadow-error/20"
          >
            {t.auth?.linkLogin || "Log In Again"}
          </button>
        </div>
      </div>

      {/* 强制遮罩 */}
      <div className="modal-backdrop bg-black/50 backdrop-blur-sm cursor-not-allowed z-40"></div>
    </dialog>,
    document.body,
  );
};

export default SessionExpiredModal;
