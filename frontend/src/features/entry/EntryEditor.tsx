import {
  useState,
  useRef,
  useLayoutEffect,
  type DragEvent,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import { useTranslation } from "../../hooks/useTranslation";
import { ENTRY_THEME, type EntryType } from "../../config/entryTheme";
import MarkdownToolbar from "../../components/shared/MarkdownToolbar";
import {
  Check,
  Circle,
  Minus,
  CircleDashed,
  UploadCloud,
  Loader2,
} from "lucide-react";
import { entryService } from "../../services/entryService";

interface Props {
  initialContent: string;
  initialType: EntryType;
  onSave: (content: string, type: EntryType) => void;
  onCancel: () => void;
  isInline?: boolean; // 用于区分 Modal 还是 List
}

export default function EntryEditor({
  initialContent,
  initialType,
  onSave,
  onCancel,
  isInline = false,
}: Props) {
  const { t } = useTranslation();
  const [content, setContent] = useState(initialContent);
  const [type, setType] = useState<EntryType>(initialType);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dragCounter = useRef(0);

  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const theme = ENTRY_THEME[type] || ENTRY_THEME.task;
  const isInvalid = !content.trim() || isUploading;

  // --- 1. 核心修复：自动高度逻辑 ---
  // 无论 Inline 还是 Modal，都启用自动高度计算
  useLayoutEffect(() => {
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;

    // 重置高度以获得正确的 scrollHeight
    textarea.style.height = "auto";

    const scrollHeight = textarea.scrollHeight;
    textarea.style.height = `${scrollHeight}px`;
  }, [content]);

  // --- 2. Tab 缩进逻辑 ---
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

  // --- 3. 图片/文件插入逻辑 ---
  const uploadFile = async (file: File): Promise<string> => {
    const stored = await entryService.uploadFile(file);
    return stored.url;
  };

  const insertMarkdownAsset = (url: string, file: File) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentText = textarea.value;

    const isImage = file.type.startsWith("image/");
    const prefix = isImage ? "!" : "";
    const textToInsert = `\n${prefix}[${file.name}](${url})\n`;

    const newText =
      currentText.substring(0, start) +
      textToInsert +
      currentText.substring(end);

    setContent(newText);

    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + textToInsert.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const handleFileProcess = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const url = await uploadFile(file);
        insertMarkdownAsset(url, file);
      }
    } catch (error) {
      console.error(error);
      alert(t.addEntry?.uploadFailed || "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (e.dataTransfer.items?.length > 0) setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) setIsDragging(false);
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

  const saveBtnClass = isInvalid
    ? "bg-base-200 text-base-content/20 cursor-not-allowed"
    : `${theme.btnBg} shadow-md active:scale-95 text-white`;

  // --- 4. 布局 CSS 配置 ---
  const containerClass = isInline
    ? "w-full flex flex-col animate-in fade-in duration-200"
    : "w-full flex flex-col animate-in fade-in duration-200 max-h-[85vh]";

  return (
    <div className={containerClass}>
      {/* 1. Header (Type Selector) */}
      <div className="shrink-0 pb-3 px-1">
        <div className="grid grid-cols-3 gap-2">
          {(Object.values(ENTRY_THEME) as any[]).map((config) => (
            <button
              key={config.key}
              onClick={() => setType(config.key as EntryType)}
              className={`btn btn-sm h-9 min-h-0 border-0 flex items-center justify-center gap-2 transition-all rounded-lg ${
                type === config.key
                  ? `${config.activeBg} ${config.activeText} ring-1 ring-inset ${config.activeBorder} shadow-sm`
                  : "bg-base-200/50 text-base-content/60 hover:bg-base-200"
              }`}
            >
              {config.key === "task" && (
                <Circle
                  size={14}
                  strokeWidth={3}
                  className={type === "task" ? "fill-current" : ""}
                />
              )}
              {config.key === "idea" && <Minus size={14} strokeWidth={3} />}
              {config.key === "event" && (
                <CircleDashed size={14} strokeWidth={2.5} />
              )}
              <span className="text-xs font-bold">
                {t.common[config.key as keyof typeof t.common] || config.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 2. Main Editor Card */}
      {/* 移除 flex-1，改用 h-auto，让内容自然撑开，直到达到 max-h */}
      <div
        className="h-auto w-full flex flex-col border border-base-300 rounded-xl bg-base-100 shadow-sm relative group transition-all"
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        {/* Toolbar */}
        <div className="shrink-0 border-b border-base-200 bg-base-50/50">
          <MarkdownToolbar
            textareaRef={textareaRef}
            value={content}
            onChange={setContent}
          />
        </div>

        {/* Text Area Container */}
        <div className="relative w-full h-auto">
          {isDragging && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-base-100/90 backdrop-blur-sm animate-in fade-in duration-150 pointer-events-none">
              <UploadCloud className="w-12 h-12 text-primary animate-bounce mb-2" />
              <p className="text-base font-bold text-primary">
                {t.addEntry?.drop}
              </p>
            </div>
          )}
          {isUploading && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-base-100/30 backdrop-blur-[1px] pointer-events-none">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          )}

          <textarea
            ref={textareaRef}
            // ✅ 核心配置：
            // h-auto: 由 JS 动态控制实际高度
            // min-h-[140px]: 保证最少有5-6行的编辑空间
            // max-h-[350px]: 移动端约10-15行，超出后 overflow-y-auto 出滚动条
            // isInline ? overflow-hidden : overflow-y-auto: Modal 模式下超出最大高度允许内部滚动
            className={`w-full block p-4 bg-transparent focus:outline-none text-base border-0 focus:ring-0 leading-relaxed font-medium resize-none custom-scrollbar h-auto
              min-h-[140px]
              ${isInline ? "overflow-hidden" : "max-h-[350px] overflow-y-auto"}
              ${isUploading ? "opacity-40 blur-[1px]" : ""}`}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isUploading ? t.addEntry?.upload : "Type something..."}
            autoFocus
            disabled={isUploading}
            onPaste={handlePaste}
          />
        </div>

        {/* Footer */}
        <div className="shrink-0 p-3 bg-base-100 border-t border-base-200 flex justify-end gap-2 z-10 relative rounded-b-xl">
          <button
            className="btn btn-sm h-9 rounded-full btn-ghost hover:bg-base-200 px-5 text-base-content/70 font-normal"
            onClick={onCancel}
            disabled={isUploading}
          >
            {t.common.cancel}
          </button>
          <button
            className={`btn btn-sm h-9 rounded-full border-0 px-6 transition-all duration-200 ${saveBtnClass}`}
            onClick={() => onSave(content, type)}
            disabled={isInvalid}
          >
            {isUploading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Check size={16} strokeWidth={3} />
            )}
            {t.common.save}
          </button>
        </div>
      </div>
    </div>
  );
}
