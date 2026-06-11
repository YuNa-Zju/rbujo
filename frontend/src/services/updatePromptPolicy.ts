export type UpdateCheckSource = "startup" | "manual";

type UpdatePromptInput = {
  source: UpdateCheckSource;
  updateVersion: string;
  dismissedVersion?: string | null;
};

export function shouldPromptForAvailableUpdate({
  source,
  updateVersion,
  dismissedVersion,
}: UpdatePromptInput) {
  if (source === "manual") {
    return true;
  }

  return dismissedVersion !== updateVersion;
}

export function markUpdateDismissed(updateVersion: string) {
  return updateVersion;
}
