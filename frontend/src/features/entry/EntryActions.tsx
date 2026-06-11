import {
  Edit3,
  ArrowRight,
  CalendarClock,
  Trash2,
  MoreHorizontal,
  Copy,
  Check,
  RotateCcw,
  Share, // 修正为 Share 图标更标准
} from "lucide-react";
import { useTranslation } from "../../hooks/useTranslation";
import { useRef, useEffect } from "react";
import { entryEventBus } from "../../lib/entryEventBus"; // 引入总线

interface Props {
  entryId: string | number; // 🆕 必须传入 ID 以支持互斥逻辑
  isTask: boolean;
  status: string;
  content: string;
  onEdit: () => void;
  onMigrate: () => void;
  onFuture: () => void;
  onDelete: () => void;
  onToggleStatus: () => void;
  onShare: () => void;
}

export default function EntryActions({
  entryId,
  isTask,
  status,
  content,
  onEdit,
  onMigrate,
  onFuture,
  onDelete,
  onToggleStatus,
  onShare,
}: Props) {
  const { t } = useTranslation();
  const detailsRef = useRef<HTMLDetailsElement>(null);

  // --- 🔴 核心互斥逻辑 ---
  useEffect(() => {
    // 1. 监听全局下拉菜单打开事件
    const handleOtherDropdownOpen = (openedId: string | number) => {
      if (openedId !== entryId && detailsRef.current?.hasAttribute("open")) {
        detailsRef.current.removeAttribute("open");
      }
    };

    entryEventBus.on("ui:dropdown_opened" as any, handleOtherDropdownOpen);

    // 2. 点击外部关闭
    const handleClickOutside = (event: MouseEvent) => {
      if (
        detailsRef.current &&
        !detailsRef.current.contains(event.target as Node)
      ) {
        detailsRef.current.removeAttribute("open");
      }
    };

    document.addEventListener("click", handleClickOutside);
    return () => {
      entryEventBus.off("ui:dropdown_opened" as any, handleOtherDropdownOpen);
      document.removeEventListener("click", handleClickOutside);
    };
  }, [entryId]);

  // 处理菜单切换动作
  const handleToggle = (e: React.SyntheticEvent) => {
    const isOpening = (e.target as HTMLDetailsElement).open;
    if (isOpening) {
      // 广播：我打开了，其他的请闭嘴
      entryEventBus.emit("ui:dropdown_opened" as any, entryId);
    }
  };

  const handleAction = (action: () => void) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    detailsRef.current?.removeAttribute("open");
    action();
  };

  const handleCopy = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(content);
    detailsRef.current?.removeAttribute("open");
  };

  return (
    <details
      ref={detailsRef}
      className="dropdown dropdown-end dropdown-bottom dropdown-left z-20"
      onToggle={handleToggle} // 🟢 监听原生切换事件
    >
      <summary
        className="btn btn-ghost btn-circle btn-sm opacity-70 hover:opacity-100 transition-all hover:bg-base-200/80"
        onClick={(e) => e.stopPropagation()} // 防止触发条目的点击/双击
      >
        <MoreHorizontal size={20} className="text-base-content/50" />
      </summary>

      {/* 横向菜单内容 */}
      <ul className="dropdown-content z-[999] menu menu-horizontal bg-base-100 rounded-xl shadow-[0_10px_30px_-10px_rgba(0,0,0,0.2)] border border-base-200/80 p-1.5 flex-nowrap items-center animate-in fade-in zoom-in-95 duration-100 right-0">
        {/* 复制 */}
        <li>
          <button
            onClick={handleCopy}
            className="tooltip tooltip-bottom p-2 rounded-lg hover:bg-base-200"
            data-tip={t.common.copy}
          >
            <Copy size={18} className="text-base-content/70" />
          </button>
        </li>

        {/* 分享 */}
        <li>
          <button
            onClick={handleAction(onShare)}
            className="tooltip tooltip-bottom p-2 rounded-lg hover:bg-base-200"
            data-tip={t.common.share || "Share"}
          >
            <Share size={18} className="text-base-content/70" />
          </button>
        </li>

        <div className="w-px h-5 bg-base-300 mx-1"></div>

        {/* 状态切换 */}
        {isTask && (
          <li>
            <button
              onClick={handleAction(onToggleStatus)}
              className="tooltip tooltip-bottom p-2 rounded-lg hover:bg-base-200"
              data-tip={status === "open" ? t.entry.complete : t.entry.reopen}
            >
              {status === "open" ? (
                <Check size={18} className="text-success" strokeWidth={2.5} />
              ) : (
                <RotateCcw size={18} className="text-warning" />
              )}
            </button>
          </li>
        )}

        {/* 编辑 */}
        <li>
          <button
            onClick={handleAction(onEdit)}
            className="tooltip tooltip-bottom p-2 rounded-lg hover:bg-base-200"
            data-tip={t.common.edit}
          >
            <Edit3 size={18} className="text-base-content/80" />
          </button>
        </li>

        {/* 迁移/Future */}
        {isTask && status === "open" && (
          <>
            <div className="w-px h-5 bg-base-300 mx-1"></div>
            <li>
              <button
                onClick={handleAction(onMigrate)}
                className="tooltip tooltip-bottom p-2 rounded-lg hover:bg-base-200"
                data-tip={t.entry.reschedule}
              >
                <ArrowRight size={18} className="text-info" />
              </button>
            </li>
            <li>
              <button
                onClick={handleAction(onFuture)}
                className="tooltip tooltip-bottom p-2 rounded-lg hover:bg-base-200"
                data-tip={t.entry.toFuture}
              >
                <CalendarClock size={18} className="text-amber-500" />
              </button>
            </li>
          </>
        )}

        <div className="w-px h-5 bg-base-300 mx-1"></div>

        {/* 删除 */}
        <li>
          <button
            onClick={handleAction(onDelete)}
            className="tooltip tooltip-bottom tooltip-error p-2 rounded-lg hover:bg-error/10"
            data-tip={t.common.delete}
          >
            <Trash2 size={18} className="text-error" />
          </button>
        </li>
      </ul>
    </details>
  );
}
