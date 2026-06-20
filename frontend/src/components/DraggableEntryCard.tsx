import { forwardRef, memo, type MouseEvent } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import EntryItem from "../features/entry/EntryItem"; // 确保路径正确
import { ENTRY_THEME, type EntryType } from "../config/entryTheme";
import { uiEvents } from "../lib/uiEvents";

export const ENTRY_CARD_RADIUS_CLASS = "rounded-2xl";
export const ENTRY_CARD_OVERFLOW_CLASS = "overflow-visible";

// 1. 定义精简后的接口 (移除了所有 onOptimistic... 回调)
interface DraggableEntryCardProps {
  entry: any;
  refresh: () => void; // 保留 refresh 作为最后的兜底手段

  isDragEnabled?: boolean;
  forceCollapse?: boolean;
  isOverlay?: boolean;
  isDragging?: boolean;
  dragHandleProps?: any;
  style?: React.CSSProperties;
  className?: string;
  disableOverflowCheck?: boolean;
  isTagClickable?: boolean;
  hideActions?: boolean;
  readOnly?: boolean;
  onInspect?: (entry: any) => void;
}

export const EntryCard = memo(
  forwardRef<HTMLDivElement, DraggableEntryCardProps>((props, ref) => {
    const {
      entry,
      isOverlay,
      isDragging,
      forceCollapse,
      refresh,
      dragHandleProps,
      style,
      className = "",
      isDragEnabled = true,
      disableOverflowCheck = false,
      isTagClickable = true,
      hideActions = false,
      readOnly = false,
      onInspect,
    } = props;

    const theme =
      ENTRY_THEME[entry.entry_type as EntryType] || ENTRY_THEME.task;
    const showHandle = isDragEnabled || isOverlay;

    const handleInspectClick = (event: MouseEvent<HTMLDivElement>) => {
      if (isOverlay || isDragging || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          "button,a,input,textarea,select,details,summary,[role='button'],[data-entry-interactive]",
        )
      ) {
        return;
      }
      const selection = window.getSelection()?.toString().trim();
      if (selection) return;
      if (onInspect) {
        onInspect(entry);
      } else {
        uiEvents.emit("OPEN_ENTRY_INSPECTOR", { entry });
      }
    };

    let containerStyle = "";
    if (isOverlay) {
      containerStyle =
        "bg-base-100 shadow-2xl ring-1 ring-base-content/5 z-50 cursor-grabbing";
    } else if (isDragging) {
      containerStyle =
        "bg-base-200/50 border-2 border-dashed border-base-content/10 opacity-40 shadow-none";
    } else {
      containerStyle =
        "bg-base-100 hover:bg-base-50/80 shadow-sm border border-base-200";
    }

    return (
      <div
        ref={ref}
        id={entry.id}
        style={style}
        className={`relative group/card touch-manipulation ${isOverlay ? "z-50" : "mb-3"}`}
      >
        <div
          className={`relative transition-all duration-200 ease-out ${ENTRY_CARD_RADIUS_CLASS} ${ENTRY_CARD_OVERFLOW_CLASS} ${containerStyle} ${className}`}
          onClick={handleInspectClick}
        >
          {/* 左侧彩色条 */}
          {!isDragging || isOverlay ? (
            <div
              className={`absolute top-2.5 bottom-2.5 left-1 w-1.5 ${theme.sideBar} opacity-80 rounded-full`}
            ></div>
          ) : null}

          {/* 拖拽手柄 */}
          {showHandle && (
            <div
              {...(isOverlay ? {} : dragHandleProps)}
              data-entry-interactive
              className={`absolute left-0 top-0 bottom-0 w-10 flex items-center justify-center z-20 touch-none cursor-grab active:cursor-grabbing`}
            >
              <div
                className={`transition-all duration-200 ${isOverlay ? "text-base-content/40" : "text-base-content/10 group-hover/card:text-base-content/30"}`}
              >
                <GripVertical size={16} />
              </div>
            </div>
          )}

          {/* 内容区域 */}
          <div
            className={`py-3 pr-3 w-full transition-all ${showHandle ? "pl-8" : "pl-5"}`}
          >
            <div className={isDragging && !isOverlay ? "opacity-0" : ""}>
              <EntryItem
                entry={entry}
                refresh={refresh}
                // ✅ 关键修改：不再透传任何 onOptimistic 回调
                // EntryItem 内部现在自己使用 entryEventBus.emit()
                forceCollapse={forceCollapse || isOverlay || isDragging}
                disableOverflowCheck={
                  disableOverflowCheck || isOverlay || isDragging
                }
                isTagClickable={isTagClickable}
                hideActions={hideActions}
                readOnly={readOnly}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }),
);

export default function DraggableEntryCard(props: DraggableEntryCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: props.entry.id,
    disabled: !props.isDragEnabled,
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 999 : "auto",
    touchAction: "pan-y",
  };

  return (
    <EntryCard
      {...props}
      ref={setNodeRef}
      isDragging={isDragging}
      style={style}
      dragHandleProps={{ ...attributes, ...listeners }}
    />
  );
}
