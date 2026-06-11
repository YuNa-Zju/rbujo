// src/lib/authEvents.ts
type AuthEventType = "sessionExpired";
type AuthEventListener = () => void;

class AuthEventEmitter {
  private events: Record<string, AuthEventListener[]> = {};

  on(event: AuthEventType, listener: AuthEventListener) {
    if (!this.events[event]) this.events[event] = [];
    this.events[event].push(listener);
  }

  off(event: AuthEventType, listener: AuthEventListener) {
    if (!this.events[event]) return;
    this.events[event] = this.events[event].filter((l) => l !== listener);
  }

  emit(event: AuthEventType) {
    console.log(`📡 Emitting event: ${event}`); // 添加日志
    if (!this.events[event]) return;
    this.events[event].forEach((listener) => listener());
  }
}

// 确保导出的是同一个实例
export const authEvents = new AuthEventEmitter();
