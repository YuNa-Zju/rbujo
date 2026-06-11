type EntryStatusInput = {
  entry_type: string;
  status: string;
  archived_at?: string | null;
};

const REOPENABLE_STATUSES = new Set([
  "forward",
  "future",
  "migrated_forward",
  "migrated_future",
]);

export function canToggleEntryStatus(entry: EntryStatusInput) {
  if (entry.archived_at) {
    return false;
  }

  return entry.entry_type === "task" || REOPENABLE_STATUSES.has(entry.status);
}
