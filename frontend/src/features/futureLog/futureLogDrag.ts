export const FUTURE_DROP_SOMEDAY_ID = "future-drop-someday";

export const futureMonthDropId = (monthIndex: number) =>
  `future-drop-month-${monthIndex}`;

export const futureEntryDragId = (entryId: string) => `future-entry-${entryId}`;

export function getFutureDropTargetMonth(
  overId: string | number | null | undefined,
  currentYear: number,
) {
  if (overId === FUTURE_DROP_SOMEDAY_ID) return null;
  if (typeof overId !== "string") return undefined;

  const match = overId.match(/^future-drop-month-(\d+)$/);
  if (!match) return undefined;

  const monthIndex = Number(match[1]);
  if (!Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    return undefined;
  }

  return `${currentYear}-${String(monthIndex + 1).padStart(2, "0")}`;
}

const normalizeFutureTarget = (targetMonth?: string | null) =>
  !targetMonth || targetMonth === "undetermined" ? null : targetMonth;

export function isSameFutureDropTarget(
  currentTargetMonth: string | null | undefined,
  nextTargetMonth: string | null,
) {
  return normalizeFutureTarget(currentTargetMonth) === nextTargetMonth;
}
