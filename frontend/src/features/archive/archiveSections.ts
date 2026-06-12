import { isExpiredFutureEntry } from "../futureLog/futureLogClassification.ts";

export type ArchiveEntry = {
  id: string;
  target_date?: string | null;
  target_month?: string | null;
  archived_at?: string | null;
  is_future?: boolean;
  readOnlyArchiveReason?: "expired_future";
  canRestore?: boolean;
};

export type ArchiveMonthSection<T extends ArchiveEntry = ArchiveEntry> = {
  month: string;
  entries: T[];
};

export type ArchiveSections<T extends ArchiveEntry = ArchiveEntry> = {
  expiredFuture: T[];
  months: Array<ArchiveMonthSection<T>>;
};

export function getArchiveMonthKey(entry: Partial<ArchiveEntry>) {
  if (entry.target_date && /^\d{4}-\d{2}-\d{2}$/.test(entry.target_date)) {
    return entry.target_date.slice(0, 7);
  }
  if (entry.target_month && /^\d{4}-\d{2}$/.test(entry.target_month)) {
    return entry.target_month;
  }
  if (entry.archived_at && /^\d{4}-\d{2}/.test(entry.archived_at)) {
    return entry.archived_at.slice(0, 7);
  }
  return "未归类";
}

export function buildArchiveSections<T extends ArchiveEntry>(
  entries: T[],
  currentYear: number,
): ArchiveSections<T> {
  const expiredFuture: T[] = [];
  const grouped = new Map<string, T[]>();

  entries.forEach((entry) => {
    const isExpired = Boolean(entry.is_future) &&
      isExpiredFutureEntry(entry, currentYear);
    if (isExpired) {
      expiredFuture.push({
        ...entry,
        readOnlyArchiveReason: "expired_future",
        canRestore: false,
      });
      return;
    }

    if (!entry.archived_at) {
      return;
    }

    const key = getArchiveMonthKey(entry);
    grouped.set(key, [
      ...(grouped.get(key) || []),
      { ...entry, canRestore: true },
    ]);
  });

  const months = Array.from(grouped.entries())
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([month, sectionEntries]) => ({
      month,
      entries: sectionEntries,
    }));

  return { expiredFuture, months };
}
