import { memo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, ChevronRight, ChevronsRight, Check } from "lucide-react";
import { type EntryType } from "../../../config/entryTheme";
import type { CalendarDotDensity } from "../calendarResponsiveLayout";

export interface DayOverview {
  id: string;
  type: EntryType;
  status: string;
}

const COLOR_MAP = {
  idea: "#fbbf24", // amber-400
  event: "#38bdf8", // sky-400
  completed: "rgba(52, 211, 153, 0.8)", // emerald-400/80
  task: "#818cf8", // indigo-400
  default: "#94a3b8", // slate-400

  // 图标颜色配置
  cancelled: "#9ca3af", // gray-400
  future: "#d97706", // amber-600
  forward: "#3b82f6", // blue-500
};

export const CALENDAR_DOT_ROW_CLASS =
  "flex items-center justify-center gap-0.5 px-0.5 pointer-events-none";

const DOT_TRANSITION = {
  layout: { type: "spring" as const, stiffness: 360, damping: 28 },
  scale: { type: "spring" as const, stiffness: 420, damping: 24 },
  opacity: { duration: 0.12 },
};

function CalendarDots({
  items,
  density = "regular",
}: {
  items: DayOverview[];
  dateKey: string;
  viewMode: "month" | "week" | string;
  density?: CalendarDotDensity;
}) {
  const isCompact = density === "compact";
  const dotSize = isCompact ? 5 : 6;
  const iconBoxSize = isCompact ? 9 : 10;
  const iconSize = isCompact ? 8 : 10;
  const rowHeight = isCompact ? 9 : 10;
  const overflowBadgeHeight = isCompact ? 9 : 10;
  const overflowBadgeMinWidth = isCompact ? 11 : 12;
  const overflowFontSize = isCompact ? 7 : 8;

  const getRenderConfig = (item: DayOverview) => {
    // 1. 已删除 -> X
    if (item.status === "cancelled") {
      return { type: "icon", icon: X, color: COLOR_MAP.cancelled };
    }
    // 2. 放入 Future Log -> »
    if (["migrated_future", "future"].includes(item.status)) {
      return { type: "icon", icon: ChevronsRight, color: COLOR_MAP.future };
    }
    // 3. 推延到明天 -> >
    if (["migrated_forward", "forward"].includes(item.status)) {
      return { type: "icon", icon: ChevronRight, color: COLOR_MAP.forward };
    }
    if (item.status === "completed" && item.type === "task") {
      return { type: "icon", icon: Check, color: COLOR_MAP.completed };
    }

    // 4. 普通圆点
    let color = COLOR_MAP.default;
    if (item.type === "idea") color = COLOR_MAP.idea;
    else if (item.type === "event") color = COLOR_MAP.event;
    else if (item.type === "task") color = COLOR_MAP.task;

    return { type: "dot", color };
  };

  const safeItems = items || [];
  const visibleItems = safeItems.slice(
    0,
    safeItems.length <= 4 ? safeItems.length : 3,
  );
  const overflowCount = safeItems.length - visibleItems.length;

  return (
    <div className={CALENDAR_DOT_ROW_CLASS} style={{ height: rowHeight }}>
      <AnimatePresence initial={false} mode="popLayout">
        {visibleItems.map((item) => {
          const config = getRenderConfig(item);
          const isIcon = config.type === "icon";

          return (
            <motion.div
              key={item.id}
              layout="position"
              initial={{ scale: 0.72, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.72, opacity: 0 }}
              transition={DOT_TRANSITION}
              className="flex items-center justify-center"
              style={{
                height: isIcon ? iconBoxSize : dotSize,
                width: isIcon ? iconBoxSize : dotSize,
              }}
            >
              {isIcon && config.icon ? (
                <config.icon
                  size={iconSize}
                  strokeWidth={isCompact ? 3 : 3.5}
                  color={config.color}
                  className="opacity-100"
                />
              ) : (
                <div
                  className="rounded-full ring-1 ring-base-100"
                  style={{
                    height: dotSize,
                    width: dotSize,
                    backgroundColor: config.color,
                  }}
                />
              )}
            </motion.div>
          );
        })}

        {overflowCount > 0 && (
          <motion.div
            key="overflow-badge"
            layout="position"
            initial={{ scale: 0.72, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.72, opacity: 0 }}
            transition={DOT_TRANSITION}
            className="flex items-center justify-center rounded-full bg-rose-400/80 px-0.5 ring-1 ring-base-100"
            style={{
              height: overflowBadgeHeight,
              minWidth: overflowBadgeMinWidth,
            }}
          >
            <span
              className="font-bold leading-none text-white"
              style={{ fontSize: overflowFontSize }}
            >
              +{overflowCount}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default memo(CalendarDots);
