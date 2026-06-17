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
  assert.equal(parsed.backupObject.header, "BUJO_SECURE_BACKUP_V1");
  assert.equal(parsed.backupObject.data[0].content, "future sync seed");
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
