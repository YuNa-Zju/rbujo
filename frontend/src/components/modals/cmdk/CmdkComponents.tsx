import React from "react";
import { Command } from "cmdk";

// 键盘按键提示组件 (保持样式不变)
export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="
      h-6 min-w-[24px] px-2 flex items-center justify-center
      text-[11px] font-bold font-mono tracking-tighter text-base-content/60
      bg-base-200 rounded-md border border-base-300 border-b-2
      shadow-[0_1px_0_0_rgba(0,0,0,0.05)] select-none
    "
    >
      {children}
    </span>
  );
}

// 列表项组件
interface ItemProps {
  icon?: React.ReactNode;
  label: string;
  subLabel?: string;
  shortcut?: React.ReactNode | string;
  // ✅ 新增 value 属性，用于传递别名关键词
  value?: string;
  onSelect: (value?: string) => void;
  danger?: boolean;
}

// ✅ 使用 forwardRef 包裹，修复键盘导航和滚动问题
export const Item = React.forwardRef<HTMLDivElement, ItemProps>(
  (
    { icon, label, subLabel, shortcut, onSelect, danger = false, value },
    ref,
  ) => {
    // ✅ 构造搜索字符串：同时包含显示的 Label 和 隐式的 Value (别名)
    // 这样输入 "new" 就能匹配到 "新建日记" (如果 value="new")
    const searchString = value ? `${label} ${value}` : label;

    return (
      <Command.Item
        ref={ref}
        value={searchString} // ✅ 传递给 cmdk 用于过滤
        onSelect={onSelect}
        className={`
        relative flex items-center gap-4 px-5 py-3.5 rounded-2xl text-base font-medium transition-all duration-200 cursor-pointer group font-lxgw
        border border-transparent select-none

        text-base-content/70

        data-[selected=true]:bg-base-content/5
        dark:data-[selected=true]:bg-white/10
        data-[selected=true]:text-base-content
        data-[selected=true]:scale-[0.99]
        data-[selected=true]:shadow-sm

        ${danger ? "!text-error data-[selected=true]:!bg-error/10" : ""}
      `}
      >
        <div
          className={`shrink-0 p-2 rounded-xl transition-colors duration-200
          ${
            danger
              ? "bg-error/10 text-error group-data-[selected=true]:bg-error/20"
              : "bg-base-content/5 text-base-content/50 group-data-[selected=true]:bg-primary/20 group-data-[selected=true]:text-primary"
          }
        `}
        >
          {icon && <span className="[&>svg]:w-5 [&>svg]:h-5">{icon}</span>}
        </div>

        <div className="flex flex-col flex-1 min-w-0">
          <span className="truncate">{label}</span>
          {subLabel && (
            <span className="text-xs opacity-40 font-normal group-data-[selected=true]:opacity-60 transition-opacity">
              {subLabel}
            </span>
          )}
        </div>

        {shortcut && (
          <div className="ml-auto flex gap-1 opacity-50 group-data-[selected=true]:opacity-100 transition-opacity">
            {typeof shortcut === "string" ? <Kbd>{shortcut}</Kbd> : shortcut}
          </div>
        )}
      </Command.Item>
    );
  },
);

Item.displayName = "Item";
