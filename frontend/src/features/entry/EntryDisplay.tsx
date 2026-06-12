import { useMemo } from "react";
import {
  Image as ImageIcon,
  Link2,
  ListChecks,
  ListOrdered,
  List,
  Code,
  Sigma,
  Quote,
  Hash,
} from "lucide-react";
import MarkdownViewer from "../../components/MarkdownViewer";
import { useTranslation } from "../../hooks/useTranslation";
import { getSmartSummary } from "../../utils/markdownUtils";

interface Props {
  content: string;
  tags?: string[];
  status: string;
  isTask?: boolean;
  // ✅ 新增：接收 entryType 以支持动态主题色 (task/idea/event)
  entryType?: string;
  forceCollapse?: boolean;
  disableOverflowCheck?: boolean;
  onDoubleClick?: () => void;
  onTaskToggle?: (newContent: string) => void;
  isTagClickable?: boolean;
  readOnly?: boolean;
}

export default function EntryDisplay({
  content,
  tags = [],
  status,
  isTask = false,
  entryType = "task", // ✅ 默认值为 task
  forceCollapse,
  disableOverflowCheck,
  onDoubleClick,
  onTaskToggle,
  isTagClickable = true,
  readOnly = false,
}: Props) {
  const { t } = useTranslation();

  // 1. 完成/取消状态样式
  const isCompletedTask = isTask && status === "completed";
  const isCancelled = status === "cancelled";
  const showDoneStyle = isCompletedTask || isCancelled;

  // 2. 摘要生成逻辑
  const summary = useMemo(() => {
    const result = getSmartSummary(content);
    let finalText = result.text;

    // 如果没有纯文本，给一个友好的占位符
    if (!finalText) {
      if (result.meta.hasImage) finalText = `[${t.common.image || "Image"}]`;
      else if (result.meta.hasCode) finalText = `[${t.common.code || "Code"}]`;
      else finalText = t.common.newEntry || "New Entry";
    }

    return {
      text: finalText,
      meta: result.meta,
    };
  }, [content, t]);

  // 3. 折叠模式 (显示摘要和图标)
  if (forceCollapse) {
    const iconClass = "opacity-40 shrink-0 text-base-content";
    const iconSize = 13;

    return (
      <div
        className={`text-sm truncate font-medium flex items-center gap-2 select-none h-6 transition-opacity duration-200 ${
          showDoneStyle
            ? "opacity-50 line-through decoration-base-content/20 text-base-content/40"
            : "text-base-content/80"
        }`}
      >
        {/* 各种小图标 */}
        {tags.length > 0 && <Hash size={iconSize} className={iconClass} />}
        {summary.meta.hasImage && (
          <ImageIcon size={iconSize} className={iconClass} />
        )}
        {summary.meta.hasLink && (
          <Link2 size={iconSize} className={iconClass} />
        )}
        {summary.meta.hasChecklist && (
          <ListChecks size={iconSize} className={iconClass} />
        )}
        {summary.meta.hasOrderedList && (
          <ListOrdered size={iconSize} className={iconClass} />
        )}
        {summary.meta.hasUnorderedList && (
          <List size={iconSize} className={iconClass} />
        )}
        {summary.meta.hasQuote && (
          <Quote size={iconSize} className={iconClass} />
        )}
        {summary.meta.hasCode && <Code size={iconSize} className={iconClass} />}
        {summary.meta.hasMath && (
          <Sigma size={iconSize} className={iconClass} />
        )}

        <span className="truncate">{summary.text}</span>
      </div>
    );
  }

  // 4. 正常展开模式 (显示完整 Markdown)
  return (
    <div className="select-text" onClick={(e) => e.stopPropagation()}>
      <MarkdownViewer
        content={content}
        tags={tags}
        // ✅ 关键修复：传递 entryType 给 MarkdownViewer
        entryType={entryType}
        // ✅ 关键修复：绝对不包含 "prose"，避免样式覆盖
        className={`w-full max-w-none transition-all duration-300 ${
          showDoneStyle
            ? "line-through opacity-50 text-base-content/50 decoration-base-content/30"
            : "text-base-content"
        }`}
        onDoubleClick={onDoubleClick}
        disableOverflowCheck={disableOverflowCheck}
        onTaskToggle={onTaskToggle}
        isTagClickable={isTagClickable}
        readOnly={readOnly || showDoneStyle}
      />
    </div>
  );
}
