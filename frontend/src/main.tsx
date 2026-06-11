import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
// import "katex/dist/katex.min.css"; // 确保安装了 katex
import { LanguageProvider } from "./hooks/useTranslation";
import { TagCacheProvider } from "./context/TagCacheContext";

// 初始化主题 (通过 Hook 内部副作用生效，但这里可以先确保 DOM 加载)
const savedTheme = localStorage.getItem("themeMode") || "system";
if (
  savedTheme === "dark" ||
  (savedTheme === "system" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches)
) {
  document.documentElement.setAttribute("data-theme", "dark");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LanguageProvider>
      <TagCacheProvider>
        <App />
      </TagCacheProvider>
    </LanguageProvider>
  </StrictMode>,
);
