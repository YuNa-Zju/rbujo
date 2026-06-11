import { useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Download,
  Upload,
  FileJson,
  Check,
  AlertCircle,
  X,
  Loader2,
  RotateCcw,
  FileText,
  Trash2,
  Archive,
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
  FileArchive,
} from "lucide-react";

import { uiEvents } from "../../lib/uiEvents";
import { dataBackupService } from "../../services/dataBackupService";
import { cacheStorage } from "../../utils/cacheStorage";
import { exportToMarkdown } from "../../utils/exportUtils";
import { useTranslation } from "../../hooks/useTranslation";
import { entryService } from "../../services/entryService";
import { useAppTheme } from "../../hooks/useAppTheme"; // ✅ 1. 引入封装好的 Hook

const UNDO_STORAGE_KEY = "bujo_last_import_ids";

// --- 内部子组件：确认弹窗 ---
const ConfirmDialog = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  desc,
  confirmText,
  loading,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  desc: string;
  confirmText: string;
  loading: boolean;
}) => {
  // ✅ 子组件使用 Hook 获取样式
  const { styles } = useAppTheme();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[7000] flex items-center justify-center p-4 isolation-isolate">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className={`absolute inset-0 ${styles.backdrop}`}
        onClick={() => !loading && onClose()}
      />
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        // ✅ 使用统一 Modal 样式
        className={`
          relative w-full max-w-sm flex flex-col overflow-hidden rounded-3xl p-6 text-center gap-4
          ${styles.modal.base} border
        `}
      >
        <div className="w-16 h-16 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mx-auto mb-2">
          <AlertTriangle size={32} strokeWidth={2} />
        </div>
        <div>
          <h3 className={`text-xl font-bold ${styles.modal.title}`}>{title}</h3>
          <p
            className={`text-sm mt-2 font-medium leading-relaxed ${styles.card.textSecondary}`}
          >
            {desc}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 w-full mt-2">
          <button
            onClick={onClose}
            disabled={loading}
            className={`btn btn-ghost rounded-full font-bold ${styles.card.textSecondary}`}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="btn btn-error rounded-full text-white font-bold shadow-lg shadow-red-500/20"
          >
            {loading && <Loader2 className="animate-spin" size={16} />}
            {confirmText}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// --- 主组件 ---
export default function BackupModal() {
  const { t } = useTranslation();

  // ✅ 2. 使用封装的 Hook 获取样式和深色模式状态
  const { styles, isDark } = useAppTheme();

  const [isOpen, setIsOpen] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [lastImportedIds, setLastImportedIds] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- 初始化 ---
  useEffect(() => {
    const savedIds = localStorage.getItem(UNDO_STORAGE_KEY);
    if (savedIds) {
      try {
        const parsed = JSON.parse(savedIds);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setLastImportedIds(parsed);
        }
      } catch {
        localStorage.removeItem(UNDO_STORAGE_KEY);
      }
    }

    const open = () => {
      setIsOpen(true);
      setStatus("idle");
      setMessage("");
      setShowConfirm(false);
    };

    uiEvents.on("OPEN_BACKUP", open);
    return () => uiEvents.off("OPEN_BACKUP", open);
  }, []);

  // --- ESC 关闭 ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showConfirm && !loading) {
          setShowConfirm(false);
          return;
        }
        if (isOpen && !loading) {
          setIsOpen(false);
        }
      }
    };
    if (isOpen) window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, showConfirm, loading]);

  // --- Helpers & Actions ---
  const handleHardRefresh = async () => {
    try {
      await (cacheStorage as any).clearDaily?.({});
      await (cacheStorage as any).saveOverview?.({});
    } finally {
      window.location.reload();
    }
  };

  const handleDismissUndo = () => {
    localStorage.removeItem(UNDO_STORAGE_KEY);
    setLastImportedIds([]);
    setStatus("idle");
  };

  const handleExportData = async () => {
    setLoading(true);
    setStatus("idle");
    setMessage(t.backup?.encrypting || "Preparing data...");
    try {
      const res = await dataBackupService.exportData();
      setStatus("success");
      setMessage(
        (t.backup?.exportSuccess || "Exported {{count}} items.").replace(
          "{{count}}",
          String(res.count),
        ),
      );
    } catch (e) {
      setStatus("error");
      setMessage(t.backup?.error || "Export failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleExportZip = async () => {
    setLoading(true);
    setStatus("idle");
    setMessage(t.backup?.processing || "Zipping...");
    try {
      await entryService.downloadBackup();
      setStatus("success");
      setMessage(t.backup?.exportZipSuccess || "Archive downloaded (.zip)");
    } catch (e) {
      setStatus("error");
      setMessage(t.backup?.error || "Export failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleExportMarkdown = async () => {
    setLoading(true);
    setStatus("idle");
    setMessage(t.backup?.processing || "Converting...");
    try {
      const success = await exportToMarkdown();
      if (success) {
        setStatus("success");
        setMessage(t.backup?.exportMdSuccess || "Markdown exported.");
      } else {
        setStatus("idle");
      }
    } catch (e) {
      setStatus("error");
      setMessage(t.backup?.error || "Export failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setStatus("idle");
    setMessage(t.backup?.decrypting || "Restoring...");

    try {
      const res = await dataBackupService.importData(file);
      const newIds = res.insertedIds || [];
      if (newIds.length > 0) {
        localStorage.setItem(UNDO_STORAGE_KEY, JSON.stringify(newIds));
        setLastImportedIds(newIds);
      }
      setStatus("success");
      setMessage(
        (t.backup?.importSuccess || "Restored {{count}} items.").replace(
          "{{count}}",
          String(newIds.length),
        ),
      );
      setTimeout(() => handleHardRefresh(), 1500);
    } catch (e) {
      setStatus("error");
      setMessage(t.backup?.error || "Import failed.");
      setLoading(false);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleUndoClick = () => {
    if (lastImportedIds.length === 0) return;
    setShowConfirm(true);
  };

  const executeUndo = async () => {
    setLoading(true);
    setShowConfirm(false);
    setMessage(t.backup?.processing || "Reverting...");

    try {
      await dataBackupService.undoImport(lastImportedIds);
      localStorage.removeItem(UNDO_STORAGE_KEY);
      setLastImportedIds([]);
      setStatus("success");
      setMessage(t.backup?.undoSuccess || "Revert successful.");
      setTimeout(() => handleHardRefresh(), 1000);
    } catch (e) {
      setStatus("error");
      setMessage(t.backup?.error || "Revert failed.");
      setLoading(false);
    }
  };

  // --- Components ---
  const ActionCard = ({
    title,
    desc,
    icon: Icon,
    colorClass,
    onClick,
    disabled,
  }: any) => (
    <motion.button
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      disabled={disabled}
      // ✅ 使用 styles.card.*
      className={`
        ${styles.card.base} ${styles.card.bg} ${styles.card.border}
        ${disabled ? "opacity-50 cursor-not-allowed" : `cursor-pointer ${styles.card.hover}`}
      `}
    >
      <div
        className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${colorClass}`}
      >
        <Icon size={22} strokeWidth={2} />
      </div>
      <div className="flex-1 min-w-0">
        <h4
          className={`font-bold text-base leading-tight mb-0.5 ${styles.card.textPrimary}`}
        >
          {title}
        </h4>
        <p
          className={`text-xs font-medium truncate ${styles.card.textSecondary}`}
        >
          {desc}
        </p>
      </div>
      {!disabled && (
        <ChevronRight
          size={16}
          className={`${styles.card.textSecondary} opacity-50 group-hover:translate-x-1 transition-transform`}
        />
      )}
    </motion.button>
  );

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[6000] flex items-center justify-center isolation-isolate p-4 sm:p-0">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={`absolute inset-0 ${styles.backdrop}`}
              onClick={() => !loading && setIsOpen(false)}
            />

            <motion.div
              layout
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              // ✅ 使用 styles.modal.*
              className={`
                ${styles.modal.layout} flex-col max-h-[90vh]
                sm:max-w-lg w-full rounded-t-[2rem] sm:rounded-[2rem]
                ${styles.modal.bg} ${styles.modal.shadow} ${styles.modal.border}
              `}
            >
              {/* Header */}
              <div
                className={`px-6 pt-8 pb-6 flex items-start justify-between ${styles.modal.header}`}
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm border ${styles.modal.iconBox}`}
                  >
                    <Archive size={24} strokeWidth={2} />
                  </div>
                  <div>
                    <h3
                      className={`font-bold text-xl leading-tight ${styles.modal.title}`}
                    >
                      {t.backup?.title || "Data & Backup"}
                    </h3>
                    <p
                      className={`text-xs mt-1 font-medium ${styles.modal.subtitle}`}
                    >
                      {t.backup?.subtitle || "Safe, secure, and portable"}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setIsOpen(false)}
                  disabled={loading}
                  className={styles.modal.closeBtn}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Scrollable Main Content */}
              <div className="px-6 py-4 overflow-y-auto flex-1 custom-scrollbar">
                {/* 1. Import */}
                <div className="mb-8">
                  <label className={styles.sectionTitle}>
                    <Upload size={10} className="inline mr-1" />{" "}
                    {t.backup?.sectionImport || "Restore"}
                  </label>
                  <ActionCard
                    title={t.backup?.importData || "Restore Data"}
                    desc={t.backup?.importDataDesc || "From .bjk file"}
                    icon={Upload}
                    colorClass={
                      isDark
                        ? "bg-cyan-500/10 text-cyan-400"
                        : "bg-cyan-50 text-cyan-600"
                    }
                    onClick={() => fileInputRef.current?.click()}
                    disabled={loading}
                  />
                  <input
                    type="file"
                    accept=".bjk"
                    ref={fileInputRef}
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>

                {/* 2. Export */}
                <div className="mb-4">
                  <label className={styles.sectionTitle}>
                    <Download size={10} className="inline mr-1" />{" "}
                    {t.backup?.sectionExport || "Export"}
                  </label>
                  <div className="space-y-3">
                    {/* BJK (Primary) */}
                    <ActionCard
                      title={t.backup?.exportData || "Export Backup (.bjk)"}
                      desc={t.backup?.exportDataDesc || "Complete .bjk file"}
                      icon={FileJson}
                      colorClass={
                        isDark
                          ? "bg-indigo-500/20 text-indigo-300"
                          : "bg-indigo-50 text-indigo-600"
                      }
                      onClick={handleExportData}
                      disabled={loading}
                    />

                    {/* ZIP (Archive) */}
                    <ActionCard
                      title={t.backup?.exportZip || "Export Archive (.zip)"}
                      desc={
                        t.backup?.exportZipDesc || "Markdown files & folders"
                      }
                      icon={FileArchive}
                      colorClass={
                        isDark
                          ? "bg-teal-500/20 text-teal-300"
                          : "bg-teal-50 text-teal-600"
                      }
                      onClick={handleExportZip}
                      disabled={loading}
                    />

                    {/* Markdown (Legacy) */}
                    <ActionCard
                      title={t.backup?.exportMd || "Export Markdown (.md)"}
                      desc={t.backup?.exportMdDesc || "Single file for Notion"}
                      icon={FileText}
                      colorClass={
                        isDark
                          ? "bg-slate-500/10 text-slate-300"
                          : "bg-slate-100 text-slate-500"
                      }
                      onClick={handleExportMarkdown}
                      disabled={loading}
                    />
                  </div>
                </div>
              </div>

              {/* Footer Area (Status & Undo) */}
              <div className="px-6 pb-6 pt-2 shrink-0 flex flex-col gap-3">
                <AnimatePresence mode="popLayout">
                  {/* Status Capsule */}
                  {status !== "idle" && (
                    <motion.div
                      key="status"
                      initial={{ opacity: 0, y: 20, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      // ✅ 使用 styles.status.*
                      className={`
                        ${styles.status.container}
                        ${status === "success" ? styles.status.success : styles.status.error}
                      `}
                    >
                      <div
                        className={`p-1.5 rounded-full shrink-0 ${status === "success" ? styles.status.successIcon : styles.status.errorIcon}`}
                      >
                        {status === "success" ? (
                          <Check size={14} strokeWidth={3} />
                        ) : (
                          <AlertCircle size={14} strokeWidth={3} />
                        )}
                      </div>
                      <span className="text-sm font-bold truncate flex-1 pr-2">
                        {message}
                      </span>
                      {loading && (
                        <Loader2
                          size={16}
                          className="animate-spin opacity-50"
                        />
                      )}
                    </motion.div>
                  )}

                  {/* Undo Card */}
                  {!loading && lastImportedIds.length > 0 && (
                    <motion.div
                      key="undo"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden w-full"
                    >
                      {/* 复用 Card 样式 + 覆盖背景以区别 */}
                      <div
                        className={`p-5 rounded-[2rem] flex flex-col gap-4 mt-2 ${styles.card.border} ${isDark ? "bg-[#1e293b]/50" : "bg-white/50"}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-10 h-10 rounded-full border flex items-center justify-center shadow-sm ${styles.status.success}`}
                            >
                              <ShieldCheck size={18} />
                            </div>
                            <div>
                              <h5
                                className={`text-[10px] font-bold uppercase tracking-widest ${styles.card.textSecondary}`}
                              >
                                Recent Import
                              </h5>
                              <p
                                className={`text-sm font-bold ${styles.card.textPrimary}`}
                              >
                                {(
                                  t.backup?.importedCount ||
                                  "{{count}} entries added"
                                ).replace(
                                  "{{count}}",
                                  String(lastImportedIds.length),
                                )}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={handleDismissUndo}
                            className={`btn btn-sm btn-circle btn-ghost ${styles.card.textSecondary} hover:bg-base-100 hover:text-error`}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>

                        <button
                          onClick={handleUndoClick}
                          className={`btn btn-outline border-2 rounded-full w-full gap-2 transition-all normal-case text-base h-12 min-h-0 ${isDark ? "btn-error text-red-300 border-red-500/30 hover:bg-red-500/20" : "btn-error bg-base-100 hover:bg-red-500 hover:text-white"}`}
                        >
                          <RotateCcw size={18} strokeWidth={2.5} />
                          {t.backup?.undo || "Undo This Import"}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showConfirm && (
          <ConfirmDialog
            isOpen={showConfirm}
            onClose={() => setShowConfirm(false)}
            onConfirm={executeUndo}
            loading={loading}
            title={t.backup?.deleteConfirmTitle || "Undo Import?"}
            desc={(
              t.backup?.deleteConfirm || "This will delete {{count}} entries."
            ).replace("{{count}}", String(lastImportedIds.length))}
            confirmText={t.backup?.confirmUndo || "Yes, Delete"}
          />
        )}
      </AnimatePresence>
    </>
  );
}
