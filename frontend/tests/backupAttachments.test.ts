import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";
import pako from "pako";

import {
  buildBackupObject,
  buildBjkArchive,
  importBackupObject,
  parseBjkArchive,
} from "../src/services/dataBackupService.ts";

const sha256For123 =
  "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81";
const testTextEncoder = new TextEncoder();

const testCrc32 = (bytes: Uint8Array) => {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
    }
  }
  return (value ^ 0xffffffff) >>> 0;
};

const concatTestBytes = (chunks: Uint8Array[]) => {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
};

const buildStoredZipForTest = (entries: Array<{ name: string; data: Uint8Array }>) => {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = testTextEncoder.encode(entry.name);
    const checksum = testCrc32(entry.data);
    const localHeader = new Uint8Array(30 + nameBytes.byteLength);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(8, 0, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, entry.data.byteLength, true);
    localView.setUint32(22, entry.data.byteLength, true);
    localView.setUint16(26, nameBytes.byteLength, true);
    localHeader.set(nameBytes, 30);
    localParts.push(localHeader, entry.data);

    const centralHeader = new Uint8Array(46 + nameBytes.byteLength);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, entry.data.byteLength, true);
    centralView.setUint32(24, entry.data.byteLength, true);
    centralView.setUint16(28, nameBytes.byteLength, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);

    offset += localHeader.byteLength + entry.data.byteLength;
  }

  const centralDirectory = concatTestBytes(centralParts);
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralDirectory.byteLength, true);
  endView.setUint32(16, offset, true);

  return concatTestBytes([...localParts, centralDirectory, endRecord]);
};

test("backup object includes uploaded attachments for portable bjk export", () => {
  const backup = buildBackupObject(
    [
      {
        id: "entry-1",
        content: "![img](asset://localhost/private/attachments/hash.png)",
      },
    ],
    [
      {
        relative_path: "attachments/hash.png",
        absolute_path: "/private/app/attachments/hash.png",
        filename: "hash.png",
        sha256: "hash",
        bytes: [1, 2, 3],
        url: "asset://localhost/private/attachments/hash.png",
      },
    ],
    123,
  );

  assert.equal(backup.header, "BUJO_SECURE_BACKUP_V1");
  assert.equal(backup.version, 2);
  assert.equal(backup.count, 1);
  assert.deepEqual(backup.attachments?.[0], {
    relative_path: "attachments/hash.png",
    filename: "hash.png",
    sha256: "hash",
    bytes: [1, 2, 3],
  });
});

test("backup import restores attachments and rewrites old upload links before entry import", async () => {
  const importedEntries: any[] = [];
  const encodedOldUrl =
    "asset://localhost/%2FUsers%2Fme%2FLibrary%2FApplication%20Support%2Ffun.yunazju.rbujo%2Fuploads%2Fhash.png";
  const response = await importBackupObject(
    {
      header: "BUJO_SECURE_BACKUP_V1",
      version: 2,
      timestamp: 123,
      count: 1,
      attachments: [
        {
          relative_path: "uploads/hash.png",
          filename: "hash.png",
          sha256: sha256For123,
          bytes: [1, 2, 3],
        },
      ],
      data: [
        {
          id: "entry-1",
          content: `![img](asset://localhost/private/uploads/hash.png)\n![encoded](${encodedOldUrl})`,
        },
      ],
    },
    {
      restoreUpload: async () => ({
        relative_path: "attachments/restored.png",
        absolute_path: "/private/app/attachments/restored.png",
        sha256: "hash",
        size: 3,
        url: "asset://localhost/private/attachments/restored.png",
      }),
      bulkImport: async (entries: any[]) => {
        importedEntries.push(...entries);
        return {
          success: true,
          message: "ok",
          inserted_count: 1,
          updated_count: 0,
          skipped_count: 0,
          inserted_ids: ["entry-1"],
        };
      },
    },
  );

  assert.equal(response.inserted_count, 1);
  assert.equal(
    importedEntries[0].content,
    "![img](attachments/restored.png)\n![encoded](attachments/restored.png)",
  );
  assert.doesNotMatch(importedEntries[0].content, /asset:\/\/localhost/);
});

test("backup import rejects attachments with mismatched hashes", async () => {
  await assert.rejects(
    () =>
      importBackupObject(
        {
          header: "BUJO_SECURE_BACKUP_V1",
          version: 2,
          timestamp: 123,
          count: 1,
          attachments: [
            {
              relative_path: "attachments/hash.png",
              filename: "hash.png",
              sha256:
                "0000000000000000000000000000000000000000000000000000000000000000",
              bytes: [1, 2, 3],
            },
          ],
          data: [
            {
              id: "entry-1",
              content: "![img](asset://localhost/private/attachments/hash.png)",
            },
          ],
        },
        {
          restoreUpload: async () => {
            throw new Error("restoreUpload should not be called");
          },
          bulkImport: async () => {
            throw new Error("bulkImport should not be called");
          },
        },
      ),
    /Attachment hash mismatch/,
  );
});

