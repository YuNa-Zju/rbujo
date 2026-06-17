import assert from "node:assert/strict";
import test from "node:test";

import {
  bumpVersion,
  extractChangelogSection,
  requireChangelogSection,
  updatePackageLockVersion,
  updatePackageVersion,
  updateTauriVersion,
} from "../scripts/releaseUtils.mjs";

test("release utils bump patch versions", () => {
  assert.equal(bumpVersion("0.2.1", "patch"), "0.2.2");
  assert.equal(bumpVersion("1.4.9", "patch"), "1.4.10");
  assert.equal(bumpVersion("0.2.8", "minor"), "0.3.0");
});

test("release utils update json manifests without changing unrelated fields", () => {
  const tauri = { productName: "BuJo", version: "0.2.1" };
  const packageJson = { name: "bullet-frontend", version: "0.0.0" };
  const lockJson = {
    name: "bullet-frontend",
    version: "0.0.0",
    packages: {
      "": {
        name: "bullet-frontend",
        version: "0.0.0",
      },
      "node_modules/example": {
        version: "1.0.0",
      },
    },
  };

  assert.deepEqual(updateTauriVersion(tauri, "0.2.2"), {
    productName: "BuJo",
    version: "0.2.2",
  });
  assert.deepEqual(updatePackageVersion(packageJson, "0.2.2"), {
    name: "bullet-frontend",
    version: "0.2.2",
  });
  assert.deepEqual(updatePackageLockVersion(lockJson, "0.2.2"), {
    name: "bullet-frontend",
    version: "0.2.2",
    packages: {
      "": {
        name: "bullet-frontend",
        version: "0.2.2",
      },
      "node_modules/example": {
        version: "1.0.0",
      },
    },
  });
});

test("release utils extract the exact changelog section for a version", () => {
  const changelog = `# Changelog

## v0.4.8 - 2026-06-17

- 发布更新日志。
- 重写 README。

## v0.4.7 - 2026-06-17

- 修复菜单。
`;

  assert.equal(
    extractChangelogSection(changelog, "0.4.8"),
    `## v0.4.8 - 2026-06-17

- 发布更新日志。
- 重写 README。`,
  );
});

test("release utils reject releases without changelog notes", () => {
  assert.throws(
    () => requireChangelogSection("# Changelog\n\n## v0.4.7\n\n- 修复菜单。", "0.4.8"),
    /Missing changelog section for v0\.4\.8/,
  );
});
