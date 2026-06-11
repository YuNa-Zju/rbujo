import { useRef, useImperativeHandle, forwardRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  User,
  KeyRound,
  Lock,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Check,
  ShieldCheck,
} from "lucide-react";
import { useTranslation } from "../../../hooks/useTranslation";
import { ENTRY_THEME } from "../../../config/entryTheme";
import { authService } from "../../../services/authService";

export interface ResetPasswordModalRef {
  open: () => void;
}

interface Props {
  onSuccess: (newKey: string) => void;
}

const ResetPasswordModal = forwardRef<ResetPasswordModalRef, Props>(
  ({ onSuccess }, ref) => {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const { t } = useTranslation();

    const [step, setStep] = useState<1 | 2>(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [successMsg, setSuccessMsg] = useState("");

    const [verifyForm, setVerifyForm] = useState({
      username: "",
      recoveryKey: "",
    });
    const [resetForm, setResetForm] = useState({
      newPassword: "",
      confirmNewPassword: "",
    });

    const theme = ENTRY_THEME.task;

    const inputClassName = `
    input w-full bg-base-200/50 pl-11 h-12 rounded-xl text-sm font-medium
    placeholder:text-base-content/30 transition-all duration-200
    border border-transparent !outline-none focus:!outline-none
    focus:bg-base-100 focus:border-primary/20 focus:ring-4 focus:ring-primary/5
  `;

    const activeIconClass = `group-focus-within/input:text-primary transition-colors duration-300`;

    useImperativeHandle(ref, () => ({
      open: () => {
        setStep(1);
        setVerifyForm({ username: "", recoveryKey: "" });
        setResetForm({ newPassword: "", confirmNewPassword: "" });
        setError("");
        setSuccessMsg("");
        dialogRef.current?.showModal();
      },
    }));

    const handleVerify = async (e: React.FormEvent) => {
      e.preventDefault();
      setError("");
      setLoading(true);

      try {
        await authService.verifyRecovery(
          verifyForm.username,
          verifyForm.recoveryKey,
        );
        setStep(2);
      } catch (err: any) {
        console.error(err);
        setError(
          err.response?.data?.detail ||
            t.auth?.verifyFailed ||
            "Verification failed.",
        );
      } finally {
        setLoading(false);
      }
    };

    const handleReset = async (e: React.FormEvent) => {
      e.preventDefault();
      setError("");
      setSuccessMsg("");

      if (resetForm.newPassword !== resetForm.confirmNewPassword) {
        setError(t.auth?.passwordMismatch || "Passwords do not match");
        return;
      }

      setLoading(true);
      try {
        const data = await authService.resetPassword(
          verifyForm.username,
          verifyForm.recoveryKey,
          resetForm.newPassword,
        );

        // ✅ 修正：使用翻译键值
        setSuccessMsg(t.auth?.resetSuccess || "Password reset successfully!");

        setTimeout(() => {
          dialogRef.current?.close();
          if (data.new_recovery_key) {
            onSuccess(data.new_recovery_key);
          }
        }, 1500);
      } catch (err: any) {
        console.error(err);
        setError(
          err.response?.data?.detail ||
            t.auth?.resetFailed ||
            "Failed to reset password.",
        );
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
          {/* Header */}
          <div className="bg-base-100 px-6 py-6 border-b border-base-200/50 sticky top-0 z-20 flex justify-between items-start">
            <div className="flex items-start gap-4">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm border border-base-200 transition-colors duration-500
                ${
                  step === 1
                    ? "bg-primary/10 text-primary border-primary/10"
                    : "bg-success/10 text-success border-success/10"
                }`}
              >
                {step === 1 ? (
                  <ShieldCheck size={24} strokeWidth={2.5} />
                ) : (
                  <Lock size={24} strokeWidth={2.5} />
                )}
              </div>

              <div className="flex flex-col pt-0.5">
                <h3 className="font-bold text-lg text-base-content leading-tight">
                  {step === 1
                    ? t.auth?.resetStep1 || "Verify Identity"
                    : t.auth?.resetStep2 || "Reset Password"}
                </h3>
                <p className="text-xs text-base-content/50 mt-1 font-medium">
                  {t.common?.Step || "Step"} {step} / 2
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
            {error && (
              <div className="alert alert-error text-xs py-3 mb-5 rounded-2xl bg-error/10 border-error/20 text-error flex items-center gap-2.5 font-bold animate-in zoom-in-95">
                <AlertCircle size={16} /> {error}
              </div>
            )}

            {/* ✅ 核心修改：重新设计成功提示框 */}
            {successMsg && (
              <div className="mb-6 bg-success/10 border border-success/20 text-success p-4 rounded-2xl flex items-center gap-4 shadow-sm animate-in zoom-in-95">
                <div className="w-10 h-10 rounded-full bg-success text-white flex items-center justify-center shrink-0 shadow-md shadow-success/20">
                  <Check size={20} strokeWidth={3} />
                </div>
                <div>
                  <h4 className="font-bold text-sm tracking-wide">
                    {t.common?.success || "Success"}
                  </h4>
                  <p className="text-xs opacity-90 font-medium mt-0.5">
                    {successMsg}
                  </p>
                </div>
              </div>
            )}

            {step === 1 ? (
              /* Step 1 Form */
              <form
                onSubmit={handleVerify}
                className="flex flex-col gap-5 animate-in slide-in-from-right duration-300"
              >
                <div className="text-xs text-base-content/60 bg-base-200/30 p-4 rounded-2xl leading-relaxed border border-base-content/5">
                  {t.auth?.resetDesc1 ||
                    "Enter your username and the recovery key provided during registration."}
                </div>

                <div className="space-y-4">
                  <div className="relative group/input">
                    <input
                      type="text"
                      name="username"
                      autoComplete="username"
                      className={inputClassName}
                      placeholder={t.auth?.userPlaceholder || "Username"}
                      required
                      value={verifyForm.username}
                      onChange={(e) =>
                        setVerifyForm({
                          ...verifyForm,
                          username: e.target.value,
                        })
                      }
                    />
                    <div
                      className={`absolute left-4 top-1/2 -translate-y-1/2 text-base-content/30 transition-colors pointer-events-none ${activeIconClass}`}
                    >
                      <User size={18} />
                    </div>
                  </div>

                  <div className="relative group/input">
                    <input
                      type="text"
                      name="recoveryKey"
                      autoComplete="off"
                      className={inputClassName}
                      placeholder={
                        t.auth?.recoveryKeyPlaceholder ||
                        "Recovery Key (e.g. rK-xxxx)"
                      }
                      required
                      value={verifyForm.recoveryKey}
                      onChange={(e) =>
                        setVerifyForm({
                          ...verifyForm,
                          recoveryKey: e.target.value,
                        })
                      }
                    />
                    <div
                      className={`absolute left-4 top-1/2 -translate-y-1/2 text-base-content/30 transition-colors pointer-events-none ${activeIconClass}`}
                    >
                      <KeyRound size={18} />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  className={`btn w-full h-12 rounded-xl text-white shadow-lg shadow-primary/20 hover:shadow-primary/30 active:scale-[0.98] transition-all ${theme.btnBg} border-none font-bold text-base`}
                  disabled={loading}
                >
                  {loading ? (
                    <span className="loading loading-spinner" />
                  ) : (
                    <span className="flex items-center gap-2">
                      {t.common?.next || "Next"}{" "}
                      <ArrowRight size={18} strokeWidth={2.5} />
                    </span>
                  )}
                </button>
              </form>
            ) : (
              /* Step 2 Form */
              <form
                onSubmit={handleReset}
                className="flex flex-col gap-5 animate-in slide-in-from-right duration-300"
              >
                {/* 隐藏成功消息显示时的说明文案，避免太乱 */}
                {!successMsg && (
                  <div className="text-xs text-success bg-success/5 border border-success/10 p-4 rounded-2xl flex items-center gap-3 font-medium">
                    <div className="w-5 h-5 rounded-full bg-success text-white flex items-center justify-center shrink-0">
                      <Check size={12} strokeWidth={4} />
                    </div>
                    {t.auth?.resetDesc2 ||
                      "Identity verified. Please set a new password."}
                  </div>
                )}

                <div className="space-y-4">
                  <div className="relative group/input">
                    <input
                      type="password"
                      name="newPassword"
                      autoComplete="new-password"
                      className={inputClassName}
                      placeholder={t.auth?.newPassPlaceholder || "New Password"}
                      required
                      value={resetForm.newPassword}
                      onChange={(e) =>
                        setResetForm({
                          ...resetForm,
                          newPassword: e.target.value,
                        })
                      }
                    />
                    <div
                      className={`absolute left-4 top-1/2 -translate-y-1/2 text-base-content/30 transition-colors pointer-events-none ${activeIconClass}`}
                    >
                      <Lock size={18} />
                    </div>
                  </div>

                  <div className="relative group/input">
                    <input
                      type="password"
                      name="confirmNewPassword"
                      autoComplete="new-password"
                      className={inputClassName}
                      placeholder={
                        t.auth?.confirmNewPass || "Confirm New Password"
                      }
                      required
                      value={resetForm.confirmNewPassword}
                      onChange={(e) =>
                        setResetForm({
                          ...resetForm,
                          confirmNewPassword: e.target.value,
                        })
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
                  className={`btn w-full h-12 rounded-xl text-white shadow-lg shadow-primary/20 hover:shadow-primary/30 active:scale-[0.98] transition-all ${theme.btnBg} border-none font-bold text-base`}
                  disabled={loading || !!successMsg}
                >
                  {loading ? (
                    <span className="loading loading-spinner" />
                  ) : (
                    t.auth?.resetBtn || "Reset Password"
                  )}
                </button>
              </form>
            )}
          </div>
        </div>

        <form method="dialog" className="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>,
      document.body,
    );
  },
);

export default ResetPasswordModal;
