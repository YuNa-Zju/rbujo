import { motion } from "framer-motion";
import { Hash } from "lucide-react";

interface TagPillProps {
  tag: string;
  onClick: (t: string) => void;
  clickable?: boolean;
  entryType?: string;
}

export const TagPill = ({
  tag,
  onClick,
  clickable = true,
  entryType = "task",
}: TagPillProps) => {
  const pastelStyles = {
    task: {
      light: "bg-indigo-50 text-indigo-600 border-indigo-200/50",
      dark: "dark:bg-indigo-500/20 dark:text-indigo-200",
    },
    idea: {
      light: "bg-amber-50 text-amber-600 border-amber-200/50",
      dark: "dark:bg-amber-500/20 dark:text-amber-200",
    },
    event: {
      light: "bg-sky-50 text-sky-600 border-sky-200/50",
      dark: "dark:bg-sky-500/20 dark:text-sky-200",
    },
  };

  const currentStyle =
    pastelStyles[entryType as keyof typeof pastelStyles] || pastelStyles.task;
  const colorClass = `${currentStyle.light} ${currentStyle.dark}`;

  const baseClass =
    "inline-flex items-center gap-1 px-2 py-0 mx-1 my-0.5 rounded-full text-[0.75em] font-medium align-baseline select-none relative z-10 hover:z-50 transition-colors border";

  const activeClass = `${colorClass} ${clickable ? "cursor-pointer border-transparent dark:border-transparent" : ""}`;
  const disabledClass =
    "bg-base-100 border-base-200 text-base-content/40 cursor-default opacity-80 pointer-events-none";

  return (
    <motion.span
      onClick={(e) => {
        e.stopPropagation();
        if (clickable) onClick(tag);
      }}
      className={`${baseClass} ${clickable ? activeClass : disabledClass}`}
      initial={false}
      whileHover={clickable ? { scale: 1.12, y: -1 } : {}}
      whileTap={clickable ? { scale: 0.95 } : {}}
      style={{ display: "inline-flex" }}
    >
      <Hash size={9} className="opacity-50" strokeWidth={2.5} />
      <span
        style={{
          fontFamily: "'LXGW WenKai Screen', sans-serif",
          letterSpacing: "0.02em",
        }}
      >
        {tag}
      </span>
    </motion.span>
  );
};
