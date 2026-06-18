import { toast } from "sonner";
import { entryService } from "../services/entryService";
import { entryEventBus } from "./entryEventBus";

type ArchiveUndoLabels = {
  archived: string;
  undo: string;
  restored: string;
  undoFailed: string;
  deletePermanently: string;
  deleted: string;
  deleteFailed: string;
};

async function restoreArchivedEntry(
  archivedEntry: any,
  toastId: string,
  labels: ArchiveUndoLabels,
) {
  try {
    const restored = await entryService.unarchive(archivedEntry.id);
    entryEventBus.emit("entry:create", restored);
    entryEventBus.emit("entry:update", restored);
    entryEventBus.emit("entry:reload_needed");
    if (restored.source_entry_id) {
      entryEventBus.emit("entry:update", {
        id: restored.source_entry_id,
        migrated_to_archived_at: null,
      });
    }
    toast.dismiss(toastId);
    toast.success(labels.restored);
  } catch (error) {
    console.error("Failed to undo archive", error);
    toast.error(labels.undoFailed);
  }
}

async function deleteArchivedEntryPermanently(
  archivedEntry: any,
  toastId: string,
  labels: ArchiveUndoLabels,
) {
  try {
    await entryService.delete(archivedEntry.id, true);
    entryEventBus.emit("entry:delete", archivedEntry.id);
    if (archivedEntry.source_entry_id) {
      entryEventBus.emit("entry:update", {
        id: archivedEntry.source_entry_id,
        status: "open",
        migrated_to_date: null,
        migrated_to_month: null,
        migrated_to_entry_id: null,
        migrated_to_archived_at: null,
        target_month: null,
      });
    }
    toast.dismiss(toastId);
    toast.success(labels.deleted);
  } catch (error) {
    console.error("Failed to permanently delete archived entry", error);
    toast.error(labels.deleteFailed);
  }
}

export function showArchiveUndoToast(archivedEntry: any, labels: ArchiveUndoLabels) {
  const toastId = `archive-${archivedEntry.id}`;

  const options: any = {
    id: toastId,
    duration: 7000,
  };
  options.action = {
    label: labels.undo,
    onClick: () => restoreArchivedEntry(archivedEntry, toastId, labels),
  };
  options.cancel = {
    label: labels.deletePermanently,
    onClick: () =>
      deleteArchivedEntryPermanently(archivedEntry, toastId, labels),
  };

  toast.success(labels.archived, options);
}
