import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2, Quote, Calendar, Clock, Hash } from "lucide-react";
import { ENTRY_THEME } from "../config/entryTheme";
import MarkdownViewer from "../components/MarkdownViewer"; // ✅ 你的新组件
import { entryService, type SharedEntryData } from "../services/entryService";

export default function PublicEntryPage() {
  const { token } = useParams();
  const [data, setData] = useState<SharedEntryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchPublicData = async () => {
      if (!token) return;
      try {
        const result = await entryService.getSharedEntry(token);
        setData(result);
      } catch (e) {
        console.error("Fetch shared entry failed:", e);
        setError(true);
      } finally {
        setLoading(false);
      }
    };
    fetchPublicData();
  }, [token]);

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-base-100">
        <Loader2 className="animate-spin text-base-content/20" size={32} />
      </div>
    );

  if (error || !data)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-base-100 text-base-content/50 gap-4">
        <div className="text-6xl grayscale opacity-50">🏜️</div>
        <p className="text-base font-medium font-lxgw">
          页面不存在或链接已失效
        </p>
      </div>
    );

  const theme = ENTRY_THEME[data.entry_type] || ENTRY_THEME.task;
  const isCompleted = data.status === "completed";

  const dateObj = new Date(data.created_at);
  const dateStr = dateObj.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
  const timeStr = dateObj.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

  // --- 页面外壳的 Pastel 配色 (头像/Badge/Footer) ---
  // Markdown 内部的颜色现在由组件自己处理，这里只负责“皮囊”
  const shellTheme = {
    task: {
      avatarBg: "bg-indigo-50 dark:bg-indigo-500/10",
      avatarText: "text-indigo-500 dark:text-indigo-300",
      avatarBorder: "border-indigo-100 dark:border-indigo-500/20",
      topBar: "bg-indigo-500/15",
      badge:
        "border-indigo-100 text-indigo-600 dark:border-indigo-500/20 dark:text-indigo-300",
      linkColor: "text-indigo-500",
    },
    idea: {
      avatarBg: "bg-amber-50 dark:bg-amber-500/10",
      avatarText: "text-amber-600 dark:text-amber-300",
      avatarBorder: "border-amber-100 dark:border-amber-500/20",
      topBar: "bg-amber-500/15",
      badge:
        "border-amber-100 text-amber-600 dark:border-amber-500/20 dark:text-amber-300",
      linkColor: "text-amber-600",
    },
    event: {
      avatarBg: "bg-sky-50 dark:bg-sky-500/10",
      avatarText: "text-sky-500 dark:text-sky-300",
      avatarBorder: "border-sky-100 dark:border-sky-500/20",
      topBar: "bg-sky-500/15",
      badge:
        "border-sky-100 text-sky-500 dark:border-sky-500/20 dark:text-sky-300",
      linkColor: "text-sky-500",
    },
  };
  // @ts-ignore
  const currentShell = shellTheme[data.entry_type] || shellTheme.task;

  return (
    <div className="min-h-screen w-full relative bg-[#f9fafb] dark:bg-base-100 flex flex-col select-text font-lxgw">
      {/* 背景装饰 */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div
          className={`absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full blur-[120px] opacity-[0.06] ${theme.sideBar}`}
        />
        <div
          className={`absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full blur-[120px] opacity-[0.06] ${theme.sideBar}`}
        />
        <div
          className="absolute inset-0 opacity-[0.15] dark:opacity-[0.05]"
          style={{
            backgroundImage: "radial-gradient(#a1a1aa 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
      </div>

      <main className="flex-1 flex justify-center px-4 sm:px-8 py-12 sm:py-20 z-10 overflow-y-auto">
        <div className="w-full max-w-3xl animate-in fade-in zoom-in-95 slide-in-from-bottom-4 duration-700 h-fit">
          <div className="bg-white/80 dark:bg-base-200/60 backdrop-blur-xl shadow-sm rounded-[2rem] border border-base-content/5 overflow-hidden">
            {/* 顶部装饰条 */}
            <div className={`h-1.5 w-full ${currentShell.topBar}`} />

            <div className="p-8 sm:p-12 lg:p-16">
              {/* Header Info */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 mb-12 pb-8 border-b border-base-content/5 border-dashed">
                <div className="flex items-center gap-5">
                  {/* 头像 */}
                  <div className="avatar placeholder select-none">
                    <div
                      className={`rounded-2xl w-16 h-16 flex items-center justify-center border transition-all ${currentShell.avatarBg} ${currentShell.avatarText} ${currentShell.avatarBorder}`}
                    >
                      <span className="text-xl font-bold leading-none tracking-tighter opacity-90">
                        {data.author_avatar}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <span className="text-2xl font-black text-base-content/90 tracking-tight leading-none">
                      {username_mapping(data.author_name)}
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 w-fit border shadow-sm ${currentShell.avatarBg} ${currentShell.badge}`}
                      >
                        <Hash size={11} strokeWidth={2.5} />
                        {data.entry_type}
                      </span>

                      {isCompleted && (
                        <span className="px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 bg-base-content/5 text-base-content/50 border border-base-content/10">
                          <div className="w-1.5 h-1.5 rounded-full bg-success/60" />
                          Done
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-start sm:items-end gap-1.5">
                  <div className="flex items-center gap-2 text-sm text-base-content/50 font-bold bg-base-content/[0.03] px-4 py-2 rounded-xl select-none">
                    <Calendar size={14} />
                    {dateStr}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-base-content/30 font-medium px-2">
                    <Clock size={12} />
                    {timeStr}
                  </div>
                </div>
              </div>

              {/* ✅ Content Area: 只需要这一行，样式全自动 */}
              <div className="w-full">
                <MarkdownViewer
                  content={data.content}
                  entryType={data.entry_type} // 👈 传递 entryType 即可触发内部的样式引擎
                  disableOverflowCheck={true}
                  isTagClickable={false}
                  readOnly={true}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="bg-base-content/[0.02] p-8 text-center border-t border-base-content/5 select-none">
              <p className="text-sm text-base-content/30 flex items-center justify-center gap-2 font-medium">
                <Quote size={12} className="rotate-180 opacity-40" />
                Powered by{" "}
                <a
                  href="/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`transition-all underline underline-offset-4 decoration-current/20 hover:decoration-current font-bold opacity-60 hover:opacity-100 ${currentShell.linkColor}`}
                >
                  Bullet Journal
                </a>
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* ❌ 彻底删除了底部的 <style> 标签，因为 MarkdownViewer 已经包含了所有需要的样式 */}
    </div>
  );
}

function username_mapping(name: string) {
  return name || "Anonymous";
}
