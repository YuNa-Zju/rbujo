import { Command } from "cmdk";
import {
  Edit3,
  MoveRight,
  Copy,
  Archive,
  XCircle,
  Undo,
  CornerDownLeft,
  Delete,
  CalendarClock,
  Check,
  RotateCcw,
} from "lucide-react";
// ✅ 1. 引入日期处理函数
import { addDays, format, parseISO } from "date-fns";
import { Item } from "./CmdkComponents";
import { getSmartSummary } from "../../../utils/markdownUtils";
import { useTranslation } from "../../../hooks/useTranslation";
import { uiEvents } from "../../../lib/uiEvents";
import { entryService } from "../../../services/entryService";
import { entryEventBus } from "../../../lib/entryEventBus";

interface EntryActionViewProps {
  entry: any;
  run: (action: () => void) => void;
  onBack: () => void;
}

export default function EntryActionView({
  entry,
  run,
  onBack,
}: EntryActionViewProps) {
  const { t } = useTranslation();

  // ... getStatusLabel 和 handleToggleStatus 保持不变 ...
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

  const handleToggleStatus = async () => {
    // ... (保持原样)
    if (!entry) return;
    const isClosed = entry.status !== "open";
    if (isClosed) {
      try {
        const data = await entryService.reopen(entry.id);
        const { updated_entry, deleted_entries } = data;
        entryEventBus.emit("entry:update", updated_entry);
        if (Array.isArray(deleted_entries)) {
          deleted_entries.forEach((t: any) =>
            entryEventBus.emit("entry:delete", t.id),
          );
        }
      } catch (e) {
        console.error("Reopen failed", e);
      }
    } else {
      const newStatus = "completed";
      entryEventBus.emit("entry:status_change", {
        ...entry,
        status: newStatus,
      });
      try {
        await entryService.update(entry.id, { status: newStatus });
      } catch (e) {
        console.error("Complete failed", e);
        entryEventBus.emit("entry:status_change", entry);
      }
    }
  };

  // ✅ 2. 辅助函数：获取 Entry 的日期对象
  const getEntryDateObj = () => {
    // task 通常用 target_date, idea/event 用 date
    const dateStr = entry.target_date || entry.date;
    if (!dateStr) return new Date(); // 如果没有日期，回退到今天
    return typeof dateStr === "string" ? parseISO(dateStr) : new Date(dateStr);
  };

  const handleArchive = async () => {
    try {
      const archived = await entryService.archive(entry.id);
      entryEventBus.emit("entry:delete", entry.id);
      if (archived.source_entry_id) {
        entryEventBus.emit("entry:update", {
          id: archived.source_entry_id,
          migrated_to_archived_at: archived.archived_at,
        });
      }
    } catch (e) {
      console.error("Archive failed", e);
    }
  };

  const handleCancel = async () => {
    try {
      await entryService.delete(entry.id, false);
      entryEventBus.emit("entry:update", { ...entry, status: "cancelled" });
      entryEventBus.emit("entry:status_change", { id: entry.id, status: "cancelled" });
    } catch (e) {
      console.error("Cancel failed", e);
    }
  };

  return (
    <>
      <Command.Group heading={t.command?.selectedEntry} className="mb-2">
        {/* ... (Entry Info Card 保持不变) ... */}
        <div className="p-5 bg-base-200/40 rounded-2xl border border-base-content/5 flex items-start gap-4 select-none">
          <div className="shrink-0 mt-0.5 text-primary/80">
            <CornerDownLeft size={22} strokeWidth={1.5} />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-lg font-medium text-base-content/80 line-clamp-3 font-lxgw leading-relaxed italic">
              {getSmartSummary(entry.content).text}
            </p>
            <p className="text-xs text-base-content/30 mt-2 font-mono flex items-center gap-2">
              <span>ID: {entry.id.slice(0, 8)}</span>
              <span>•</span>
              <span>{entry.entry_type.toUpperCase()}</span>
              {entry.entry_type === "task" && (
                <>
                  <span>•</span>
                  <span className="uppercase text-info">
                    {getStatusLabel(entry.status)}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>
      </Command.Group>

      <Command.Group heading={t.command?.actions} className="space-y-2">
        {/* 状态切换按钮 */}
        {entry.entry_type === "task" && (
          <Item
            icon={entry.status === "open" ? <Check /> : <RotateCcw />}
            label={
              entry.status === "open"
                ? t.entry?.complete || "Complete"
                : t.entry?.reopen || "Reopen"
            }
            onSelect={() => run(handleToggleStatus)}
          />
        )}

        <Item
          icon={<Edit3 />}
          label={t.command?.edit}
          onSelect={() =>
            run(() =>
              uiEvents.emit("OPEN_EDIT_ENTRY", {
                entry: entry,
              }),
            )
          }
        />

        {/* 迁移/未来日志 */}
        {entry.entry_type === "task" && entry.status === "open" && (
          <>
            {/* ✅ 3. 修复 Migrate：默认日期 = Entry日期 + 1天 */}
            <Item
              icon={<MoveRight />}
              label={t.command?.migrate}
              onSelect={() =>
                run(() => {
                  const baseDate = getEntryDateObj();
                  const nextDay = addDays(baseDate, 1);

                  uiEvents.emit("OPEN_MIGRATE_ENTRY", {
                    entry: entry,
                    defaultDate: format(nextDay, "yyyy-MM-dd"), // 传递 +1 天
                  });
                })
              }
            />
            {/* ✅ 4. 修复 Future Log：默认月份 = Entry所在月份 */}
            <Item
              icon={<CalendarClock />}
              label={t.entry?.toFuture || "To Future Log"}
              onSelect={() =>
                run(() => {
                  const baseDate = getEntryDateObj();

                  uiEvents.emit("OPEN_FUTURE_ENTRY", {
                    entry: entry,
                    defaultMonth: format(baseDate, "yyyy-MM"), // 传递当月
                  });
                })
              }
            />
          </>
        )}

        <Item
          icon={<Copy />}
          label={t.command?.copy}
          onSelect={() => {
            navigator.clipboard.writeText(entry.content);
            run(() => {});
          }}
        />
        {!entry.archived_at && (
          <Item
            icon={<Archive />}
            label={t.common?.archive || "Archive"}
            onSelect={() => run(handleArchive)}
          />
        )}
        {entry.status !== "cancelled" && (
          <Item
            icon={<XCircle />}
            label={t.entry?.softDelete || "Mark as Cancelled"}
            danger
            onSelect={() => run(handleCancel)}
          />
        )}
      </Command.Group>

      <Command.Group className="mt-4 pt-4 border-t border-base-content/5">
        <Item
          icon={<Undo />}
          label={t.command?.back || "Back"}
          shortcut={<Delete className="w-3 h-3" strokeWidth={2.5} />}
          onSelect={onBack}
        />
      </Command.Group>
    </>
  );
}
