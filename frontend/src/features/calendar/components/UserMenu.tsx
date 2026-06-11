import {
  User,
  Moon,
  Sun,
  Monitor,
  Languages,
  Archive,
  FileArchive,
  Rss,
  ChevronRight,
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

  // 1. 业务逻辑保留
  const user = { username: "Local" };
  const username = user.username;
  const avatarLetter = username.slice(0, 2).toUpperCase();

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
    onClick,
    danger = false,
  }: {
    icon: any;
    label: string;
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
      {!danger && (
        <ChevronRight
          size={14}
          className="opacity-0 -translate-x-2 group-hover:opacity-40 group-hover:translate-x-0 transition-all duration-300"
        />
      )}
    </button>
  );

  const ControlItem = ({
    icon: Icon,
    label,
    value,
    onClick,
  }: {
    icon: any;
    label: string;
    value: string;
    onClick: () => void;
  }) => (
    <button
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="flex flex-col justify-between p-3 rounded-xl bg-base-200/40 hover:bg-base-200 border border-transparent hover:border-base-300/50 transition-all duration-200 text-left h-20 group relative overflow-hidden"
    >
      <div className="flex justify-between items-start w-full z-10">
        <Icon
          size={16}
          className="text-base-content/60 group-hover:text-primary transition-colors"
        />
        <span className="text-[10px] font-bold font-mono opacity-40 bg-base-100 px-1.5 py-0.5 rounded-md">
          {value}
        </span>
      </div>
      <span className="text-xs font-medium text-base-content/70 group-hover:text-base-content z-10">
        {label}
      </span>
      <div className="absolute -right-4 -bottom-4 w-12 h-12 bg-primary/5 rounded-full blur-xl group-hover:bg-primary/10 transition-all" />
    </button>
  );

  return (
    <div className="dropdown dropdown-end ml-1">
      <div
        tabIndex={0}
        role="button"
        className="btn btn-ghost btn-circle avatar placeholder hover:bg-base-200 transition-all duration-300"
      >
        <div className="bg-linear-to-br from-primary/10 to-primary/5 text-primary rounded-full w-9 h-9 flex items-center justify-center ring-1 ring-base-200 hover:ring-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all">
          {user.username ? (
            <span className="text-xs font-bold leading-none tracking-tighter">
              {avatarLetter}
            </span>
          ) : (
            <User size={16} />
          )}
        </div>
      </div>

      <div
        tabIndex={0}
        className="dropdown-content mt-3 z-50 w-64 p-1.5 origin-top-right transform transition-all duration-200"
      >
        <div className="bg-base-100/80 backdrop-blur-xl rounded-2xl shadow-2xl shadow-black/5 border border-white/10 dark:border-white/5 flex flex-col gap-1.5 p-1.5">
          <div className="px-3 py-3 bg-linear-to-br from-base-100 to-base-200/50 rounded-xl border border-base-200/50 flex items-center gap-3 select-none">
            <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shadow-inner shrink-0">
              {avatarLetter}
            </div>
            <div className="flex flex-col min-w-0 justify-center">
              <span className="text-sm font-bold text-base-content truncate">
                {username}
              </span>
            </div>
          </div>

          <div className="bg-base-100/50 rounded-xl border border-base-200/30 p-1 flex flex-col gap-0.5">
            <MenuItem
              icon={Archive}
              label={t.common?.archive || "Archive"}
              onClick={handleOpenArchive}
            />

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
              icon={FileArchive}
              label={t.backup?.title || "Backup & Export"}
              onClick={handleOpenBackup}
            />
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <ControlItem
              icon={
                themeMode === "light"
                  ? Sun
                  : themeMode === "dark"
                    ? Moon
                    : Monitor
              }
              label={t?.calendar?.theme || "Theme"}
              value={t.common.theme[themeMode]}
              onClick={cycleTheme}
            />
            <ControlItem
              icon={Languages}
              label={t?.common?.language || "Language"}
              value={LANG_MAP[lang] || lang.toUpperCase()}
              onClick={toggleLang}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
