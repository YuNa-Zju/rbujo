import api from "../lib/api";

// --- 接口定义 ---

export interface LoginResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
}

export interface RegisterResponse {
  id: string;
  username: string;
  recovery_key?: string;
}

export interface UserProfile {
  id: string;
  username: string;
  [key: string]: any;
}

export interface ResetPasswordResponse {
  msg: string;
  new_recovery_key?: string;
}

export interface ChangePasswordResponse {
  message: string;
  new_recovery_key?: string;
}

// --- Service ---

export const authService = {
  // 1. 注册
  register: async (username: string, password: string) => {
    const response = await api.post<RegisterResponse>("/auth/register", {
      username,
      password,
    });
    return response.data;
  },

  // 2. 登录
  login: async (username: string, password: string) => {
    const formData = new URLSearchParams();
    formData.set("username", username);
    formData.set("password", password);

    const response = await api.post<LoginResponse>("/auth/token", formData, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    return response.data;
  },

  // 3. 登出 (✅ 之前缺失的方法)
  logout: async () => {
    // 即使 Token 过期或无效，也尝试通知后端
    return api.post("/auth/logout");
  },

  // 4. 获取用户信息
  me: async () => {
    const response = await api.get<UserProfile>("/users/me");
    return response.data;
  },

  // 5. 验证恢复密钥 (重置密码第一步)
  verifyRecovery: async (username: string, recoveryKey: string) => {
    const response = await api.post("/auth/verify-recovery", {
      username,
      recovery_key: recoveryKey,
    });
    return response.data;
  },

  // 6. 重置密码 (重置密码第二步)
  resetPassword: async (
    username: string,
    recoveryKey: string,
    newPassword: string,
  ) => {
    const response = await api.post<ResetPasswordResponse>(
      "/auth/reset-password",
      {
        username,
        recovery_key: recoveryKey,
        new_password: newPassword,
      },
    );
    return response.data;
  },

  // 7. 修改密码 (需登录)
  changePassword: async (oldPassword: string, newPassword: string) => {
    const response = await api.post<ChangePasswordResponse>(
      "/auth/change-password",
      {
        old_password: oldPassword,
        new_password: newPassword,
      },
    );
    return response.data;
  },
};
