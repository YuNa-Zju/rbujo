import pako from "pako";
import { entryService, type ImportResponse } from "./entryService";

// 文件头标识
const BACKUP_HEADER = "BUJO_SECURE_BACKUP_V1";

export const dataBackupService = {
  /**
   * 📤 导出流程
   */
  async exportData() {
    try {
      const entries = await entryService.getAllForBackup();

      const backupObj = {
        header: BACKUP_HEADER,
        timestamp: Date.now(),
        count: entries.length,
        data: entries,
      };

      const jsonStr = JSON.stringify(backupObj);
      const compressed = pako.gzip(jsonStr);

      // 转 Base64
      const base64 = btoa(
        Array.from(compressed, (byte) => String.fromCharCode(byte)).join(""),
      );

      const blob = new Blob([base64], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bujo_backup_${new Date().toISOString().slice(0, 10)}.bjk`;
      document.body.appendChild(a);
      a.click();

      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      return { success: true, count: entries.length };
    } catch (e) {
      console.error("Backup Export Failed:", e);
      throw e;
    }
  },

  /**
   * 📥 导入流程
   * ✅ 修复：正确解构后端返回的详细对象
   */
  async importData(file: File) {
    // 定义 Promise 返回类型，确保 UI 能拿到正确的 count 和 IDs
    return new Promise<{
      success: boolean;
      count: number; // 这里的 count 指新增数量
      updated_count: number; // 更新数量
      insertedIds: string[]; // 撤回用的 ID 列表
    }>((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = async (event) => {
        try {
          const base64Content = event.target?.result as string;
          if (!base64Content) throw new Error("File is empty");

          // 1. 解压
          const binaryString = atob(base64Content);
          const charData = Uint8Array.from(binaryString, (c) =>
            c.charCodeAt(0),
          );
          const decompressedStr = pako.ungzip(charData, { to: "string" });
          const backupObject = JSON.parse(decompressedStr);

          // 2. 校验
          if (backupObject.header !== BACKUP_HEADER) {
            throw new Error("Invalid backup file format (Header mismatch)");
          }
          if (!Array.isArray(backupObject.data)) {
            throw new Error("Invalid data format: 'data' is not an array");
          }

          // 3. 调用后端
          // ✅ 关键修复：API 返回的是对象 { inserted_ids, inserted_count, updated_count ... }
          const response: ImportResponse = await entryService.bulkImport(
            backupObject.data,
          );

          // 4. 返回给前端 UI
          resolve({
            success: true,
            // UI 显示 "Restored X items" 时，通常指新增成功的数量，或者你可以相加
            count: response.inserted_count,
            updated_count: response.updated_count,
            // ✅ 必须从 response.inserted_ids 取值，这里才是纯净的 ID 数组
            insertedIds: response.inserted_ids || [],
          });
        } catch (e) {
          console.error("Backup Import Failed:", e);
          reject(e);
        }
      };

      reader.onerror = (e) => reject(e);
      reader.readAsText(file);
    });
  },

  /**
   * ↩️ 撤回导入
   */
  async undoImport(ids: string[]) {
    if (!ids || ids.length === 0) return;
    return entryService.batchDelete(ids);
  },
};
