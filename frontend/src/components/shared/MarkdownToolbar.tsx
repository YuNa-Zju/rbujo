import {
  Bold,
  Italic,
  Strikethrough,
  Heading1,
  Heading2,
  Link,
  List,
  ListOrdered,
  Quote,
  Sigma,
  DollarSign,
  Paperclip,
  CheckSquare,
  Minus,
  Code,
} from "lucide-react";
import { useRef, useState } from "react";
import {
  chooseAttachmentUploadMode,
  uploadFilesAsMarkdown,
} from "../../services/attachmentService";
import ImageUploader from "./ImageUploader";

interface Props {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (newValue: string) => void;
}

export default function MarkdownToolbar({ textareaRef }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  // ✅ 核心：使用 execCommand 模拟输入，保留 Undo/Redo 历史
  const executeReplace = (text: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus();
    document.execCommand("insertText", false, text);
  };

  // --- 1. 普通文本包裹 (Bold, Italic) ---
  const insertText = (prefix: string, suffix: string = "") => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selection = text.substring(start, end);

    const replacement = `${prefix}${selection}${suffix}`;

    textarea.setSelectionRange(start, end);
    executeReplace(replacement);

    // 智能光标定位
    setTimeout(() => {
      if (selection.length === 0) {
        // 没选中内容时，光标放在中间
        const newCursorPos = start + prefix.length;
        textarea.setSelectionRange(newCursorPos, newCursorPos);
      } else {
        // 选中内容时，光标包裹整个替换后的内容
        textarea.setSelectionRange(start, start + replacement.length);
      }
    }, 0);
  };

  // --- 2. 链接插入 (Link) - 优化光标逻辑 ---
  const handleLink = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selection = textarea.value.substring(start, end);

    if (selection.length > 0) {
      // 选中了文字 -> [文字](光标在这里)
      textarea.setSelectionRange(start, end);
      executeReplace(`[${selection}]()`);
      setTimeout(() => {
        const cursorPos = start + selection.length + 3; // +3 是 "[](" 的长度
        textarea.setSelectionRange(cursorPos, cursorPos);
      }, 0);
    } else {
      // 没选中文字 -> [光标在这里](url)
      executeReplace("[](url)");
      setTimeout(() => {
        const cursorPos = start + 1;
        textarea.setSelectionRange(cursorPos, cursorPos);
      }, 0);
    }
  };

  // --- 3. 块级插入 (Code, Math, Divider) ---
  const insertBlock = (blockType: "code" | "math" | "divider") => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selection = text.substring(start, end);

    const hasBefore = start === 0 || text[start - 1] === "\n";
    const hasAfter = end === text.length || text[end] === "\n";
    const prefixNL = hasBefore ? "" : "\n";
    const suffixNL = hasAfter ? "" : "\n";

    let content = "";
    let cursorOffset = 0; // 插入后光标相对 start 的偏移量

    if (blockType === "divider") {
      content = `${prefixNL}---${suffixNL}`;
      cursorOffset = content.length;
    } else if (blockType === "code") {
      content = `${prefixNL}\`\`\`\n${selection}\n\`\`\`${suffixNL}`;
      // 如果没选中文本，光标定位在 ``` 后面方便写语言
      cursorOffset =
        selection.length === 0 ? prefixNL.length + 3 : content.length;
    } else if (blockType === "math") {
      content = `${prefixNL}$$\n${selection}\n$$${suffixNL}`;
      cursorOffset =
        selection.length === 0 ? prefixNL.length + 3 : content.length;
    }

    textarea.setSelectionRange(start, end);
    executeReplace(content);

    setTimeout(() => {
      const targetPos = start + cursorOffset;
      textarea.setSelectionRange(targetPos, targetPos);
    }, 0);
  };

  // --- 4. 行首修饰 (List, Checkbox, Quote) ---
  const handleLinePrefix = (prefix: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;

    let lineStart = text.lastIndexOf("\n", start - 1) + 1;
    let lineEnd = text.indexOf("\n", end);
    if (lineEnd === -1) lineEnd = text.length;

    const selectedLinesRaw = text.substring(lineStart, lineEnd);

    if (selectedLinesRaw.length === 0) {
      textarea.setSelectionRange(start, end);
      executeReplace(prefix);
      return;
    }

    const lines = selectedLinesRaw.split("\n");
    const newLines = lines.map((line) => `${prefix}${line}`);
    const newContent = newLines.join("\n");

    textarea.setSelectionRange(lineStart, lineEnd);
    executeReplace(newContent);
  };

  // --- 5. 有序列表 (1. 2. 3.) ---
  const handleOrderedList = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;

    let lineStart = text.lastIndexOf("\n", start - 1) + 1;
    let lineEnd = text.indexOf("\n", end);
    if (lineEnd === -1) lineEnd = text.length;

    const selectedLinesRaw = text.substring(lineStart, lineEnd);

    if (selectedLinesRaw.length === 0) {
      textarea.setSelectionRange(start, end);
      executeReplace("1. ");
      return;
    }

    const lines = selectedLinesRaw.split("\n");
    const newLines = lines.map((line, index) => `${index + 1}. ${line}`);
    const newContent = newLines.join("\n");

    textarea.setSelectionRange(lineStart, lineEnd);
    executeReplace(newContent);
  };

  // --- 6. 批量上传 ---
  const handleBatchUpload = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);
    try {
      const textarea = textareaRef.current;
      if (!textarea) return;

      textarea.focus();
      const mode = await chooseAttachmentUploadMode(Array.from(files));
      const markdown = await uploadFilesAsMarkdown(files, mode);
      const start = textarea.selectionStart;
      const text = textarea.value;
      const hasBefore = start === 0 || text[start - 1] === "\n";
      const insertContent = hasBefore ? markdown : `\n${markdown}`;
      textarea.setSelectionRange(start, start);
      executeReplace(insertContent);
    } catch (e) {
      console.error(e);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // 辅助组件：统一按钮样式
  const ToolBtn = ({
    icon: Icon,
    onClick,
    title,
  }: {
    icon: any;
    onClick: () => void;
    title?: string;
  }) => (
    <button
      className="btn btn-sm btn-square btn-ghost hover:bg-base-content/10 hover:text-primary transition-colors text-base-content/70"
      onClick={onClick}
      title={title}
      type="button" // 防止意外提交表单
    >
      <Icon size={17} strokeWidth={2} />
    </button>
  );

  const Divider = () => (
    <div className="w-px h-4 bg-base-content/10 mx-1"></div>
  );

  return (
    <div className="flex flex-wrap items-center gap-0.5 p-1.5 bg-base-100/80 backdrop-blur-md border-b border-base-200 overflow-x-auto no-scrollbar shrink-0 z-20 sticky top-0">
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        multiple
        onChange={(e) => e.target.files && handleBatchUpload(e.target.files)}
      />

      {/* Headings */}
      <ToolBtn icon={Heading1} onClick={() => insertText("# ")} title="H1" />
      <ToolBtn icon={Heading2} onClick={() => insertText("## ")} title="H2" />

      <Divider />

      {/* Styles */}
      <ToolBtn
        icon={Bold}
        onClick={() => insertText("**", "**")}
        title="Bold"
      />
      <ToolBtn
        icon={Italic}
        onClick={() => insertText("*", "*")}
        title="Italic"
      />
      <ToolBtn
        icon={Strikethrough}
        onClick={() => insertText("~~", "~~")}
        title="Strikethrough"
      />

      <Divider />

      {/* Lists */}
      <ToolBtn
        icon={List}
        onClick={() => handleLinePrefix("- ")}
        title="Bullet List"
      />
      <ToolBtn
        icon={ListOrdered}
        onClick={handleOrderedList}
        title="Ordered List"
      />
      <ToolBtn
        icon={CheckSquare}
        onClick={() => handleLinePrefix("- [ ] ")}
        title="Task List"
      />
      <ToolBtn
        icon={Quote}
        onClick={() => handleLinePrefix("> ")}
        title="Quote"
      />

      <Divider />

      {/* Inserts */}
      <ToolBtn icon={Link} onClick={handleLink} title="Link" />

      <ToolBtn
        icon={Code}
        onClick={() => insertBlock("code")}
        title="Code Block"
      />

      <Divider />

      {/* Math/Extra */}
      <ToolBtn
        icon={DollarSign}
        onClick={() => insertText("$", "$")}
        title="Inline Math"
      />
      <ToolBtn
        icon={Sigma}
        onClick={() => insertBlock("math")}
        title="Block Math"
      />
      <ToolBtn
        icon={Minus}
        onClick={() => insertBlock("divider")}
        title="Divider"
      />

      <Divider />

      {/* Uploads */}
      {/* 这里的 ImageUploader 是你原本的组件，为了统一样式，建议你可以把它的 Trigger 样式也调整一下 */}
      <div className="flex items-center">
        <ImageUploader
          onUploadSuccess={(md) => {
            const textarea = textareaRef.current;
            if (!textarea) return;
            const start = textarea.selectionStart;
            const text = textarea.value;
            const hasBefore = start === 0 || text[start - 1] === "\n";
            const insert = hasBefore ? md : "\n" + md;
            textarea.setSelectionRange(start, start);
            executeReplace(insert);
          }}
        />
      </div>

      <button
        className="btn btn-sm btn-square btn-ghost hover:bg-base-content/10 hover:text-primary transition-colors text-base-content/70"
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
        title="Upload File"
        type="button"
      >
        {isUploading ? (
          <span className="loading loading-spinner loading-xs" />
        ) : (
          <Paperclip size={17} strokeWidth={2} />
        )}
      </button>
    </div>
  );
}
