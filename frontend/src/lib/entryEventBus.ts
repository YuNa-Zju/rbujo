// src/utils/entryEventBus.ts

// 定义迁移事件的数据载荷结构
export interface MigratePayload {
  source: any; // 被修改的源笔记 (例如状态变为 migrated)
  target: any; // 新生成的目标笔记
  date: string; // 目标日期字符串
}

export interface CloseModalsPayload {
  except?: string[]; // 例如 ["FutureLogModal", "SearchModal"]
}

// ✅ 核心修改：在联合类型中添加 "window:open_future_log"
export type EventType =
  | "entry:create"
  | "entry:update"
  | "entry:delete"
  | "entry:status_change"
  | "entry:migrate"
  | "entry:reload_needed"
  | "window:close_all_modals" // 全局关闭弹窗指令
  | "window:open_future_log" // 🚀 新增：打开 Future Log 指令
  | "ui:open_timeline";

type Handler = (data?: any) => void;

class EntryEventBus {
  private listeners: Record<string, Handler[]> = {};

  on(event: EventType, handler: Handler) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(handler);
  }

  off(event: EventType, handler: Handler) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter((h) => h !== handler);
  }

  emit(event: EventType, data?: any) {
    if (!this.listeners[event]) return;
    // 浅拷贝监听器数组，防止在遍历过程中有监听器被注销导致索引错乱
    [...this.listeners[event]].forEach((handler) => handler(data));
  }
}

export const entryEventBus = new EntryEventBus();
