import { useState, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkBreaks from "remark-breaks";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { ChevronDown, ChevronUp } from "lucide-react";
import { motion } from "framer-motion";
import { useTranslation } from "../hooks/useTranslation";
import ImagePreview from "./ImagePreview";
import CodeBlock from "./markdown/CodeBlock";
import { uiEvents } from "../lib/uiEvents";
import { useReadOnly } from "../context/ReadOnlyContext";
import { useAppTheme } from "../hooks/useAppTheme";
import { extractUploadRelativePath } from "../services/attachmentService";
import { entryService } from "../services/entryService";

// ✅ 引入拆分后的文件 (假设你已经拆分了，如果没有请把上面的 CUSTOM_MARKDOWN_STYLES 复制回来)
import { CUSTOM_MARKDOWN_STYLES } from "./markdown/markdownStyles";
import { TagPill } from "./markdown/TagPill";

interface Props {
  content: string;
  tags?: string[];
  className?: string;
  onDoubleClick?: () => void;
  onTaskToggle?: (newContent: string) => void;
  disableOverflowCheck?: boolean;
  isTagClickable?: boolean;
  entryType?: string;
  readOnly?: boolean;
}

// 辅助函数：查找真正的滚动容器
const getScrollParent = (node: HTMLElement | null): HTMLElement | Window => {
  if (!node) return window;
  const style = window.getComputedStyle(node);
  const overflowY = style.overflowY;
  const isScrollable =
    (overflowY === "auto" || overflowY === "scroll") &&
    node.scrollHeight > node.clientHeight;
  if (isScrollable) return node;
  return getScrollParent(node.parentElement);
};

// 通用平滑滚动函数
const smoothScrollTo = (
  target: HTMLElement | Window,
  targetY: number,
  duration: number,
  callback: () => void,
) => {
  let startY = 0;
  if (target === window) {
    startY = window.scrollY || document.documentElement.scrollTop;
  } else {
    startY = (target as HTMLElement).scrollTop;
  }
  const diff = targetY - startY;
  const startTime = performance.now();
  if (Math.abs(diff) < 5) {
    if (target === window) window.scrollTo(0, targetY);
    else (target as HTMLElement).scrollTop = targetY;
    callback();
    return;
  }
  const step = (currentTime: number) => {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    const nextY = startY + diff * ease;
    if (target === window) window.scrollTo(0, nextY);
    else (target as HTMLElement).scrollTop = nextY;
    if (progress < 1) requestAnimationFrame(step);
    else {
      if (target === window) window.scrollTo(0, targetY);
      else (target as HTMLElement).scrollTop = targetY;
      callback();
    }
  };
  requestAnimationFrame(step);
};

const transformMarkdownUrl = (value: string) => {
  const trimmed = value.trim();
  try {
    const parsed = new URL(trimmed);
    const isTauriAsset =
      parsed.protocol === "asset:" ||
      (["http:", "https:"].includes(parsed.protocol) &&
        parsed.hostname === "asset.localhost");
    if (isTauriAsset) {
      return value;
    }
  } catch {
    // Relative URLs and malformed protocols go through react-markdown's default filter.
  }
  return defaultUrlTransform(value);
};

export default function MarkdownViewer({
  content,
  tags = [],
  className = "",
  onDoubleClick,
  onTaskToggle,
  disableOverflowCheck,
  isTagClickable = true,
  entryType = "task",
  readOnly = false,
}: Props) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [hasMeasured, setHasMeasured] = useState(false);

  const { isDark } = useAppTheme(); // 仅用于按钮样式的微调

  const contextReadOnly = useReadOnly();
  const effectiveReadOnly = readOnly || contextReadOnly;

  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const isTogglingRef = useRef(false);

  // 动态主题色
  const themeStyles = (() => {
    const colorMap: Record<
      string,
      { text: string; bg: string; border: string }
    > = {
      task: {
        text: "#6366f1",
        bg: "rgba(99, 102, 241, 0.08)",
        border: "#c7d2fe",
      },
      idea: {
        text: "#d97706",
        bg: "rgba(245, 158, 11, 0.08)",
        border: "#fde68a",
      },
      event: {
        text: "#0ea5e9",
        bg: "rgba(14, 165, 233, 0.08)",
        border: "#bae6fd",
      },
    };
    const c = colorMap[entryType] || colorMap.task;
    return {
      "--theme-text": c.text,
      "--theme-bg": c.bg,
      "--theme-border": c.border,
      "--fallback-bc": "currentColor",
    } as React.CSSProperties;
  })();

  useLayoutEffect(() => {
    if (disableOverflowCheck) {
      setHasMeasured(true);
      return;
    }
    if (containerRef.current) {
      const isLong = containerRef.current.scrollHeight > 200;
      setIsOverflowing(isLong);
      requestAnimationFrame(() => {
        setHasMeasured(true);
      });
    }
  }, [content, disableOverflowCheck]);

  const handleCheckboxChange = (index: number) => {
    if (!onTaskToggle) return;
    isTogglingRef.current = true;
    const lines = content.split("\n");
    let checkboxCount = 0;
    const newLines = lines.map((line) => {
      const match = line.match(/^(\s*[-*+]\s+)\[([ xX])\](.*)$/);
      if (match) {
        if (checkboxCount === index) {
          const prefix = match[1];
          const isChecked = match[2] !== " ";
          const suffix = match[3];
          checkboxCount++;
          return `${prefix}[${isChecked ? " " : "x"}]${suffix}`;
        }
        checkboxCount++;
      }
      return line;
    });
    onTaskToggle(newLines.join("\n"));
  };

  const handleTagClick = (tag: string) => {
    uiEvents.emit("OPEN_TAG_SEARCH", tag);
  };

  const handleAttachmentOpen = async (
    e: React.MouseEvent<HTMLAnchorElement>,
    href?: string,
  ) => {
    const relativePath = extractUploadRelativePath(href);
    if (!relativePath) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      await entryService.openUpload(relativePath);
    } catch (error) {
      console.error("Failed to open attachment", error);
    }
  };

  const handleCollapse = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect();
      const scrollParent = getScrollParent(wrapperRef.current);
      let scrollTop = 0;
      let offsetTop = 0;
      if (scrollParent === window) {
        scrollTop = window.scrollY || document.documentElement.scrollTop;
        offsetTop = rect.top;
      } else {
        const el = scrollParent as HTMLElement;
        const parentRect = el.getBoundingClientRect();
        scrollTop = el.scrollTop;
        offsetTop = rect.top - parentRect.top;
      }
      if (offsetTop < 100) {
        const targetScrollTop = scrollTop + offsetTop - 120;
        smoothScrollTo(scrollParent, targetScrollTop, 400, () =>
          setExpanded(false),
        );
      } else {
        setExpanded(false);
      }
    } else {
      setExpanded(false);
    }
  };

  const heightState = disableOverflowCheck
    ? "auto"
    : !isOverflowing || expanded
      ? "auto"
      : 200;

  const showMask = isOverflowing && !disableOverflowCheck;

  return (
    <>
      <style>{CUSTOM_MARKDOWN_STYLES}</style>

      {/* 这个 div 是相对定位的容器，用于放置内容和绝对定位的按钮 */}
      <div
        className="relative group w-full bg-base-100/0"
        style={{ ...themeStyles, isolation: "isolate" }}
      >
        <motion.div
          ref={wrapperRef}
          initial={false}
          animate={{ height: heightState }}
          transition={{
            type: "tween",
            stiffness: 260,
            damping: 25,
            duration: hasMeasured ? undefined : 0,
          }}
          // ✅ 修复 1：将 mask-image 应用到这里（Wrapper）
          // Wrapper 的高度是固定的 200px，所以 mask 会正确地从 0 渐变到 200px
          style={{
            position: "relative",
            zIndex: 0,
            maskImage:
              showMask && !expanded
                ? "linear-gradient(to bottom, black 50%, transparent 100%)"
                : "none",
            WebkitMaskImage:
              showMask && !expanded
                ? "linear-gradient(to bottom, black 50%, transparent 100%)"
                : "none",
          }}
          className={`w-full overflow-hidden ${expanded ? "" : "rounded-b-2xl"}`}
          onDoubleClick={onDoubleClick}
        >
          <div
            ref={containerRef}
            className={`prose-custom-scale w-full [&>*:last-child]:mb-0 ${className}`}
          >
            {tags.length > 0 && (
              <div className="not-prose mb-3 flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <TagPill
                    key={tag}
                    tag={tag}
                    onClick={handleTagClick}
                    clickable={isTagClickable}
                    entryType={entryType}
                  />
                ))}
              </div>
            )}
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
              rehypePlugins={[rehypeKatex]}
              urlTransform={transformMarkdownUrl}
              components={{
                pre: ({ children }) => <>{children}</>,
                code: ({
                  node,
                  inline,
                  className,
                  children,
                  ...props
                }: any) => {
                  if (inline) return <code {...props}>{children}</code>;
                  return (
                    <CodeBlock
                      inline={inline}
                      className={className}
                      entryType={entryType}
                      {...props}
                    >
                      {children}
                    </CodeBlock>
                  );
                },
                h1: ({ children }) => <h1>{children}</h1>,
                h2: ({ children }) => <h2>{children}</h2>,
                h3: ({ children }) => <h3>{children}</h3>,
                h4: ({ children }) => <h4>{children}</h4>,
                h5: ({ children }) => <h5>{children}</h5>,
                h6: ({ children }) => <h6>{children}</h6>,
                img: ({ src, alt }) => (
                  <img
                    src={src}
                    alt={alt}
                    className="rounded-xl max-h-72 object-contain cursor-zoom-in my-3 transition-all relative z-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewImage(src || null);
                    }}
                  />
                ),
                blockquote: ({ children }) => (
                  <blockquote>{children}</blockquote>
                ),
                a: ({ href, children }) => (
                  <a href={href} onClick={(e) => handleAttachmentOpen(e, href)}>
                    {children}
                  </a>
                ),
                ul: ({ children, className }) => {
                  const isTaskList = className?.includes("contains-task-list");
                  return (
                    <ul className={isTaskList ? "contains-task-list" : ""}>
                      {children}
                    </ul>
                  );
                },
                ol: ({ children }) => <ol>{children}</ol>,
                li: ({ children, className, ...rest }: any) => {
                  const isTaskItem = className?.includes("task-list-item");
                  return (
                    <li
                      {...rest}
                      className={isTaskItem ? "task-list-item" : ""}
                    >
                      {children}
                    </li>
                  );
                },
                input: (props) => {
                  if (props.type === "checkbox") {
                    return (
                      <input
                        type="checkbox"
                        checked={props.checked}
                        disabled={effectiveReadOnly}
                        onChange={() => {}}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (effectiveReadOnly) return;
                          const allCheckboxes =
                            containerRef.current?.querySelectorAll(
                              'input[type="checkbox"]',
                            );
                          if (allCheckboxes) {
                            const idx = Array.from(allCheckboxes).indexOf(
                              e.currentTarget,
                            );
                            if (idx !== -1) handleCheckboxChange(idx);
                          }
                        }}
                        className="shrink-0"
                      />
                    );
                  }
                  return <input {...props} />;
                },
                p: ({ children }) => (
                  <p className="mb-6 last:mb-0 relative">{children}</p>
                ),
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        </motion.div>

        {/* ✅ 修复 2：将按钮移出 motion.div，放到外层容器中
            作为兄弟元素，它不会被 motion.div 上的 mask-image 影响，保持完全不透明。
        */}
        {showMask && !expanded && (
          <div className="absolute bottom-0 left-0 right-0 h-12 flex justify-center items-end pb-1 z-20 pointer-events-none">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(true);
              }}
              className={`pointer-events-auto btn btn-sm h-8 rounded-full px-5 shadow-sm border border-transparent hover:scale-105 transition-all
                ${
                  isDark
                    ? "bg-base-200/60 hover:bg-base-200/80"
                    : "bg-base-100/60 hover:bg-base-100/80"
                }
              `}
              style={{
                color: "var(--theme-text)",
                borderColor: "var(--theme-border)",
                backdropFilter: "blur(4px)",
              }}
            >
              {t.common.showMore} <ChevronDown size={14} />
            </button>
          </div>
        )}

        {expanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-center mt-4"
          >
            <button
              onClick={handleCollapse}
              className="btn btn-sm h-8 rounded-full px-4 btn-ghost bg-base-200/50 hover:bg-base-200 transition-all"
              style={{ color: "var(--theme-text)" }}
            >
              {t.common.showLess} <ChevronUp size={12} />
            </button>
          </motion.div>
        )}
      </div>

      {previewImage &&
        createPortal(
          <ImagePreview
            src={previewImage}
            onClose={() => setPreviewImage(null)}
          />,
          document.body,
        )}
    </>
  );
}
