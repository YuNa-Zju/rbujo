type FutureEntryLike = {
  target_month?: string | null;
  status?: string | null;
};

export type FutureLogCategory<T> = {
  planning: T[];
  completed: T[];
  expired: T[];
};

const completedStatuses = new Set([
  "completed",
  "cancelled",
  "forward",
  "migrated_forward",
  "migrated_future",
]);

export function isCompletedFutureStatus(status?: string | null) {
  return completedStatuses.has(status || "");
}

export function getFutureTargetYear(entry: FutureEntryLike) {
  const targetMonth = entry.target_month;
  if (!targetMonth || !/^\d{4}-\d{2}$/.test(targetMonth)) {
    return null;
  }
  return Number(targetMonth.slice(0, 4));
}

export function isExpiredFutureEntry(
  entry: FutureEntryLike,
  currentYear: number,
) {
  const targetYear = getFutureTargetYear(entry);
  return targetYear !== null && targetYear !== currentYear;
}

export function categorizeFutureEntries<T extends FutureEntryLike>(
  entries: T[],
  currentYear: number,
): FutureLogCategory<T> {
  return entries.reduce<FutureLogCategory<T>>(
    (result, entry) => {
      if (isExpiredFutureEntry(entry, currentYear)) {
        result.expired.push(entry);
      } else if (isCompletedFutureStatus(entry.status)) {
        result.completed.push(entry);
      } else {
        result.planning.push(entry);
      }
      return result;
    },
    { planning: [], completed: [], expired: [] },
  );
}
