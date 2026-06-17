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

const Section = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <section className="rounded-2xl border border-base-content/10 bg-base-100/70 overflow-hidden">
    <div className="flex items-center justify-between px-4 py-3 bg-base-200/40">
      <h3 className="text-sm font-black tracking-wide text-base-content/75">
        {title}
      </h3>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-2">{children}</div>
  </section>
);

const ActionButton = ({
  icon,
  title,
  description,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  onClick: () => void | Promise<void>;
}) => (
  <button
    type="button"
    onClick={() => void onClick()}
    className="group grid grid-cols-[34px_1fr] items-center gap-3 rounded-xl border border-base-content/10 bg-base-100 px-3 py-3 text-left transition hover:border-primary/30 hover:bg-primary/5"
  >
    <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-content">
      {icon}
    </span>
    <span className="min-w-0">
      <span className="block truncate text-sm font-bold text-base-content">
        {title}
      </span>
      <span className="block truncate text-xs text-base-content/55">
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
      <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-base-content/10 bg-base-100/95 shadow-2xl backdrop-blur-xl">
        <header className="flex items-start justify-between gap-4 border-b border-base-content/10 px-6 py-5">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-base-content/35">
              BuJo
            </p>
            <h2 className="mt-1 truncate text-2xl font-black">
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
          <Section title={t.command?.data || "Data"}>
            <ActionButton
              icon={<HardDrive size={17} />}
              title={
                t.command?.storage ||
                t.attachmentMaintenance?.menuLabel ||
                "Storage"
              }
              description={t.attachmentMaintenance?.dailyFolder || "Markdown"}
              onClick={() => run(() => uiEvents.emit("OPEN_ATTACHMENT_MAINTENANCE"))}
            />
            <ActionButton
              icon={<FileArchive size={17} />}
              title={t.backup?.title || "Backup"}
              description=".bjk / Markdown"
              onClick={() => run(() => uiEvents.emit("OPEN_BACKUP"))}
            />
          </Section>

          <Section title={t.command?.app || "App"}>
            <ActionButton
              icon={<RefreshCw size={17} />}
              title={t.command?.checkUpdate || "Check for Updates"}
              description={t.common?.versionInfo || "Release notes"}
              onClick={() => run(() => uiEvents.emit("OPEN_CHECK_UPDATE"))}
            />
            <ActionButton
              icon={<Info size={17} />}
              title={t.command?.versionInfo || "Version Info"}
              description="BuJo"
              onClick={() => run(() => uiEvents.emit("OPEN_VERSION_INFO"))}
            />
            <ActionButton
              icon={<SunMoon size={17} />}
              title={t.command?.theme || "Theme"}
              description={t.common?.theme?.[themeMode] || themeMode}
              onClick={() => cycleTheme()}
            />
            <ActionButton
              icon={<Languages size={17} />}
              title={t.command?.language || "Language"}
              description={lang === "zh" ? "中文" : "English"}
              onClick={() => toggleLang()}
            />
          </Section>
        </div>
      </div>
    </div>,
    document.body,
  );
}
