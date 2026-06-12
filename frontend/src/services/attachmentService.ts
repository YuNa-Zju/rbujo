import type { StoredUpload } from "./entryService";

export type AttachmentUploadMode = "original" | "compressed";

export interface AttachmentMarkdownItem {
  name: string;
  type?: string;
  url: string;
}

export interface UploadedAttachment {
  originalFile: File;
  uploadFile: File;
  stored: StoredUpload;
}

export interface AttachmentDropPoint {
  x: number;
  y: number;
}

const COMPRESSIBLE_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);
const IMAGE_EXTENSION_PATTERN = /\.(avif|bmp|gif|heic|heif|jpe?g|png|svg|webp)$/i;
const COMPRESSIBLE_IMAGE_EXTENSION_PATTERN = /\.(jpe?g|png|webp)$/i;

const markdownLabel = (name: string) =>
  name.replace(/[\]\r\n]+/g, " ").trim() || "attachment";

const filenameWithoutExtension = (name: string) =>
  name.replace(/\.[^.]+$/, "") || "image";

const withExtension = (name: string, extension: string) =>
  `${filenameWithoutExtension(name)}.${extension.replace(/^\./, "")}`;

export const filenameFromPath = (path: string) => {
  const normalized = path.replace(/\\/g, "/");
  return normalized.split("/").filter(Boolean).pop() || "attachment";
};

export const isImageFileType = (type?: string, name?: string) =>
  (typeof type === "string" && type.startsWith("image/")) ||
  (typeof name === "string" && IMAGE_EXTENSION_PATTERN.test(name));

export const isCompressibleImageFile = (file: File) =>
  COMPRESSIBLE_IMAGE_TYPES.has(file.type.toLowerCase()) ||
  COMPRESSIBLE_IMAGE_EXTENSION_PATTERN.test(file.name);

export const resolveAttachmentUploadMode = (
  files: Array<File>,
  requestedMode: AttachmentUploadMode,
): AttachmentUploadMode => {
  if (
    requestedMode === "compressed" &&
    files.some((file) => isCompressibleImageFile(file))
  ) {
    return "compressed";
  }
  return "original";
};

export const buildAttachmentMarkdown = (items: AttachmentMarkdownItem[]) =>
  items
    .map((item) => {
      const label = markdownLabel(item.name);
      return isImageFileType(item.type, item.name)
        ? `![${label}](${item.url})`
        : `[${label}](${item.url})`;
    })
    .join("\n")
    .concat(items.length > 0 ? "\n" : "");

export const insertMarkdownAtSelection = (
  currentText: string,
  selectionStart: number,
  selectionEnd: number,
  markdown: string,
) => {
  if (!markdown) {
    return {
      text: currentText,
      cursor: selectionStart,
    };
  }

  const startsLine = selectionStart === 0 || currentText[selectionStart - 1] === "\n";
  const endsLine =
    selectionEnd >= currentText.length || currentText[selectionEnd] === "\n";
  const insertion = `${startsLine ? "" : "\n"}${markdown.trimEnd()}\n${
    endsLine ? "" : "\n"
  }`;
  return {
    text:
      currentText.slice(0, selectionStart) +
      insertion +
      currentText.slice(selectionEnd),
    cursor: selectionStart + insertion.length,
  };
};

export const isPointInsideElement = (
  point: AttachmentDropPoint,
  element: Pick<Element, "getBoundingClientRect"> | null,
) => {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  return (
    point.x >= rect.left &&
    point.x <= rect.right &&
    point.y >= rect.top &&
    point.y <= rect.bottom
  );
};

const normalizeScaleFactor = (scaleFactor: number) =>
  Number.isFinite(scaleFactor) && scaleFactor > 0 ? scaleFactor : 1;

export const physicalPointToCssPoint = (
  point: AttachmentDropPoint,
  scaleFactor: number,
): AttachmentDropPoint => {
  const scale = normalizeScaleFactor(scaleFactor);
  return {
    x: point.x / scale,
    y: point.y / scale,
  };
};

export const isPhysicalPointInsideElement = (
  point: AttachmentDropPoint,
  element: Pick<Element, "getBoundingClientRect"> | null,
  scaleFactor: number,
) => isPointInsideElement(physicalPointToCssPoint(point, scaleFactor), element);

