export interface EntrySummary {
  text: string;
  meta: {
    hasImage: boolean;
    hasLink: boolean;
    hasChecklist: boolean;
    hasOrderedList: boolean; // 有序列表 1.
    hasUnorderedList: boolean; // 无序列表 -
    hasCode: boolean; // 代码块或行内代码
    hasMath: boolean; // 公式
    hasQuote: boolean; // 引用
    hasTag: boolean; // 标签
  };
}

export const getSmartSummary = (markdown: string): EntrySummary => {
  // 默认返回空状态
  const defaultMeta = {
    hasImage: false,
    hasLink: false,
    hasChecklist: false,
    hasOrderedList: false,
    hasUnorderedList: false,
    hasCode: false,
    hasMath: false,
    hasQuote: false,
    hasTag: false,
  };

  if (!markdown) return { text: "", meta: defaultMeta };

  // --- 1. 全局元数据扫描 (用于显示图标) ---
  // 我们检测全文是否存在这些特征，不仅仅是第一行
  const meta = {
    hasImage: /!\[.*?\]\(.*?\)/.test(markdown),
    // 链接要排除图片语法
    hasLink:
      /\[.*?\]\(.*?\)/.test(markdown) && !/!\[.*?\]\(.*?\)/.test(markdown),
    // 宽松匹配 checklist (- [ ])
    hasChecklist: /^\s*[-*+]\s+\[[xX ]\]/m.test(markdown),
    // 匹配有序列表 (1. )
    hasOrderedList: /^\s*\d+\.\s/m.test(markdown),
    // 匹配无序列表 (- , * , + )，但在 checklist 之外
    hasUnorderedList: /^\s*[-*+]\s+(?!\[)/m.test(markdown),
    // 匹配代码块 (```) 或 行内代码 (`)
    hasCode: /`/.test(markdown),
    // 匹配公式 ($$) 或 ($)
    hasMath: /\$/.test(markdown),
    // 匹配引用 (>)
    hasQuote: /^\s*>/m.test(markdown),
    // 匹配标签 (行首的 #Tag)
    hasTag: /(^|\n)\s*#[^\s#]+/.test(markdown),
  };

  // --- 2. 提取第一行有效文本 ---
  const lines = markdown.split("\n");
  let summaryText = "";

  for (let line of lines) {
    let text = line.trim();

    // 2.1 跳过纯分割线、纯代码块标记
    if (/^[-*_]{3,}$/.test(text)) continue;
    if (/^```/.test(text)) continue;
    if (!text) continue;

    // 2.2 剥离行首标签 (Priority High)
    // 逻辑：匹配行首连续的 #Tag1 #Tag2，并将它们移除，只保留后面的内容
    // 如果一行全是标签，移除后为空，循环会继续找下一行
    if (text.startsWith("#")) {
      // 移除行首的所有标签 (例如 "#Work #Todo 开会" -> "开会")
      text = text.replace(/^(\s*#[^\s#]+\s*)+/, "").trim();
      // 如果这一行只有标签，处理完是空字符串，continue 找下一行
      if (!text) continue;
    }

    // 2.3 剥离 Markdown 结构符号 (标题、引用、列表)
    text = text
      // 移除 Checklist 标记 (- [ ] / - [x])
      .replace(/^\s*[-*+]\s+\[([xX ])\]\s+/, "")
      // 移除 Markdown 标题 (# Header)
      .replace(/^#+\s+/, "")
      // 移除 引用 (>)
      .replace(/^>\s+/, "")
      // 移除 有序列表 (1. )
      .replace(/^\d+\.\s+/, "")
      // 移除 无序列表 (- )
      .replace(/^[-*+]\s+/, "");

    // 2.4 内容清洗 (变为纯文本)

    // 图片: ![Alt](url) -> [图片] Alt 或 [图片]
    text = text.replace(/!\[(.*?)\]\(.*?\)/g, (_, alt) =>
      alt ? `[图片] ${alt}` : "[图片]",
    );

    // 链接: [Text](url) -> Text
    text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

    // 公式: $$...$$ 或 $...$ -> 去掉 $ 符号，保留内容 (或者你可以选择直接替换为 [公式])
    // 这里选择保留内容但去除分隔符，让它读起来像文本
    text = text.replace(/\$\$?([^$]+)\$\$?/g, "$1");

    // 代码: `code` -> code
    text = text.replace(/`([^`]+)`/g, "$1");

    // 粗体/斜体/删除线: **Text** -> Text
    text = text.replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, "$1");

    // 2.5 最终清理不可见字符
    // eslint-disable-next-line no-control-regex
    text = text.replace(/[\u0000-\u001F\u007F-\u009F\u200B]/g, "").trim();

    if (text) {
      summaryText = text;
      break; // 找到第一行有效文本，结束循环
    }
  }

  // 兜底：如果全是图片或空行，给一个默认提示
  if (!summaryText && meta.hasImage) summaryText = "[图片]";
  if (!summaryText && meta.hasCode) summaryText = "[代码]";
  if (!summaryText) summaryText = "新条目";

  return {
    text: summaryText,
    meta,
  };
};
