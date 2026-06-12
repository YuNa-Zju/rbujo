export function bumpVersion(version, level = "patch") {
  const parts = version.split(".").map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) {
    throw new Error(`Invalid semver version: ${version}`);
  }

  const [major, minor, patch] = parts;
  if (level === "patch") return `${major}.${minor}.${patch + 1}`;
  if (level === "minor") return `${major}.${minor + 1}.0`;
  if (level === "major") return `${major + 1}.0.0`;
  throw new Error(`Unsupported version bump: ${level}`);
}

export function updateTauriVersion(config, nextVersion) {
  return { ...config, version: nextVersion };
}

export function updatePackageVersion(packageJson, nextVersion) {
  return { ...packageJson, version: nextVersion };
}

export function updatePackageLockVersion(lockJson, nextVersion) {
  return {
    ...lockJson,
    version: nextVersion,
    packages: {
      ...lockJson.packages,
      "": {
        ...lockJson.packages?.[""],
        version: nextVersion,
      },
    },
  };
}
