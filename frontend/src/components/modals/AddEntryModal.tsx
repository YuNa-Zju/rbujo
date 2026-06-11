import {
  useRef,
  useImperativeHandle,
  forwardRef,
  useState,
  type DragEvent,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import { useTranslation } from "../../hooks/useTranslation";
import { ENTRY_THEME, type EntryType } from "../../config/entryTheme";
import { format, addMonths, isValid, parseISO } from "date-fns";
import MarkdownToolbar from "../shared/MarkdownToolbar";
import TypeSelector from "../shared/TypeSelector";
import FutureLogOptions from "../shared/FutureLogOptions";
import { entryService } from "../../services/entryService";
import {
  X,
  CalendarDays,
  Clock,
  UploadCloud,
  Loader2,
  PenLine,
  Hash,
  Plus,
} from "lucide-react";
import { entryEventBus } from "../../lib/entryEventBus";

// ✅ 1. Update Open Options to include optional 'entry' for editing
export interface AddEntryModalOpenOptions {
  date?: Date | string;
  mode?: "daily" | "future";
  entry?: any; // If provided, switches to Edit Mode
}

export interface AddEntryModalRef {
  showModal: (options?: AddEntryModalOpenOptions) => void;
  close: () => void;
}

interface Props {
  onSuccess?: (newEntry: any) => void;
}

const AddEntryModal = forwardRef<AddEntryModalRef, Props>(
  ({ onSuccess }, ref) => {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const tagInputRef = useRef<HTMLInputElement>(null);
    const dragCounter = useRef(0);

    const { t } = useTranslation();

    const [mode, setMode] = useState<"daily" | "future">("daily");

    // ✅ Track the entry being edited (null = creation mode)
    const [editingEntry, setEditingEntry] = useState<any | null>(null);

    const [content, setContent] = useState("");
    const [type, setType] = useState<EntryType>("task");
    const [tags, setTags] = useState<string[]>([]);
    const [tagDraft, setTagDraft] = useState("");
    const [loading, setLoading] = useState(false);

    const [isUploading, setIsUploading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);

    // Date Management
    const [activeDate, setActiveDate] = useState<string>("");
    const [targetMonth, setTargetMonth] = useState(
      format(new Date(), "yyyy-MM"),
    );
    const [isUndetermined, setIsUndetermined] = useState(false);

    useImperativeHandle(ref, () => ({
      showModal: (options = {}) => {
        const { date: openDate, mode: openMode, entry } = options;

        // Reset UI states
        setIsUploading(false);
        setIsDragging(false);

        if (entry) {
          // 📝 EDIT MODE: Pre-fill data
          setEditingEntry(entry);
          setContent(entry.content || "");
          setType(entry.entry_type || "task");
          setTags(Array.isArray(entry.tags) ? entry.tags : []);
          setTagDraft("");

          // Determine mode based on entry data
          if (entry.is_future) {
            setMode("future");
            if (entry.target_month) {
              setTargetMonth(entry.target_month);
              setIsUndetermined(false);
            } else {
              setIsUndetermined(true);
            }
          } else {
            setMode("daily");
            // Use entry's date, fallback to passed date or today
            const d = entry.target_date || entry.date || openDate;
            setActiveDate(
              d
                ? format(new Date(d), "yyyy-MM-dd")
                : format(new Date(), "yyyy-MM-dd"),
            );
          }
        } else {
          // 🆕 CREATE MODE: Reset to defaults
          setEditingEntry(null);
          setContent("");
          setTags([]);
          setTagDraft("");
          // setType("task"); // Optional: keep last used type or reset

          setMode(openMode || "daily");

          let dateStr = "";
          if (openDate) {
            if (openDate instanceof Date) {
              dateStr = format(openDate, "yyyy-MM-dd");
            } else {
              const parsed = parseISO(openDate);
              dateStr = isValid(parsed)
                ? format(parsed, "yyyy-MM-dd")
                : openDate;
            }
          } else {
            dateStr = format(new Date(), "yyyy-MM-dd");
          }
          setActiveDate(dateStr);

          if (openMode === "future") {
            setTargetMonth(format(addMonths(new Date(), 1), "yyyy-MM"));
            setIsUndetermined(false);
          }
        }

        dialogRef.current?.showModal();

        // ⚡ Focus logic (delayed to wait for animation)
        requestAnimationFrame(() => {
          setTimeout(() => {
            if (textareaRef.current) {
              textareaRef.current.focus();
              // If editing, place cursor at the end
              if (entry) {
                const len = textareaRef.current.value.length;
                textareaRef.current.setSelectionRange(len, len);
              } else {
                textareaRef.current.setSelectionRange(0, 0);
              }
            }
          }, 50);
        });
      },
      close: () => dialogRef.current?.close(),
    }));

    // --- Tab Indentation Logic ---
    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Tab") {
        e.preventDefault();
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const value = textarea.value;

        if (start === end && !e.shiftKey) {
          document.execCommand("insertText", false, "    ");
          return;
        }

        const startLineIndex = value.lastIndexOf("\n", start - 1) + 1;
        let endLineIndex = value.indexOf("\n", end);
        if (endLineIndex === -1) endLineIndex = value.length;

        const linesBlock = value.substring(startLineIndex, endLineIndex);
        const lines = linesBlock.split("\n");

        let newLinesBlock = "";

        if (e.shiftKey) {
          newLinesBlock = lines
            .map((line) => line.replace(/^ {0,4}/, ""))
            .join("\n");
        } else {
          newLinesBlock = lines.map((line) => "    " + line).join("\n");
        }

        textarea.setSelectionRange(startLineIndex, endLineIndex);
        document.execCommand("insertText", false, newLinesBlock);

        setTimeout(() => {
          if (textarea) {
            textarea.setSelectionRange(
              startLineIndex,
              startLineIndex + newLinesBlock.length,
            );
          }
        }, 0);
      }
    };

    // --- File Upload Logic ---
    const uploadFile = async (file: File): Promise<string> => {
      const stored = await entryService.uploadFile(file);
      return stored.url;
    };

    const insertMarkdownAsset = (url: string, file: File) => {
      if (!textareaRef.current) return;
      const textarea = textareaRef.current;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      const isImage = file.type.startsWith("image/");
      const prefix = isImage ? "!" : "";
      const textToInsert = `\n${prefix}[${file.name}](${url})\n`;

      const newContent =
        content.substring(0, start) + textToInsert + content.substring(end);
      setContent(newContent);

      setTimeout(() => {
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd =
          start + textToInsert.length;
      }, 0);
    };

    const handleFileProcess = async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const file = files[0];

      setIsUploading(true);
      try {
        const url = await uploadFile(file);
        insertMarkdownAsset(url, file);
      } catch (error) {
        console.error("Upload failed", error);
        alert(t.addEntry?.uploadFailed || "Upload failed");
      } finally {
        setIsUploading(false);
      }
    };

    // --- Drag & Drop Logic ---
    const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current += 1;
      if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
        setIsDragging(true);
      }
    };

    const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current -= 1;
      if (dragCounter.current <= 0) {
        setIsDragging(false);
        dragCounter.current = 0;
      }
    };

    const handleDrop = (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      dragCounter.current = 0;
      handleFileProcess(e.dataTransfer.files);
    };

    const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
      if (e.clipboardData.files && e.clipboardData.files.length > 0) {
        e.preventDefault();
        handleFileProcess(e.clipboardData.files);
      }
    };

    const normalizeTag = (value: string) =>
      value
        .trim()
        .replace(/^#+/, "")
        .replace(/^[,，;；:：\s]+|[,，;；:：\s]+$/g, "");

    const addTag = (value: string) => {
      const tag = normalizeTag(value);
      if (!tag || /\s/.test(tag)) return;
      setTags((current) => {
        if (current.some((item) => item.toLowerCase() === tag.toLowerCase())) {
          return current;
        }
        return [...current, tag];
      });
      setTagDraft("");
    };

    const removeTag = (tag: string) => {
      setTags((current) => current.filter((item) => item !== tag));
    };

    const finalizedTags = () => {
      const pending = normalizeTag(tagDraft);
      if (!pending || /\s/.test(pending)) return tags;
      if (tags.some((item) => item.toLowerCase() === pending.toLowerCase())) {
        return tags;
      }
      return [...tags, pending];
    };

    const handleTagKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" || e.key === "," || e.key === "，") {
        e.preventDefault();
        addTag(tagDraft);
      } else if (e.key === "Backspace" && !tagDraft && tags.length > 0) {
        removeTag(tags[tags.length - 1]);
      }
    };

    const handleTagButtonClick = () => {
      if (tagDraft.trim()) {
        addTag(tagDraft);
        return;
      }
      tagInputRef.current?.focus();
    };

    // --- Submit Logic (Create or Update) ---
    const handleSubmit = async () => {
      if (!content.trim()) return;
      const nextTags = finalizedTags();
      setTags(nextTags);
      setTagDraft("");
      setLoading(true);
      try {
        if (editingEntry) {
          // 🔄 UPDATE LOGIC
          const payload: any = {
            content,
            entry_type: type,
            tags: nextTags,
            // Usually we don't update date/status here unless specific UI allows it
          };

          const updated = await entryService.update(editingEntry.id, payload);

          // Broadcast update event
          entryEventBus.emit("entry:update", updated);

          if (onSuccess) onSuccess(updated);
        } else {
          // 🆕 CREATE LOGIC
          const payload: any = {
            content,
            entry_type: type,
            tags: nextTags,
            status: "open",
            created_at: new Date().toISOString(),
          };

          if (mode === "daily") {
            payload.target_date = activeDate;
            payload.is_future = false;
          } else {
            payload.is_future = true;
            payload.status = "future";
            payload.target_month = isUndetermined ? null : targetMonth;
          }

          const data = await entryService.create(payload);

          // Broadcast create event
          entryEventBus.emit("entry:create", data);

          setContent(""); // Only clear on create success
          if (onSuccess) onSuccess(data);
        }

        dialogRef.current?.close();
      } catch (e) {
        console.error("Operation failed", e);
      } finally {
        setLoading(false);
      }
    };

    const currentTheme = ENTRY_THEME[type] || ENTRY_THEME.task;
    const isInvalid = !content.trim() || isUploading;

    const buttonClass = isInvalid
      ? "bg-base-200 text-base-content/20 cursor-not-allowed shadow-none"
      : `${currentTheme.btnBg} shadow-lg shadow-${currentTheme.color.split("-")[1]}-500/30 active:scale-95 text-white`;

    const displayDateDisplay = activeDate
      ? format(parseISO(activeDate), "MMM do, yyyy")
      : "";

    // Dynamic Title
    const modalTitle = editingEntry
      ? t.addEntry?.editEntryTitle || "Edit Entry"
      : mode === "future"
        ? t.futureLog?.add || "Future Log"
        : t.addEntry?.newEntryTitle || "New Entry";

    return (
      <dialog ref={dialogRef} className="modal modal-bottom sm:modal-middle">
        <div className="modal-box w-full sm:w-11/12 sm:max-w-2xl p-0 bg-base-100 shadow-2xl rounded-t-3xl sm:rounded-3xl flex flex-col max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-base-200/50 bg-base-100/95 backdrop-blur-md sticky top-0 z-20">
            <div className="flex flex-col">
              <h3 className="font-bold text-lg text-base-content flex items-center gap-2">
                {editingEntry ? (
                  <PenLine size={20} className="text-primary" />
                ) : mode === "future" ? (
                  <CalendarDays size={20} className="text-primary" />
                ) : (
                  <Clock size={20} className="text-primary" />
                )}
                {modalTitle}
              </h3>
              {/* Show date for Daily mode or when Editing */}
              {(mode === "daily" || editingEntry) && (
                <span className="text-xs text-base-content/40 font-mono ml-7 mt-0.5">
                  {editingEntry && editingEntry.target_date
                    ? format(parseISO(editingEntry.target_date), "MMM do, yyyy")
                    : displayDateDisplay}
                </span>
              )}
            </div>
            <form method="dialog">
              <button className="btn btn-sm btn-circle btn-ghost text-base-content/50 hover:bg-base-200">
                <X size={20} />
              </button>
            </form>
          </div>

          {/* Content */}
          <div className="overflow-y-auto flex-1 overscroll-contain">
            <div className="px-6 py-4 bg-base-100">
              <TypeSelector currentType={type} onChange={setType} />

              <div className="mt-4 rounded-2xl border border-base-200/70 bg-base-200/25 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={handleTagButtonClick}
                    className="btn btn-ghost btn-xs btn-circle text-base-content/45 hover:text-primary hover:bg-primary/10"
                    aria-label="添加标签"
                    title="添加标签"
                  >
                    {tagDraft.trim() ? (
                      <Plus size={14} strokeWidth={2.5} />
                    ) : (
                      <Hash size={14} strokeWidth={2.5} />
                    )}
                  </button>
                  {tags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="inline-flex items-center gap-1 rounded-full border border-primary/10 bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/15"
                    >
                      {tag}
                      <X size={11} strokeWidth={2.5} />
                    </button>
                  ))}
                  <input
                    ref={tagInputRef}
                    className="min-w-28 flex-1 bg-transparent text-sm outline-none placeholder:text-base-content/30"
                    value={tagDraft}
                    onChange={(e) => setTagDraft(e.target.value)}
                    onKeyDown={handleTagKeyDown}
                    onBlur={() => addTag(tagDraft)}
                    placeholder="添加标签"
                  />
                </div>
              </div>

              {/* Only show Future Date Picker when Creating Future Log (too complex for edit) */}
              {!editingEntry && mode === "future" && (
                <div className="mt-4 pt-4 border-t border-base-200/50 animate-in fade-in slide-in-from-top-2 duration-300">
                  <FutureLogOptions
                    targetMonth={targetMonth}
                    setTargetMonth={setTargetMonth}
                    isUndetermined={isUndetermined}
                    setIsUndetermined={setIsUndetermined}
                  />
                </div>
              )}
            </div>

            {/* Edit Area */}
            <div
              className="relative flex-1 px-6 pb-4 bg-base-100 min-h-[200px] flex flex-col gap-2"
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
            >
              {/* Drag Overlay */}
              {isDragging && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-base-100/90 backdrop-blur-sm animate-in fade-in duration-150 pointer-events-none rounded-xl">
                  <UploadCloud className="w-12 h-12 text-primary animate-bounce mb-2" />
                  <p className="text-base font-bold text-primary">
                    {t.addEntry?.drop}
                  </p>
                </div>
              )}

              {/* Upload Overlay */}
              {isUploading && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-base-100/30 backdrop-blur-[1px] pointer-events-none transition-all duration-300 rounded-xl">
                  <div className="flex items-center gap-3 px-8 py-3 bg-base-100/95 backdrop-blur-xl shadow-2xl rounded-full border border-base-content/5 ring-1 ring-base-content/5 animate-in zoom-in-95 duration-200">
                    <Loader2 className="w-5 h-5 text-primary animate-spin" />
                    <span className="text-base font-semibold text-base-content tracking-wide">
                      {t.addEntry?.upload}
                    </span>
                  </div>
                </div>
              )}

              <MarkdownToolbar
                textareaRef={textareaRef}
                value={content}
                onChange={setContent}
              />
              <textarea
                ref={textareaRef}
                className={`textarea textarea-ghost w-full text-lg h-full min-h-[150px] placeholder:text-base-content/20 focus:bg-transparent px-2 leading-relaxed resize-none focus:outline-none focus:border-none focus:ring-0 font-medium ${isUploading ? "opacity-40 blur-[1px]" : ""}`}
                placeholder={
                  editingEntry
                    ? "Edit content..."
                    : isUploading
                      ? t.addEntry?.upload
                      : mode === "future"
                        ? t.addEntry?.placeholderFuture
                        : t.addEntry?.placeholderDaily
                }
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isUploading}
                onPaste={handlePaste}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="p-5 bg-base-100 flex justify-between items-center border-t border-base-100 z-20">
            <span
              className={`text-xs font-bold font-mono ml-2 transition-colors ${content.length > 500 ? "text-warning" : "text-base-content/30"}`}
            >
              {content.length} {t.addEntry?.chars}
            </span>
            <div className="flex gap-3">
              <form method="dialog">
                <button
                  className="btn h-11 min-h-0 rounded-full btn-ghost text-base-content/60 hover:bg-base-200 px-6 font-normal"
                  disabled={isUploading}
                >
                  {t.common?.cancel}
                </button>
              </form>
              <button
                className={`btn h-11 min-h-0 rounded-full px-8 transition-all duration-300 border-0 ${buttonClass}`}
                onClick={handleSubmit}
                disabled={loading || isInvalid}
              >
                {(loading || isUploading) && (
                  <span className="loading loading-spinner loading-xs" />
                )}
                {editingEntry
                  ? t.common?.save || "Save"
                  : t.addEntry?.createBtn}
              </button>
            </div>
          </div>
        </div>

        <form method="dialog" className="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>
    );
  },
);

export default AddEntryModal;
