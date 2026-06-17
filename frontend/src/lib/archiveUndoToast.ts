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

export function showArchiveUndoToast(archivedEntry: any, labels: ArchiveUndoLabels) {
  const toastId = `archive-${archivedEntry.id}`;
  toast(labels.archived, {
    id: toastId,
    duration: 7000,
    action: {
      label: labels.undo,
      onClick: async () => {
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
          toast.success(labels.restored);
        } catch (error) {
          console.error("Failed to undo archive", error);
          toast.error(labels.undoFailed);
        }
      },
    },
    cancel: {
      label: labels.deletePermanently,
      onClick: async () => {
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
      },
    },
  });
}
