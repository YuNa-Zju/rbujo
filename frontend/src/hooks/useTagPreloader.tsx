import { useEffect } from "react";
import { useTagCache } from "../context/TagCacheContext";

export function useTagPreloader(entries: any[]) {
  const { prefetch } = useTagCache();

  // 生成一个基于 ID 的指纹，避免 entries 引用变化导致重复触发
  const entriesFingerprint = entries
    .map((e) => `${e.id}:${Array.isArray(e.tags) ? e.tags.join("|") : ""}`)
    .join(",");

  useEffect(() => {
    if (!entries || entries.length === 0) return;

    const allTags = new Set<string>();

    entries.forEach((entry) => {
      if (!Array.isArray(entry.tags)) return;
      entry.tags.forEach((tag: string) => {
        if (tag) allTags.add(tag);
      });
    });

    // ✅ 移除 setTimeout，立即执行预加载
    if (allTags.size > 0) {
      allTags.forEach((tag) => prefetch(tag));
    }

    // ✅ 依赖指纹而不是 entries 数组本身
  }, [entriesFingerprint, prefetch]);
}
