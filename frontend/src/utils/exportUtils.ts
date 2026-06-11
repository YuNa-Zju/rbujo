import { entryService } from "../services/entryService";

const saveBlob = (blob: Blob, filename: string) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

/**
 * 导出当前用户的所有数据为 Markdown 格式
 */
export const exportToMarkdown = async () => {
  try {
    const entries = await entryService.getAllForBackup();
    const markdown = entries
      .map((entry: any) => {
        const title = entry.target_date || entry.target_month || "Future";
        const archived = entry.archived_at ? " archived" : "";
        const tags =
          Array.isArray(entry.tags) && entry.tags.length > 0
            ? `Tags: ${entry.tags.map((tag: string) => `#${tag}`).join(" ")}\n\n`
            : "";
        return `## ${title}${archived}\n\n${tags}${entry.content || ""}`;
      })
      .join("\n\n");
    const dateStr = new Date().toISOString().slice(0, 10);
    saveBlob(
      new Blob([markdown], { type: "text/markdown;charset=utf-8" }),
      `bujo_backup_${dateStr}.md`,
    );
    return true;
  } catch (e) {
    console.error("Export failed:", e);
    alert("Export failed. Please try again.");
    return false;
  }
};
