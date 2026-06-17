import {
  Menu,
  Moon,
  Sun,
  Monitor,
  Languages,
  Archive,
  FileArchive,
  HardDrive,
  Info,
  RefreshCw,
  Settings,
} from "lucide-react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { useTheme } from "../../../hooks/useTheme";
import { useTranslation } from "../../../hooks/useTranslation";
// import { exportToMarkdown } from "../../../utils/exportUtils";
// 🔴 引入 uiEvents 总线，移除多余的 Ref 导入
import { uiEvents } from "../../../lib/uiEvents";

const LANG_MAP: Record<string, string> = {
  zh: "CN",
  en: "EN",
};

const MENU_SECTION_DATA = "MENU_SECTION_DATA";
const MENU_SECTION_APP = "MENU_SECTION_APP";

export default function UserMenu() {
  const navigate = useNavigate();
  const { themeMode, cycleTheme } = useTheme();
  const { lang, toggleLang, t } = useTranslation();

  const handleOpenBackup = () => {
    uiEvents.emit("OPEN_BACKUP");
  };

  const handleCheckUpdate = () => {
    uiEvents.emit("OPEN_CHECK_UPDATE");
  };

  const handleOpenVersionInfo = () => {
    uiEvents.emit("OPEN_VERSION_INFO");
  };

  const handleOpenAttachmentMaintenance = () => {
    uiEvents.emit("OPEN_ATTACHMENT_MAINTENANCE");
  };

  const handleOpenSettings = () => {
    uiEvents.emit("OPEN_SETTINGS");
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

  const MenuSection = ({
    label,
    section,
    children,
  }: {
    label: string;
    section: string;
    children: ReactNode;
  }) => (
    <div className="flex flex-col gap-0.5" data-section={section}>
      <div className="px-2.5 pb-1 pt-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-base-content/35">
        {label}
      </div>
      {children}
    </div>
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
        className="dropdown-content mt-3 z-50 w-64 p-1.5 origin-top-right transform transition-all duration-200"
      >
        <div className="bg-base-100/90 backdrop-blur-xl rounded-2xl shadow-2xl shadow-black/5 border border-white/10 dark:border-white/5 flex flex-col gap-0.5 p-1.5">
          <MenuSection
            section={MENU_SECTION_DATA}
            label={t.command?.data || "Data"}
          >
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
              icon={HardDrive}
              label={t.command?.storage || t.attachmentMaintenance?.menuLabel || "Storage"}
              onClick={handleOpenAttachmentMaintenance}
            />
          </MenuSection>

          <div className="my-1 h-px bg-base-content/10" />

          <MenuSection section={MENU_SECTION_APP} label={t.command?.app || "App"}>
            <MenuItem
              icon={Settings}
              label={t.command?.settings || "Settings"}
              onClick={handleOpenSettings}
            />
            <MenuItem
              icon={RefreshCw}
              label={t.command?.checkUpdate || t.common?.checkUpdate || "Check for Updates"}
              onClick={handleCheckUpdate}
            />
            <MenuItem
              icon={Info}
              label={t.command?.versionInfo || t.common?.versionInfo || "Version Info"}
              onClick={handleOpenVersionInfo}
            />
            <MenuItem
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
            <MenuItem
              icon={Languages}
              label={t?.common?.language || "Language"}
              value={LANG_MAP[lang] || lang.toUpperCase()}
              onClick={toggleLang}
            />
          </MenuSection>
        </div>
      </div>
    </div>
  );
}
