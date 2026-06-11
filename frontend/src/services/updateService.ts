import { invoke, isTauri } from "@tauri-apps/api/core";
import { shouldCheckForUpdates } from "./updatePolicy";
import {
  markUpdateDismissed,
  shouldPromptForAvailableUpdate,
  type UpdateCheckSource,
} from "./updatePromptPolicy";

export type UpdateMetadata = {
  version: string;
  currentVersion: string;
};

export type UpdateCheckResult =
  | { status: "available"; update: UpdateMetadata }
  | { status: "none" }
  | { status: "suppressed"; update: UpdateMetadata }
  | { status: "unsupported" }
  | { status: "already-started" };

const DISMISSED_UPDATE_VERSION_KEY = "rbujo.dismissedUpdateVersion";

let startupCheckStarted = false;

export async function checkForUpdates(
  source: UpdateCheckSource,
): Promise<UpdateCheckResult> {
  if (source === "startup") {
    if (startupCheckStarted) {
      return { status: "already-started" };
    }
    startupCheckStarted = true;
  }

  if (!shouldCheckForUpdates(isTauri(), import.meta.env.PROD)) {
    return { status: "unsupported" };
  }

  const update = await invoke<UpdateMetadata | null>("check_for_update");
  if (!update) {
    return { status: "none" };
  }

  if (
    !shouldPromptForAvailableUpdate({
      source,
      updateVersion: update.version,
      dismissedVersion: getDismissedUpdateVersion(),
    })
  ) {
    return { status: "suppressed", update };
  }

  return { status: "available", update };
}

export function dismissUpdate(updateVersion: string) {
  const dismissedVersion = markUpdateDismissed(updateVersion);
  try {
    window.localStorage.setItem(DISMISSED_UPDATE_VERSION_KEY, dismissedVersion);
  } catch {
    // localStorage can be unavailable in restricted webviews.
  }
}

export async function installUpdate() {
  await invoke<void>("install_update");
}

function getDismissedUpdateVersion() {
  try {
    return window.localStorage.getItem(DISMISSED_UPDATE_VERSION_KEY);
  } catch {
    return null;
  }
}
