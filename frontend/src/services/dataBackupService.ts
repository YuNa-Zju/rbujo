import { isTauri } from "@tauri-apps/api/core";
import pako from "pako";
import type { ImportResponse, StoredUpload, UploadBackup } from "./entryService";
import {
  attachmentMarkdownUrlFromStoredUpload,
  replaceAttachmentReferences,
} from "./attachmentService.ts";

// 文件头标识
const BACKUP_HEADER = "BUJO_SECURE_BACKUP_V1";
const BJK_FORMAT = "fun.yunazju.rbujo.bjk";
const BJK_CONTAINER_VERSION = 1;
const BJK_MANIFEST_PATH = "manifest.json";
const BJK_PAYLOAD_PATH = "data/backup.json.gz";
const ZIP_LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const MAX_BJK_ARCHIVE_BYTES = 256 * 1024 * 1024;
const MAX_BJK_PAYLOAD_BYTES = 256 * 1024 * 1024;

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

export interface BjkManifest {
  format: typeof BJK_FORMAT;
  container_version: typeof BJK_CONTAINER_VERSION;
  created_at: string;
  app: {
    name: "BuJo";
    identifier: "fun.yunazju.rbujo";
  };
  backup: {
    header: typeof BACKUP_HEADER;
    version: BackupObject["version"];
    timestamp: number;
    count: number;
    attachments_count: number;
  };
  payload: {
    path: typeof BJK_PAYLOAD_PATH;
    media_type: "application/json";
    compression: "gzip";
  };
  compatibility: {
    legacy_base64_gzip_import: true;
  };
}

interface ParsedBjkArchive {
  manifest: BjkManifest | null;
  backupObject: BackupObject;
}

export interface BackupImportResult {
  success: boolean;
  count: number;
  updated_count: number;
  insertedIds: string[];
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

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const sha256Pattern = /^[a-f0-9]{64}$/i;

const crc32Table = new Uint32Array(256);
for (let i = 0; i < crc32Table.length; i += 1) {
  let value = i;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  crc32Table[i] = value >>> 0;
}

const crc32 = (bytes: Uint8Array) => {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value = crc32Table[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
};

const concatBytes = (chunks: Uint8Array[]) => {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
};

const toUint8Array = (input: ArrayBuffer | Uint8Array | string) => {
  if (typeof input === "string") return textEncoder.encode(input);
  if (input instanceof Uint8Array) return input;
  return new Uint8Array(input);
};

const assertBjkSize = (size: number, label: string, max = MAX_BJK_ARCHIVE_BYTES) => {
  if (size > max) {
    throw new Error(`${label} is too large`);
  }
};

const inflateGzipToString = (bytes: Uint8Array, label: string) => {
  const inflater = new pako.Inflate({ to: "string", chunkSize: 64 * 1024 });
  let output = "";
  let outputBytes = 0;

  inflater.onData = (chunk: ArrayBuffer | Uint8Array | string) => {
    if (typeof chunk === "string") {
      outputBytes += textEncoder.encode(chunk).byteLength;
      assertBjkSize(outputBytes, label, MAX_BJK_PAYLOAD_BYTES);
      output += chunk;
      return;
    }

    const chunkBytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
    const chunkSize = chunkBytes.byteLength;
    outputBytes += chunkSize;
    assertBjkSize(outputBytes, label, MAX_BJK_PAYLOAD_BYTES);
    output += textDecoder.decode(chunkBytes);
  };

  inflater.push(bytes, true);
  if (inflater.err) {
    throw new Error(inflater.msg || `Invalid ${label}`);
  }

  return output;
};

const writeStoredZip = (entries: Array<{ name: string; data: Uint8Array }>) => {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    if (entry.data.byteLength > 0xffffffff) {
      throw new Error(`BJK entry is too large: ${entry.name}`);
    }
    const nameBytes = textEncoder.encode(entry.name);
    const checksum = crc32(entry.data);
    const localHeader = new Uint8Array(30 + nameBytes.byteLength);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, ZIP_LOCAL_FILE_HEADER_SIGNATURE, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 0, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, entry.data.byteLength, true);
    localView.setUint32(22, entry.data.byteLength, true);
    localView.setUint16(26, nameBytes.byteLength, true);
    localView.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);
    localParts.push(localHeader, entry.data);

