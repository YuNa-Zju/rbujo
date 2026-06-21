import { addMonths, format } from "date-fns";

export const FUTURE_TARGET_UNDETERMINED = "undetermined";
export const FUTURE_TARGET_CUSTOM = "custom";

export type FutureTargetValue =
  | typeof FUTURE_TARGET_UNDETERMINED
  | typeof FUTURE_TARGET_CUSTOM
  | string;

export interface FutureTargetOption {
  value: FutureTargetValue;
  label: string;
}

export function buildFutureTargetOptions(now = new Date()): FutureTargetOption[] {
  const thisMonth = format(now, "yyyy-MM");
  const nextMonth = format(addMonths(now, 1), "yyyy-MM");
  return [
    { value: FUTURE_TARGET_UNDETERMINED, label: "待定" },
    { value: thisMonth, label: `本月 ${thisMonth}` },
    { value: nextMonth, label: `下月 ${nextMonth}` },
    { value: FUTURE_TARGET_CUSTOM, label: "指定月份" },
  ];
}

export function resolveFutureTargetMonth(
  targetValue: FutureTargetValue,
  customMonth: string,
): string | null {
  if (targetValue === FUTURE_TARGET_UNDETERMINED) return null;
  if (targetValue === FUTURE_TARGET_CUSTOM) return customMonth || null;
  return targetValue || null;
}
