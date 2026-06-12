import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

type TauriConfig = {
  version?: string;
  bundle?: {
    createUpdaterArtifacts?: boolean;
  };
};

test("desktop release config is ready for updater publishing", async () => {
  const configPath = path.resolve(
    import.meta.dirname,
    "../../src-tauri/tauri.conf.json",
  );
  const config = JSON.parse(await readFile(configPath, "utf8")) as TauriConfig;

  assert.match(config.version ?? "", /^\d+\.\d+\.\d+$/);
  assert.equal(config.bundle?.createUpdaterArtifacts, true);
});
