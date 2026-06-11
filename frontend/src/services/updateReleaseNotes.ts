export const FALLBACK_UPDATE_RELEASE_NOTES = "这次更新没有提供更新日志。";

export function getUpdateReleaseNotes(update: { body?: string | null }) {
  const body = update.body?.trim();
  return body || FALLBACK_UPDATE_RELEASE_NOTES;
}
