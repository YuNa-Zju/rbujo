import { useEffect, useState, useCallback, useRef } from "react";
import { X, Hash, Calendar, ArrowRight, Loader2, SearchX } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "../../hooks/useTranslation";
import { useEntryNavigation } from "../../hooks/useEntryNavigation";
import { EntryCard } from "../DraggableEntryCard";
import { useTagCache } from "../../context/TagCacheContext";
import { ReadOnlyContext } from "../../context/ReadOnlyContext";
import { useAppTheme } from "../../hooks/useAppTheme"; // ✅ 1. 引入 AppTheme
import { EscModalWrapper } from "../common/EscModalWrapper"; // ✅ 2. 引入 EscWrapper

interface TagSearchModalProps {
  tag: string | null;
  onClose: () => void;
}

// --- 动画变体配置 ---
const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.3 } },
  exit: { opacity: 0, transition: { duration: 0.2 } },
};

const modalVariants = {
  hidden: { y: "100%", opacity: 0, scale: 0.95 },
  visible: {
    y: 0,
    opacity: 1,
    scale: 1,
    transition: { type: "spring" as const, damping: 25, stiffness: 300 },
  },
  exit: {
    y: "100%",
    opacity: 0,
    scale: 0.95,
    transition: { duration: 0.2, ease: "easeInOut" as const },
  },
};

const listContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1,
    },
  },
};

const listItemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { type: "spring" as const, stiffness: 300, damping: 24 },
  },
};

