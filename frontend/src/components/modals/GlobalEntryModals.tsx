import { useEffect, useRef, useState } from "react";
import { entryService } from "../../services/entryService";
import { entryEventBus, type MigratePayload } from "../../lib/entryEventBus";
import { useModalController } from "../../context/ModalControllerContext";

import MigrateModal from "./MigrateModal";
import FutureModal from "./FutureModal";
import DeleteModal from "./DeleteModal";

export default function GlobalEntryModals() {
  const { entryActionRequest, clearEntryAction } = useModalController();
  const [selectedEntry, setSelectedEntry] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [dateInput, setDateInput] = useState("");
  const [futureMonth, setFutureMonth] = useState("");

  const migrateRef = useRef<HTMLDialogElement>(null);
  const futureRef = useRef<HTMLDialogElement>(null);
  const deleteRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!entryActionRequest || entryActionRequest.kind === "edit") return;

    const { entry, defaultDate, defaultMonth } = entryActionRequest.payload;
    setSelectedEntry(entry);

    if (entryActionRequest.kind === "migrate") {
      if (defaultDate) {
        setDateInput(defaultDate);
      } else {
        const now = new Date();
        now.setDate(now.getDate() + 1);
        setDateInput(entry.target_date || now.toISOString().split("T")[0]);
      }
      migrateRef.current?.showModal();
      return;
    }

    if (entryActionRequest.kind === "future") {
      setFutureMonth(defaultMonth || entry.target_month || "");
      futureRef.current?.showModal();
      return;
    }

    if (entryActionRequest.kind === "delete") {
      deleteRef.current?.showModal();
      return;
    }
  }, [entryActionRequest]);

  const handleClose = () => {
    migrateRef.current?.close();
    futureRef.current?.close();
    deleteRef.current?.close();
    setTimeout(() => setSelectedEntry(null), 300);
    clearEntryAction();
  };

  /**
   * 1. 迁移逻辑 (Future -> Daily 或 Daily -> Daily)
   */
  const handleMigrateConfirm = async () => {
    if (!selectedEntry || !dateInput) return;
    setLoading(true);

    try {
      if (selectedEntry.is_future) {
        // --- 场景 A: 从 Future Log 迁移到某一天 ---
        // 1. 先从 UI 移除 Future 条目
        entryEventBus.emit("entry:delete", selectedEntry.id);

        const response = await entryService.rescheduleFutureEntry(
          selectedEntry.id,
          dateInput,
        );

        // 2. 🔴 三角形更新：通知最原始的 Daily 存根，它的去向从“未来”变更为“某天”
        if (selectedEntry.source_entry_id) {
          entryEventBus.emit("entry:update", {
            id: selectedEntry.source_entry_id,
            status: "migrated_forward",
            migrated_to_date: dateInput,
            target_month: null,
          });
        }

        // 3. 广播迁移事件：将 Future 条目转换为新的 Daily 条目
        const payload: MigratePayload = {
          source: { ...selectedEntry, status: "migrated_forward" },
          target: { ...response, is_future: false, status: "open" },
          date: dateInput,
        };
        entryEventBus.emit("entry:migrate", payload);
      } else {
        // --- 场景 B: Daily 之间的迁移 ---
        const result = await entryService.migrate(selectedEntry.id, dateInput);
        entryEventBus.emit("entry:migrate", {
          source: result.updated_source,
          target: result.new_entry,
          date: dateInput,
        });
      }
      handleClose();
    } catch (error) {
      console.error("Migrate failed:", error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * 2. 未来日志逻辑 (Daily -> Future 或 Future 修改月份)
   */
  const handleFutureConfirm = async () => {
    if (!selectedEntry) return;
    setLoading(true);

    // 逻辑 1: 如果月份为空，则为 SomeDay
    const targetMonth = futureMonth || null;

    try {
      let response;
      if (selectedEntry.is_future) {
        // Future -> Future (修改月份)
        response = await entryService.moveFutureEntry(
          selectedEntry.id,
          targetMonth,
        );

        // 同步更新本体
        if (selectedEntry.source_entry_id) {
          entryEventBus.emit("entry:update", {
            id: selectedEntry.source_entry_id,
            target_month: targetMonth,
          });
        }
        entryEventBus.emit("entry:update", response);
      } else {
        // Daily -> Future
        response = await entryService.moveToFuture(
          selectedEntry.id,
          targetMonth,
        );

        // 逻辑 2 & 3: 处理存根与真身的渲染分离
        const movedEntry = response;

        // A. 准备 Daily 存根 (Stub)
        const stubEntry = {
          ...selectedEntry,
          status: "migrated_future",
          is_future: false, // 🔴 确保它留在 Daily 视图
          target_month: targetMonth,
          date: selectedEntry.date || movedEntry.from_date,
        };

        // B. 准备 Future 真身
        const futureEntry = {
          ...movedEntry,
          is_future: true, // 🔴 确保它去往 Future 视图
          target_month: targetMonth,
        };

        // 发送状态变更给 Daily Log (更新存根图标)
        entryEventBus.emit("entry:status_change", stubEntry);

        // 发送迁移指令：
        // 这里的 payload 会被各自的列表组件根据 is_future 标志过滤处理
        entryEventBus.emit("entry:migrate", {
          source: stubEntry,
          target: futureEntry,
          date: targetMonth || "Someday",
        });

        // 额外发送一个 create 确保 FutureLog 捕获新条目
        entryEventBus.emit("entry:create", futureEntry);
      }
      handleClose();
    } catch (error) {
      console.error("Future action failed:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteConfirm = async (hard: boolean) => {
    if (!selectedEntry) return;
    setLoading(true);
    try {
      await entryService.delete(selectedEntry.id, hard);
      if (hard) {
        entryEventBus.emit("entry:delete", selectedEntry.id);
      } else {
        entryEventBus.emit("entry:status_change", {
          ...selectedEntry,
          status: "cancelled",
        });
      }
      handleClose();
    } catch (error) {
      console.error("Delete failed:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <MigrateModal
        dialogRef={migrateRef}
        dateInput={dateInput}
        setDateInput={setDateInput}
        onConfirm={handleMigrateConfirm}
        loading={loading}
      />
      <FutureModal
        dialogRef={futureRef}
        futureMonth={futureMonth}
        setFutureMonth={setFutureMonth}
        onConfirm={handleFutureConfirm}
        loading={loading}
      />
      <DeleteModal
        dialogRef={deleteRef}
        isTask={selectedEntry?.entry_type === "task"}
        isSoftDeleteAvailable={selectedEntry?.status === "open"}
        onSoftDelete={() => handleDeleteConfirm(false)}
        onHardDelete={() => handleDeleteConfirm(true)}
      />
    </>
  );
}
