// src/lib/modalStack.ts

type CloseHandler = () => void;

class ModalStackManager {
  private stack: string[] = [];
  private handlers: Map<string, CloseHandler> = new Map();

  constructor() {
    // 仅在浏览器环境执行
    if (typeof window !== "undefined") {
      // ✅ 使用 capture: true 确保最先捕获事件
      window.addEventListener("keydown", this.handleKeyDown, true);
    }
  }

  /**
   * 注册弹窗
   * @param id 弹窗唯一标识 (如 "SearchModal")
   * @param onClose 关闭回调函数
   */
  push = (id: string, onClose: CloseHandler) => {
    // 避免重复入栈
    if (this.stack.includes(id)) return;
    this.stack.push(id);
    this.handlers.set(id, onClose);
    // console.log("Modal Stack Push:", this.stack);
  };

  /**
   * 移除弹窗
   * @param id 弹窗唯一标识
   */
  remove = (id: string) => {
    this.stack = this.stack.filter((itemId) => itemId !== id);
    this.handlers.delete(id);
    // console.log("Modal Stack Remove:", this.stack);
  };

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;

    // 如果栈里有弹窗
    if (this.stack.length > 0) {
      // 1. 获取栈顶（最后打开的）ID
      const topId = this.stack[this.stack.length - 1];

      // 2. 获取对应的关闭函数
      const handler = this.handlers.get(topId);

      if (handler) {
        // 3. ✅ 关键：阻止事件冒泡和默认行为
        // 这样底层的弹窗或者是其他监听了 ESC 的组件就不会收到事件了
        e.stopImmediatePropagation();
        e.stopPropagation();
        e.preventDefault();

        // 4. 执行关闭
        handler();
      }
    }
  };
}

// 导出单例
export const modalStack = new ModalStackManager();
