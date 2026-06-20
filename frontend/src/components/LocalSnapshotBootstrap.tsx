import { useEffect } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { entryService } from "../services/entryService";

export default function LocalSnapshotBootstrap() {
  useEffect(() => {
    if (!isTauri()) return;

    let cancelled = false;
    entryService.runAutoLocalSnapshotIfDue().catch((error) => {
      if (!cancelled) {
        console.warn("Auto local snapshot skipped", error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
