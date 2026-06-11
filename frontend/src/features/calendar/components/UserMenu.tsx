import {
  Menu,
  Moon,
  Sun,
  Monitor,
  Languages,
  Archive,
  FileArchive,
  Rss,
  RefreshCw,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useTheme } from "../../../hooks/useTheme";
import { useTranslation } from "../../../hooks/useTranslation";
// import { exportToMarkdown } from "../../../utils/exportUtils";
import { cacheStorage } from "../../../utils/cacheStorage";
// 🔴 引入 uiEvents 总线，移除多余的 Ref 导入
import { uiEvents } from "../../../lib/uiEvents";

const LANG_MAP: Record<string, string> = {
  zh: "CN",
  en: "EN",
};

export default function UserMenu() {
  const navigate = useNavigate();
  const { themeMode, cycleTheme } = useTheme();
  const { lang, toggleLang, t } = useTranslation();

  const handleUpdate = async () => {
    try {
      await (cacheStorage as any).clearAll();
    } catch (e) {
      console.error("Failed to clear cache", e);
    } finally {
      window.location.reload();
    }
  };

  const handleOpenCalendarSync = () => {
    uiEvents.emit("OPEN_CALENDAR_SYNC");
  };

  const handleOpenBackup = () => {
    uiEvents.emit("OPEN_BACKUP");
  };

  const handleOpenArchive = () => {
    navigate("/archive");
  };

  // --- 子组件 (样式保持不变) ---

  const MenuItem = ({
    icon: Icon,
    label,
    value,
    onClick,
    danger = false,
  }: {
    icon: any;
    label: string;
    value?: string;
    onClick: () => void;
    danger?: boolean;
  }) => (
    <button
      onClick={() => {
        const elem = document.activeElement as HTMLElement;
        if (elem) elem.blur();
        onClick();
      }}
      className={`group flex items-center justify-between w-full p-2.5 rounded-lg transition-all duration-200
        ${
          danger
            ? "text-error hover:bg-error/10"
            : "text-base-content/80 hover:bg-base-200/60 hover:text-base-content"
        }
      `}
    >
      <div className="flex items-center gap-3">
        <div
          className={`p-1.5 rounded-md ${
            danger
              ? "bg-error/10 group-hover:bg-error/20"
              : "bg-base-200/50 group-hover:bg-base-100 shadow-sm"
          } transition-colors`}
        >
          <Icon size={14} strokeWidth={2.5} />
        </div>
        <span className="text-sm font-medium tracking-wide">{label}</span>
      </div>
      {value && (
        <span className="text-[10px] font-bold font-mono opacity-50 bg-base-200/70 px-1.5 py-0.5 rounded-md">
          {value}
        </span>
      )}
    </button>
  );

  return (
    <div className="dropdown dropdown-end ml-1">
      <div
        tabIndex={0}
        role="button"
        className="btn btn-ghost btn-circle hover:bg-base-200 transition-all duration-300"
      >
        <Menu size={20} className="text-base-content/70" />
      </div>

      <div
        tabIndex={0}
        className="dropdown-content mt-3 z-50 w-60 p-1.5 origin-top-right transform transition-all duration-200"
      >
        <div className="bg-base-100/90 backdrop-blur-xl rounded-2xl shadow-2xl shadow-black/5 border border-white/10 dark:border-white/5 flex flex-col gap-0.5 p-1.5">
          <MenuItem
            icon={RefreshCw}
            label={t.common?.update || "Update"}
            onClick={handleUpdate}
          />
          <MenuItem
            icon={Rss}
            label={t.ics?.title || "Calendar Sync"}
            onClick={handleOpenCalendarSync}
          />
          <MenuItem
            icon={Archive}
            label={t.common?.archive || "Archive"}
            onClick={handleOpenArchive}
          />
          <MenuItem
            icon={FileArchive}
            label={t.backup?.title || "Backup & Export"}
            onClick={handleOpenBackup}
          />
          <MenuItem
            icon={
              themeMode === "light" ? Sun : themeMode === "dark" ? Moon : Monitor
            }
            label={t?.calendar?.theme || "Theme"}
            value={t.common.theme[themeMode]}
            onClick={cycleTheme}
          />
          <MenuItem
            icon={Languages}
            label={t?.common?.language || "Language"}
            value={LANG_MAP[lang] || lang.toUpperCase()}
            onClick={toggleLang}
          />
        </div>
      </div>
    </div>
  );
}
