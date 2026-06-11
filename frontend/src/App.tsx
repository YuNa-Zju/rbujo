// src/App.tsx
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import React from "react";
import LoginPage from "./features/auth/LoginPage";
import CalendarPage from "./features/calendar/CalendarPage";
import DailyPage from "./features/daily/DailyPage";
import PublicEntryPage from "./pages/PublicEntryPage";
import { useAuth } from "./features/auth/useAuth";
import { EntryModalProvider } from "./context/EntryModalContext";
import GlobalEntryModals from "./components/modals/GlobalEntryModals";
import SessionExpiredModal from "./components/modals/SessionExpiredModal";
import GlobalUIModals from "./components/modals/GlobalUIModals";
import GlobalCommandPalette from "./components/modals/cmdk/GlobalCommandPalette";

// ✅ 1. 静默鉴权组件：只负责显隐，不负责跳转 (修复 PublicPage 被误伤)
function SilentAuth({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  return token ? <>{children}</> : null;
}

// ✅ 2. 升级版 PrivateRoute：记录“案发现场” (修复登录后不回跳)
function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { token, loading } = useAuth();
  const location = useLocation(); // 📍 获取当前所在的路径

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-base-100">
        <span className="loading loading-spinner loading-lg text-primary/50"></span>
      </div>
    );
  }

  // 如果没登录，把当前的 location 塞进 state 里传给 login 页面
  return token ? (
    <>{children}</>
  ) : (
    <Navigate to="/login" state={{ from: location }} replace />
  );
}

export default function App() {
  return (
    <EntryModalProvider>
      <BrowserRouter>
        <SessionExpiredModal />

        {/* ✅ 修改：全局组件改用 SilentAuth，不再阻断 Public 页面 */}
        <SilentAuth>
          <GlobalCommandPalette />
        </SilentAuth>

        <Routes>
          <Route path="/login" element={<LoginPage />} />

          {/* 公开路由：无需任何保护 */}
          <Route path="/s/:token" element={<PublicEntryPage />} />

          {/* 私有路由区域 */}
          <Route
            path="/"
            element={
              <PrivateRoute>
                <CalendarPage />
              </PrivateRoute>
            }
          />

          <Route
            path="/daily/:dateStr"
            element={
              <PrivateRoute>
                <DailyPage />
              </PrivateRoute>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>

        {/* 全局弹窗也建议改为 SilentAuth，或者保留在 Routes 外面如果不涉及敏感数据 */}
        <GlobalEntryModals />
        <GlobalUIModals />
      </BrowserRouter>
    </EntryModalProvider>
  );
}
