import { useEffect, useRef } from "react";
import { useModalController } from "../../context/ModalControllerContext";

// 1. 核心业务弹窗
import AddEntryModal, { type AddEntryModalRef } from "./AddEntryModal";
import SearchModal from "./SearchModal";
import TagSearchModal from "./TagSearchModal";

// 2. 视图类弹窗
import FutureLogModal from "./FutureLogModal";

// 3. 设置/系统类弹窗
import BackupModal from "./BackupModal";

export function LegacyGlobalUIModals() {
  const {
    search,
    closeSearch,
    tagSearch,
    closeTagSearch,
    futureLogOpen,
    closeFutureLog,
    backupOpen,
    closeBackup,
    addEntryRequest,
    entryActionRequest,
  } = useModalController();

  // --- Ref 管理 ---
  const addEntryRef = useRef<AddEntryModalRef>(null);

  useEffect(() => {
    if (addEntryRequest) {
      addEntryRef.current?.showModal(addEntryRequest);
    }
  }, [addEntryRequest]);

  useEffect(() => {
    if (entryActionRequest?.kind === "edit") {
      addEntryRef.current?.showModal({ entry: entryActionRequest.payload.entry });
    }
  }, [entryActionRequest]);

  return (
    <>
      {/* 复用同一个组件处理 新建 和 编辑 */}
      <AddEntryModal ref={addEntryRef} />

      {search.open && (
        <SearchModal
          isOpen={search.open}
          initialQuery={search.initialQuery}
          onClose={closeSearch}
        />
      )}

      {futureLogOpen && <FutureLogModal onClose={closeFutureLog} />}

      {tagSearch.open && (
        <TagSearchModal
          tag={tagSearch.tag}
          onClose={closeTagSearch}
        />
      )}
      <BackupModal open={backupOpen} onClose={closeBackup} />
    </>
  );
}
