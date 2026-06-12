import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBackupObject,
  importBackupObject,
} from "../src/services/dataBackupService.ts";

const sha256For123 =
  "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81";

test("backup object includes uploaded attachments for portable bjk export", () => {
  const backup = buildBackupObject(
    [
      {
        id: "entry-1",
        content: "![img](asset://localhost/private/uploads/hash.png)",
      },
    ],
    [
      {
        relative_path: "uploads/hash.png",
        absolute_path: "/private/app/uploads/hash.png",
        filename: "hash.png",
        sha256: "hash",
        bytes: [1, 2, 3],
        url: "asset://localhost/private/uploads/hash.png",
      },
    ],
    123,
  );

  assert.equal(backup.header, "BUJO_SECURE_BACKUP_V1");
  assert.equal(backup.version, 2);
  assert.equal(backup.count, 1);
  assert.deepEqual(backup.attachments?.[0], {
    relative_path: "uploads/hash.png",
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
        relative_path: "uploads/restored.png",
        absolute_path: "/private/app/uploads/restored.png",
        sha256: "hash",
        size: 3,
        url: "asset://localhost/private/uploads/restored.png",
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
    "![img](asset://localhost/private/uploads/restored.png)\n![encoded](asset://localhost/private/uploads/restored.png)",
  );
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
              relative_path: "uploads/hash.png",
              filename: "hash.png",
              sha256:
                "0000000000000000000000000000000000000000000000000000000000000000",
              bytes: [1, 2, 3],
            },
          ],
          data: [
            {
              id: "entry-1",
              content: "![img](asset://localhost/private/uploads/hash.png)",
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
