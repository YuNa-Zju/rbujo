import { listen } from "@tauri-apps/api/event";
import {
  FileArchive,
  HardDrive,
  Info,
  Languages,
  RefreshCw,
  SunMoon,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useTheme } from "../../hooks/useTheme";
import { useTranslation } from "../../hooks/useTranslation";
import { uiEvents } from "../../lib/uiEvents";

const SettingsPill = ({
  children,
  muted,
}: {
  children: ReactNode;
  muted?: boolean;
}) => (
  <span
    className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.14em] ${
      muted
        ? "border-base-content/10 bg-base-200/40 text-base-content/45"
        : "border-primary/15 bg-primary/10 text-primary"
    }`}
  >
    {children}
  </span>
);

const SettingsSection = ({
  title,
  kicker,
  children,
}: {
  title: string;
  kicker: string;
  children: ReactNode;
}) => (
  <section className="rounded-3xl border border-base-content/10 bg-base-100/70 p-3 shadow-sm">
    <div className="mb-3 flex items-center justify-between gap-3 px-1">
      <h3 className="text-sm font-black tracking-wide text-base-content/80">{title}</h3>
      <SettingsPill muted>{kicker}</SettingsPill>
    </div>
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{children}</div>
  </section>
);

const SettingsActionCard = ({
  icon,
  title,
  description,
  pill,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  pill?: string;
  onClick: () => void | Promise<void>;
}) => (
  <button
    type="button"
    onClick={() => void onClick()}
    className="group grid min-h-[88px] grid-cols-[42px_1fr] items-center gap-3 rounded-2xl border border-base-content/10 bg-base-100/80 px-4 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/5 hover:shadow-md"
  >
    <span className="grid h-10 w-10 place-items-center rounded-2xl bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-content">
      {icon}
    </span>
    <span className="min-w-0">
      <span className="flex min-w-0 items-center gap-2">
        <span className="block truncate text-sm font-black text-base-content">
          {title}
        </span>
        {pill && <SettingsPill>{pill}</SettingsPill>}
      </span>
      <span className="mt-1 block truncate text-xs font-medium text-base-content/55">
        {description}
      </span>
    </span>
  </button>
);

export default function SettingsModalController() {
  const [open, setOpen] = useState(false);
  const { t, lang, toggleLang } = useTranslation();
  const { themeMode, cycleTheme } = useTheme();

  useEffect(() => {
    const openSettings = () => setOpen(true);

    uiEvents.on("OPEN_SETTINGS", openSettings);
    return () => {
      uiEvents.off("OPEN_SETTINGS", openSettings);
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlistenSettings: (() => void) | null = null;

    const register = async () => {
      try {
        unlistenSettings = await listen("menu:settings", () => setOpen(true));
      } catch (error) {
        console.warn("Settings menu listener registration failed", error);
      }

      if (disposed) {
        unlistenSettings?.();
      }
    };

    register();
    return () => {
      disposed = true;
      unlistenSettings?.();
    };
  }, []);

  if (!open) return null;

  const close = () => setOpen(false);
  const run = (action: () => void | Promise<void>) => {
    close();
    void action();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        aria-label={t.common?.close || "Close"}
        onClick={close}
      />
      <div className="relative w-full max-w-2xl overflow-hidden rounded-[2rem] border border-base-content/10 bg-base-100/95 shadow-2xl backdrop-blur-xl">
        <header className="flex items-start justify-between gap-4 border-b border-base-content/10 bg-base-200/20 px-6 py-5">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <SettingsPill>BuJo</SettingsPill>
              <SettingsPill muted>{t.command?.app || "App"}</SettingsPill>
            </div>
            <h2 className="truncate text-2xl font-black">
              {t.command?.settings || "Settings"}
            </h2>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-circle btn-sm shrink-0"
            aria-label={t.common?.close || "Close"}
            onClick={close}
          >
            <X size={18} />
          </button>
        </header>

        <div className="grid gap-3 p-4">
          <SettingsSection
            title={t.command?.data || "Data"}
            kicker=".bjk / md"
          >
            <SettingsActionCard
              icon={<HardDrive size={17} />}
              title={
                t.command?.storage ||
                t.attachmentMaintenance?.menuLabel ||
                "Storage"
              }
              description={t.attachmentMaintenance?.dailyFolder || "Markdown"}
              pill="Local"
              onClick={() => run(() => uiEvents.emit("OPEN_ATTACHMENT_MAINTENANCE"))}
            />
            <SettingsActionCard
              icon={<FileArchive size={17} />}
              title={t.backup?.title || "Backup"}
              description=".bjk / Markdown"
              onClick={() => run(() => uiEvents.emit("OPEN_BACKUP"))}
            />
          </SettingsSection>

          <SettingsSection title={t.command?.app || "App"} kicker="BuJo">
            <SettingsActionCard
              icon={<RefreshCw size={17} />}
              title={t.command?.checkUpdate || "Check for Updates"}
              description={t.common?.versionInfo || "Release notes"}
              onClick={() => run(() => uiEvents.emit("OPEN_CHECK_UPDATE"))}
            />
            <SettingsActionCard
              icon={<Info size={17} />}
              title={t.command?.versionInfo || "Version Info"}
              description="BuJo"
              onClick={() => run(() => uiEvents.emit("OPEN_VERSION_INFO"))}
            />
            <SettingsActionCard
              icon={<SunMoon size={17} />}
              title={t.command?.theme || "Theme"}
              description={t.common?.theme?.[themeMode] || themeMode}
              pill={themeMode}
              onClick={() => cycleTheme()}
            />
            <SettingsActionCard
              icon={<Languages size={17} />}
              title={t.command?.language || "Language"}
              description={lang === "zh" ? "中文" : "English"}
              pill={lang.toUpperCase()}
              onClick={() => toggleLang()}
            />
          </SettingsSection>
        </div>
      </div>
    </div>,
    document.body,
  );
}
