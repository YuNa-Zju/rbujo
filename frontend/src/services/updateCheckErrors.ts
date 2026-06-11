export function getUpdateCheckFailureMessage(error: unknown) {
  const message =
    error instanceof Error ? error.message : String(error ?? "");

  if (/404|not found/i.test(message)) {
    return "暂时没有可用更新信息";
  }

  return "检查更新失败，请稍后重试";
}
