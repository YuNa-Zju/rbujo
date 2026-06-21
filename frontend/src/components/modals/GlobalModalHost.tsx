import { useCallback, useEffect, useRef, useState } from "react";
import { entryService } from "../../services/entryService";
import { entryEventBus, type MigratePayload } from "../../lib/entryEventBus";
import { useModalController } from "../../context/ModalControllerContext";

import AddEntryModal, { type AddEntryModalRef } from "./AddEntryModal";
import SearchModal from "./SearchModal";
import TagSearchModal from "./TagSearchModal";
import FutureLogModal from "./FutureLogModal";
import BackupModal from "./BackupModal";
import MigrateModal from "./MigrateModal";
import FutureModal from "./FutureModal";
import DeleteModal from "./DeleteModal";
import UpdateCheckController from "./UpdateCheckController";
import VersionInfoController from "./VersionInfoController";
import AttachmentMaintenanceController from "./AttachmentMaintenanceController";
import SettingsModalController from "./SettingsModalController";
import BjkImportPromptController from "./BjkImportPromptController";

export default function GlobalModalHost() {
  const {
    search,
    closeSearch,
    tagSearch,
    closeTagSearch,
    futureLogOpen,
    closeFutureLog,
    backupOpen,
    closeBackup,
    addEntryRequest,
    entryActionRequest,
    clearEntryAction,
  } = useModalController();

  const addEntryRef = useRef<AddEntryModalRef>(null);
  const migrateRef = useRef<HTMLDialogElement>(null);
  const futureRef = useRef<HTMLDialogElement>(null);
  const deleteRef = useRef<HTMLDialogElement>(null);

  const [selectedEntry, setSelectedEntry] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [dateInput, setDateInput] = useState("");
  const [futureMonth, setFutureMonth] = useState("");

  useEffect(() => {
    if (addEntryRequest) {
      addEntryRef.current?.showModal(addEntryRequest);
    }
  }, [addEntryRequest]);

  useEffect(() => {
    if (entryActionRequest?.kind === "edit") {
      addEntryRef.current?.showModal({ entry: entryActionRequest.payload.entry });
    }
  }, [entryActionRequest]);

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
    }
  }, [entryActionRequest]);

  const handleCloseEntryAction = useCallback(() => {
    migrateRef.current?.close();
    futureRef.current?.close();
    deleteRef.current?.close();
    setTimeout(() => setSelectedEntry(null), 300);
    clearEntryAction();
  }, [clearEntryAction]);

  const handleMigrateConfirm = async () => {
    if (!selectedEntry || !dateInput) return;
    setLoading(true);

    try {
      if (selectedEntry.is_future) {
        entryEventBus.emit("entry:delete", selectedEntry.id);
        const response = await entryService.rescheduleFutureEntry(
          selectedEntry.id,
          dateInput,
        );

        if (selectedEntry.source_entry_id) {
          entryEventBus.emit("entry:update", {
            id: selectedEntry.source_entry_id,
            status: "migrated_forward",
            migrated_to_date: dateInput,
            target_month: null,
          });
        }

        const payload: MigratePayload = {
          source: { ...selectedEntry, status: "migrated_forward" },
          target: { ...response, is_future: false, status: "open" },
          date: dateInput,
        };
        entryEventBus.emit("entry:migrate", payload);
      } else {
        const result = await entryService.migrate(selectedEntry.id, dateInput);
        entryEventBus.emit("entry:migrate", {
          source: result.updated_source,
          target: result.new_entry,
          date: dateInput,
        });
      }
      handleCloseEntryAction();
    } catch (error) {
      console.error("Migrate failed:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleFutureConfirm = async () => {
    if (!selectedEntry) return;
    setLoading(true);
    const targetMonth = futureMonth || null;

    try {
      if (selectedEntry.is_future) {
        const response = await entryService.moveFutureEntry(
          selectedEntry.id,
          targetMonth,
        );

        if (selectedEntry.source_entry_id) {
          entryEventBus.emit("entry:update", {
            id: selectedEntry.source_entry_id,
            target_month: targetMonth,
          });
        }
        entryEventBus.emit("entry:update", response);
      } else {
        const response = await entryService.moveToFutureWithSource(
          selectedEntry.id,
          targetMonth,
        );
        const stubEntry = response.updated_source;
        const futureEntry = {
          ...response.new_entry,
          is_future: true,
          target_month: targetMonth,
        };

        entryEventBus.emit("entry:status_change", stubEntry);
        entryEventBus.emit("entry:migrate", {
          source: stubEntry,
          target: futureEntry,
          date: targetMonth || "Someday",
        });
        entryEventBus.emit("entry:create", futureEntry);
      }
      handleCloseEntryAction();
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
      handleCloseEntryAction();
    } catch (error) {
      console.error("Delete failed:", error);
    } finally {
      setLoading(false);
    }
  };

  const migrateModalOpen = entryActionRequest?.kind === "migrate";
  const futureModalOpen = entryActionRequest?.kind === "future";
  const deleteModalOpen = entryActionRequest?.kind === "delete";

  return (
    <>
      <AddEntryModal ref={addEntryRef} />

      {search.open && (
        <SearchModal
          isOpen={search.open}
          initialQuery={search.initialQuery}
          onClose={closeSearch}
        />
      )}

      {futureLogOpen && <FutureLogModal onClose={closeFutureLog} />}

      {tagSearch.open && (
        <TagSearchModal tag={tagSearch.tag} onClose={closeTagSearch} />
      )}

      <BackupModal open={backupOpen} onClose={closeBackup} />
      <MigrateModal
        dialogRef={migrateRef}
        isOpen={migrateModalOpen}
        onClose={handleCloseEntryAction}
        dateInput={dateInput}
        setDateInput={setDateInput}
        onConfirm={handleMigrateConfirm}
        loading={loading}
      />
      <FutureModal
        dialogRef={futureRef}
        isOpen={futureModalOpen}
        onClose={handleCloseEntryAction}
        futureMonth={futureMonth}
        setFutureMonth={setFutureMonth}
        onConfirm={handleFutureConfirm}
        loading={loading}
      />
      <DeleteModal
        dialogRef={deleteRef}
        isOpen={deleteModalOpen}
        onClose={handleCloseEntryAction}
        isTask={selectedEntry?.entry_type === "task"}
        isSoftDeleteAvailable={selectedEntry?.status === "open"}
        onSoftDelete={() => handleDeleteConfirm(false)}
        onHardDelete={() => handleDeleteConfirm(true)}
      />
      <UpdateCheckController />
      <VersionInfoController />
      <AttachmentMaintenanceController />
      <SettingsModalController />
      <BjkImportPromptController />
    </>
  );
}
