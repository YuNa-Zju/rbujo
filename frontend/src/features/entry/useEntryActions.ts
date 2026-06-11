import { useState } from "react";
import { format, addDays, addMonths, parseISO } from "date-fns";
import { entryService } from "../../services/entryService";
import { useEntryNavigation } from "../../hooks/useEntryNavigation";
import { useTagCache } from "../../context/TagCacheContext";
// 引入两个总线：一个负责数据同步，一个负责 UI 弹窗
import { entryEventBus, type MigratePayload } from "../../lib/entryEventBus";
import { uiEvents } from "../../lib/uiEvents";
import { type EntryType } from "../../config/entryTheme";

export function useEntryActions(
  entry: any,
  refresh: () => void,
  // Refs 依然保留，作为一种优先的打开方式
  refs: Partial<{
    migrateModalRef: React.RefObject<HTMLDialogElement | null>;
    futureModalRef: React.RefObject<HTMLDialogElement | null>;
    deleteModalRef: React.RefObject<HTMLDialogElement | null>;
  }> = {},
  onEditingChange?: (isEditing: boolean) => void,
) {
  const { handleJump } = useEntryNavigation();
  const { clearCache } = useTagCache();

  // --- State ---
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dateInput, setDateInput] = useState("");
  const [futureMonth, setFutureMonth] = useState("");

  // --- Derived State ---
  const isDone = entry.status !== "open";
  const isTask = entry.entry_type === "task";
  const isMigrated = [
    "forward",
    "future",
    "migrated_forward",
    "migrated_future",
  ].includes(entry.status);

  // --- Helpers ---
  const execute = async (fn: () => Promise<void>) => {
    setLoading(true);
    try {
      await fn();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const setEditingState = (state: boolean) => {
    setIsEditing(state);
    if (onEditingChange) onEditingChange(state);
  };

  /**
   * 📡 同步更新广播
   * 负责通知 EventBus 更新当前条目，以及（如果存在）原始父条目
   */
  const broadcastSync = (baseEntry: any, overrideProps: any = {}) => {
    const currentUpdate = { ...baseEntry, ...overrideProps };
    entryEventBus.emit("entry:update", currentUpdate);

    // 如果有本体 (Source Entry)，也要同步更新它
    if (baseEntry.source_entry_id) {
      entryEventBus.emit("entry:update", {
        id: baseEntry.source_entry_id,
        content: overrideProps.content ?? baseEntry.content,
        entry_type: overrideProps.entry_type ?? baseEntry.entry_type,
        target_month: overrideProps.target_month ?? baseEntry.target_month,
        // 注意：Status 通常需要特殊处理，不在这里盲目同步
      });
    }
  };

  // --- Handlers (常规操作) ---

  const handleReopen = async () => {
    execute(async () => {
      const data = await entryService.reopen(entry.id);
      const { updated_entry, deleted_entries } = data;

      if (updated_entry) {
        entryEventBus.emit("entry:update", updated_entry);

        // 处理关联删除 (Logic maintained)
        const targets = Array.isArray(deleted_entries) ? deleted_entries : [];

        // 检查 link_to 关联
        if (targets.length === 0 && entry.migrated_to_date) {
          const fallbackId = entry.link_to || entry.props?.link_to;
          if (fallbackId) {
            targets.push({
              id: fallbackId,
              target_date: entry.migrated_to_date,
            });
          }
        }
        targets.forEach((t: any) => entryEventBus.emit("entry:delete", t.id));
      }
      refresh();
    });
  };

  const handleStatusToggle = () => {
    if (isEditing) return;
    if (isMigrated) {
      handleReopen();
      return;
    }
    if (!isTask) return;

    const newStatus = entry.status === "open" ? "completed" : "open";
    const updatedEntry = { ...entry, status: newStatus };

    // 乐观更新
    entryEventBus.emit("entry:status_change", updatedEntry);

    entryService
      .update(entry.id, { status: newStatus, is_future: entry.is_future })
      .catch((e) => {
        console.error(e);
        refresh(); // 回滚
      });
  };

  const handleSaveEdit = (content: string, type: EntryType) => {
    broadcastSync(entry, { content, entry_type: type });
    execute(async () => {
      await entryService.update(entry.id, { content, entry_type: type });
      setEditingState(false);
      clearCache();
      refresh();
    });
  };

  const handleTaskToggle = (newContent: string) => {
    broadcastSync(entry, { content: newContent });
    entryService.update(entry.id, { content: newContent });
  };

  const handleOpenFutureLog = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleJump(null); // 跳转到 Future Log 视图
  };

  // --- 🟢 Modal Openers (UI Events) ---

  const openMigrate = () => {
    // 1. 计算默认下一天
    let baseDate = new Date();
    if (entry.target_date) baseDate = parseISO(entry.target_date);
    else if (entry.date) baseDate = parseISO(entry.date);
    const defaultDate = format(addDays(baseDate, 1), "yyyy-MM-dd");

    // 2. 优先使用 Ref
    if (refs.migrateModalRef?.current) {
      setDateInput(defaultDate); // 本地 State 更新
      refs.migrateModalRef.current.showModal();
    } else {
      // 3. ✅ 降级：通过总线发送，并带上 defaultDate
      uiEvents.emit("OPEN_MIGRATE_ENTRY", {
        entry,
        defaultDate, // <--- 关键修改
      });
    }
  };

  const openFuture = () => {
    // 1. 计算默认本月
    const defaultMonth = format(new Date(), "yyyy-MM");

    if (refs.futureModalRef?.current) {
      setFutureMonth(defaultMonth); // 本地 State 更新
      refs.futureModalRef.current.showModal();
    } else {
      // 2. ✅ 降级：通过总线发送，并带上 defaultMonth
      uiEvents.emit("OPEN_FUTURE_ENTRY", {
        entry,
        defaultMonth, // <--- 关键修改
      });
    }
  };

  const openDelete = () => {
    if (refs.deleteModalRef?.current) {
      refs.deleteModalRef.current.showModal();
    } else {
      uiEvents.emit("OPEN_DELETE_ENTRY", { entry });
    }
  };

  const performArchive = () => {
    execute(async () => {
      const archived = await entryService.archive(entry.id);
      entryEventBus.emit("entry:delete", entry.id);
      if (archived.source_entry_id) {
        entryEventBus.emit("entry:update", {
          id: archived.source_entry_id,
          migrated_to_archived_at: archived.archived_at,
        });
      }
      clearCache();
      refresh();
    });
  };

  // --- 🔴 核心逻辑：确认迁移 (Confirm Migrate) ---
  // 这对应“弹窗确认”后的逻辑，包含了你要求的“三角形更新”修复

  const confirmMigrate = () => {
    execute(async () => {
      if (entry.is_future) {
        // [场景 A] Future Log 条目 -> 重新规划到具体日期

        // 1. UI上移除当前 Future 条目
        entryEventBus.emit("entry:delete", entry.id);

        // 2. 调用 API
        const response = await entryService.rescheduleFutureEntry(
          entry.id,
          dateInput,
        );

        // 🔴 3. 核心 Bug 修复：更新原始 Daily 条目 (A) 的状态
        // A 原本是 "migrated_future" (去未来了)，现在它的分身 (B) 被改到了某天
        // 所以 A 应该变为 "migrated_forward" (去某天了)
        if (entry.source_entry_id) {
          entryEventBus.emit("entry:update", {
            id: entry.source_entry_id, // 原始条目 A 的 ID
            status: "migrated_forward", // 状态修正
            migrated_to_date: dateInput, // 链接修正
            target_month: null, // 移除月份标记
          });
        }

        // 4. 生成新条目 C (或移动后的 B)
        const futureSource = { ...entry };
        const newDailyEntry = {
          ...response,
          id: entry.id,
          date: dateInput,
          status: "open",
          is_future: false,
          target_month: null,
          source_entry_id: entry.source_entry_id,
        };

        const payload: MigratePayload = {
          source: futureSource,
          target: newDailyEntry,
          date: dateInput,
        };
        entryEventBus.emit("entry:migrate", payload);
        refresh();
      } else {
        // [场景 B] Daily Log 条目 -> 迁移到另一天
        const data = await entryService.migrate(entry.id, dateInput);
        const { new_entry, updated_source } = data;
        if (new_entry && updated_source) {
          const payload: MigratePayload = {
            source: updated_source,
            target: new_entry,
            date: dateInput,
          };
          entryEventBus.emit("entry:migrate", payload);
        }
        refresh();
      }
      refs.migrateModalRef?.current?.close();
    });
  };

  const confirmFuture = (isUndetermined: boolean) => {
    const targetMonth = isUndetermined ? null : futureMonth;
    execute(async () => {
      if (entry.is_future) {
        // Future -> Future (修改月份)：只同步 target_month
        broadcastSync(entry, { target_month: targetMonth });
        await entryService.moveFutureEntry(entry.id, targetMonth);
      } else {
        // Daily -> Future：状态变为 migrated_future
        const updatedEntry = {
          ...entry,
          status: "migrated_future",
          target_month: targetMonth,
        };
        entryEventBus.emit("entry:status_change", updatedEntry);
        await entryService.moveToFuture(entry.id, targetMonth);
      }
      refresh();
      refs.futureModalRef?.current?.close();
    });
  };

  const performDelete = (hard: boolean) => {
    if (hard) {
      entryEventBus.emit("entry:delete", entry.id);
      if (entry.source_entry_id) {
        entryEventBus.emit("entry:update", {
          id: entry.source_entry_id,
          status: "open",
          migrated_to_date: null,
          migrated_to_month: null,
          migrated_to_entry_id: null,
          migrated_to_archived_at: null,
          target_month: null,
        });
      }
    } else {
      const updatedEntry = { ...entry, status: "cancelled" };
      entryEventBus.emit("entry:update", updatedEntry);
    }
    execute(async () => {
      await entryService.delete(entry.id, hard);
      if (hard) refresh();
      clearCache();
      refs.deleteModalRef?.current?.close();
    });
  };

  const performCancel = () => {
    performDelete(false);
  };

  // --- 🔴 快捷操作 (Shortcuts) ---
  // 这里必须复刻 confirmMigrate 的逻辑，否则快捷操作会导致数据不一致

  const handleMoveToTomorrow = async () => {
    let baseDate = new Date();
    // 兼容 Future Entry (没有 .date) 和 Daily Entry
    if (entry.date) baseDate = parseISO(entry.date);
    const tomorrow = format(addDays(baseDate, 1), "yyyy-MM-dd");

    // 设置 State 供逻辑一致性
    setDateInput(tomorrow);

    execute(async () => {
      if (entry.is_future) {
        // [场景 A] Future -> Tomorrow (必须包含 source_entry_id 修复)
        entryEventBus.emit("entry:delete", entry.id);

        const response = await entryService.rescheduleFutureEntry(
          entry.id,
          tomorrow,
        );

        // 🔴 更新 Source Entry
        if (entry.source_entry_id) {
          entryEventBus.emit("entry:update", {
            id: entry.source_entry_id,
            status: "migrated_forward",
            migrated_to_date: tomorrow,
            target_month: null,
          });
        }

        const futureSource = { ...entry };
        const newDailyEntry = {
          ...response,
          id: entry.id,
          date: tomorrow,
          status: "open",
          is_future: false,
          target_month: null,
          source_entry_id: entry.source_entry_id,
        };

        entryEventBus.emit("entry:migrate", {
          source: futureSource,
          target: newDailyEntry,
          date: tomorrow,
        });
      } else {
        // [场景 B] Daily -> Tomorrow
        const data = await entryService.migrate(entry.id, tomorrow);
        const { new_entry, updated_source } = data;
        if (new_entry && updated_source) {
          entryEventBus.emit("entry:migrate", {
            source: updated_source,
            target: new_entry,
            date: tomorrow,
          });
        }
      }
      refresh();
    });
  };

  const handleMoveToNextMonth = async () => {
    const nextMonth = format(addMonths(new Date(), 1), "yyyy-MM");

    execute(async () => {
      if (entry.is_future) {
        // Future -> Next Month (Update Month)
        broadcastSync(entry, { target_month: nextMonth });
        await entryService.moveFutureEntry(entry.id, nextMonth);
      } else {
        // Daily -> Next Month (Migrate to Future)
        const updatedEntry = {
          ...entry,
          status: "migrated_future",
          target_month: nextMonth,
        };
        entryEventBus.emit("entry:status_change", updatedEntry);
        await entryService.moveToFuture(entry.id, nextMonth);
      }
      refresh();
    });
  };

  return {
    isEditing,
    loading,
    dateInput,
    setDateInput,
    futureMonth,
    setFutureMonth,
    isTask,
    isDone,
    isMigrated,
    setEditingState,
    handleStatusToggle,
    handleSaveEdit,
    handleTaskToggle,
    handleOpenFutureLog,
    // 暴露快捷操作
    handleMoveToTomorrow,
    handleMoveToNextMonth,
    actions: {
      openMigrate,
      openFuture,
      openDelete,
      confirmMigrate,
      confirmFuture,
      performDelete,
      performCancel,
      performArchive,
    },
  };
}