test("bjk export is a zip container with manifest and gzip payload", () => {
  const backup = buildBackupObject(
    [
      {
        id: "entry-1",
        content: "future sync seed",
      },
    ],
    [],
    123,
  );

  const archive = buildBjkArchive(backup, new Date("2026-06-17T00:00:00.000Z"));
  assert.deepEqual(Array.from(archive.slice(0, 4)), [0x50, 0x4b, 0x03, 0x04]);

  const parsed = parseBjkArchive(archive);
  assert.equal(parsed.manifest?.format, "fun.yunazju.rbujo.bjk");
  assert.equal(parsed.manifest?.container_version, 1);
  assert.equal(parsed.manifest?.backup.count, 1);
  assert.equal(parsed.manifest?.payload.path, "data/backup.json.gz");
  assert.match(parsed.manifest?.payload.sha256 || "", /^[a-f0-9]{64}$/);
  assert.ok((parsed.manifest?.payload.uncompressed_bytes || 0) > 0);
  assert.equal(parsed.manifest?.backup.entries_index?.length, 1);
  assert.equal(parsed.manifest?.backup.entries_index?.[0].id, "entry-1");
  assert.match(
    parsed.manifest?.backup.entries_index?.[0].fingerprint || "",
    /^[a-f0-9]{64}$/,
  );
  assert.equal(parsed.manifest?.backup.attachments_index?.length, 0);
  assert.equal(parsed.backupObject.header, "BUJO_SECURE_BACKUP_V1");
  assert.equal(parsed.backupObject.data[0].content, "future sync seed");
});

test("bjk manifest indexes entries and attachments for incremental import", () => {
  const backup = buildBackupObject(
    [
      {
        id: "entry-1",
        content: "same content",
        entry_type: "task",
        status: "open",
        target_date: "2026-06-18",
        tags: ["BUJO", "ACEE", "BUJO"],
      },
    ],
    [
      {
        relative_path: "attachments/hash.png",
        absolute_path: "/private/app/attachments/hash.png",
        filename: "hash.png",
        sha256: sha256For123,
        bytes: [1, 2, 3],
        url: "asset://localhost/private/attachments/hash.png",
      },
    ],
    789,
  );

  const parsed = parseBjkArchive(buildBjkArchive(backup));
  const entryIndex = parsed.manifest?.backup.entries_index?.[0];
  const attachmentIndex = parsed.manifest?.backup.attachments_index?.[0];

  assert.equal(entryIndex?.id, "entry-1");
  assert.equal(entryIndex?.target_date, "2026-06-18");
  assert.match(entryIndex?.fingerprint || "", /^[a-f0-9]{64}$/);
  assert.match(entryIndex?.content_sha256 || "", /^[a-f0-9]{64}$/);
  assert.match(entryIndex?.tags_sha256 || "", /^[a-f0-9]{64}$/);
  assert.equal(attachmentIndex?.relative_path, "attachments/hash.png");
  assert.equal(attachmentIndex?.filename, "hash.png");
  assert.equal(attachmentIndex?.sha256, sha256For123);
  assert.equal(attachmentIndex?.size, 3);
});

test("bjk import rejects zip payloads when the manifest hash is stale", () => {
  const backup = buildBackupObject(
    [
      {
        id: "entry-stale",
        content: "payload content",
      },
    ],
    [],
    456,
  );
  const backupText = JSON.stringify(backup);
  const payload = pako.gzip(backupText);
  const manifest = {
    format: "fun.yunazju.rbujo.bjk",
    container_version: 1,
    created_at: "2026-06-18T00:00:00.000Z",
    backup: {
      header: "BUJO_SECURE_BACKUP_V1",
      version: 2,
      timestamp: backup.timestamp,
      count: backup.count,
      attachments_count: 0,
      entries_index: [],
      attachments_index: [],
    },
    payload: {
      path: "data/backup.json.gz",
      media_type: "application/json",
      compression: "gzip",
      sha256: "0".repeat(64),
      uncompressed_bytes: testTextEncoder.encode(backupText).byteLength,
    },
    compatibility: {
      legacy_base64_gzip_import: true,
    },
  };
  const archive = buildStoredZipForTest([
    {
      name: "manifest.json",
      data: testTextEncoder.encode(`${JSON.stringify(manifest, null, 2)}\n`),
    },
    {
      name: "data/backup.json.gz",
      data: payload,
    },
  ]);

  assert.throws(() => parseBjkArchive(archive), /Invalid BJK payload hash/);
});

test("bjk import accepts legacy base64 gzip payloads", () => {
  const backup = buildBackupObject(
    [
      {
        id: "entry-legacy",
        content: "legacy payload",
      },
    ],
    [],
    456,
  );
  const compressed = pako.gzip(JSON.stringify(backup));
  const legacyText = Buffer.from(compressed).toString("base64");

  const parsed = parseBjkArchive(new TextEncoder().encode(legacyText));
  assert.equal(parsed.manifest, null);
  assert.equal(parsed.backupObject.header, "BUJO_SECURE_BACKUP_V1");
  assert.equal(parsed.backupObject.data[0].content, "legacy payload");
});
