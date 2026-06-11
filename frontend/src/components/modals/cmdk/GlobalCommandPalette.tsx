import { useEffect, useState, useMemo, useCallback, useLayoutEffect } from "react";
import { Command } from "cmdk";
import {
  Search,
  PenLine,
  Hash,
  CalendarCheck,
  ArrowRight,
  CornerDownLeft,
  Loader2,
  Image as ImageIcon,
  Link as LinkIcon,
  CheckSquare,
  Archive,
  RefreshCw,
  LayoutGrid,
  Delete,
  Circle,
  XCircle,
  CheckCircle2,
  ChevronRightCircle,
  Clock,
  ListOrdered,
  List,
  Code,
  Sigma,
  Quote,
  Sun,
  Moon,
  Monitor,
  Languages,
} from "lucide-react";

import { uiEvents } from "../../../lib/uiEvents";
import { entryService } from "../../../services/entryService";
import { ENTRY_THEME, type EntryType } from "../../../config/entryTheme";
import { getSmartSummary } from "../../../utils/markdownUtils";
import { useTranslation } from "../../../hooks/useTranslation";
import { useTheme } from "../../../hooks/useTheme";
import { cacheStorage } from "../../../utils/cacheStorage";
import { useTagCache } from "../../../context/TagCacheContext";

import { Kbd, Item } from "./CmdkComponents";
import EntryActionView from "./EntryActionView";

type ViewState = "ROOT" | "ENTRY_ACTIONS";

const STATUS_ICONS: Record<string, any> = {
  open: Circle,
  completed: CheckCircle2,
  migrated: ChevronRightCircle,
  cancelled: XCircle,
  future: Clock,
  forward: ChevronRightCircle,
};

const STATUS_COLORS: Record<string, string> = {
  open: "text-base-content/50",
  completed: "text-success",
  migrated: "text-info",
  forward: "text-info",
  cancelled: "text-error",
  future: "text-warning",
};

