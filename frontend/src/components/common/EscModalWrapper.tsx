import { ModalFrame } from "./ModalFrame";

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
  /** 原生 dialog 这类组件需要常驻 DOM，打开时再进入 ESC 栈 */
  mountWhenClosed?: boolean;
  /** 是否 portal 到 body，默认 true */
  portal?: boolean;
}

export const EscModalWrapper = ({
  id,
  isOpen,
  onClose,
  children,
  listenGlobalClose = true,
  mountWhenClosed = false,
  portal = true,
}: EscModalWrapperProps) => (
  <ModalFrame
    id={id}
    isOpen={isOpen}
    onClose={onClose}
    listenGlobalClose={listenGlobalClose}
    mountWhenClosed={mountWhenClosed}
    portal={portal}
  >
    {children}
  </ModalFrame>
);
