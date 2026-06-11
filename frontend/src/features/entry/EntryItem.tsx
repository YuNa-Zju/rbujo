import {
  CheckCircle2,
  ChevronRight,
  ChevronsRight,
  X,
  ArrowRight,
  CalendarClock,
  CornerLeftUp,
} from "lucide-react";
import { ENTRY_THEME, type EntryType } from "../../config/entryTheme";
import { useTranslation } from "../../hooks/useTranslation";
import { useEntryNavigation } from "../../hooks/useEntryNavigation";

import { useEntryActions } from "./useEntryActions";

import EntryDisplay from "./EntryDisplay";
import EntryEditor from "./EntryEditor";
import EntryActions from "./EntryActions";
import { uiEvents } from "../../lib/uiEvents";

interface EntryItemProps {
  entry: any;
  refresh: () => void;
  forceCollapse?: boolean;
  disableOverflowCheck?: boolean;
  onEditingChange?: (isEditing: boolean) => void;
  useInlineEditor?: boolean;
  isTagClickable?: boolean;
}

export default function EntryItem({
  entry,
  refresh,
  forceCollapse,
  disableOverflowCheck,
  onEditingChange,
  useInlineEditor = false,
  isTagClickable = true,
}: EntryItemProps) {
  const { t } = useTranslation();
  const { handleJump } = useEntryNavigation();

  // 🔴 修复 1：参数对齐
  // useEntryActions 的签名是 (entry, refresh, refs, onEditingChange)
  // 之前少传了 refs，导致 onEditingChange 变成了 refs，逻辑错乱
  const {
    isEditing,
    loading,
    isTask,
    isMigrated,
    setEditingState,
    handleStatusToggle,
    handleSaveEdit,
    handleTaskToggle,
    handleOpenFutureLog,
    actions,
  } = useEntryActions(
    entry,
    refresh,
    {}, // ✅ 必须传一个空对象占位，否则 Hook 内部逻辑会崩
    onEditingChange,
  );

  const theme = ENTRY_THEME[entry.entry_type as EntryType] || ENTRY_THEME.task;
  const isCompletedTask = isTask && entry.status === "completed";

  const handleShare = () => {
    console.log("📢 [EntryItem] Emitting OPEN_SHARE_ENTRY for id:", entry.id);
    uiEvents.emit("OPEN_SHARE_ENTRY", { entry });
  };

  const renderIcon = () => {
    if (["migrated_future", "future"].includes(entry.status))
      return <ChevronsRight className="text-secondary" size={18} />;
    if (["migrated_forward", "forward"].includes(entry.status))
      return <ChevronRight className="text-info" size={18} />;
    if (entry.status === "cancelled")
      return <X className="text-gray-300" size={18} />;
    if (isCompletedTask)
      return <CheckCircle2 size={18} className="text-success" />;
    const Icon = theme.icon;
    return <Icon className={theme.color} size={16} strokeWidth={2.5} />;
  };

  return (
    <div
      className={`flex items-start gap-3 w-full group relative transition-all duration-300`}
    >
      {/* Status Toggle / Icon */}
      <button
        className={`w-7 h-7 flex items-center justify-center shrink-0 mt-[1px] rounded-full transition-all duration-200 ${
          isTask || isMigrated
            ? `cursor-pointer active:scale-90 hover:bg-base-200/80 ${theme.softHover}`
            : "cursor-default"
        } ${isCompletedTask ? "opacity-50 grayscale-[0.5]" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          handleStatusToggle();
        }}
        disabled={loading || isEditing}
      >
        {renderIcon()}
      </button>

      {/* Content Area */}
      <div className="flex-1 min-w-0 pt-[2px]">
        {isEditing ? (
          <EntryEditor
            initialContent={entry.content}
            initialType={entry.entry_type}
            onSave={handleSaveEdit}
            onCancel={() => setEditingState(false)}
            isInline={useInlineEditor}
          />
        ) : (
          <div className="flex flex-col gap-1.5">
            <EntryDisplay
              content={entry.content}
              status={entry.status}
              isTask={isTask}
              forceCollapse={forceCollapse}
              disableOverflowCheck={disableOverflowCheck}
              onDoubleClick={() => !forceCollapse && setEditingState(true)}
              onTaskToggle={handleTaskToggle}
              isTagClickable={isTagClickable}
              entryType={entry.entry_type}
            />

            {!forceCollapse && (
              <div className="flex flex-wrap gap-2 text-xs select-none">
                {/* Migrated TO Date */}
                {entry.migrated_to_date && (
                  <span
                    className="flex items-center gap-1.5 text-info/90 hover:text-info cursor-pointer font-medium bg-info/5 hover:bg-info/10 px-2 py-0.5 rounded-full transition-colors border border-info/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleJump(entry.migrated_to_date!);
                    }}
                  >
                    <ArrowRight size={10} strokeWidth={3} />{" "}
                    {t.entry.migratedTo}{" "}
                    <span className="font-mono">{entry.migrated_to_date}</span>
                  </span>
                )}

                {/* Migrated TO Future */}
                {(entry.target_month ||
                  entry.status === "future" ||
                  entry.status === "migrated_future") &&
                  ["migrated_future", "future"].includes(entry.status) && (
                    <span
                      className="flex items-center gap-1.5 cursor-pointer font-medium px-2 py-0.5 rounded-full transition-colors border text-amber-600/90 hover:text-amber-700 bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/10"
                      onClick={(e) => handleOpenFutureLog(e)}
                    >
                      <CalendarClock size={11} strokeWidth={2.5} />
                      {t.entry.movedToFuture}{" "}
                      <span className="font-mono">
                        {entry.target_month || t.futureLog.undetermined}
                      </span>
                    </span>
                  )}

                {/* Migrated FROM */}
                {entry.from_date && (
                  <span
                    className="flex items-center gap-1.5 text-base-content/50 hover:text-base-content/80 cursor-pointer font-medium px-2 py-0.5 rounded-full transition-colors hover:bg-base-200/50 border border-transparent hover:border-base-200"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleJump(entry.from_date!);
                    }}
                  >
                    <CornerLeftUp size={10} strokeWidth={2.5} />{" "}
                    {t.entry.migratedFrom}{" "}
                    <span className="font-mono ml-0.5">{entry.from_date}</span>
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      {!isEditing && !forceCollapse && (
        <div className="flex-none">
          <EntryActions
            entryId={entry.id} // 传入 ID 以支持菜单互斥
            isTask={isTask}
            status={entry.status}
            content={entry.content}
            onEdit={() => setEditingState(true)}
            onToggleStatus={handleStatusToggle}
            onMigrate={actions.openMigrate}
            onFuture={actions.openFuture}
            onDelete={actions.openDelete}
            // 🔴 修复 2：防止 actions.openShare 未定义导致崩溃
            onShare={handleShare}
          />
        </div>
      )}
    </div>
  );
}
