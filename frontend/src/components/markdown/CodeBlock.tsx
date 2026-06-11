import { useState, useEffect } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import {
  oneDark,
  oneLight,
} from "react-syntax-highlighter/dist/esm/styles/prism";
import { Check, Copy, Terminal } from "lucide-react";
import { type EntryType } from "../../config/entryTheme";

interface CodeBlockProps {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
  entryType?: string;
}

// ✅ 1. 提取检测逻辑为独立函数
const getSystemTheme = () => {
  if (typeof document === "undefined") return false; // SSR 防护

  const root = document.documentElement;
  const currentTheme = root.getAttribute("data-theme");

  if (currentTheme === "dark") return true;
  if (currentTheme === "light") return false;

  // 如果没有 data-theme，检查系统偏好
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
};

export default function CodeBlock({
  inline,
  className,
  children,
  entryType = "task",
  ...props
}: CodeBlockProps) {
  const [isCopied, setIsCopied] = useState(false);

  // ✅ 2. 使用惰性初始化：直接在初始值中读取 DOM，保证第一次渲染就是正确的颜色
  const [isDark, setIsDark] = useState(() => getSystemTheme());

  // ✅ 3. 监听变化 (MutationObserver + Media Query)
  useEffect(() => {
    const root = document.documentElement;

    const updateTheme = () => {
      const newValue = getSystemTheme();
      // 只有真的变了才更新，避免重复渲染
      setIsDark((prev) => (prev !== newValue ? newValue : prev));
    };

    // 监听 data-theme 属性变化
    const observer = new MutationObserver(updateTheme);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    // 监听系统深色模式变化
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", updateTheme);

    return () => {
      observer.disconnect();
      media.removeEventListener("change", updateTheme);
    };
  }, []);

  const textInput = String(children).replace(/\n$/, "");
  const match = /language-(\w+)/.exec(className || "");
  const lang = match ? match[1] : null;
  const isReallyInline = inline || (!lang && !textInput.includes("\n"));

  const handleCopy = () => {
    navigator.clipboard.writeText(textInput);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  // --- 样式配置 ---
  const containerBg = isDark ? "bg-[#1a1b26]" : "bg-[#f6f8fa]";
  const containerBorder = isDark ? "border-[#414868]/50" : "border-base-300";
  // 修正了之前的 typo: bg-[#eaMkef] -> bg-[#e4e4e7] (常见的浅灰色)
  const headerBg = isDark ? "bg-[#16161e]" : "bg-[#e4e4e7]";
  const headerBorder = isDark ? "border-[#414868]/30" : "border-base-300/50";
  const textColor = isDark ? "text-[#a9b1d6]" : "text-gray-500";

  const syntaxTheme = isDark ? oneDark : oneLight;

  // 根据 entryType 获取对应的 Hover 颜色类
  const hoverColorClass =
    {
      task: "hover:text-indigo-600 dark:hover:text-indigo-400",
      idea: "hover:text-amber-600 dark:hover:text-amber-400",
      event: "hover:text-sky-600 dark:hover:text-sky-400",
    }[entryType as EntryType] || "hover:text-primary";

  // 行内代码块样式
  if (isReallyInline) {
    return (
      <code
        className={`px-1.5 py-0.5 rounded-md text-[0.9em] align-baseline break-words mx-0.5 border transition-colors duration-300
          ${
            isDark
              ? "bg-[#24283b] text-[#c0caf5] border-[#414868]"
              : "bg-base-200 text-primary border-base-300"
          }
        `}
        style={{
          fontFamily: "'JetBrains Mono', 'LXGW WenKai Screen', monospace",
        }}
        {...props}
      >
        {children}
      </code>
    );
  }

  return (
    <div
      className={`relative group my-5 rounded-xl overflow-hidden border shadow-sm transition-colors duration-300 ease-in-out
        ${containerBg} ${containerBorder}`}
    >
      {/* Header */}
      <div
        className={`absolute top-0 left-0 right-0 flex justify-between items-center px-4 h-10 border-b select-none z-10 transition-colors duration-300 ${headerBg} ${headerBorder}`}
      >
        <div
          className={`flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider ${textColor} opacity-90`}
        >
          <Terminal size={13} strokeWidth={2.5} />
          <span>{lang || "TEXT"}</span>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            handleCopy();
          }}
          className={`flex items-center gap-1.5 text-[11px] font-bold transition-all px-2.5 py-1.5 rounded-md
            ${
              isCopied
                ? "text-success bg-success/10"
                : `text-base-content/50 hover:bg-base-content/5 ${hoverColorClass}`
            }
          `}
        >
          {isCopied ? (
            <>
              <Check size={13} strokeWidth={3} />
              <span>COPIED</span>
            </>
          ) : (
            <>
              <Copy size={13} strokeWidth={2.5} />
              <span>COPY</span>
            </>
          )}
        </button>
      </div>

      <div className="relative">
        <SyntaxHighlighter
          language={lang || "text"}
          style={syntaxTheme}
          showLineNumbers={true}
          wrapLines={true}
          codeTagProps={{
            style: {
              fontSize: "14px",
              fontFamily:
                "'JetBrains Mono', 'LXGW WenKai Screen', 'Fira Code', Consolas, monospace",
              backgroundColor: "transparent",
            },
          }}
          customStyle={{
            margin: 0,
            padding: "3.5rem 1rem 1rem 0.5rem",
            background: "transparent",
            fontSize: "14px",
            lineHeight: "1.6",
          }}
          lineNumberStyle={{
            minWidth: "3em",
            paddingRight: "1em",
            color: isDark ? "#565f89" : "#b0b0b0",
            textAlign: "right",
            userSelect: "none",
          }}
          {...props}
        >
          {textInput}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}
