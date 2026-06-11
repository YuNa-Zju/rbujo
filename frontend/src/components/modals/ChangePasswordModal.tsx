import { useRef, useImperativeHandle, forwardRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Lock,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Check,
  ShieldCheck,
} from "lucide-react";
import { useTranslation } from "../../hooks/useTranslation";
import { ENTRY_THEME } from "../../config/entryTheme";
import { authService } from "../../services/authService"; // ✅ 引入 Service

export interface ChangePasswordModalRef {
  open: () => void;
}

interface Props {
  onSuccess: (newKey: string) => void;
}

const ChangePasswordModal = forwardRef<ChangePasswordModalRef, Props>(
  ({ onSuccess }, ref) => {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const { t } = useTranslation();

    const [form, setForm] = useState({
      oldPassword: "",
      newPassword: "",
      confirmNewPassword: "",
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [successMsg, setSuccessMsg] = useState("");

    // 使用 Task 主题
    const theme = ENTRY_THEME.task;

    // 样式：统一的高颜值输入框
    const inputClassName = `
    input w-full bg-base-200/50 pl-11 h-12 rounded-xl text-sm font-medium
    placeholder:text-base-content/30 transition-all duration-200
    border border-transparent !outline-none focus:!outline-none
    focus:bg-base-100 focus:border-primary/20 focus:ring-4 focus:ring-primary/5
  `;

    const activeIconClass = `group-focus-within/input:text-primary transition-colors duration-300`;

    useImperativeHandle(ref, () => {
      return {
        open: () => {
          setForm({
            oldPassword: "",
            newPassword: "",
            confirmNewPassword: "",
          });
          setError("");
          setSuccessMsg("");
          dialogRef.current?.showModal();
        },
      };
    });

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setError("");
      setSuccessMsg("");

      if (form.newPassword !== form.confirmNewPassword) {
        setError(t.auth?.passwordMismatch || "New passwords do not match");
        return;
      }

      setLoading(true);
      try {
        // ✅ 调用 Service
        const data = await authService.changePassword(
          form.oldPassword,
          form.newPassword,
        );

        setSuccessMsg(
          data.message ||
            t.auth?.changeSuccess ||
            "Password changed successfully!",
        );

        setTimeout(() => {
          dialogRef.current?.close();
          if (data.new_recovery_key) {
            onSuccess(data.new_recovery_key);
          }
        }, 1500);
      } catch (err: any) {
        // 错误处理
        const status = err.response?.status;
        let msg = t.auth?.changeFailed || "Failed to change password";
        if (status === 401 || status === 403) {
          msg = t.auth?.oldPasswordWrong || "Incorrect old password";
        } else if (err.response?.data?.detail) {
          msg = err.response.data.detail;
        }
        setError(msg);
      } finally {
        setLoading(false);
      }
    };

    return createPortal(
      <dialog
        ref={dialogRef}
        className="modal modal-bottom sm:modal-middle"
        onCancel={(e) => e.preventDefault()}
      >
        <div className="modal-box w-[calc(100%-2rem)] max-w-sm p-0 bg-base-100 shadow-2xl rounded-[2rem] overflow-hidden m-4 border border-base-content/5 relative z-10">
          {/* === Header: 大气卡片风格 === */}
          <div className="bg-base-100 px-6 py-6 border-b border-base-200/50 sticky top-0 z-20 flex justify-between items-start">
            <div className="flex items-center gap-4">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center bg-base-200 text-base-content/70 shadow-sm border border-base-content/5`}
              >
                <Lock size={24} strokeWidth={2.5} />
              </div>
              <div className="flex flex-col">
                <h3 className="font-bold text-lg text-base-content leading-tight">
                  {t.auth?.changePassword || "Change Password"}
                </h3>
                <p className="text-xs text-base-content/50 mt-1 font-medium">
                  {t.auth?.secureAccount || "Secure your account"}
                </p>
              </div>
            </div>
            <form method="dialog">
              <button className="btn btn-sm btn-circle btn-ghost bg-base-200/50 hover:bg-base-200 text-base-content/40 hover:text-base-content border-transparent transition-all">
                <X size={18} />
              </button>
            </form>
          </div>

          <div className="p-6 pt-6">
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              {error && (
                <div className="alert alert-error text-xs py-3 rounded-2xl bg-error/10 border-error/20 text-error flex items-center gap-2.5 font-bold animate-in zoom-in-95">
                  <AlertCircle size={16} /> {error}
                </div>
              )}

              {successMsg && (
                <div className="alert alert-success text-xs py-3 rounded-2xl bg-success/10 border-success/20 text-success flex items-center gap-2.5 font-bold animate-in zoom-in-95">
                  <Check size={16} /> {successMsg}
                </div>
              )}

              {/* Old Password */}
              <div className="space-y-4">
                <div className="relative group/input">
                  <input
                    type="password"
                    name="oldPassword"
                    autoComplete="current-password"
                    className={inputClassName}
                    placeholder={t.auth?.currentPassword || "Current Password"}
                    required
                    value={form.oldPassword}
                    onChange={(e) =>
                      setForm({ ...form, oldPassword: e.target.value })
                    }
                  />
                  <div
                    className={`absolute left-4 top-1/2 -translate-y-1/2 text-base-content/30 transition-colors pointer-events-none ${activeIconClass}`}
                  >
                    <KeyRound size={18} />
                  </div>
                </div>

                <div className="divider my-0 text-[10px] opacity-40 font-bold tracking-widest uppercase px-4">
                  {t.common?.to || "To"}
                </div>

                {/* New Password */}
                <div className="relative group/input">
                  <input
                    type="password"
                    name="newPassword"
                    autoComplete="new-password"
                    className={inputClassName}
                    placeholder={t.auth?.newPassword || "New Password"}
                    required
                    value={form.newPassword}
                    onChange={(e) =>
                      setForm({ ...form, newPassword: e.target.value })
                    }
                  />
                  <div
                    className={`absolute left-4 top-1/2 -translate-y-1/2 text-base-content/30 transition-colors pointer-events-none ${activeIconClass}`}
                  >
                    <ShieldCheck size={18} />
                  </div>
                </div>

                {/* Confirm New */}
                <div className="relative group/input">
                  <input
                    type="password"
                    name="confirmNewPassword"
                    autoComplete="new-password"
                    className={inputClassName}
                    placeholder={
                      t.auth?.confirmNewPassword || "Confirm New Password"
                    }
                    required
                    value={form.confirmNewPassword}
                    onChange={(e) =>
                      setForm({ ...form, confirmNewPassword: e.target.value })
                    }
                  />
                  <div
                    className={`absolute left-4 top-1/2 -translate-y-1/2 text-base-content/30 transition-colors pointer-events-none ${activeIconClass}`}
                  >
                    <CheckCircle2 size={18} />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                className={`btn w-full h-12 mt-2 rounded-xl text-white shadow-lg shadow-primary/20 hover:shadow-primary/30 active:scale-[0.98] transition-all ${theme.btnBg} border-none font-bold text-base`}
                disabled={loading || !!successMsg}
              >
                {loading ? (
                  <span className="loading loading-spinner" />
                ) : (
                  t.auth?.updateBtn || "Update Password"
                )}
              </button>
            </form>
          </div>
        </div>

        {/* ✅ 修复遮罩：使用标准 DaisyUI 结构 */}
        <form method="dialog" className="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>,
      document.body,
    );
  },
);

export default ChangePasswordModal;