const TagSearchModal = ({ tag: activeTag, onClose }: TagSearchModalProps) => {
  const { t } = useTranslation();
  const { handleJump } = useEntryNavigation();

  // ✅ 3. 获取主题样式
  const { styles, isDark, colors } = useAppTheme();

  const { cache, prefetch, getCachedResults } = useTagCache();

  // isActive 控制 AnimatePresence 的挂载/卸载
  const [isActive, setIsActive] = useState(false);
  const pendingJumpRef = useRef<{ date: string | null } | null>(null);

  const results = activeTag ? cache[activeTag] || [] : [];
  const loading = activeTag ? !cache[activeTag] : false;

  useEffect(() => {
    if (activeTag) {
      setIsActive(true);
      if (!getCachedResults(activeTag)) {
        prefetch(activeTag);
      }
    } else {
      setIsActive(false);
    }
  }, [activeTag, prefetch, getCachedResults]);

  const handleClose = useCallback(() => {
    setIsActive(false);
    setTimeout(() => {
      onClose();
      if (pendingJumpRef.current) {
        handleJump(pendingJumpRef.current.date);
        pendingJumpRef.current = null;
      }
    }, 300);
  }, [onClose, handleJump]);

  const handleJumpToDate = (dateStr: string | null) => {
    pendingJumpRef.current = { date: dateStr || null };
    handleClose();
  };

  // ✅ 4. 移除手动的 keydown 和 entryEventBus 监听
  // 因为 EscModalWrapper 会自动处理 ESC 和 CLOSE_MODALS 事件

  if (!activeTag) return null;

  return (
    // ✅ 5. 接入 EscModalWrapper
    <EscModalWrapper
      id="TagSearchModal"
      isOpen={!!activeTag}
      onClose={handleClose}
    >
      <div className="fixed inset-0 z-[5050] flex flex-col justify-end sm:justify-center items-center isolation-isolate pointer-events-none">
        <AnimatePresence>
          {isActive && (
            <>
              {/* 1. Backdrop */}
              <motion.div
                variants={backdropVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className={`absolute inset-0 pointer-events-auto ${styles.backdrop}`}
                onClick={handleClose}
              />

              {/* 2. Content Box */}
              <motion.div
                variants={modalVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className={`
                  pointer-events-auto
                  relative w-full sm:max-w-2xl flex flex-col
                  rounded-t-[2rem] sm:rounded-2xl
                  h-[90dvh] sm:h-[80vh]
                  overflow-hidden
                  ${styles.modal.base} border
                `}
                style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
              >
                {/* Header */}
                <div className={styles.modal.header}>
                  <div className="flex justify-between items-center">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-3">
                        <motion.div
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ delay: 0.1 }}
                          className={`w-10 h-10 rounded-full flex items-center justify-center border shadow-sm ${styles.modal.iconBox}`}
                        >
                          <Hash size={20} strokeWidth={2.5} />
                        </motion.div>
                        <h3
                          className={`font-serif font-bold text-2xl tracking-tight flex items-center gap-2 ${styles.modal.title}`}
                        >
                          {activeTag}
                        </h3>
                      </div>
                      <p
                        className={`text-xs font-medium pl-14 ${styles.modal.subtitle}`}
                      >
                        {loading
                          ? t.tag?.searching
                          : `${results.length} ${t.tag?.results}`}
                      </p>
                    </div>
                    <button
                      onClick={handleClose}
                      className={styles.modal.closeBtn}
                    >
                      <X size={22} />
                    </button>
                  </div>
                </div>

                {/* List Body */}
                <div className="flex-1 overflow-y-auto p-4 pb-20 custom-scrollbar">
                  {loading ? (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex flex-col items-center justify-center h-64 gap-4 opacity-60"
                    >
                      <Loader2
                        size={32}
                        className={`animate-spin ${styles.feedback.loadingSpinner}`}
                      />
                      <span
                        className={`text-sm font-medium tracking-wide ${styles.feedback.loadingText}`}
                      >
                        {t.tag?.scanning}
                      </span>
                    </motion.div>
                  ) : results.length === 0 ? (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="flex flex-col items-center justify-center h-64 gap-4 opacity-60 select-none"
                    >
                      <div
                        className={`p-4 rounded-full ${styles.feedback.emptyIconBg}`}
                      >
                        <SearchX size={32} />
                      </div>
                      <p
                        className={`font-bold text-lg ${styles.feedback.emptyText}`}
                      >
                        {t.tag?.noEntries}
                      </p>
                    </motion.div>
                  ) : (
                    <ReadOnlyContext.Provider value={true}>
                      {/* ✅ 列表容器：控制交错动画 */}
                      <motion.div
                        variants={listContainerVariants}
                        initial="hidden"
                        animate="visible"
                        className="flex flex-col gap-6 pb-10"
                      >
                        {results.map((entry) => (
                          <motion.div
                            key={entry.id}
                            variants={listItemVariants} // 每个子元素应用此变体
                            className="relative group px-2 sm:px-4"
                          >
                            {/* Date Label / Jump Button */}
                            <div className="flex items-center mb-2">
                              <button
                                onClick={() =>
                                  handleJumpToDate(
                                    entry.date || entry.target_date,
                                  )
                                }
                                className={`
                                  flex items-center gap-2 px-3 py-1 rounded-full border shadow-sm text-xs font-mono transition-all
                                  ${
                                    isDark
                                      ? "bg-[#1e293b]/50 border-indigo-500/20 text-indigo-300 hover:bg-[#1e293b] hover:border-indigo-400"
                                      : "bg-white border-indigo-100 text-slate-500 hover:text-indigo-600 hover:border-indigo-200"
                                  }
                                `}
                              >
                                <Calendar size={12} />
                                <span className="font-semibold">
                                  {entry.date ||
                                    entry.target_date ||
                                    "Future Log"}
                                </span>
                                <ArrowRight
                                  size={10}
                                  className="opacity-0 -ml-1 group-hover:opacity-100 group-hover:ml-0 transition-all"
                                />
                              </button>
                            </div>

                            {/* Entry Card */}
                            <div className="transform transition-transform hover:translate-x-1 duration-300">
                              <EntryCard
                                entry={entry}
                                refresh={() => {}}
                                isDragEnabled={false}
                                // ✅ 严格保留原有样式类名，仅替换颜色变量
                                className={`
                                  transition-all duration-300 shadow-sm
                                  ${styles.card.style}
                                  ${styles.card.hover}
                                `}
                                // 注入颜色 Context (为了 EntryCard 内部的遮罩)
                                style={{
                                  backgroundColor: colors.cardBg,
                                  borderColor: colors.cardBorder,
                                }}
                              />
                            </div>
                          </motion.div>
                        ))}
                      </motion.div>
                    </ReadOnlyContext.Provider>
                  )}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </EscModalWrapper>
  );
};

export default TagSearchModal;
