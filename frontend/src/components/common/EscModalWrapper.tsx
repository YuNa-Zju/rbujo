import { useEffect } from "react";
import { modalStack } from "../../lib/modalStack";
import { uiEvents, type CloseModalsPayload } from "../../lib/uiEvents";

interface EscModalWrapperProps {
  /** 弹窗的唯一 ID，用于栈管理 (必须唯一，如 'SearchModal') */
  id: string;
  /** 弹窗是否处于打开状态 */
  isOpen: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 子元素 (Modal 的内容) */
  children: React.ReactNode;
  /** 是否监听全局关闭事件 (默认 true) */
  listenGlobalClose?: boolean;
}

export const EscModalWrapper = ({
  id,
  isOpen,
  onClose,
  children,
  listenGlobalClose = true,
}: EscModalWrapperProps) => {
  // 1. 处理 ESC 栈逻辑
  useEffect(() => {
    if (isOpen) {
      modalStack.push(id, onClose);
    } else {
      modalStack.remove(id);
    }

    // 组件卸载时保险起见移除
    return () => {
      modalStack.remove(id);
    };
  }, [isOpen, onClose, id]);

  // 2. 处理全局总线关闭信号 (uiEvents.emit('CLOSE_MODALS'))
  useEffect(() => {
    if (!listenGlobalClose || !isOpen) return;

    const handleGlobalClose = (payload?: CloseModalsPayload) => {
      // 如果 payload 指定了排除列表，且当前 ID 在排除列表中，则不关闭
      if (payload?.except?.includes(id)) return;
      onClose();
    };

    uiEvents.on("CLOSE_MODALS", handleGlobalClose);
    return () => {
      uiEvents.off("CLOSE_MODALS", handleGlobalClose);
    };
  }, [isOpen, onClose, id, listenGlobalClose]);

  return <>{children}</>;
};
