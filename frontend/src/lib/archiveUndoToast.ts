import { toast } from "sonner";
import { entryService } from "../services/entryService";
import { entryEventBus } from "./entryEventBus";

type ArchiveUndoLabels = {
  archived: string;
  undo: string;
  restored: string;
  undoFailed: string;
};

export function showArchiveUndoToast(archivedEntry: any, labels: ArchiveUndoLabels) {
  toast(labels.archived, {
    id: `archive-${archivedEntry.id}`,
    duration: 7000,
    action: {
      label: labels.undo,
      onClick: async () => {
        try {
          const restored = await entryService.unarchive(archivedEntry.id);
          entryEventBus.emit("entry:update", restored);
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
  });
}
