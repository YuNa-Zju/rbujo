import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  bumpVersion,
  updatePackageLockVersion,
  updatePackageVersion,
  updateTauriVersion,
} from "./releaseUtils.mjs";

const bumpLevel = process.argv[2] || "patch";
const repoRoot = resolve(import.meta.dirname, "../..");
const tauriConfigPath = resolve(repoRoot, "src-tauri/tauri.conf.json");
const packagePath = resolve(repoRoot, "frontend/package.json");
const lockPath = resolve(repoRoot, "frontend/package-lock.json");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function git(args) {
  execFileSync("git", args, {
    cwd: repoRoot,
    stdio: "inherit",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
}

function gitOutput(args) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  }).trim();
}

const currentBranch = gitOutput(["branch", "--show-current"]);
if (currentBranch !== "master") {
  throw new Error("Release script must be run from master after merging fixes.");
}

const pendingChanges = gitOutput(["status", "--porcelain"]);
if (pendingChanges) {
  throw new Error("Release script requires a clean working tree before bumping version.");
}

const tauriConfig = readJson(tauriConfigPath);
const nextVersion = bumpVersion(tauriConfig.version, bumpLevel);

writeJson(tauriConfigPath, updateTauriVersion(tauriConfig, nextVersion));
writeJson(packagePath, updatePackageVersion(readJson(packagePath), nextVersion));
writeJson(lockPath, updatePackageLockVersion(readJson(lockPath), nextVersion));

git(["add", "src-tauri/tauri.conf.json", "frontend/package.json", "frontend/package-lock.json"]);
git(["commit", "-m", `Release v${nextVersion}`]);
const pushMasterCommand = "git push origin master";
console.log(pushMasterCommand);
git(["push", "origin", "master"]);
git(["tag", "-a", `v${nextVersion}`, "-m", `BuJo v${nextVersion}`]);
const pushTagCommand = `git push origin v${nextVersion}`;
console.log(pushTagCommand);
git(["push", "origin", `v${nextVersion}`]);
