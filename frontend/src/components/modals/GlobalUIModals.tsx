import { useState, useEffect, useRef } from "react";
import {
  uiEvents,
  type AddEntryPayload,
  type EntryActionPayload, // ✅ 引入这个类型
} from "../../lib/uiEvents";

// 1. 核心业务弹窗
import AddEntryModal, { type AddEntryModalRef } from "./AddEntryModal";
import SearchModal from "./SearchModal";
import TagSearchModal from "./TagSearchModal";

// 2. 视图类弹窗
import FutureLogModal from "./FutureLogModal";
import TimelineModal, { type TimelineModalRef } from "./TimelineModal";

// 3. 设置/系统类弹窗
import CalendarSyncModal, {
  type CalendarSyncModalRef,
} from "./CalendarSyncModal";
import BackupModal from "./BackupModal";

export default function GlobalUIModals() {
  // --- 状态管理 ---
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [tagSearchState, setTagSearchState] = useState<{
    open: boolean;
    tag: string | null;
  }>({ open: false, tag: null });
  const [isFutureLogOpen, setIsFutureLogOpen] = useState(false);

  // --- Ref 管理 ---
  const addEntryRef = useRef<AddEntryModalRef>(null);
  const timelineRef = useRef<TimelineModalRef>(null);
  const syncRef = useRef<CalendarSyncModalRef>(null);

  // --- 监听 UI 总线 ---
  useEffect(() => {
    // 1. 打开新建
    const openAddEntry = (payload: AddEntryPayload) =>
      addEntryRef.current?.showModal(payload);

    // ✅ 2. 打开编辑 (关键逻辑)
    // 收到 payload.entry 后，直接传给 AddEntryModal
    // 组件内部会自动识别 entry 存在，从而切换 UI 为 "编辑模式" 并回显数据
    const openEditEntry = (payload: EntryActionPayload) => {
      addEntryRef.current?.showModal({ entry: payload.entry });
    };

    const openSearch = () => setIsSearchOpen(true);
    const openTagSearch = (tag: string | null) =>
      setTagSearchState({ open: true, tag });
    const openFutureLog = () => setIsFutureLogOpen(true);

    const openTimeline = () => timelineRef.current?.open();
    const openCalendarSync = () => syncRef.current?.open();

    // 注册监听
    uiEvents.on("OPEN_ADD_ENTRY", openAddEntry);
    uiEvents.on("OPEN_EDIT_ENTRY", openEditEntry); // ✅ 注册编辑监听
    uiEvents.on("OPEN_SEARCH", openSearch);
    uiEvents.on("OPEN_TAG_SEARCH", openTagSearch);
    uiEvents.on("OPEN_FUTURE_LOG", openFutureLog);
    uiEvents.on("OPEN_TIMELINE", openTimeline);
    uiEvents.on("OPEN_CALENDAR_SYNC", openCalendarSync);

    return () => {
      uiEvents.off("OPEN_ADD_ENTRY", openAddEntry);
      uiEvents.off("OPEN_EDIT_ENTRY", openEditEntry); // ✅ 移除编辑监听
      uiEvents.off("OPEN_SEARCH", openSearch);
      uiEvents.off("OPEN_TAG_SEARCH", openTagSearch);
      uiEvents.off("OPEN_FUTURE_LOG", openFutureLog);
      uiEvents.off("OPEN_TIMELINE", openTimeline);
      uiEvents.off("OPEN_CALENDAR_SYNC", openCalendarSync);
    };
  }, []);

  return (
    <>
      {/* 复用同一个组件处理 新建 和 编辑 */}
      <AddEntryModal ref={addEntryRef} />

      {isSearchOpen && (
        <SearchModal
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
        />
      )}

      {isFutureLogOpen && (
        <FutureLogModal onClose={() => setIsFutureLogOpen(false)} />
      )}

      <TimelineModal ref={timelineRef} />

      {tagSearchState.open && (
        <TagSearchModal
          tag={tagSearchState.tag}
          onClose={() =>
            setTagSearchState((prev) => ({ ...prev, open: false }))
          }
        />
      )}

      <CalendarSyncModal ref={syncRef} />
      <BackupModal />
    </>
  );
}
