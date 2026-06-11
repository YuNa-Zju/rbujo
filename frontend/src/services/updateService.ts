import { invoke, isTauri } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { shouldCheckForUpdates } from "./updatePolicy";

type UpdateMetadata = {
  version: string;
  currentVersion: string;
};

let startupCheckStarted = false;

export async function checkForUpdatesOnStartup() {
  if (startupCheckStarted) {
    return;
  }
  startupCheckStarted = true;

  if (!shouldCheckForUpdates(isTauri(), import.meta.env.PROD)) {
    return;
  }

  try {
    const update = await invoke<UpdateMetadata | null>("check_for_update");
    if (!update) {
      return;
    }

    showUpdateToast(update);
  } catch (error) {
    console.warn("Update check failed", error);
  }
}

function showUpdateToast(update: UpdateMetadata) {
  toast("发现新版本", {
    description: `当前版本 ${update.currentVersion}，可更新到 ${update.version}`,
    duration: Infinity,
    action: {
      label: "立即更新",
      onClick: () => {
        void installUpdate();
      },
    },
    cancel: {
      label: "稍后",
      onClick: () => {},
    },
  });
}

async function installUpdate() {
  const toastId = toast.loading("正在下载并安装更新...");
  try {
    await invoke<void>("install_update");
    toast.success("更新已安装，正在重启应用", { id: toastId });
  } catch (error) {
    console.error("Update install failed", error);
    toast.error("更新安装失败，请稍后重试", { id: toastId });
  }
}
