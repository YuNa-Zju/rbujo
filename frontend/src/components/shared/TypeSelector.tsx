import { ENTRY_THEME } from "../../config/entryTheme";
import type { EntryType } from "../../config/entryTheme";
import { useTranslation } from "../../hooks/useTranslation";

interface Props {
  currentType: EntryType;
  onChange: (type: EntryType) => void;
}

export default function TypeSelector({ currentType, onChange }: Props) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-3 gap-3 p-1">
      {/* 仅保留极其轻微的起伏动画，增加灵动感 */}
      <style>{`
        @keyframes subtle-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-2px); }
        }
      `}</style>

      {(Object.values(ENTRY_THEME) as any[]).map((theme) => {
        const isSelected = currentType === theme.key;

        // 玻璃色值配置：使用极低饱和度和高透明度
        const glassStyles = {
          task: isSelected
            ? "bg-indigo-500/15 border-indigo-500/30 text-indigo-600 dark:text-indigo-400"
            : "bg-base-200/40 border-transparent text-base-content/30",
          idea: isSelected
            ? "bg-amber-500/15 border-amber-500/30 text-amber-600 dark:text-amber-400"
            : "bg-base-200/40 border-transparent text-base-content/30",
          event: isSelected
            ? "bg-sky-500/15 border-sky-500/30 text-sky-600 dark:text-sky-400"
            : "bg-base-200/40 border-transparent text-base-content/30",
        }[theme.key as string];

        return (
          <button
            key={theme.key}
            onClick={() => onChange(theme.key as EntryType)}
            className={`
              relative flex flex-col items-center justify-center gap-1.5 h-16 rounded-2xl
              transition-all duration-300 border backdrop-blur-md overflow-hidden
              ${glassStyles}
              ${isSelected ? "shadow-sm z-10" : "hover:bg-base-200/60"}
            `}
            style={{
              animation: isSelected
                ? "subtle-float 4s ease-in-out infinite"
                : "none",
            }}
          >
            {/* 这里的图标和文字不再使用强制白色，而是使用对应主题的深色，增加玻璃的透光感 */}
            <theme.icon
              size={20}
              strokeWidth={isSelected ? 2.5 : 2}
              className={`transition-all duration-300 ${isSelected ? "scale-110" : "opacity-50"}`}
            />

            <span
              className={`text-[10px] font-bold tracking-widest uppercase transition-all`}
            >
              {t.common[theme.key as keyof typeof t.common] || theme.label}
            </span>

            {/* 彻底去掉顶部的白边高光和背景流光 */}
          </button>
        );
      })}
    </div>
  );
}
