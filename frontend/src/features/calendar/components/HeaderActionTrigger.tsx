import { useEffect, useState } from "react";
import { Search, CalendarCheck, Clock } from "lucide-react";
import { motion } from "framer-motion";
import { uiEvents } from "../../../lib/uiEvents";
import { useTranslation } from "../../../hooks/useTranslation";
import UserMenu from "./UserMenu";

// ✅ 1. 内置 Hook：手动监听 data-theme 属性变化
const useIsDark = () => {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;

    const checkTheme = () => {
      const theme = root.getAttribute("data-theme");
      // 只要是 dark 就返回 true，否则 false
      setIsDark(theme === "dark" || root.classList.contains("dark"));
    };

    checkTheme(); // 初始化

    // 监听属性变化
    const observer = new MutationObserver(checkTheme);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-theme", "class"],
    });

    return () => observer.disconnect();
  }, []);

  return isDark;
};

export default function HeaderActionTrigger() {
  const { t } = useTranslation();

  // ✅ 获取当前是否为暗色模式
  const isDark = useIsDark();

  const openCmd = () => uiEvents.emit("OPEN_CMD_PALETTE");
  const openFutureLog = () => uiEvents.emit("OPEN_FUTURE_LOG");
  const openTimeline = () => uiEvents.emit("OPEN_TIMELINE");

  // ⚡️ 弹簧动画配置
  const springAnim = {
    whileHover: { scale: 1.05 } as const,
    whileTap: { scale: 0.92 } as const,
    transition: { type: "spring" as const, stiffness: 400, damping: 17 },
  };

  // 通用按钮基础样式
  const baseBtnClass =
    "btn btn-sm btn-ghost btn-circle transition-colors duration-200 flex items-center justify-center";

  // --- 样式配置中心 (手动管理) ---
  const styles = {
    // 1. Timeline (Indigo)
    timeline: isDark
      ? "text-indigo-300 hover:text-indigo-200 hover:bg-indigo-500/20" // Dark
      : "text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50", // Light

    // 2. Future Log (Orange)
    futureLog: isDark
      ? "text-orange-300 hover:text-orange-200 hover:bg-orange-500/20" // Dark
      : "text-orange-400 hover:text-orange-600 hover:bg-orange-50", // Light

    // 3. Mobile Search
    mobileSearch: isDark
      ? "text-slate-400 hover:text-slate-200 hover:bg-white/5" // Dark
      : "text-slate-400 hover:text-slate-600 hover:bg-slate-100", // Light

    // 4. Desktop Search Bar (核心修复)
    searchBar: isDark
      ? // Dark Mode: 超清透 (2%白背景 + 8%白边框)，彻底去除灰白遮罩
        "bg-white/[0.02] hover:bg-white/[0.06] border-white/[0.08] hover:border-white/[0.15] shadow-none"
      : // Light Mode: 柔和浅灰玻璃
        "bg-slate-100/60 hover:bg-slate-200/60 border-slate-200/60 hover:border-slate-300/60 shadow-sm hover:shadow-md",

    searchText: isDark
      ? "text-slate-500 group-hover:text-slate-300"
      : "text-slate-400 group-hover:text-slate-600",

    searchIcon: isDark
      ? "text-slate-500 group-hover:text-slate-300"
      : "text-slate-400 group-hover:text-slate-600",

    // 5. KBD 按键
    kbd: isDark
      ? "bg-black/30 border-white/10 text-slate-400" // Dark: 深色块，不刺眼
      : "bg-white border-slate-200 text-slate-500", // Light: 白块
  };

  return (
    <div className="flex items-center gap-2 ml-auto">
      {/* 1. Timeline / Daily Log */}
      <motion.button
        {...springAnim}
        className={`${baseBtnClass} ${styles.timeline}`}
        onClick={openTimeline}
        title={t.command?.timeline || "Timeline View"}
      >
        <Clock size={20} strokeWidth={2} />
      </motion.button>

      {/* 2. Future Log */}
      <motion.button
        {...springAnim}
        className={`${baseBtnClass} ${styles.futureLog}`}
        onClick={openFutureLog}
        title={t.command?.futureLog || "Future Log"}
      >
        <CalendarCheck size={20} strokeWidth={2} />
      </motion.button>

      {/* 3. Search / CMDK Trigger */}

      {/* Mobile Icon */}
      <motion.button
        {...springAnim}
        className={`md:hidden ${baseBtnClass} ${styles.mobileSearch}`}
        onClick={openCmd}
      >
        <Search size={20} strokeWidth={2} />
      </motion.button>

      {/* Desktop Search Bar */}
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        transition={{ type: "spring", stiffness: 500, damping: 25 }}
        onClick={openCmd}
        className={`hidden md:flex items-center gap-3 px-4 py-1.5 h-9 rounded-full group cursor-text transition-all duration-200 border ${styles.searchBar}`}
      >
        <Search
          size={14}
          className={`transition-colors ${styles.searchIcon}`}
        />

        <span
          className={`text-xs font-medium transition-colors w-24 lg:w-36 text-left truncate ${styles.searchText}`}
        >
          {t.command?.placeholder || "Search..."}
        </span>

        {/* KBD Shortcuts */}
        <div className="flex gap-0.5 opacity-40 group-hover:opacity-80 transition-opacity">
          <kbd
            className={`h-5 min-w-[18px] flex items-center justify-center text-[10px] rounded-md font-mono border ${styles.kbd}`}
          >
            ⌘
          </kbd>
          <kbd
            className={`h-5 min-w-[18px] flex items-center justify-center text-[10px] rounded-md font-mono border ${styles.kbd}`}
          >
            K
          </kbd>
        </div>
      </motion.button>

      {/* 4. User Menu */}
      <div className="ml-1">
        <UserMenu />
      </div>
    </div>
  );
}
