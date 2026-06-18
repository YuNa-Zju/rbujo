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
  const normalizedEntryType = ["task", "idea", "event"].includes(entryType)
    ? entryType
    : "task";
  const entryTypeClass = {
    task: "tag-pill-task",
    idea: "tag-pill-idea",
    event: "tag-pill-event",
  }[normalizedEntryType];

  const baseClass =
    "tag-pill inline-flex items-center gap-1 px-2 py-0 mx-1 my-0.5 rounded-full text-[0.75em] font-medium align-baseline select-none relative z-10 hover:z-50 transition-colors border";

  const activeClass = `${entryTypeClass} ${
    clickable ? "tag-pill-clickable cursor-pointer" : ""
  }`;
  const disabledClass =
    "tag-pill-disabled cursor-default opacity-80 pointer-events-none";

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
