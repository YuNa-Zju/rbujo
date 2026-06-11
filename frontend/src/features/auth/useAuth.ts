import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "../../hooks/useTranslation";
import { authService } from "../../services/authService"; // 引入 Service
import { clearUserSession } from "../../utils/authUtils"; // ✅ 引入通用清理函数

export function useAuth() {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem("token"),
  );
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const { t } = useTranslation();

  const authenticate = async (
    username: string,
    password: string,
    isRegister: boolean,
  ) => {
    setLoading(true);
    try {
      // 1. 注册逻辑
      if (isRegister) {
        const data = await authService.register(username, password);
        return data;
      }

      // 2. 登录逻辑
      const { access_token, refresh_token } = await authService.login(
        username,
        password,
      );

      if (!access_token) {
        throw new Error("Login failed: No access token received");
      }

      // 3. 存储 Token
      localStorage.setItem("token", access_token);
      if (refresh_token) {
        localStorage.setItem("refresh_token", refresh_token);
      }
      setToken(access_token);

      // 4. 获取并存储用户信息
      try {
        const user = await authService.me();
        localStorage.setItem("user", JSON.stringify(user));
      } catch (e) {
        console.warn("Failed to fetch user info", e);
      }

      // 5. 跳转
      navigate("/");
      return null;
    } catch (error: any) {
      console.error("Auth Error:", error);
      const status = error.response?.status;

      let msg = t.error?.network || "Network Error";
      if (status === 401) msg = t.error?.auth || "Authentication failed";
      else if (status === 400) msg = t.error?.exist || "User already exists";
      else if (status === 422) msg = "Data validation error (422)";
      else if (error.message) msg = error.message;

      throw new Error(msg);
    } finally {
      setLoading(false);
    }
  };

  // ✅ 统一封装的登出逻辑
  const logout = async () => {
    setLoading(true);
    try {
      // 1. 尝试通知后端 (即使失败也不影响前端登出)
      await authService.logout();
    } catch (error) {
      console.warn(
        "Logout API call failed, but proceeding with cleanup.",
        error,
      );
    } finally {
      // 2. 无论后端是否成功，强制清理前端数据
      await clearUserSession();

      // 3. 更新状态并跳转
      setToken(null);
      setLoading(false);
      navigate("/login", { replace: true });
    }
  };

  return { token, authenticate, logout, loading };
}
