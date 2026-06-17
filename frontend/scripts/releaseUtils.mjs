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

export function extractChangelogSection(changelog, version) {
  const headingPattern = new RegExp(
    `^## v${version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$).*`,
    "m",
  );
  const headingMatch = changelog.match(headingPattern);
  if (!headingMatch || headingMatch.index === undefined) {
    return "";
  }

  const sectionStart = headingMatch.index;
  const nextHeadingMatch = changelog
    .slice(sectionStart + headingMatch[0].length)
    .match(/\n## v/m);
  const sectionEnd =
    nextHeadingMatch?.index === undefined
      ? changelog.length
      : sectionStart + headingMatch[0].length + nextHeadingMatch.index;
  return changelog.slice(sectionStart, sectionEnd).trim();
}

export function requireChangelogSection(changelog, version) {
  const section = extractChangelogSection(changelog, version);
  if (!section) {
    throw new Error(`Missing changelog section for v${version}. Add it to CHANGELOG.md before releasing.`);
  }
  return section;
}
