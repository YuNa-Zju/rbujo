import { Circle, Minus, CircleDashed } from "lucide-react";

export const ENTRY_THEME = {
  task: {
    key: "task",
    label: "Task",
    // 图标/文字色：亮色用较深的靛蓝，暗色用明亮的靛蓝（发光感）
    color: "text-indigo-600 dark:text-indigo-300",

    // 侧边条：稍微带点透明度，不那么死板
    sideBar: "bg-indigo-500/80 dark:bg-indigo-400/80",
    dotColor: "bg-indigo-500",
    dragRing: "ring-indigo-500/30",

    // ✅ Pastel 核心：激活状态
    // Light: 极淡的靛蓝底 + 深靛蓝字
    // Dark:  使用 400 色号的 20% 透明度（发光感），而不是 900 的浑浊感
    activeBg: "bg-indigo-100 dark:bg-indigo-400/20",
    activeText: "text-indigo-700 dark:text-indigo-100",
    activeBorder: "border-indigo-200 dark:border-indigo-400/30",

    // 普通状态背景：极淡，几乎隐形
    softBg: "bg-indigo-50/50 dark:bg-indigo-400/5",
    softHover: "hover:bg-indigo-50 dark:hover:bg-indigo-400/10",

    // 按钮：保持一定的存在感，但阴影改为彩色阴影
    btnBg:
      "bg-indigo-500 hover:bg-indigo-600 text-white shadow-indigo-500/20 border-indigo-200/20",
    icon: Circle,
  },
  idea: {
    key: "idea",
    label: "Idea",
    // Idea 使用 Amber (琥珀色/暖黄)
    color: "text-amber-600 dark:text-amber-300",
    sideBar: "bg-amber-500/80 dark:bg-amber-400/80",
    dotColor: "bg-amber-500",
    dragRing: "ring-amber-500/30",

    // ✅ 修复灰白遮罩的关键：
    // Dark Mode 下使用 amber-400/20。Amber-400 是明黄色，配合透明度在黑底上是清透的金色。
    // 如果用 amber-600 或 900，就会显得像棕色或灰色泥巴。
    activeBg: "bg-amber-100 dark:bg-amber-400/20",
    activeText: "text-amber-800 dark:text-amber-100", // 文字深一点保证对比度
    activeBorder: "border-amber-200 dark:border-amber-400/30",

    softBg: "bg-amber-50/50 dark:bg-amber-400/5",
    softHover: "hover:bg-amber-50 dark:hover:bg-amber-400/10",

    btnBg:
      "bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/20 border-amber-200/20",
    icon: Minus,
  },
  event: {
    key: "event",
    label: "Event",
    // Event 使用 Sky (天蓝) - 或者你可以换成 Rose (粉色) 如果想要更 Pastel
    color: "text-sky-600 dark:text-sky-300",
    sideBar: "bg-sky-500/80 dark:bg-sky-400/80",
    dotColor: "bg-sky-500",
    dragRing: "ring-sky-500/30",

    // Pastel Blue
    activeBg: "bg-sky-100 dark:bg-sky-400/20",
    activeText: "text-sky-700 dark:text-sky-100",
    activeBorder: "border-sky-200 dark:border-sky-400/30",

    softBg: "bg-sky-50/50 dark:bg-sky-400/5",
    softHover: "hover:bg-sky-50 dark:hover:bg-sky-400/10",

    btnBg:
      "bg-sky-500 hover:bg-sky-600 text-white shadow-sky-500/20 border-sky-200/20",
    icon: CircleDashed,
  },
} as const;

export type EntryType = keyof typeof ENTRY_THEME;
