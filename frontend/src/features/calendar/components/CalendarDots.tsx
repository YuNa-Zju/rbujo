import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronRight, ChevronsRight, Check } from "lucide-react";
import { type EntryType } from "../../../config/entryTheme";

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

export default function CalendarDots({
  items,
}: {
  items: DayOverview[];
  dateKey: string;
  viewMode: any;
}) {
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
    <div className="flex gap-0.5 mt-1 justify-center flex-wrap px-0.5 min-h-[12px] items-center pointer-events-none">
      <AnimatePresence mode="popLayout">
        {visibleItems.map((item) => {
          const config = getRenderConfig(item);
          const isIcon = config.type === "icon";

          return (
            <motion.div
              key={item.id}
              layout
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{
                layout: { type: "spring", stiffness: 300, damping: 25 },
                scale: { type: "spring", stiffness: 400, damping: 20 },
                opacity: { duration: 0.2 },
              }}
              // ✅ 修复核心：动态类名
              // 如果是图标(Icon)：使用 w-3 h-3 (12px)，给图标足够的空间展示
              // 如果是圆点(Dot)：保持 w-2 h-2 (8px)，保持紧凑
              className={`flex items-center justify-center ${
                isIcon ? "w-3 h-3" : "w-2 h-2"
              }`}
            >
              {isIcon && config.icon ? (
                // ✅ 图标配置：
                // size={12}: 现在容器是 12px，这里设为 12 就能撑满容器，看起来很大
                // strokeWidth={4}: 保持超粗线条
                // -ml-[0.5px]: 视觉微调居中
                <config.icon
                  size={12}
                  strokeWidth={4}
                  color={config.color}
                  className="opacity-100 -ml-[0.5px]"
                />
              ) : (
                // ✅ 普通圆点
                <div
                  className="w-2 h-2 rounded-full ring-1 ring-base-100"
                  style={{ backgroundColor: config.color }}
                />
              )}
            </motion.div>
          );
        })}

        {overflowCount > 0 && (
          <motion.div
            key="overflow-badge"
            layout
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="h-3 min-w-[14px] px-1 rounded-full bg-rose-400/80 flex items-center justify-center ring-1 ring-base-100"
          >
            <span className="text-[9px] font-bold text-white leading-none">
              +{overflowCount}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
