import pako from "pako";
import type { ImportResponse, StoredUpload, UploadBackup } from "./entryService";
import { replaceAttachmentReferences } from "./attachmentService.ts";

// 文件头标识
const BACKUP_HEADER = "BUJO_SECURE_BACKUP_V1";

interface PortableAttachment {
  relative_path: string;
  filename: string;
  sha256: string;
  bytes: number[];
}

interface BackupObject {
  header: typeof BACKUP_HEADER;
  version: 2;
  timestamp: number;
  count: number;
  data: any[];
  attachments?: PortableAttachment[];
}

interface BackupImportServices {
  restoreUpload: (upload: {
    filename: string;
    bytes: number[] | Uint8Array;
  }) => Promise<StoredUpload>;
  bulkImport: (entries: any[]) => Promise<ImportResponse>;
}

const filenameFromPath = (relativePath: string) =>
  relativePath.split("/").filter(Boolean).pop() || "attachment";

const loadEntryService = async () => (await import("./entryService")).entryService;

const sha256Pattern = /^[a-f0-9]{64}$/i;

const sha256Hex = async (bytes: Uint8Array) => {
  if (!globalThis.crypto?.subtle) {
    throw new Error("SHA-256 is not available in this environment");
  }
  const digestInput = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(digestInput).set(bytes);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", digestInput);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
};

const validateAttachmentHash = async (
  attachment: PortableAttachment,
  bytes: Uint8Array,
) => {
  if (!attachment.sha256) return;
  if (!sha256Pattern.test(attachment.sha256)) {
    throw new Error(`Invalid attachment hash for ${attachment.filename}`);
  }
  const actual = await sha256Hex(bytes);
  if (actual !== attachment.sha256.toLowerCase()) {
    throw new Error(`Attachment hash mismatch for ${attachment.filename}`);
  }
};

export const buildBackupObject = (
  entries: any[],
  uploads: UploadBackup[] = [],
  timestamp = Date.now(),
): BackupObject => ({
  header: BACKUP_HEADER,
  version: 2,
  timestamp,
  count: entries.length,
  data: entries,
  attachments: uploads.map((upload) => ({
    relative_path: upload.relative_path,
    filename: upload.filename || filenameFromPath(upload.relative_path),
    sha256: upload.sha256,
    bytes: Array.from(upload.bytes),
  })),
});

export const importBackupObject = async (
  backupObject: any,
  services?: BackupImportServices,
) => {
  if (backupObject.header !== BACKUP_HEADER) {
    throw new Error("Invalid backup file format (Header mismatch)");
  }
  if (!Array.isArray(backupObject.data)) {
    throw new Error("Invalid data format: 'data' is not an array");
  }

  const entryService = services ?? (await loadEntryService());
  const replacements = new Map<string, string>();
  const attachments: PortableAttachment[] = Array.isArray(backupObject.attachments)
    ? backupObject.attachments
    : [];

  for (const attachment of attachments) {
    if (!attachment || !Array.isArray(attachment.bytes)) continue;
    const filename = attachment.filename || filenameFromPath(attachment.relative_path);
    const bytes = new Uint8Array(attachment.bytes);
    await validateAttachmentHash(attachment, bytes);
    const restored = await entryService.restoreUpload({
      filename,
      bytes,
    });
    replacements.set(attachment.relative_path, restored.url);
    replacements.set(`uploads/${filename}`, restored.url);
  }

  const entries = backupObject.data.map((entry: any) => {
    if (typeof entry?.content !== "string" || replacements.size === 0) {
      return entry;
    }
    return {
      ...entry,
      content: replaceAttachmentReferences(entry.content, replacements),
    };
  });

  return entryService.bulkImport(entries);
};

export const dataBackupService = {
  /**
   * 📤 导出流程
   */
  async exportData() {
    try {
      const entryService = await loadEntryService();
      const entries = await entryService.getAllForBackup();
      const uploads = await entryService.listUploads();
      const backupObj = buildBackupObject(entries, uploads);

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

          // 2. 校验 + 恢复附件 + 导入条目
          const response: ImportResponse = await importBackupObject(backupObject);

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
    const entryService = await loadEntryService();
    return entryService.batchDelete(ids);
  },
};
