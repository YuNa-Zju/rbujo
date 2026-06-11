import { useState, useRef, useEffect } from "react";
import {
  User,
  Lock,
  ArrowRight,
  PenTool,
  HelpCircle,
  Languages,
  AlertCircle,
  CheckCircle2,
  KeyRound,
} from "lucide-react";
// ✅ 1. 引入路由钩子
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "./useAuth";
import { useTranslation } from "../../hooks/useTranslation";
import HelpModal, { type HelpModalRef } from "./components/HelpModal";
import ResetPasswordModal, {
  type ResetPasswordModalRef,
} from "./components/ResetPasswordModal";
import RecoveryKeyModal, {
  type RecoveryKeyModalRef,
} from "./components/RecoveryKeyModal";
import { ENTRY_THEME } from "../../config/entryTheme";

// ✅ 新增：强制重置 iOS 缩放的工具函数
// 原理：通过临时修改 meta viewport 禁止缩放，浏览器就会强制回弹到原始比例
const resetIOSZoom = () => {
  const viewportMeta = document.querySelector('meta[name="viewport"]');
  if (viewportMeta) {
    const originalContent = viewportMeta.getAttribute("content");
    // 强制设置 maximum-scale=1 来复位
    viewportMeta.setAttribute(
      "content",
      "width=device-width, initial-scale=1, maximum-scale=1",
    );
    // 100ms 后还原（可选，防止影响后续页面的缩放能力），或者直接跳转走了也行
    setTimeout(() => {
      if (originalContent)
        viewportMeta.setAttribute("content", originalContent);
    }, 100);
  }
};

