import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { listen } from "@tauri-apps/api/event";
import {
  uiEvents,
  type AddEntryPayload,
  type EntryActionPayload,
} from "../lib/uiEvents";
import {
  buildInitialWorkbenchState,
  openWorkbenchEntry as openWorkbenchEntryState,
  openWorkbenchTimeline as openWorkbenchTimelineState,
  returnWorkbenchTimeline as returnWorkbenchTimelineState,
  setWorkbenchCollapsed as setWorkbenchCollapsedStateValue,
  setWorkbenchWidth as setWorkbenchWidthStateValue,
  type WorkbenchState,
} from "../features/workbench/workbenchModel";

type EntryActionKind = "migrate" | "future" | "delete" | "edit";

const WORKBENCH_WIDTH_STORAGE_KEY = "rbujo.workbench.width";
const WORKBENCH_COLLAPSED_STORAGE_KEY = "rbujo.workbench.collapsed";

interface AddEntryRequest extends AddEntryPayload {
  requestId: number;
}

interface EntryActionRequest {
  kind: EntryActionKind;
  payload: EntryActionPayload;
  requestId: number;
}

interface ModalControllerValue {
  search: { open: boolean; initialQuery: string | null };
  tagSearch: { open: boolean; tag: string | null };
  workbench: WorkbenchState;
  commandPaletteOpen: boolean;
  commandPaletteRequestId: number;
  futureLogOpen: boolean;
  backupOpen: boolean;
  addEntryRequest: AddEntryRequest | null;
  entryActionRequest: EntryActionRequest | null;
  openSearch: (query?: string | null) => void;
  closeSearch: () => void;
  openTagSearch: (tag?: string | null) => void;
  closeTagSearch: () => void;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  openFutureLog: () => void;
  closeFutureLog: () => void;
  openBackup: () => void;
  closeBackup: () => void;
  openAddEntry: (payload?: AddEntryPayload) => void;
  openEntryAction: (kind: EntryActionKind, payload: EntryActionPayload) => void;
  clearEntryAction: () => void;
  openWorkbenchTimeline: () => void;
  openWorkbenchEntry: (entry: any) => void;
  returnWorkbenchTimeline: () => void;
  setWorkbenchCollapsed: (collapsed: boolean) => void;
  setWorkbenchWidth: (width: number) => void;
  openInspector: (entry: any) => void;
  closeInspector: () => void;
}

const ModalControllerContext = createContext<ModalControllerValue | null>(null);

const readInitialWorkbenchState = () => {
  if (typeof window === "undefined") return buildInitialWorkbenchState();
  const storedWidth = window.localStorage.getItem(WORKBENCH_WIDTH_STORAGE_KEY);
  return buildInitialWorkbenchState({
    collapsed:
      window.localStorage.getItem(WORKBENCH_COLLAPSED_STORAGE_KEY) === "true",
    width: storedWidth == null ? undefined : Number(storedWidth),
  });
};