    const centralHeader = new Uint8Array(46 + nameBytes.byteLength);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, ZIP_CENTRAL_DIRECTORY_SIGNATURE, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 0, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, entry.data.byteLength, true);
    centralView.setUint32(24, entry.data.byteLength, true);
    centralView.setUint16(28, nameBytes.byteLength, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);

    offset += localHeader.byteLength + entry.data.byteLength;
  }

  const centralDirectory = concatBytes(centralParts);
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralDirectory.byteLength, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true);

  return concatBytes([...localParts, centralDirectory, endRecord]);
};

const readZipEntries = (bytes: Uint8Array) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = new Map<string, Uint8Array>();
  let offset = 0;

  while (offset + 4 <= bytes.byteLength) {
    const signature = view.getUint32(offset, true);
    if (
      signature === ZIP_CENTRAL_DIRECTORY_SIGNATURE ||
      signature === ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE
    ) {
      break;
    }
    if (signature !== ZIP_LOCAL_FILE_HEADER_SIGNATURE) {
      throw new Error("Invalid BJK zip container");
    }

    const flags = view.getUint16(offset + 6, true);
    const method = view.getUint16(offset + 8, true);
    const checksum = view.getUint32(offset + 14, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const uncompressedSize = view.getUint32(offset + 22, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    if (flags & 0x08) {
      throw new Error("Unsupported BJK zip data descriptor");
    }

    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > bytes.byteLength) {
      throw new Error("Truncated BJK zip entry");
    }
    assertBjkSize(uncompressedSize, "BJK zip entry", MAX_BJK_PAYLOAD_BYTES);

    const name = textDecoder.decode(bytes.slice(nameStart, nameStart + nameLength));
    const compressed = bytes.slice(dataStart, dataEnd);
    if (method !== 0) {
      throw new Error(`Unsupported BJK zip compression method: ${method}`);
    }
    const data = compressed;
    if (data.byteLength !== uncompressedSize) {
      throw new Error(`Invalid BJK zip size for ${name}`);
    }
    if (crc32(data) !== checksum) {
      throw new Error(`Invalid BJK zip checksum for ${name}`);
    }
    entries.set(name, data);
    offset = dataEnd;
  }

  if (entries.size === 0) {
    throw new Error("Empty BJK zip container");
  }
  return entries;
};

const isZipContainer = (bytes: Uint8Array) =>
  bytes.length >= 4 &&
  bytes[0] === 0x50 &&
  bytes[1] === 0x4b &&
  bytes[2] === 0x03 &&
  bytes[3] === 0x04;

const buildBjkManifest = (
  backupObject: BackupObject,
  createdAt: Date,
): BjkManifest => ({
  format: BJK_FORMAT,
  container_version: BJK_CONTAINER_VERSION,
  created_at: createdAt.toISOString(),
  app: {
    name: "BuJo",
    identifier: "fun.yunazju.rbujo",
  },
  backup: {
    header: backupObject.header,
    version: backupObject.version,
    timestamp: backupObject.timestamp,
    count: backupObject.count,
    attachments_count: backupObject.attachments?.length ?? 0,
  },
  payload: {
    path: BJK_PAYLOAD_PATH,
    media_type: "application/json",
    compression: "gzip",
  },
  compatibility: {
    legacy_base64_gzip_import: true,
  },
});

const gzipBackupObject = (backupObject: BackupObject) =>
  pako.gzip(JSON.stringify(backupObject));

export const buildBjkArchive = (
  backupObject: BackupObject,
  createdAt = new Date(),
) => {
  const manifest = buildBjkManifest(backupObject, createdAt);
  const manifestBytes = textEncoder.encode(
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  const payloadBytes = gzipBackupObject(backupObject);

  return writeStoredZip([
    { name: BJK_MANIFEST_PATH, data: manifestBytes },
    { name: BJK_PAYLOAD_PATH, data: payloadBytes },
  ]);
};

const gzipUncompressedSize = (bytes: Uint8Array) => {
  if (bytes.byteLength < 4) return 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset + bytes.byteLength - 4, 4);
  return view.getUint32(0, true);
};

