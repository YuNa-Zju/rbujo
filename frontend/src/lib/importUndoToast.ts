import { toast } from "sonner";

import { dataBackupService } from "../services/dataBackupService";
import { entryEventBus } from "./entryEventBus";

export const IMPORT_UNDO_STORAGE_KEY = "bujo_last_import_ids";

type ImportUndoLabels = {
  importedCount: string;
  undo: string;
  undoSuccess: string;
  undoFailed: string;
};

type ImportSuccessToastOptions = {
  importedCount: number;
  insertedIds: string[];
  labels: ImportUndoLabels;
  onUndoComplete?: () => void;
};

const formatCount = (template: string, count: number) =>
  template.replace("{{count}}", String(count));

const normalizeIds = (ids: unknown): string[] =>
  Array.isArray(ids)
    ? ids.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];

const notifyImportChanged = () => {
  entryEventBus.emit("entry:reload_needed");
};

export const readStoredImportUndoIds = () => {
  try {
    return normalizeIds(
      JSON.parse(localStorage.getItem(IMPORT_UNDO_STORAGE_KEY) || "[]"),
    );
  } catch {
    localStorage.removeItem(IMPORT_UNDO_STORAGE_KEY);
    return [];
  }
};

export const recordImportUndoIds = (ids: string[]) => {
  const normalizedIds = normalizeIds(ids);
  if (normalizedIds.length > 0) {
    localStorage.setItem(IMPORT_UNDO_STORAGE_KEY, JSON.stringify(normalizedIds));
  } else {
    localStorage.removeItem(IMPORT_UNDO_STORAGE_KEY);
  }
  notifyImportChanged();
  return normalizedIds;
};

export const clearImportUndoIds = () => {
  localStorage.removeItem(IMPORT_UNDO_STORAGE_KEY);
};

export const undoStoredImport = async (
  ids: string[],
  labels: Pick<ImportUndoLabels, "undoSuccess" | "undoFailed">,
  onUndoComplete?: () => void,
) => {
  const normalizedIds = normalizeIds(ids);
  if (normalizedIds.length === 0) return;

  try {
    await dataBackupService.undoImport(normalizedIds);
    clearImportUndoIds();
    normalizedIds.forEach((id) => entryEventBus.emit("entry:delete", id));
    notifyImportChanged();
    onUndoComplete?.();
    toast.success(labels.undoSuccess, { id: "backup-import-undo-success" });
  } catch (error) {
    console.error("Failed to undo import", error);
    toast.error(labels.undoFailed, { id: "backup-import-undo-error" });
    throw error;
  }
};

export const showImportSuccessToast = ({
  importedCount,
  insertedIds,
  labels,
  onUndoComplete,
}: ImportSuccessToastOptions) => {
  const normalizedIds = normalizeIds(insertedIds);
  const options: any = {
    id: "backup-import-success",
    duration: normalizedIds.length > 0 ? 10000 : 5000,
  };

  if (normalizedIds.length > 0) {
    options.action = {
      label: labels.undo,
      onClick: () => {
        void undoStoredImport(normalizedIds, labels, onUndoComplete).catch(() => {});
      },
    };
  }

  toast.success(formatCount(labels.importedCount, importedCount), options);
};