export function ModalControllerProvider({ children }: { children: ReactNode }) {
  const requestSeq = useRef(0);
  const [search, setSearch] = useState({
    open: false,
    initialQuery: null as string | null,
  });
  const [tagSearch, setTagSearch] = useState({
    open: false,
    tag: null as string | null,
  });
  const [workbench, setWorkbench] = useState<WorkbenchState>(
    readInitialWorkbenchState,
  );
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandPaletteRequestId, setCommandPaletteRequestId] = useState(0);
  const [futureLogOpen, setFutureLogOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [addEntryRequest, setAddEntryRequest] =
    useState<AddEntryRequest | null>(null);
  const [entryActionRequest, setEntryActionRequest] =
    useState<EntryActionRequest | null>(null);

  const nextRequestId = useCallback(() => {
    requestSeq.current += 1;
    return requestSeq.current;
  }, []);

  const openSearch = useCallback((query: string | null = null) => {
    setSearch({ open: true, initialQuery: query });
  }, []);

  const closeSearch = useCallback(() => {
    setSearch((current) => ({ ...current, open: false }));
  }, []);

  const openTagSearch = useCallback((tag: string | null = null) => {
    setTagSearch({ open: true, tag });
  }, []);

  const closeTagSearch = useCallback(() => {
    setTagSearch((current) => ({ ...current, open: false }));
  }, []);

  const openCommandPalette = useCallback(() => {
    setCommandPaletteRequestId((current) => current + 1);
    setCommandPaletteOpen(true);
  }, []);

  const closeCommandPalette = useCallback(() => {
    setCommandPaletteOpen(false);
  }, []);

  const openFutureLog = useCallback(() => {
    setFutureLogOpen(true);
  }, []);

  const closeFutureLog = useCallback(() => {
    setFutureLogOpen(false);
  }, []);

  const openBackup = useCallback(() => {
    setBackupOpen(true);
  }, []);

  const closeBackup = useCallback(() => {
    setBackupOpen(false);
  }, []);

  const openAddEntry = useCallback(
    (payload: AddEntryPayload = {}) => {
      setAddEntryRequest({ ...payload, requestId: nextRequestId() });
    },
    [nextRequestId],
  );

  const openEntryAction = useCallback(
    (kind: EntryActionKind, payload: EntryActionPayload) => {
      setEntryActionRequest({ kind, payload, requestId: nextRequestId() });
    },
    [nextRequestId],
  );

  const clearEntryAction = useCallback(() => {
    setEntryActionRequest(null);
  }, []);

  const openWorkbenchEntry = useCallback((entry: any) => {
    if (!entry) return;
    setWorkbench((current) => openWorkbenchEntryState(current, entry));
  }, []);

  const openWorkbenchTimeline = useCallback(() => {
    setWorkbench(openWorkbenchTimelineState);
  }, []);

  const returnWorkbenchTimeline = useCallback(() => {
    setWorkbench(returnWorkbenchTimelineState);
  }, []);

  const setWorkbenchCollapsed = useCallback((collapsed: boolean) => {
    setWorkbench((current) =>
      setWorkbenchCollapsedStateValue(current, collapsed),
    );
  }, []);

  const setWorkbenchWidth = useCallback((width: number) => {
    setWorkbench((current) => setWorkbenchWidthStateValue(current, width));
  }, []);

  const openInspector = openWorkbenchEntry;
  const closeInspector = returnWorkbenchTimeline;

  useEffect(() => {
    const add = (payload: AddEntryPayload) => openAddEntry(payload || {});
    const edit = (payload: EntryActionPayload) => openEntryAction("edit", payload);
    const migrate = (payload: EntryActionPayload) =>
      openEntryAction("migrate", payload);
    const future = (payload: EntryActionPayload) =>
      openEntryAction("future", payload);
    const remove = (payload: EntryActionPayload) =>
      openEntryAction("delete", payload);
    const inspect = (payload: EntryActionPayload) =>
      openWorkbenchEntry(payload?.entry);

    uiEvents.on("OPEN_ADD_ENTRY", add);
    uiEvents.on("OPEN_EDIT_ENTRY", edit);
    uiEvents.on("OPEN_MIGRATE_ENTRY", migrate);
    uiEvents.on("OPEN_FUTURE_ENTRY", future);
    uiEvents.on("OPEN_DELETE_ENTRY", remove);
    uiEvents.on("OPEN_ENTRY_INSPECTOR", inspect);
    uiEvents.on("OPEN_SEARCH", openSearch);
    uiEvents.on("OPEN_TAG_SEARCH", openTagSearch);
    uiEvents.on("OPEN_CMD_PALETTE", openCommandPalette);
    uiEvents.on("OPEN_FUTURE_LOG", openFutureLog);
    uiEvents.on("OPEN_BACKUP", openBackup);

    return () => {
      uiEvents.off("OPEN_ADD_ENTRY", add);
      uiEvents.off("OPEN_EDIT_ENTRY", edit);
      uiEvents.off("OPEN_MIGRATE_ENTRY", migrate);
      uiEvents.off("OPEN_FUTURE_ENTRY", future);
      uiEvents.off("OPEN_DELETE_ENTRY", remove);
      uiEvents.off("OPEN_ENTRY_INSPECTOR", inspect);
      uiEvents.off("OPEN_SEARCH", openSearch);
      uiEvents.off("OPEN_TAG_SEARCH", openTagSearch);
      uiEvents.off("OPEN_CMD_PALETTE", openCommandPalette);
      uiEvents.off("OPEN_FUTURE_LOG", openFutureLog);
      uiEvents.off("OPEN_BACKUP", openBackup);
    };
  }, [
    openAddEntry,
    openBackup,
    openCommandPalette,
    openEntryAction,
    openFutureLog,
    openWorkbenchEntry,
    openSearch,
    openTagSearch,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      WORKBENCH_WIDTH_STORAGE_KEY,
      String(workbench.width),
    );
    window.localStorage.setItem(
      WORKBENCH_COLLAPSED_STORAGE_KEY,
      String(workbench.collapsed),
    );
  }, [workbench.collapsed, workbench.width]);

  useEffect(() => {
    let disposed = false;
    const unlisten: Array<() => void> = [];

    const register = async () => {
      try {
        unlisten.push(await listen("menu:new-entry", () => openAddEntry({})));
        unlisten.push(await listen("menu:search", () => openSearch(null)));
        unlisten.push(await listen("menu:future-log", openFutureLog));
        unlisten.push(await listen("menu:backup", openBackup));
      } catch (error) {
        console.warn("Native menu listener registration failed", error);
        return;
      }
      if (disposed) {
        unlisten.splice(0).forEach((dispose) => dispose());
      }
    };

    register();
    return () => {
      disposed = true;
      unlisten.forEach((dispose) => dispose());
    };
  }, [openAddEntry, openBackup, openFutureLog, openSearch]);

  const value = useMemo<ModalControllerValue>(
    () => ({
      search,
      tagSearch,
      workbench,
      commandPaletteOpen,
      commandPaletteRequestId,
      futureLogOpen,
      backupOpen,
      addEntryRequest,
      entryActionRequest,
      openSearch,
      closeSearch,
      openTagSearch,
      closeTagSearch,
      openCommandPalette,
      closeCommandPalette,
      openFutureLog,
      closeFutureLog,
      openBackup,
      closeBackup,
      openAddEntry,
      openEntryAction,
      clearEntryAction,
      openWorkbenchTimeline,
      openWorkbenchEntry,
      returnWorkbenchTimeline,
      setWorkbenchCollapsed,
      setWorkbenchWidth,
      openInspector,
      closeInspector,
    }),
    [
      addEntryRequest,
      backupOpen,
      clearEntryAction,
      closeBackup,
      closeCommandPalette,
      closeFutureLog,
      closeSearch,
      closeTagSearch,
      commandPaletteRequestId,
      entryActionRequest,
      commandPaletteOpen,
      futureLogOpen,
      workbench,
      openAddEntry,
      openBackup,
      openCommandPalette,
      openEntryAction,
      openFutureLog,
      openWorkbenchEntry,
      openWorkbenchTimeline,
      openInspector,
      openSearch,
      openTagSearch,
      returnWorkbenchTimeline,
      search,
      setWorkbenchCollapsed,
      setWorkbenchWidth,
      tagSearch,
    ],
  );

  return (
    <ModalControllerContext.Provider value={value}>
      {children}
    </ModalControllerContext.Provider>
  );
}

export function useModalController() {
  const context = useContext(ModalControllerContext);
  if (!context) {
    throw new Error("useModalController must be used inside ModalControllerProvider");
  }
  return context;
}
