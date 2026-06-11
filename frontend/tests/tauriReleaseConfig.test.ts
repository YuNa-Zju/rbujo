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

test("desktop release config is ready for v0.2.1 updater publishing", async () => {
  const configPath = path.resolve(
    import.meta.dirname,
    "../../src-tauri/tauri.conf.json",
  );
  const config = JSON.parse(await readFile(configPath, "utf8")) as TauriConfig;

  assert.equal(config.version, "0.2.1");
  assert.equal(config.bundle?.createUpdaterArtifacts, true);
});
