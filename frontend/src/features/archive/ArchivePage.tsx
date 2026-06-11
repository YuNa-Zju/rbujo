import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Archive,
  ArrowLeft,
  CalendarDays,
  Loader2,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import { entryService } from "../../services/entryService";
import { EntryCard } from "../../components/DraggableEntryCard";
import { entryEventBus } from "../../lib/entryEventBus";
import HeaderActionTrigger from "../calendar/components/HeaderActionTrigger";
import { useTranslation } from "../../hooks/useTranslation";

export default function ArchivePage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [entries, setEntries] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const loadArchived = useCallback(async () => {
    setLoading(true);
    try {
      const data = await entryService.search({
        q: "",
        include_archived: true,
        limit: 1000,
      });
      setEntries(data.filter((entry) => entry.archived_at));
    } catch (error) {
      console.error("Load archive failed", error);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadArchived();
  }, [loadArchived]);

  const filteredEntries = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return entries;
    return entries.filter((entry) =>
      `${entry.content} ${entry.target_date ?? ""} ${entry.target_month ?? ""}`
        .toLowerCase()
        .includes(keyword),
    );
  }, [entries, query]);

  const handleUnarchive = async (entry: any) => {
    const restored = await entryService.unarchive(entry.id);
    setEntries((prev) => prev.filter((item) => item.id !== entry.id));
    entryEventBus.emit("entry:update", restored);
  };

  const handleDelete = async (entry: any) => {
    await entryService.delete(entry.id, true);
    setEntries((prev) => prev.filter((item) => item.id !== entry.id));
    entryEventBus.emit("entry:delete", entry.id);
  };

  const handleJump = (entry: any) => {
    if (entry.target_date) {
      navigate(`/daily/${entry.target_date}`);
    }
  };

  return (
    <div className="fixed inset-0 w-full h-[100dvh] bg-base-100 overflow-hidden flex flex-col">
      <div className="flex-none h-14 grid grid-cols-[1fr_auto_1fr] items-center px-2 sm:px-4 border-b border-base-200/50 bg-base-100/80 backdrop-blur-md z-[100]">
        <div className="flex justify-start">
          <button
            className="btn btn-ghost btn-circle btn-sm text-base-content/60"
            onClick={() => navigate("/")}
            title={t.common?.back || "Back"}
          >
            <ArrowLeft size={20} />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <Archive size={18} className="text-primary" />
          <span className="text-lg font-serif font-bold">
            {t.archivePage?.title || t.common?.archive || "Archive"}
          </span>
        </div>
        <div className="flex items-center justify-end">
          <HeaderActionTrigger />
        </div>
      </div>

      <main className="flex-1 overflow-y-auto overscroll-contain">
        <div className="px-4 py-6 max-w-3xl mx-auto w-full">
          <div className="sticky top-0 z-20 bg-base-100/95 backdrop-blur-sm pb-4">
            <div className="flex items-center gap-3 rounded-2xl bg-base-200/60 border border-base-300/40 px-4 py-3">
              <Search size={18} className="text-base-content/40 shrink-0" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={
                  t.archivePage?.searchPlaceholder || "Search archived entries"
                }
                className="bg-transparent outline-none w-full text-sm font-medium"
              />
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-32 text-base-content/40">
              <Loader2 size={28} className="animate-spin" />
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 text-base-content/30 select-none">
              <div className="w-16 h-16 rounded-full bg-base-200/70 flex items-center justify-center mb-4">
                <Archive size={26} />
              </div>
              <p className="font-serif italic text-xl">
                {t.archivePage?.empty || "No archived entries"}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4 pb-24">
              {filteredEntries.map((entry) => (
                <div key={entry.id} className="group">
                  <div className="flex items-center justify-between gap-3 mb-2 px-1">
                    <button
                      onClick={() => handleJump(entry)}
                      className="flex items-center gap-2 text-xs font-mono font-bold text-base-content/45 hover:text-primary transition-colors"
                    >
                      <CalendarDays size={13} />
                      {entry.target_date ||
                        entry.target_month ||
                        t.archivePage?.future ||
                        "Future"}
                    </button>
                    <div className="flex items-center gap-1">
                      <button
                        className="btn btn-xs btn-ghost rounded-full gap-1"
                        onClick={() => handleUnarchive(entry)}
                        title={t.archivePage?.restore || "Restore"}
                      >
                        <RotateCcw size={13} />
                        {t.archivePage?.restore || "Restore"}
                      </button>
                      <button
                        className="btn btn-xs btn-ghost text-error rounded-full"
                        onClick={() => handleDelete(entry)}
                        title={
                          t.archivePage?.deletePermanently ||
                          "Delete permanently"
                        }
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  <EntryCard
                    entry={entry}
                    refresh={loadArchived}
                    isDragEnabled={false}
                    forceCollapse={false}
                    hideActions
                    isTagClickable={false}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
