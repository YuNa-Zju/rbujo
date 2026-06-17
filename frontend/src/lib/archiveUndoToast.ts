import { createElement } from "react";
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

  toast.custom(
    () =>
      createElement(
        "div",
        {
          className:
            "flex w-[min(calc(100vw-2rem),42rem)] items-center gap-4 rounded-full border border-base-content/10 bg-base-100/95 px-5 py-3 text-base-content shadow-2xl backdrop-blur-xl",
          role: "status",
        },
        createElement(
          "span",
          {
            className: "min-w-0 flex-1 truncate text-sm font-medium tracking-tight",
          },
          labels.archived,
        ),
        createElement(
          "div",
          {
            className: "ml-auto flex shrink-0 items-center gap-2",
          },
          createElement(
            "button",
            {
              type: "button",
              className:
                "rounded-full border border-error/30 bg-error/15 px-4 py-1.5 text-xs font-semibold text-error transition-colors hover:bg-error hover:text-error-content",
              onClick: () =>
                deleteArchivedEntryPermanently(archivedEntry, toastId, labels),
            },
            labels.deletePermanently,
          ),
          createElement(
            "button",
            {
              type: "button",
              className:
                "rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-content shadow-sm shadow-primary/20 transition-colors hover:bg-primary/90",
              onClick: () => restoreArchivedEntry(archivedEntry, toastId, labels),
            },
            labels.undo,
          ),
        ),
      ),
    {
      id: toastId,
      duration: 7000,
    },
  );
}