export default function LoginPage() {
  // ✅ 2. 初始化路由钩子
  const navigate = useNavigate();
  const location = useLocation();
  // 获取“我从哪里来”，如果不知道就回首页 "/"
  const from = location.state?.from?.pathname || "/";

  const [isRegister, setIsRegister] = useState(false);
  const [form, setForm] = useState({
    username: "",
    password: "",
    confirmPassword: "",
  });
  const [toast, setToast] = useState<{
    show: boolean;
    msg: string;
    type: "success" | "error";
  } | null>(null);

  const [pendingLogin, setPendingLogin] = useState<{
    username: string;
    password: string;
  } | null>(null);

  const { authenticate, loading } = useAuth();
  const { t, toggleLang } = useTranslation();

  const helpRef = useRef<HelpModalRef>(null);
  const resetRef = useRef<ResetPasswordModalRef>(null);
  const recoveryRef = useRef<RecoveryKeyModalRef>(null);

  const taskTheme = ENTRY_THEME.task;
  const ideaTheme = ENTRY_THEME.idea;

  useEffect(() => {
    if (toast?.show) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    setForm({ username: "", password: "", confirmPassword: "" });
    setToast(null);
  }, [isRegister]);

  // ✅ 新增：封装带缩放重置的跳转函数
  const navigateWithZoomReset = () => {
    // 1. 先触发失焦，收起键盘（有时候收起键盘浏览器会自动复位，但加上 reset 更保险）
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    // 2. 强制重置缩放
    resetIOSZoom();

    // 3. 给予浏览器一点时间渲染“缩放复位”的动画，然后再跳转，体验更丝滑
    setTimeout(() => {
      navigate(from, { replace: true });
    }, 150);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isRegister && form.password !== form.confirmPassword) {
      setToast({
        show: true,
        msg: t.auth?.passwordMismatch || "Passwords do not match",
        type: "error",
      });
      return;
    }

    try {
      const res = (await authenticate(
        form.username,
        form.password,
        isRegister,
      )) as any;

      if (isRegister && res?.recovery_key) {
        // 如果是注册，先暂存登录信息，弹出 Key 弹窗，暂不跳转
        setPendingLogin({ username: form.username, password: form.password });
        recoveryRef.current?.open(res.recovery_key);
      } else {
        // ✅ 3. 修改：如果是普通登录，调用重置并跳转
        navigateWithZoomReset();
      }
    } catch (err: any) {
      setToast({ show: true, msg: err.message, type: "error" });
      setForm((prev) => ({ ...prev, password: "", confirmPassword: "" }));
    }
  };

  const handleResetSuccess = (newKey: string) => {
    recoveryRef.current?.open(newKey);
  };

  const handleRecoveryClose = async () => {
    // 注册并记录 Key 后，自动登录
    if (pendingLogin) {
      try {
        await authenticate(pendingLogin.username, pendingLogin.password, false);
        setPendingLogin(null);
        // ✅ 4. 修改：注册成功自动登录后，也调用重置并跳转
        navigateWithZoomReset();
      } catch (error) {
        console.error("Auto login failed", error);
      }
    }
  };

  const inputClassName = `
    input w-full bg-base-200/50
    pl-11 h-12 rounded-xl text-sm font-medium
    placeholder:text-base-content/30 transition-all duration-200
    border border-transparent
    !outline-none focus:!outline-none
    focus:bg-base-100
    focus:border-indigo-500/50
    focus:ring-4 focus:ring-indigo-500/10
  `;

  const activeIconClass = `group-focus-within/input:${taskTheme.color.split(" ")[0]}`;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f9f9fb] dark:bg-base-300 relative overflow-hidden font-sans selection:bg-primary/20">
      {toast && (
        <div className="fixed top-6 z-[100] animate-in slide-in-from-top-4 duration-300">
          <div
            className={`alert ${toast.type === "error" ? "alert-error bg-error/10 text-error border-error/20" : "alert-success bg-success/10 text-success border-success/20"} shadow-lg rounded-full px-6 py-2.5 flex items-center gap-2 border backdrop-blur-md`}
          >
            {toast.type === "error" ? (
              <AlertCircle size={18} />
            ) : (
              <CheckCircle2 size={18} />
            )}
            <span className="text-sm font-medium">{toast.msg}</span>
          </div>
        </div>
      )}

      <div className="absolute inset-0 w-full h-full pointer-events-none overflow-hidden">
        <div
          className={`absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full blur-[120px] opacity-20 ${taskTheme.sideBar}`}
        />
        <div
          className={`absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full blur-[120px] opacity-20 ${ideaTheme.sideBar}`}
        />
        <div
          className="absolute inset-0 opacity-[0.4]"
          style={{
            backgroundImage: "radial-gradient(#94a3b8 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />
      </div>

      <div className="card w-full max-w-[380px] bg-base-100/90 backdrop-blur-xl shadow-2xl z-10 border border-white/40 dark:border-white/5 rounded-3xl overflow-visible relative group">
        <div className="absolute -top-12 right-0 flex gap-2">
          <button
            className="btn btn-circle btn-sm bg-base-100/50 backdrop-blur-md border-transparent hover:bg-white hover:text-primary shadow-sm transition-all"
            onClick={toggleLang}
          >
            <Languages size={16} />
          </button>
          <button
            className="btn btn-circle btn-sm bg-base-100/50 backdrop-blur-md border-transparent hover:bg-white hover:text-primary shadow-sm transition-all"
            onClick={() => helpRef.current?.open()}
          >
            <HelpCircle size={16} />
          </button>
        </div>

        <div className="card-body px-8 py-10">
          <div className="text-center mb-8 relative">
            <div
              className={`w-14 h-14 text-white rounded-2xl rotate-3 flex items-center justify-center mx-auto mb-5 shadow-lg group-hover:rotate-6 transition-transform duration-500 ${taskTheme.sideBar} shadow-indigo-500/30`}
            >
              <PenTool size={26} className="text-white" />
            </div>
            <h1 className="text-2xl font-serif font-bold tracking-tight text-base-content">
              {isRegister ? t.auth.joinUs : t.auth.welcomeBack}
            </h1>
            <p className="text-xs font-medium text-base-content/50 mt-2 uppercase tracking-wider">
              {isRegister ? t.auth.descRegister : t.auth.descLogin}
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-4 relative"
          >
            <div className="space-y-4">
              <div className="form-control">
                <div className="relative group/input">
                  <input
                    type="text"
                    id="username"
                    name="username"
                    autoComplete="username"
                    className={inputClassName}
                    placeholder={t.auth.userPlaceholder}
                    required
                    value={form.username}
                    onChange={(e) =>
                      setForm({ ...form, username: e.target.value })
                    }
                  />
                  <div
                    className={`absolute left-4 top-1/2 -translate-y-1/2 text-base-content/30 transition-colors pointer-events-none ${activeIconClass}`}
                  >
                    <User size={18} />
                  </div>
                </div>
              </div>

              <div className="form-control">
                <div className="relative group/input">
                  <input
                    type="password"
                    id="password"
                    name="password"
                    autoComplete={
                      isRegister ? "new-password" : "current-password"
                    }
                    className={inputClassName}
                    placeholder={t.auth.passPlaceholder}
                    required
                    value={form.password}
                    onChange={(e) =>
                      setForm({ ...form, password: e.target.value })
                    }
                  />
                  <div
                    className={`absolute left-4 top-1/2 -translate-y-1/2 text-base-content/30 transition-colors pointer-events-none ${activeIconClass}`}
                  >
                    <Lock size={18} />
                  </div>
                </div>
              </div>

              {!isRegister && (
                <div className="flex justify-end px-1 -mt-2">
                  <button
                    type="button"
                    className={`text-xs font-medium ${taskTheme.color} hover:underline opacity-80 hover:opacity-100 transition-opacity`}
                    onClick={() => resetRef.current?.open()}
                  >
                    {t.auth?.forgotPassword || "Forgot password?"}
                  </button>
                </div>
              )}

              <div
                className={`transition-all duration-300 ease-in-out overflow-hidden ${isRegister ? "max-h-24 opacity-100 p-1 -m-1" : "max-h-0 opacity-0"}`}
              >
                <div className="form-control pt-1">
                  <div className="relative group/input">
                    <input
                      type="password"
                      id="confirm-password"
                      name="confirmPassword"
                      autoComplete="new-password"
                      className={inputClassName}
                      placeholder={
                        t.auth?.confirmPassPlaceholder || "Confirm Password"
                      }
                      required={isRegister}
                      value={form.confirmPassword}
                      onChange={(e) =>
                        setForm({ ...form, confirmPassword: e.target.value })
                      }
                    />
                    <div
                      className={`absolute left-4 top-1/2 -translate-y-1/2 text-base-content/30 transition-colors pointer-events-none ${activeIconClass}`}
                    >
                      <KeyRound size={18} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <button
              type="submit"
              className={`btn w-full h-12 rounded-xl mt-2 text-base font-bold shadow-lg hover:-translate-y-0.5 transition-all duration-300 border-none ${taskTheme.btnBg}`}
              disabled={loading}
            >
              {loading ? (
                <span className="loading loading-spinner loading-sm" />
              ) : (
                <span className="flex items-center gap-2">
                  {isRegister ? t.auth.btnSignUp : t.auth.btnSignIn}{" "}
                  <ArrowRight size={18} strokeWidth={2.5} />
                </span>
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-base-content/5 text-center">
            <p className="text-xs font-medium text-base-content/60 mb-2">
              {isRegister ? t.auth.switchHave : t.auth.switchNew}
            </p>
            <button
              className={`text-sm font-bold transition-colors relative group/link ${taskTheme.color} hover:opacity-80`}
              onClick={() => setIsRegister(!isRegister)}
            >
              {isRegister ? t.auth.linkLogin : t.auth.linkCreate}
              <span
                className={`absolute -bottom-1 left-0 w-0 h-0.5 rounded-full transition-all group-hover/link:w-full ${taskTheme.sideBar}`}
              ></span>
            </button>
          </div>
        </div>
      </div>

      <HelpModal ref={helpRef} />
      <ResetPasswordModal ref={resetRef} onSuccess={handleResetSuccess} />
      <RecoveryKeyModal ref={recoveryRef} onClose={handleRecoveryClose} />
    </div>
  );
}
