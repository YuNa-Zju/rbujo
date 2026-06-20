import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  CalendarDays,
  Clock3,
  FileText,
  Hash,
  Link2,
  Tag,
  X,
} from "lucide-react";
import MarkdownViewer from "./MarkdownViewer";
import { entryService } from "../services/entryService";
import { useModalController } from "../context/ModalControllerContext";
import { ENTRY_THEME, type EntryType } from "../config/entryTheme";

interface EntryInspectorProps {
  open: boolean;
  entry: any | null;
  onClose: () => void;
}

const relatedLabel: Record<string, string> = {
  semantic: "语义相关",
  tag: "同标签",
  content: "内容相关",
  date: "同日期",
  related: "相关",
};

export default function EntryInspector({
  open,
  entry,
  onClose,
}: EntryInspectorProps) {
  const [related, setRelated] = useState<any[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(false);
  const { openInspector } = useModalController();

  const theme = useMemo(() => {
    if (!entry) return ENTRY_THEME.task;
    return ENTRY_THEME[entry.entry_type as EntryType] || ENTRY_THEME.task;
  }, [entry]);

  useEffect(() => {
    let cancelled = false;
    if (!open || !entry?.id) {
      setRelated([]);
      return () => {
        cancelled = true;
      };
    }

    setLoadingRelated(true);
    entryService
      .getRelatedEntries(entry.id, 5)
      .then((items) => {
        if (!cancelled) setRelated(items);
      })
      .catch((error) => {
        console.error("Failed to load related entries", error);
        if (!cancelled) setRelated([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingRelated(false);
      });

    return () => {
      cancelled = true;
    };
  }, [entry?.id, open]);

  const dateLabel =
    entry?.target_date || entry?.target_month || (entry?.is_future ? "Future" : null);
  const visible = open && entry;

  return (
    <aside
      className={`fixed right-0 top-0 z-40 h-dvh w-[360px] max-w-[calc(100vw-20px)] border-l border-base-200 bg-base-100/95 shadow-2xl backdrop-blur-xl transition-transform duration-200 ease-out ${
        visible ? "translate-x-0" : "pointer-events-none translate-x-full"
      }`}
      aria-hidden={!visible}
    >
      {visible && (
        <div className="flex h-full flex-col">
          <header className="flex items-start gap-3 border-b border-base-200 px-4 py-4">
            <div
              className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${theme.softBg}`}
            >
              <theme.icon size={18} className={theme.color} strokeWidth={2.5} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-normal text-base-content/40">
                <span>{entry.entry_type}</span>
                <span className="h-1 w-1 rounded-full bg-base-content/20" />
                <span>{entry.status}</span>
              </div>
              <h2 className="mt-1 line-clamp-2 text-base font-semibold leading-snug text-base-content">
                {entry.summary?.text || entry.content || "Untitled"}
              </h2>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm h-8 w-8 rounded-full p-0"
              onClick={onClose}
              aria-label="Close inspector"
            >
              <X size={16} />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <section className="space-y-2">
              <InspectorMeta icon={<CalendarDays size={14} />} label="时间">
                {dateLabel || "未安排"}
              </InspectorMeta>
              {entry.created_at && (
                <InspectorMeta icon={<Clock3 size={14} />} label="创建">
                  {entry.created_at}
                </InspectorMeta>
              )}
              {entry.tags?.length > 0 && (
                <InspectorMeta icon={<Hash size={14} />} label="标签">
                  <span className="flex flex-wrap gap-1.5">
                    {entry.tags.map((tag: string) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 rounded-full border border-base-200 bg-base-200/40 px-2 py-0.5 text-[11px] font-medium"
                      >
                        <Tag size={10} />
                        {tag}
                      </span>
                    ))}
                  </span>
                </InspectorMeta>
              )}
            </section>

            <section className="mt-5">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-normal text-base-content/40">
                <FileText size={13} />
                内容
              </div>
              <div className="rounded-2xl border border-base-200 bg-base-50/40 p-3">
                <MarkdownViewer
                  content={entry.content || ""}
                  tags={entry.tags || []}
                  entryType={entry.entry_type}
                  disableOverflowCheck
                  readOnly
                  isTagClickable={false}
                  uploadReferences={entry.summary?.uploadReferences}
                  className="text-sm"
                />
              </div>
            </section>

            <section className="mt-5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-normal text-base-content/40">
                  <Link2 size={13} />
                  Related Notes
                </div>
                {loadingRelated && (
                  <span className="loading loading-spinner loading-xs text-base-content/30" />
                )}
              </div>

              <div className="space-y-2">
                {!loadingRelated && related.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-base-200 px-3 py-4 text-sm text-base-content/40">
                    暂无明显关联
                  </div>
                )}
                {related.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="w-full rounded-2xl border border-base-200 bg-base-100 px-3 py-3 text-left transition hover:border-primary/30 hover:bg-primary/5"
                    onClick={() => openInspector(item)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-base-content">
                        {item.summary?.text || item.content || "Untitled"}
                      </span>
                      <span className="shrink-0 rounded-full bg-base-200/70 px-2 py-0.5 text-[10px] font-semibold text-base-content/50">
                        {relatedLabel[item._search?.type] || "相关"}
                      </span>
                    </div>
                    <div className="mt-1 truncate text-xs text-base-content/45">
                      {item._search?.snippet || item.content}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}
    </aside>
  );
}

function InspectorMeta({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2 text-sm">
      <div className="flex items-center gap-1.5 text-base-content/40">
        {icon}
        <span>{label}</span>
      </div>
      <div className="min-w-0 text-base-content/75">{children}</div>
    </div>
  );
}
