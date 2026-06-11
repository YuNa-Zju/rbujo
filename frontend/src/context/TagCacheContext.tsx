import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from "react";
import { entryService } from "../services/entryService";
import { entryEventBus } from "../lib/entryEventBus";

interface TagCacheContextType {
  cache: Record<string, any[]>;
  prefetch: (tag: string) => Promise<void>;
  clearCache: () => void;
  getCachedResults: (tag: string) => any[] | undefined;
}

const TagCacheContext = createContext<TagCacheContextType | null>(null);

export function TagCacheProvider({ children }: { children: React.ReactNode }) {
  const [cache, setCache] = useState<Record<string, any[]>>({});
  const fetchingRef = useRef<Record<string, boolean>>({});
  const cacheRef = useRef(cache);

  useEffect(() => {
    cacheRef.current = cache;
  }, [cache]);

  const getCachedResults = useCallback((tag: string) => {
    return cacheRef.current[tag];
  }, []);

  const clearCache = useCallback(() => {
    setCache({});
    fetchingRef.current = {};
  }, []);

  // 🟢 核心逻辑：执行标签搜索并更新缓存
  const executeFetch = useCallback(async (tag: string) => {
    if (fetchingRef.current[tag]) return;
    fetchingRef.current[tag] = true;

    try {
      const query = `#${tag}`;
      const rawResults = await entryService.search({ q: query, mode: "text" });

      const safeTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`(^|\\s)#${safeTag}(\\s|$)`);

      const validResults = rawResults.filter((entry: any) => {
        const content = entry.content || "";
        const firstLineEnd = content.indexOf("\n");
        const firstLine =
          firstLineEnd === -1 ? content : content.slice(0, firstLineEnd);
        return regex.test(firstLine);
      });

      setCache((prev) => ({
        ...prev,
        [tag]: validResults,
      }));
    } catch (e) {
      console.error(`Failed to fetch tag: ${tag}`, e);
    } finally {
      fetchingRef.current[tag] = false;
    }
  }, []);

  // 预加载（仅在无缓存时触发）
  const prefetch = useCallback(
    async (tag: string) => {
      if (cacheRef.current[tag]) return;
      await executeFetch(tag);
    },
    [executeFetch],
  );

  // 🔴 核心：监听 Entry 总线，实现静默热更新
  useEffect(() => {
    const handleAutoRefresh = () => {
      const activeTags = Object.keys(cacheRef.current);
      if (activeTags.length > 0) {
        console.log(
          `🔄 [TagCache] Entry changed. Auto-refreshing: ${activeTags.join(", ")}`,
        );
        activeTags.forEach((tag) => executeFetch(tag));
      }
    };

    entryEventBus.on("entry:create", handleAutoRefresh);
    entryEventBus.on("entry:update", handleAutoRefresh);
    entryEventBus.on("entry:delete", handleAutoRefresh);
    entryEventBus.on("entry:status_change", handleAutoRefresh);
    entryEventBus.on("entry:migrate", handleAutoRefresh);

    return () => {
      entryEventBus.off("entry:create", handleAutoRefresh);
      entryEventBus.off("entry:update", handleAutoRefresh);
      entryEventBus.off("entry:delete", handleAutoRefresh);
      entryEventBus.off("entry:status_change", handleAutoRefresh);
      entryEventBus.off("entry:migrate", handleAutoRefresh);
    };
  }, [executeFetch]);

  return (
    <TagCacheContext.Provider
      value={{ cache, prefetch, clearCache, getCachedResults }}
    >
      {children}
    </TagCacheContext.Provider>
  );
}

export function useTagCache() {
  const context = useContext(TagCacheContext);
  if (!context) throw new Error("useTagCache Error");
  return context;
}
