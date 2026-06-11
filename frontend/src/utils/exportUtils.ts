import api from "../lib/api";

/**
 * 导出当前用户的所有数据为 Markdown 格式
 */
export const exportToMarkdown = async () => {
  try {
    const response = await api.get("/export/markdown", {
      responseType: "blob",
    });

    // 创建 Blob URL
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement("a");
    link.href = url;

    // 设置文件名：bujo_backup_YYYY-MM-DD.md
    const dateStr = new Date().toISOString().slice(0, 10);
    link.setAttribute("download", `bujo_backup_${dateStr}.md`);

    // 触发下载
    document.body.appendChild(link);
    link.click();

    // 清理
    link.remove();
    window.URL.revokeObjectURL(url);

    return true;
  } catch (e) {
    console.error("Export failed:", e);
    alert("Export failed. Please try again.");
    return false;
  }
};
