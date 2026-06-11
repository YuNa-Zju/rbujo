// src/lib/uiEvents.ts

// 1. 定义通用载荷
export interface AddEntryPayload {
  mode?: "daily" | "future";
  date?: string | Date;
}

export interface EntryActionPayload {
  entry: any;
  defaultDate?: string;
  defaultMonth?: string;
}

// ✅ 新增：关闭弹窗的载荷
export interface CloseModalsPayload {
  except?: string[]; // 允许排除某些 ID 不关闭
  force?: boolean;
}

// 3. 定义事件名
type UIEventType =
  | "OPEN_SEARCH"
  | "OPEN_TAG_SEARCH"
  | "OPEN_FUTURE_LOG"
  | "OPEN_TIMELINE"
  | "OPEN_CALENDAR_SYNC"
  | "OPEN_ADD_ENTRY"
  | "OPEN_MIGRATE_ENTRY"
  | "OPEN_FUTURE_ENTRY"
  | "OPEN_DELETE_ENTRY"
  | "OPEN_EDIT_ENTRY"
  | "OPEN_SHARE_ENTRY"
  | "OPEN_CMD_PALETTE"
  | "OPEN_BACKUP"
  // ✅ 新增：统一关闭信号
  | "CLOSE_MODALS";

// 4. 定义事件载荷映射
interface UIEventPayloads {
  OPEN_SEARCH: string | null;
  OPEN_TAG_SEARCH: string | null;
  OPEN_FUTURE_LOG: void;
  OPEN_TIMELINE: void;
  OPEN_CALENDAR_SYNC: void;
  OPEN_ADD_ENTRY: AddEntryPayload;
  OPEN_MIGRATE_ENTRY: EntryActionPayload;
  OPEN_FUTURE_ENTRY: EntryActionPayload;
  OPEN_DELETE_ENTRY: EntryActionPayload;
  OPEN_SHARE_ENTRY: EntryActionPayload;
  OPEN_EDIT_ENTRY: EntryActionPayload;
  OPEN_CMD_PALETTE: void;
  OPEN_BACKUP: void;
  // ✅ 新增
  CLOSE_MODALS: CloseModalsPayload | undefined;
}

// 5. 事件发射器实现
type UIEventListener<T extends UIEventType> = (
  payload: UIEventPayloads[T],
) => void;

class UIEventEmitter {
  private events: Map<string, UIEventListener<any>[]> = new Map();

  on<T extends UIEventType>(event: T, listener: UIEventListener<T>) {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    this.events.get(event)?.push(listener);
  }

  off<T extends UIEventType>(event: T, listener: UIEventListener<T>) {
    const listeners = this.events.get(event);
    if (listeners) {
      this.events.set(
        event,
        listeners.filter((l) => l !== listener),
      );
    }
  }

  emit<T extends UIEventType>(event: T, payload?: UIEventPayloads[T]) {
    const listeners = this.events.get(event);
    if (listeners) {
      listeners.forEach((listener) => listener(payload as any));
    }
  }
}

export const uiEvents = new UIEventEmitter();