export interface TauriAttachmentDropPayload {
  type: string;
  paths: string[];
  position: AttachmentDropPoint | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const pointFromUnknown = (value: unknown): AttachmentDropPoint | null => {
  if (!isRecord(value)) return null;
  const { x, y } = value;
  return typeof x === "number" && typeof y === "number" ? { x, y } : null;
};

export const normalizeTauriAttachmentDropPayload = (
  value: unknown,
): TauriAttachmentDropPayload | null => {
  const payload =
    isRecord(value) && isRecord(value.payload) && typeof value.type !== "string"
      ? value.payload
      : value;
  if (!isRecord(payload) || typeof payload.type !== "string") return null;

  return {
    type: payload.type,
    paths: Array.isArray(payload.paths)
      ? payload.paths.filter((path): path is string => typeof path === "string")
      : [],
    position: pointFromUnknown(payload.position),
  };
};

type DropTargetElement =
  | (Pick<Element, "getBoundingClientRect"> & {
      contains?: Element["contains"];
    })
  | null;

const hasActiveElement = (
  element: DropTargetElement,
  activeElement: unknown,
) =>
  Boolean(
      element &&
      activeElement &&
      typeof element.contains === "function" &&
      element.contains(activeElement as Node),
  );

export const shouldAcceptTauriAttachmentDrop = (
  payload: unknown,
  element: DropTargetElement,
  scaleFactor: number,
  activeElement: unknown = null,
) => {
  const normalized = normalizeTauriAttachmentDropPayload(payload);
  if (!normalized || normalized.type !== "drop" || normalized.paths.length === 0) {
    return [];
  }

  if (!normalized.position) {
    return hasActiveElement(element, activeElement) ? normalized.paths : [];
  }

  if (
    isPhysicalPointInsideElement(normalized.position, element, scaleFactor) ||
    isPointInsideElement(normalized.position, element)
  ) {
    return normalized.paths;
  }

  return [];
};

export const shouldHandleDomAttachmentDrop = (
  isTauriApp: boolean,
  files: FileList | File[] | null | undefined,
) => !isTauriApp && Boolean(files && files.length > 0);

export const extractUploadRelativePath = (url: string | null | undefined) => {
  if (!url) return null;
  let value = url.trim();
  try {
    value = decodeURIComponent(value);
  } catch {
    // Keep the original string if it is not URI-encoded.
  }
  const rawMatch = value.match(/^uploads\/[^)\]\s"'<>]+/);
  if (rawMatch) return rawMatch[0];

  try {
    const parsed = new URL(value);
    const isTauriAsset =
      parsed.protocol === "asset:" ||
      (["http:", "https:"].includes(parsed.protocol) &&
        parsed.hostname === "asset.localhost");
    if (!isTauriAsset) return null;
    const match = decodeURIComponent(parsed.pathname).match(
      /\/(uploads\/[^)\]\s"'<>]+)/,
    );
    return match?.[1] ?? null;
  } catch {
    return null;
  }
};

export const replaceAttachmentReferences = (
  content: string,
  replacements: Map<string, string>,
) => {
  let next = content;
  for (const [relativePath, replacementUrl] of replacements.entries()) {
    const escapedPath = relativePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapedEncodedPath = encodeURIComponent(relativePath).replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&",
    );
    const assetPatterns = [
      new RegExp(`asset:\\/\\/[^\\s\\)\\]"']*\\/${escapedPath}`, "g"),
      new RegExp(`https?:\\/\\/asset\\.localhost[^\\s\\)\\]"']*\\/${escapedPath}`, "g"),
      new RegExp(`asset:\\/\\/[^\\s\\)\\]"']*${escapedEncodedPath}`, "gi"),
      new RegExp(
        `https?:\\/\\/asset\\.localhost[^\\s\\)\\]"']*${escapedEncodedPath}`,
        "gi",
      ),
    ];
    for (const pattern of assetPatterns) {
      next = next.replace(pattern, replacementUrl);
    }
    const rawPattern = new RegExp(
      `(^|[\\(\\s"'=])${escapedPath}(?=$|[\\)\\]\\s"'<>])`,
      "g",
    );
    next = next.replace(rawPattern, (_match, prefix: string) => {
      return `${prefix}${replacementUrl}`;
    });
  }
  return next;
};

export const chooseAttachmentUploadMode = async (
  files: Array<File>,
): Promise<AttachmentUploadMode> => {
  if (!files.some((file) => isCompressibleImageFile(file))) {
    return "original";
  }
  const shouldCompress = window.confirm(
    "检测到图片附件。选择“确定”会压缩后保存，选择“取消”会保留原图。",
  );
  return shouldCompress ? "compressed" : "original";
};

export const compressImageFile = async (file: File): Promise<File> => {
  if (!isCompressibleImageFile(file)) return file;
  if (
    typeof document === "undefined" ||
    typeof Image === "undefined" ||
    typeof URL === "undefined"
  ) {
    return file;
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Failed to decode image"));
      element.src = objectUrl;
    });

    const maxSide = 1920;
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.84),
    );
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], withExtension(file.name, "webp"), {
      type: "image/webp",
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

export const prepareAttachmentFile = async (
  file: File,
  mode: AttachmentUploadMode,
) => (mode === "compressed" ? compressImageFile(file) : file);

export const uploadFilesAsAttachments = async (
  files: FileList | File[],
  requestedMode: AttachmentUploadMode,
) => {
  const originalFiles = Array.from(files);
  const mode = resolveAttachmentUploadMode(originalFiles, requestedMode);
  const uploaded: UploadedAttachment[] = [];
  const { entryService } = await import("./entryService");

  for (const originalFile of originalFiles) {
    const uploadFile = await prepareAttachmentFile(originalFile, mode);
    const stored = await entryService.uploadFile(uploadFile);
    uploaded.push({
      originalFile,
      uploadFile,
      stored,
    });
  }

  return uploaded;
};

export const uploadFilesAsMarkdown = async (
  files: FileList | File[],
  requestedMode: AttachmentUploadMode,
) => {
  const uploaded = await uploadFilesAsAttachments(files, requestedMode);
  return buildAttachmentMarkdown(
    uploaded.map(({ originalFile, uploadFile, stored }) => ({
      name: uploadFile.name || originalFile.name,
      type: uploadFile.type || originalFile.type,
      url: stored.url,
    })),
  );
};

export const uploadPathsAsMarkdown = async (paths: string[]) => {
  const sourcePaths = paths.filter((path) => path.trim().length > 0);
  const { entryService } = await import("./entryService");
  const items: AttachmentMarkdownItem[] = [];

  for (const path of sourcePaths) {
    const stored = await entryService.uploadPath(path);
    items.push({
      name: filenameFromPath(path),
      url: stored.url,
    });
  }

  return buildAttachmentMarkdown(items);
};