const normalizeCommandTag = (value: string) =>
  value
    .trim()
    .replace(/^#+/, "")
    .replace(/^[,，;；:：\s]+|[,，;；:：\s]+$/g, "");

export default function GlobalCommandPalette() {
  const { t, lang, toggleLang } = useTranslation();
  const { themeMode, cycleTheme } = useTheme();
  const { allTags, refreshTags } = useTagCache();

  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");

  const [view, setView] = useState<ViewState>("ROOT");
  const [dayEntries, setDayEntries] = useState<any[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<any | null>(null);
  const [loadingEntries, setLoadingEntries] = useState(false);

  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    setIsTouchDevice("ontouchstart" in window || navigator.maxTouchPoints > 0);
  }, []);

  const focusDateStr = useMemo(() => {
    const stored = sessionStorage.getItem("calendar_focus_date");
    if (stored) return stored;
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, [open]);

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "forward":
      case "migrated":
        return t.command?.statusMigrated || "MIGRATED";
      case "completed":
        return t.command?.statusCompleted || "DONE";
      case "cancelled":
        return t.command?.statusCancelled || "CANCELLED";
      case "future":
        return t.command?.statusFuture || "FUTURE";
      case "open":
      default:
        return t.command?.statusOpen || "OPEN";
    }
  };

  const resetContext = useCallback(() => {
    setView("ROOT");
    setSelectedEntry(null);
    setInputValue("");
  }, []);

  const run = (action: () => void) => {
    action();
    setOpen(false);
    setTimeout(resetContext, 300);
  };

  const handleBack = useCallback(() => {
    resetContext();
  }, [resetContext]);

  // 加载今日数据
  useEffect(() => {
    if (open && view === "ROOT") {
      const loadData = async () => {
        setLoadingEntries(true);
        try {
          const cachedData = await cacheStorage.loadDaily();
          const entries = cachedData[focusDateStr];
          if (Array.isArray(entries)) {
            setDayEntries(entries);
            setLoadingEntries(false);
          }
        } catch (e) {
          console.warn("Cache load failed", e);
        }

        try {
          const freshData = await entryService.getDailyEntries(focusDateStr);
          setDayEntries(Array.isArray(freshData) ? freshData : []);
        } catch (e) {
          console.error("API failed", e);
        } finally {
          setLoadingEntries(false);
        }
      };
      loadData();
    }
  }, [open, view, focusDateStr]);

  // 快捷键
  useLayoutEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((p) => {
          if (!p) resetContext();
          return !p;
        });
      }
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      )
        return;
      if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        uiEvents.emit("OPEN_SEARCH", null);
      }
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        uiEvents.emit("OPEN_ADD_ENTRY", {
          mode: "daily",
          date: new Date(focusDateStr),
        });
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [focusDateStr, resetContext]);

  useLayoutEffect(() => {
    const handleOpenSignal = () => {
      setOpen(true);
      resetContext();
    };
    uiEvents.on("OPEN_CMD_PALETTE", handleOpenSignal);
    return () => {
      uiEvents.off("OPEN_CMD_PALETTE", handleOpenSignal);
    };
  }, [refreshTags, resetContext]);

  useEffect(() => {
    if (open) void refreshTags();
  }, [open, refreshTags]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      if (view === "ROOT" || (view === "ENTRY_ACTIONS" && !inputValue)) {
        setOpen(false);
        return;
      }
    }
    if (view === "ENTRY_ACTIONS" && e.key === "Backspace" && !inputValue) {
      e.preventDefault();
      e.stopPropagation();
      handleBack();
    }
  };

  const openEntryActions = (entry: any) => {
    setSelectedEntry(entry);
    setInputValue("");
    setView("ENTRY_ACTIONS");
  };

  const getThemeIcon = () => {
    if (themeMode === "light") return <Sun />;
    if (themeMode === "dark") return <Moon />;
    return <Monitor />;
  };

  const getThemeLabel = () => {
    const map = {
      system: t.common?.theme?.system || "System",
      light: t.common?.theme?.light || "Light",
      dark: t.common?.theme?.dark || "Dark",
    };
    return map[themeMode] || themeMode.toUpperCase();
  };

  const normalizedTagInput = normalizeCommandTag(inputValue);

  const filteredTagSuggestions = useMemo(() => {
    const needle = normalizedTagInput.toLowerCase();
    return allTags
      .filter((tag) => !needle || tag.toLowerCase().includes(needle))
      .sort((a, b) => {
        if (!needle) return a.localeCompare(b);
        const aStarts = a.toLowerCase().startsWith(needle);
        const bStarts = b.toLowerCase().startsWith(needle);
        if (aStarts === bStarts) return a.localeCompare(b);
        return aStarts ? -1 : 1;
      })
      .slice(0, 8);
  }, [allTags, inputValue, normalizedTagInput]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={() => setOpen(false)}
      />

      <Command
        label="Global Command Menu"
        onKeyDown={handleKeyDown}
        className={`
          relative w-full max-w-2xl bg-base-100/95 backdrop-blur-2xl shadow-2xl border border-base-content/10 overflow-hidden
          flex flex-col h-auto max-h-[85vh] rounded-t-[2rem] sm:rounded-3xl
          animate-in slide-in-from-bottom-10 duration-300 ease-out
          sm:h-auto sm:max-h-[600px] sm:zoom-in-95
        `}
      >
        <div className="flex justify-center pt-3 pb-1 sm:hidden w-full bg-base-100/50">
          <div className="w-12 h-1.5 bg-base-content/20 rounded-full" />
        </div>

        <div
          className="flex items-center border-b border-base-content/5 px-6 py-2 bg-base-100/50 shrink-0"
          cmdk-input-wrapper=""
        >
          {view === "ENTRY_ACTIONS" ? (
            <CornerDownLeft className="w-6 h-6 text-primary mr-4 animate-in fade-in slide-in-from-right-2" />
          ) : (
            <Search className="w-6 h-6 text-base-content/40 mr-4" />
          )}

          <Command.Input
            value={inputValue}
            onValueChange={setInputValue}
            placeholder={
              view === "ENTRY_ACTIONS"
                ? t.command?.placeholderActions
                : t.command?.placeholder
            }
            className="w-full h-16 bg-transparent outline-none text-xl font-medium text-base-content placeholder:text-base-content/30 font-lxgw"
            autoFocus={!isTouchDevice}
          />

          <div className="hidden sm:flex items-center gap-3">
            {view === "ENTRY_ACTIONS" && (
              <div className="flex items-center gap-2 animate-in fade-in">
                <Kbd>
                  <Delete className="w-4 h-4" strokeWidth={2.5} />
                </Kbd>
              </div>
            )}
            {!view && (
              <div className="flex gap-2">
                <Kbd>⌘</Kbd>
                <Kbd>K</Kbd>
              </div>
            )}
          </div>
        </div>

        <Command.List className="flex-1 overflow-y-auto p-4 scroll-py-4 flex flex-col gap-4 pb-8 sm:pb-4">
          <Command.Empty className="py-16 text-center text-base text-base-content/40 font-lxgw">
            No results found.
          </Command.Empty>

          {view === "ROOT" && (
            <>
              {/* Search Suggestions */}
              {inputValue && (
                <Command.Group
                  heading={t.command?.search}
                  className="space-y-2"
                >
                  <Item
                    icon={<Search />}
                    label={`"${inputValue}"`}
                    value={`search find ${inputValue}`}
                    subLabel={t.command?.search}
                    onSelect={() =>
                      run(() => uiEvents.emit("OPEN_SEARCH", inputValue))
                    }
                  />
                  <Item
                    icon={<Hash />}
                    label={`#${normalizedTagInput || inputValue}`}
                    value={`tag filter hashtag ${inputValue} ${normalizedTagInput}`}
                    subLabel={t.command?.filterTag}
                    onSelect={() =>
                      run(() =>
                        uiEvents.emit(
                          "OPEN_TAG_SEARCH",
                          normalizedTagInput || inputValue,
                        ),
                      )
                    }
                  />
                </Command.Group>
              )}

              {/* Daily & Create */}
              <Command.Group
                heading={
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <LayoutGrid size={14} className="opacity-50" />
                    <span className="font-semibold opacity-70 tracking-wide">
                      {t.command?.dailyEntries || "Daily & Create"}
                    </span>
                  </div>
                }
              >
                <div className="flex flex-col gap-2">
                  {loadingEntries && dayEntries.length === 0 ? (
                    <div className="px-4 py-6 text-sm text-base-content/40 flex items-center justify-center gap-2 bg-base-200/30 rounded-2xl">
                      <Loader2 className="w-5 h-5 animate-spin" /> Loading...
                    </div>
                  ) : dayEntries.length === 0 && !inputValue ? (
                    <div className="px-4 py-6 text-sm font-medium text-base-content/30 italic font-lxgw text-center bg-base-200/20 rounded-2xl border border-dashed border-base-content/5">
                      {t.command?.noEntries || "No entries yet today."}
                    </div>
                  ) : (
                    dayEntries.map((entry) => {
                      const theme =
                        ENTRY_THEME[entry.entry_type as EntryType] ||
                        ENTRY_THEME.task;
                      const { text, meta } = getSmartSummary(entry.content);
                      const entryTags = Array.isArray(entry.tags)
                        ? entry.tags.join(" ")
                        : "";
                      const Icon = theme.icon;
                      const StatusIcon = STATUS_ICONS[entry.status] || Circle;
                      const statusColor =
                        STATUS_COLORS[entry.status] || "text-base-content/30";
                      const isCompleted =
                        entry.status === "completed" ||
                        entry.status === "cancelled";
                      const isMigrated = [
                        "migrated",
                        "forward",
                        "future",
                      ].includes(entry.status);

                      return (
                        <Command.Item
                          key={entry.id}
                          onSelect={() => openEntryActions(entry)}
                          value={`${text} ${entryTags} ${entry.entry_type} ${entry.status} ${entry.id}`}
                          className="relative flex items-center gap-4 px-5 py-4 rounded-2xl text-base font-medium transition-all duration-200 cursor-pointer group font-lxgw
                                     border border-transparent bg-base-100 shadow-sm
                                     data-[selected=true]:bg-primary/5 data-[selected=true]:border-primary/20 data-[selected=true]:shadow-md data-[selected=true]:scale-[1.01]"
                        >
                          <div
                            className={`shrink-0 ${theme.color} p-2 rounded-xl bg-base-content/5 group-data-[selected=true]:bg-primary/20 transition-colors duration-200`}
                          >
                            <Icon size={18} strokeWidth={2.5} />
                          </div>
                          <div className="flex-1 min-w-0 flex flex-col">
                            <span
                              className={`truncate ${isCompleted ? "line-through opacity-50" : "opacity-80 group-data-[selected=true]:opacity-100"}`}
                            >
                              {text}
                            </span>
                            {(isMigrated || isCompleted) && (
                              <div className="flex items-center gap-1 mt-0.5 text-[10px] font-mono uppercase tracking-wider opacity-60">
                                <StatusIcon size={10} className={statusColor} />
                                <span className={`font-bold ${statusColor}`}>
                                  {getStatusLabel(entry.status)}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2 opacity-30 group-data-[selected=true]:opacity-60 transition-opacity">
                            {meta.hasImage && <ImageIcon size={14} />}
                            {meta.hasLink && <LinkIcon size={14} />}
                            {meta.hasChecklist && <CheckSquare size={14} />}
                            {meta.hasOrderedList && <ListOrdered size={14} />}
                            {meta.hasUnorderedList && <List size={14} />}
                            {meta.hasCode && <Code size={14} />}
                            {meta.hasMath && <Sigma size={14} />}
                            {meta.hasQuote && <Quote size={14} />}
                            {meta.hasTag && <Hash size={14} />}
                          </div>
                          <ArrowRight className="w-4 h-4 opacity-0 group-data-[selected=true]:opacity-100 text-primary transition-all -ml-2 group-data-[selected=true]:ml-0" />
                        </Command.Item>
                      );
                    })
                  )}
                </div>

                <div className="flex flex-col gap-2 mt-3">
                  <Item
                    icon={<PenLine />}
                    label={t.command?.newDaily}
                    subLabel={t.command.subtitle}
                    value={`${t.command?.newDaily} new daily create n`}
                    shortcut="N"
                    onSelect={() =>
                      run(() =>
                        uiEvents.emit("OPEN_ADD_ENTRY", {
                          mode: "daily",
                          date: new Date(focusDateStr),
                        }),
                      )
                    }
                  />
                  <Item
                    icon={<ArrowRight />}
                    label={t.command?.newFuture}
                    subLabel={t.command.futsubtitle}
                    value={`${t.command?.newFuture} new future log f`}
                    onSelect={() =>
                      run(() =>
                        uiEvents.emit("OPEN_ADD_ENTRY", { mode: "future" }),
                      )
                    }
                  />
                </div>
              </Command.Group>

              {/* Navigation */}
              <Command.Group
                heading={t.command?.navigation}
                className="space-y-2"
              >
                <Item
                  icon={<Clock />}
                  label={t.command?.timeline}
                  value={`${t.command?.timeline} timeline time t view`}
                  onSelect={() => run(() => uiEvents.emit("OPEN_TIMELINE"))}
                />
                <Item
                  icon={<CalendarCheck />}
                  label={t.command?.futureLog}
                  value={`${t.command?.futureLog} future log plan calendar`}
                  onSelect={() => run(() => uiEvents.emit("OPEN_FUTURE_LOG"))}
                />
                <Item
                  icon={<Search />}
                  label={t.command?.openSearch}
                  value={`${t.command?.openSearch} search find s`}
                  shortcut="S"
                  onSelect={() => run(() => uiEvents.emit("OPEN_SEARCH", null))}
                />
              </Command.Group>

              {/* Tools */}
              <Command.Group
                heading={t.command?.tools || "Tools"}
                className="space-y-2"
              >
                <Item
                  icon={<RefreshCw />}
                  label={t.command?.calendarSync || "Calendar Sync"}
                  value={`${t.command?.calendarSync} sync calendar google`}
                  onSelect={() =>
                    run(() => uiEvents.emit("OPEN_CALENDAR_SYNC"))
                  }
                />
                <Item
                  icon={<Archive />}
                  label={t.backup?.title || "Backup & Restore"}
                  subLabel=".BJK / Markdown"
                  value={`${t.backup?.title} backup export download restore`}
                  onSelect={() => run(() => uiEvents.emit("OPEN_BACKUP"))}
                />
              </Command.Group>

              {filteredTagSuggestions.length > 0 && (
                <Command.Group
                  heading={t.command?.tagMenu || "Tags"}
                  className="space-y-2"
                >
                  {filteredTagSuggestions.map((tag) => (
                    <Item
                      key={tag}
                      icon={<Hash />}
                      label={`#${tag}`}
                      value={`tag filter hashtag ${tag}`}
                      subLabel={t.command?.filterTag}
                      onSelect={() =>
                        run(() => uiEvents.emit("OPEN_TAG_SEARCH", tag))
                      }
                    />
                  ))}
                </Command.Group>
              )}

              {/* Settings (新增) */}
              <Command.Group
                heading={t.command?.settings || "Settings"}
                className="space-y-2"
              >
                <Item
                  icon={getThemeIcon()}
                  label={t.command?.theme || "Switch Theme"}
                  subLabel={getThemeLabel()}
                  // ✅ 关键词：包含 system/dark/light 方便搜索
                  value="switch theme 切换主题 mode dark light system color"
                  // ⚡️ 修复：直接调用，不传参，不 preventDefault
                  onSelect={() => cycleTheme()}
                />
                <Item
                  icon={<Languages />}
                  label={t.command?.language || "Switch Language"}
                  subLabel={lang === "zh" ? "中文" : "English"}
                  // ✅ 关键词
                  value="switch language 切换语言 lang chinese english"
                  // ⚡️ 修复：直接调用
                  onSelect={() => toggleLang()}
                />
              </Command.Group>
            </>
          )}

          {view === "ENTRY_ACTIONS" && selectedEntry && (
            <EntryActionView
              entry={selectedEntry}
              run={run}
              onBack={handleBack}
            />
          )}
        </Command.List>

        <div className="h-1.5 bg-gradient-to-r from-primary/20 via-secondary/20 to-accent/20" />
      </Command>
    </div>
  );
}
