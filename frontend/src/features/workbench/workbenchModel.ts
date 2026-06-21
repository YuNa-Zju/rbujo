export type WorkbenchMode = "timeline" | "detail";

export const WORKBENCH_MIN_WIDTH = 300;
export const WORKBENCH_DEFAULT_WIDTH = 380;
export const WORKBENCH_MAX_WIDTH = 560;

export interface WorkbenchPreferences {
  collapsed?: boolean;
  width?: number;
}

export interface WorkbenchState {
  mode: WorkbenchMode;
  entry: any | null;
  collapsed: boolean;
  width: number;
}

export function clampWorkbenchWidth(width: unknown): number {
  const numericWidth = typeof width === "number" ? width : Number(width);
  if (!Number.isFinite(numericWidth)) return WORKBENCH_DEFAULT_WIDTH;
  return Math.min(
    WORKBENCH_MAX_WIDTH,
    Math.max(WORKBENCH_MIN_WIDTH, Math.round(numericWidth)),
  );
}

export function buildInitialWorkbenchState(
  preferences: WorkbenchPreferences = {},
): WorkbenchState {
  return {
    mode: "timeline",
    entry: null,
    collapsed: Boolean(preferences.collapsed),
    width: clampWorkbenchWidth(preferences.width ?? WORKBENCH_DEFAULT_WIDTH),
  };
}

export function openWorkbenchTimeline(state: WorkbenchState): WorkbenchState {
  return {
    ...state,
    mode: "timeline",
    entry: null,
    collapsed: false,
  };
}

export function openWorkbenchEntry(
  state: WorkbenchState,
  entry: any | null,
): WorkbenchState {
  if (!entry) return state;
  return {
    ...state,
    mode: "detail",
    entry,
    collapsed: false,
  };
}

export function returnWorkbenchTimeline(state: WorkbenchState): WorkbenchState {
  return {
    ...state,
    mode: "timeline",
    entry: null,
  };
}

export function setWorkbenchCollapsed(
  state: WorkbenchState,
  collapsed: boolean,
): WorkbenchState {
  return {
    ...state,
    collapsed,
  };
}

export function setWorkbenchWidth(
  state: WorkbenchState,
  width: unknown,
): WorkbenchState {
  return {
    ...state,
    width: clampWorkbenchWidth(width),
  };
}
