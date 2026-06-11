import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

type TauriCapability = {
  windows?: string[];
  permissions?: Array<string | { identifier: string }>;
};

test("main window has event and updater IPC permissions", async () => {
  const capabilityPath = path.resolve(
    import.meta.dirname,
    "../../src-tauri/capabilities/default.json",
  );
  const capability = JSON.parse(
    await readFile(capabilityPath, "utf8"),
  ) as TauriCapability;
  const permissions = (capability.permissions ?? []).map((permission) =>
    typeof permission === "string" ? permission : permission.identifier,
  );

  assert.deepEqual(capability.windows, ["main"]);
  assert.ok(permissions.includes("core:default"));
  assert.ok(permissions.includes("updater:default"));
});
