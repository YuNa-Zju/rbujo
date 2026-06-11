import { useState, useEffect, useMemo } from "react";

// 内部使用的 Hook，不一定要导出
const useSystemTheme = () => {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const root = document.documentElement;
    const updateTheme = () => {
      const val = root.getAttribute("data-theme");
      if (val === "dark" || val === "light") {
        setTheme(val);
      } else {
        const sysDark = window.matchMedia(
          "(prefers-color-scheme: dark)",
        ).matches;
        setTheme(sysDark ? "dark" : "light");
      }
    };
    updateTheme();
    const observer = new MutationObserver(updateTheme);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.addEventListener("change", updateTheme);
    return () => {
      observer.disconnect();
      mediaQuery.removeEventListener("change", updateTheme);
    };
  }, []);

  return theme;
};

export const useAppTheme = () => {
  const theme = useSystemTheme();
  const isDark = theme === "dark";

  // 1. 原始颜色值
  const colors = {
    modalBg: isDark ? "#0f172a" : "#f8fafc",
    cardBg: isDark ? "#1e293b" : "#ffffff",
    cardBorder: isDark
      ? "rgba(255, 255, 255, 0.05)"
      : "rgba(99, 102, 241, 0.2)",
  };

  // 2. 样式类名
  const styles = useMemo(
    () => ({
      // 基础层
      backdrop: isDark
        ? "bg-black/70 backdrop-blur-md"
        : "bg-slate-900/20 backdrop-blur-sm",

      // ✅ 补全 sectionTitle
      sectionTitle: `text-xs font-bold uppercase tracking-wider mb-3 pl-1 ${
        isDark ? "text-indigo-400" : "text-indigo-900/40"
      }`,

      // 模态框通用
      modal: {
        layout: "relative w-full overflow-hidden flex flex-col border",

        // ✅ 拆分属性供 BackupModal 使用
        bg: isDark ? "bg-[#0f172a]" : "bg-[#f8fafc]",
        shadow: isDark
          ? "shadow-2xl shadow-black/90"
          : "shadow-2xl shadow-indigo-900/10",
        border: isDark ? "border-indigo-500/10" : "border-white/50",

        base: `bg-[${colors.modalBg}] ${
          isDark
            ? "shadow-black/90 border-indigo-500/10"
            : "shadow-2xl shadow-indigo-900/10 border-white/50"
        }`,

        header: `shrink-0 z-30 pt-6 sm:pt-10 pb-4 px-6 flex flex-col gap-5 backdrop-blur-md border-b ${
          isDark
            ? "bg-[#0f172a]/90 border-indigo-500/20"
            : "bg-white/80 border-indigo-100/50"
        }`,
        title: isDark ? "text-slate-100" : "text-slate-700",
        subtitle: isDark ? "text-slate-500" : "text-slate-400",
        iconBox: isDark
          ? "bg-indigo-500/10 text-indigo-300 border-indigo-500/10"
          : "bg-indigo-50 text-indigo-500 border-indigo-100",
        closeBtn: `btn btn-sm btn-circle btn-ghost transition-all ${
          isDark
            ? "hover:bg-white/10 text-slate-400"
            : "hover:bg-slate-100 text-slate-400"
        }`,
      },

      // 卡片系统
      card: {
        base: "group relative w-full p-4 rounded-3xl border transition-all duration-300 text-left flex items-center gap-4",

        // ✅ 拆分属性
        bg: isDark ? "bg-[#1e293b]" : "bg-white",
        border: isDark ? "border-white/5" : "border-indigo-50",

        style: `bg-[${colors.cardBg}] border-[${colors.cardBorder}] ${
          isDark ? "text-slate-200" : "text-slate-700"
        }`,
        hover: isDark
          ? "hover:border-indigo-500/30 hover:bg-[#1e293b]/80"
          : "hover:border-indigo-200 hover:bg-white hover:shadow-md shadow-[0_2px_8px_-2px_rgba(99,102,241,0.05)]",
        textPrimary: isDark ? "text-indigo-100" : "text-slate-700",
        textSecondary: isDark ? "text-slate-500" : "text-slate-400",
      },

      // ✅ 补全 Status 样式
      status: {
        container:
          "flex items-center gap-3 px-4 py-3 rounded-2xl w-full shadow-sm border",
        success: isDark
          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
          : "bg-emerald-50 text-emerald-600 border-emerald-100",
        successIcon: isDark
          ? "bg-emerald-500/20 text-emerald-300"
          : "bg-emerald-100 text-emerald-600",
        error: isDark
          ? "bg-rose-500/10 text-rose-300 border-rose-500/20"
          : "bg-rose-50 text-rose-600 border-rose-100",
        errorIcon: isDark
          ? "bg-rose-500/20 text-rose-300"
          : "bg-rose-100 text-rose-600",
        info: isDark
          ? "bg-indigo-500/10 text-indigo-300 border-indigo-500/20"
          : "bg-indigo-50 text-indigo-600 border-indigo-100",
      },

      // 表单元素
      form: {
        inputContainer: `flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 border ${
          isDark
            ? "bg-[#1e293b]/50 border-indigo-500/10 focus-within:bg-[#1e293b] focus-within:border-indigo-500/30 text-indigo-400"
            : "bg-indigo-50/50 border-indigo-100/50 focus-within:bg-white focus-within:border-indigo-300 text-indigo-400"
        }`,
        input: `bg-transparent border-none outline-none text-sm w-full font-medium ${
          isDark
            ? "text-indigo-100 placeholder:text-indigo-300/40"
            : "text-indigo-900 placeholder:text-indigo-300/70"
        }`,
        clearBtn: `p-1 rounded-full transition-colors ${
          isDark
            ? "hover:bg-white/10 text-indigo-400"
            : "hover:bg-indigo-100 text-indigo-400"
        }`,
      },

      // 时间轴专用
      timeline: {
        titleGradient: isDark
          ? "from-indigo-300 to-slate-300"
          : "from-indigo-600 to-slate-600",
        line: isDark ? "bg-indigo-500/20" : "bg-indigo-100",
        dateMain: isDark ? "text-slate-200" : "text-slate-700",
        dateSub: isDark ? "text-slate-500" : "text-slate-400",
        dateToday: isDark ? "text-indigo-300" : "text-indigo-600",
        todayBadge: isDark
          ? "bg-indigo-500/20 text-indigo-300"
          : "bg-indigo-100 text-indigo-600",
        daysLeftBadge: isDark
          ? "bg-indigo-500/10 text-indigo-300"
          : "bg-indigo-50/80 text-indigo-400",
        dotToday: `relative z-10 w-4 h-4 rounded-full flex items-center justify-center border-[3px] transition-all duration-300 ${
          isDark
            ? "bg-[#0f172a] border-indigo-400 shadow-[0_0_0_4px_rgba(129,140,248,0.15)]"
            : "bg-white border-indigo-500 shadow-[0_0_0_4px_rgba(99,102,241,0.15)]"
        }`,
        dotNormal: `relative z-10 w-4 h-4 rounded-full border-[3px] transition-all duration-300 ${
          isDark
            ? "bg-[#0f172a] border-indigo-800 group-hover:border-indigo-600"
            : "bg-indigo-50 border-indigo-200 group-hover:border-indigo-400"
        }`,
        endMarker: `flex items-center gap-2 px-4 py-1.5 rounded-full border text-[10px] font-mono tracking-[0.2em] uppercase ${
          isDark
            ? "border-indigo-500/20 bg-[#0f172a] text-indigo-400"
            : "border-indigo-100 bg-slate-50 text-indigo-300"
        }`,
      },

      feedback: {
        loadingSpinner: isDark ? "text-indigo-400" : "text-indigo-500",
        loadingText: isDark ? "text-indigo-300" : "text-indigo-400",
        emptyIconBg: isDark
          ? "bg-white/5 text-indigo-300"
          : "bg-indigo-50 text-indigo-300",
        emptyText: isDark ? "text-slate-500" : "text-slate-400",
      },

      statusCapsule: {
        base: "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border",
        success: isDark
          ? "border-teal-500/30 text-teal-400"
          : "border-teal-200 text-teal-600",
        error: isDark
          ? "border-rose-500/30 text-rose-400"
          : "border-rose-200 text-rose-600",
      },
    }),
    [isDark, colors],
  ); // 依赖 colors

  return { isDark, theme, colors, styles };
};
