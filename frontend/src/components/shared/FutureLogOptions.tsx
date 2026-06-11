import { CalendarDays, Sparkles } from "lucide-react";
import { useTranslation } from "../../hooks/useTranslation";

interface Props {
  targetMonth: string;
  setTargetMonth: (val: string) => void;
  isUndetermined: boolean;
  setIsUndetermined: (val: boolean) => void;
}

export default function FutureLogOptions({
  targetMonth,
  setTargetMonth,
  isUndetermined,
  setIsUndetermined,
}: Props) {
  const { t } = useTranslation();

  // --- 核心样式定义 ---
  // 未选中状态：平平无奇的背景，融入环境
  const inactiveContainer =
    "border-base-200/50 bg-base-100/50 hover:bg-base-200/50 hover:border-base-300/50 opacity-60 hover:opacity-100";
  const inactiveIconBg = "bg-base-200/50 text-base-content/50";
  const inactiveText = "text-base-content/60";
  const inactiveBorder = "border-base-300/30";

  // ✅ 选中状态 (玻璃感核心)：
  // 1. bg-orange-500/5: 极淡的暖色透明层
  // 2. backdrop-blur-md: 毛玻璃效果
  // 3. border-orange-500/20: 极淡的边缘光晕
  // 4. shadow-sm: 微微浮起的感觉
  const activeContainer =
    "border-orange-500/20 bg-orange-500/5 dark:bg-orange-400/5 backdrop-blur-md shadow-sm";
  // Icon背景也改为极淡的透明层
  const activeIconBg = "bg-orange-500/10 text-orange-500 dark:text-orange-300";
  // 文字颜色稍微深一点点，保持可读性，但不用刺眼的纯橘色
  const activeText = "text-base-content/90 font-medium";
  // 指示器边框
  const activeBorder = "border-orange-500/30";

  return (
    <div className="flex flex-col gap-3 font-lxgw">
      {/* Option 1: Specific Month */}
      <div
        className={`
          relative w-full p-3 sm:p-4 rounded-2xl border-[1.5px] transition-all duration-300 flex items-center gap-4 text-left group
          ${!isUndetermined ? activeContainer : inactiveContainer}
        `}
      >
        <input
          type="month"
          className="absolute inset-0 w-full h-full opacity-0 z-10 cursor-pointer"
          value={targetMonth}
          onChange={(e) => {
            setTargetMonth(e.target.value);
            setIsUndetermined(false);
          }}
          onClick={(e) => {
            e.stopPropagation();
            setIsUndetermined(false);
            try {
              e.currentTarget.showPicker?.();
            } catch (error) {
              console.warn("showPicker not supported", error);
            }
          }}
        />

        {/* Icon */}
        <div
          className={`
            p-2.5 sm:p-3 rounded-xl transition-colors shrink-0 backdrop-blur-sm
            ${!isUndetermined ? activeIconBg : inactiveIconBg}
          `}
        >
          <CalendarDays size={20} strokeWidth={1.8} />
        </div>

        {/* Text */}
        <div className="flex flex-col items-start flex-1 min-w-0">
          <span
            className={`text-[17px] transition-colors ${
              !isUndetermined ? activeText : inactiveText
            }`}
          >
            {t.entry.futureMonth || "Specific Month"}
          </span>
          <span className="text-sm opacity-50 font-mono truncate tracking-tight">
            {targetMonth || "Select a month..."}
          </span>
        </div>

        {/* 选中指示器 (圆点) */}
        <div
          className={`
            w-5 h-5 rounded-full border-[1.5px] flex items-center justify-center ml-2 transition-all shrink-0
            ${!isUndetermined ? activeBorder : inactiveBorder}
          `}
        >
          {!isUndetermined && (
            // 指示点也用半透明的柔和色
            <div className="w-2.5 h-2.5 rounded-full bg-orange-400/80" />
          )}
        </div>
      </div>

      {/* Option 2: Someday / Undetermined */}
      <button
        type="button"
        onClick={() => setIsUndetermined(true)}
        className={`
          relative w-full p-3 sm:p-4 rounded-2xl border-[1.5px] transition-all duration-300 flex items-center gap-4 text-left z-20 group
          ${isUndetermined ? activeContainer : inactiveContainer}
        `}
      >
        <div
          className={`
            p-2.5 sm:p-3 rounded-xl transition-colors shrink-0 backdrop-blur-sm
            ${isUndetermined ? activeIconBg : inactiveIconBg}
          `}
        >
          <Sparkles size={20} strokeWidth={1.8} />
        </div>

        <div className="flex flex-col flex-1">
          <span
            className={`text-[17px] transition-colors ${
              isUndetermined ? activeText : inactiveText
            }`}
          >
            {t.entry.futureSomeday || "Someday"}
          </span>
          <span className="text-sm opacity-50 tracking-tight">
            {t.futureLog?.undetermined || "No specific date"}
          </span>
        </div>

        <div
          className={`
            w-5 h-5 rounded-full border-[1.5px] flex items-center justify-center ml-2 transition-all
            ${isUndetermined ? activeBorder : inactiveBorder}
          `}
        >
          {isUndetermined && (
            <div className="w-2.5 h-2.5 rounded-full bg-orange-400/80" />
          )}
        </div>
      </button>
    </div>
  );
}
