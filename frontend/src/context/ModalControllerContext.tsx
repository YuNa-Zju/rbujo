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

type EntryActionKind = "migrate" | "future" | "delete" | "edit";

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
  futureLogOpen: boolean;
  backupOpen: boolean;
  addEntryRequest: AddEntryRequest | null;
  entryActionRequest: EntryActionRequest | null;
  timelineRequestId: number;
  calendarSyncRequestId: number;
  openSearch: (query?: string | null) => void;
  closeSearch: () => void;
  openTagSearch: (tag?: string | null) => void;
  closeTagSearch: () => void;
  openFutureLog: () => void;
  closeFutureLog: () => void;
  openBackup: () => void;
  closeBackup: () => void;
  openAddEntry: (payload?: AddEntryPayload) => void;
  openEntryAction: (kind: EntryActionKind, payload: EntryActionPayload) => void;
  clearEntryAction: () => void;
  openTimeline: () => void;
  openCalendarSync: () => void;
}

const ModalControllerContext = createContext<ModalControllerValue | null>(null);

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
  const [futureLogOpen, setFutureLogOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [addEntryRequest, setAddEntryRequest] =
    useState<AddEntryRequest | null>(null);
  const [entryActionRequest, setEntryActionRequest] =
    useState<EntryActionRequest | null>(null);
  const [timelineRequestId, setTimelineRequestId] = useState(0);
  const [calendarSyncRequestId, setCalendarSyncRequestId] = useState(0);

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

  const openTimeline = useCallback(() => {
    setTimelineRequestId((current) => current + 1);
  }, []);

  const openCalendarSync = useCallback(() => {
    setCalendarSyncRequestId((current) => current + 1);
  }, []);

  useEffect(() => {
    const add = (payload: AddEntryPayload) => openAddEntry(payload || {});
    const edit = (payload: EntryActionPayload) => openEntryAction("edit", payload);
    const migrate = (payload: EntryActionPayload) =>
      openEntryAction("migrate", payload);
    const future = (payload: EntryActionPayload) =>
      openEntryAction("future", payload);
    const remove = (payload: EntryActionPayload) =>
      openEntryAction("delete", payload);

    uiEvents.on("OPEN_ADD_ENTRY", add);
    uiEvents.on("OPEN_EDIT_ENTRY", edit);
    uiEvents.on("OPEN_MIGRATE_ENTRY", migrate);
    uiEvents.on("OPEN_FUTURE_ENTRY", future);
    uiEvents.on("OPEN_DELETE_ENTRY", remove);
    uiEvents.on("OPEN_SEARCH", openSearch);
    uiEvents.on("OPEN_TAG_SEARCH", openTagSearch);
    uiEvents.on("OPEN_FUTURE_LOG", openFutureLog);
    uiEvents.on("OPEN_TIMELINE", openTimeline);
    uiEvents.on("OPEN_CALENDAR_SYNC", openCalendarSync);
    uiEvents.on("OPEN_BACKUP", openBackup);

    return () => {
      uiEvents.off("OPEN_ADD_ENTRY", add);
      uiEvents.off("OPEN_EDIT_ENTRY", edit);
      uiEvents.off("OPEN_MIGRATE_ENTRY", migrate);
      uiEvents.off("OPEN_FUTURE_ENTRY", future);
      uiEvents.off("OPEN_DELETE_ENTRY", remove);
      uiEvents.off("OPEN_SEARCH", openSearch);
      uiEvents.off("OPEN_TAG_SEARCH", openTagSearch);
      uiEvents.off("OPEN_FUTURE_LOG", openFutureLog);
      uiEvents.off("OPEN_TIMELINE", openTimeline);
      uiEvents.off("OPEN_CALENDAR_SYNC", openCalendarSync);
      uiEvents.off("OPEN_BACKUP", openBackup);
    };
  }, [
    openAddEntry,
    openBackup,
    openCalendarSync,
    openEntryAction,
    openFutureLog,
    openSearch,
    openTagSearch,
    openTimeline,
  ]);

  useEffect(() => {
    let disposed = false;
    const unlisten: Array<() => void> = [];

    const register = async () => {
      try {
        unlisten.push(await listen("menu:new-entry", () => openAddEntry({})));
        unlisten.push(await listen("menu:search", () => openSearch(null)));
        unlisten.push(await listen("menu:future-log", openFutureLog));
        unlisten.push(await listen("menu:backup", openBackup));
      } catch {
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
      futureLogOpen,
      backupOpen,
      addEntryRequest,
      entryActionRequest,
      timelineRequestId,
      calendarSyncRequestId,
      openSearch,
      closeSearch,
      openTagSearch,
      closeTagSearch,
      openFutureLog,
      closeFutureLog,
      openBackup,
      closeBackup,
      openAddEntry,
      openEntryAction,
      clearEntryAction,
      openTimeline,
      openCalendarSync,
    }),
    [
      addEntryRequest,
      backupOpen,
      calendarSyncRequestId,
      clearEntryAction,
      closeBackup,
      closeFutureLog,
      closeSearch,
      closeTagSearch,
      entryActionRequest,
      futureLogOpen,
      openAddEntry,
      openBackup,
      openCalendarSync,
      openEntryAction,
      openFutureLog,
      openSearch,
      openTagSearch,
      openTimeline,
      search,
      tagSearch,
      timelineRequestId,
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
