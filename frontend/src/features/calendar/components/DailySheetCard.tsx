import { useRef, type PointerEvent, type ReactNode, type WheelEvent } from "react";
import { motion, useDragControls, type PanInfo } from "framer-motion";
import clsx from "clsx";

type CalendarViewMode = "month" | "week";

interface DailySheetCardProps {
  viewMode: CalendarViewMode;
  isManualSorting: boolean;
  title: ReactNode;
  actions: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onCollapseCalendar: () => void;
  onExpandCalendar: () => void;
  onToggleCalendar: () => void;
}

const SHEET_DRAG_DISTANCE_THRESHOLD = 54;
const SHEET_DRAG_VELOCITY_THRESHOLD = 480;
export const SHEET_WHEEL_THRESHOLD = 42;
const SHEET_WHEEL_COOLDOWN_MS = 360;

export default function DailySheetCard({
  viewMode,
  isManualSorting,
  title,
  actions,
  children,
  footer,
  onCollapseCalendar,
  onExpandCalendar,
  onToggleCalendar,
}: DailySheetCardProps) {
  const dragControls = useDragControls();
  const lastWheelAt = useRef(0);

  const startSheetDrag = (event: PointerEvent<HTMLElement>) => {
    if (isManualSorting) return;
    dragControls.start(event);
  };

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (
      info.offset.y <= -SHEET_DRAG_DISTANCE_THRESHOLD ||
      info.velocity.y <= -SHEET_DRAG_VELOCITY_THRESHOLD
    ) {
      onCollapseCalendar();
      return;
    }
    if (
      info.offset.y >= SHEET_DRAG_DISTANCE_THRESHOLD ||
      info.velocity.y >= SHEET_DRAG_VELOCITY_THRESHOLD
    ) {
      onExpandCalendar();
    }
  };

  const handleSheetWheel = (event: WheelEvent<HTMLElement>) => {
    if (isManualSorting || Math.abs(event.deltaY) < SHEET_WHEEL_THRESHOLD) return;
    event.preventDefault();
    const now = Date.now();
    if (now - lastWheelAt.current < SHEET_WHEEL_COOLDOWN_MS) return;
    lastWheelAt.current = now;
    if (event.deltaY < 0) {
      onCollapseCalendar();
    } else {
      onExpandCalendar();
    }
  };

  return (
    <motion.section
      layout
      drag="y"
      dragControls={dragControls}
      dragListener={false}
      dragMomentum={false}
      dragElastic={0.08}
      dragConstraints={{ top: 0, bottom: 0 }}
      onDragEnd={handleDragEnd}
      animate={{ y: 0 }}
      transition={{ type: "spring", stiffness: 420, damping: 38 }}
      className={clsx(
        "relative flex h-full min-h-0 flex-col overflow-hidden rounded-[2rem] border border-base-200/80 bg-base-100/95 shadow-[0_18px_55px_rgba(15,23,42,0.08)]",
        viewMode === "week" ? "mt-3" : "mt-4",
      )}
    >
      <div
        className={clsx(
          "flex-none border-b border-base-content/5 bg-base-100/90 px-4 pb-2 pt-1.5 backdrop-blur-md",
          isManualSorting ? "cursor-default" : "cursor-grab active:cursor-grabbing",
        )}
        onPointerDown={startSheetDrag}
        onWheel={handleSheetWheel}
      >
        <button
          type="button"
          className="mx-auto mb-2 block h-2 w-16 rounded-full bg-base-content/15 transition-colors hover:bg-primary/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          onClick={onToggleCalendar}
          onPointerDown={(event) => event.stopPropagation()}
          aria-label={
            viewMode === "month" ? "Switch to week view" : "Switch to month view"
          }
          title={viewMode === "month" ? "Switch to week view" : "Switch to month view"}
        />
        <div className="flex min-h-9 items-center justify-between gap-3">
          {title}
          <div className="flex items-center gap-1">{actions}</div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>

      {footer && (
        <div className="flex-none border-t border-base-content/5 bg-linear-to-t from-base-100 via-base-100/95 to-base-100/75 p-2">
          {footer}
        </div>
      )}
    </motion.section>
  );
}
