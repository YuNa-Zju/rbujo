import { useState, useEffect } from "react";

export type ThemeMode = "light" | "dark" | "system";

export function useTheme() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(
    () => (localStorage.getItem("themeMode") as ThemeMode) || "system",
  );

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    const applyTheme = () => {
      const isDark =
        themeMode === "system" ? media.matches : themeMode === "dark";
      root.setAttribute("data-theme", isDark ? "dark" : "light");

      // 更新 meta theme-color 用于移动端浏览器状态栏
      const color = isDark ? "#1d232a" : "#ffffff";
      let meta = document.querySelector('meta[name="theme-color"]');
      if (!meta) {
        meta = document.createElement("meta");
        meta.setAttribute("name", "theme-color");
        document.head.appendChild(meta);
      }
      meta.setAttribute("content", color);
    };

    applyTheme();
    localStorage.setItem("themeMode", themeMode);

    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [themeMode]);

  const cycleTheme = () => {
    setThemeMode((prev) =>
      prev === "system" ? "light" : prev === "light" ? "dark" : "system",
    );
  };

  return { themeMode, cycleTheme, setThemeMode };
}