const parseGzippedBackupObject = (bytes: Uint8Array): BackupObject => {
  assertBjkSize(
    gzipUncompressedSize(bytes),
    "BJK backup payload",
    MAX_BJK_PAYLOAD_BYTES,
  );
  const text = inflateGzipToString(bytes, "BJK backup payload");
  return JSON.parse(text);
};

const parseLegacyBackupText = (text: string): BackupObject => {
  const binaryString = atob(text.trim());
  const compressed = Uint8Array.from(binaryString, (c) => c.charCodeAt(0));
  return parseGzippedBackupObject(compressed);
};

export const parseBjkArchive = (
  input: ArrayBuffer | Uint8Array | string,
): ParsedBjkArchive => {
  const bytes = toUint8Array(input);
  assertBjkSize(bytes.byteLength, "BJK archive");

  if (!isZipContainer(bytes)) {
    return {
      manifest: null,
      backupObject: parseLegacyBackupText(textDecoder.decode(bytes)),
    };
  }

  const entries = readZipEntries(bytes);
  const manifestBytes = entries.get(BJK_MANIFEST_PATH);
  if (!manifestBytes) {
    throw new Error("Invalid BJK package: missing manifest.json");
  }

  const manifest = JSON.parse(textDecoder.decode(manifestBytes)) as BjkManifest;
  if (manifest.format !== BJK_FORMAT) {
    throw new Error("Invalid BJK package format");
  }
  if (manifest.container_version !== BJK_CONTAINER_VERSION) {
    throw new Error(
      `Unsupported BJK container version: ${manifest.container_version}`,
    );
  }

  const payloadPath = manifest.payload?.path || BJK_PAYLOAD_PATH;
  const payloadBytes = entries.get(payloadPath);
  if (!payloadBytes) {
    throw new Error(`Invalid BJK package: missing ${payloadPath}`);
  }

  return {
    manifest,
    backupObject: parseGzippedBackupObject(payloadBytes),
  };
};

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
    const restoredMarkdownUrl = attachmentMarkdownUrlFromStoredUpload(restored);
    replacements.set(attachment.relative_path, restoredMarkdownUrl);
    replacements.set(`uploads/${filename}`, restoredMarkdownUrl);
    replacements.set(`attachments/${filename}`, restoredMarkdownUrl);
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

export const importBjkArchive = async (
  input: ArrayBuffer | Uint8Array | string,
): Promise<BackupImportResult> => {
  const bytes = toUint8Array(input);
  if (isTauri()) {
    const entryService = await loadEntryService();
    const response = await entryService.importBjkArchive(bytes);
    return {
      success: true,
      count: response.inserted_count,
      updated_count: response.updated_count,
      insertedIds: response.inserted_ids || [],
    };
  }

  const { backupObject } = parseBjkArchive(bytes);
  const response: ImportResponse = await importBackupObject(backupObject);

  return {
    success: true,
    count: response.inserted_count,
    updated_count: response.updated_count,
    insertedIds: response.inserted_ids || [],
  };
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
      const archive = buildBjkArchive(backupObj);
      const blob = new Blob([archive], { type: "application/zip" });
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

  importBjkArchive,

  /**
   * 📥 导入流程
   * ✅ 修复：正确解构后端返回的详细对象
   */
  async importData(file: File) {
    // 定义 Promise 返回类型，确保 UI 能拿到正确的 count 和 IDs
    return new Promise<BackupImportResult>((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = async (event) => {
        try {
          const fileContent = event.target?.result;
          if (!fileContent) throw new Error("File is empty");
          resolve(await importBjkArchive(fileContent as ArrayBuffer));
        } catch (e) {
          console.error("Backup Import Failed:", e);
          reject(e);
        }
      };

      reader.onerror = (e) => reject(e);
      reader.readAsArrayBuffer(file);
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
