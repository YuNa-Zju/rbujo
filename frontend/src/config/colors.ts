// src/config/colors.ts

export const ENTRY_COLORS = {
  // 类型颜色 (Type)
  task: {
    dot: "bg-indigo-400 dark:bg-indigo-400",
    text: "text-indigo-600 dark:text-indigo-300",
    bg: "bg-indigo-50 dark:bg-indigo-900/20",
    border: "border-indigo-200 dark:border-indigo-800",
  },
  idea: {
    dot: "bg-amber-400 dark:bg-amber-400",
    text: "text-amber-600 dark:text-amber-300",
    bg: "bg-amber-50 dark:bg-amber-900/20",
    border: "border-amber-200 dark:border-amber-800",
  },
  event: {
    dot: "bg-sky-400 dark:bg-sky-400",
    text: "text-sky-600 dark:text-sky-300",
    bg: "bg-sky-50 dark:bg-sky-900/20",
    border: "border-sky-200 dark:border-sky-800",
  },
  // 状态颜色 (Status)
  completed: {
    dot: "bg-emerald-400",
    text: "text-base-content/40 line-through",
  },
  cancelled: {
    dot: "bg-base-content/30",
    text: "text-base-content/40 line-through decoration-wavy",
  },
};

export const UI_COLORS = {
  activeDate: "bg-primary text-primary-content shadow-md font-bold",
  todayDate: "ring-1 ring-primary text-primary font-bold",
  dimmedDate: "opacity-30",
};
