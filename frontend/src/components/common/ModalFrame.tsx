import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { modalStack } from "../../lib/modalStack";
import { uiEvents, type CloseModalsPayload } from "../../lib/uiEvents";

interface ModalFrameProps {
  id: string;
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  listenGlobalClose?: boolean;
  portal?: boolean;
  mountWhenClosed?: boolean;
}

export function ModalFrame({
  id,
  isOpen,
  onClose,
  children,
  listenGlobalClose = true,
  portal = true,
  mountWhenClosed = false,
}: ModalFrameProps) {
  useEffect(() => {
    if (isOpen) {
      modalStack.push(id, onClose);
    } else {
      modalStack.remove(id);
    }

    return () => {
      modalStack.remove(id);
    };
  }, [isOpen, onClose, id]);

  useEffect(() => {
    if (!listenGlobalClose || !isOpen) return;

    const handleGlobalClose = (payload?: CloseModalsPayload) => {
      if (payload?.except?.includes(id)) return;
      onClose();
    };

    uiEvents.on("CLOSE_MODALS", handleGlobalClose);
    return () => {
      uiEvents.off("CLOSE_MODALS", handleGlobalClose);
    };
  }, [id, isOpen, listenGlobalClose, onClose]);

  if (!isOpen && !mountWhenClosed) return null;
  if (!portal || typeof document === "undefined") return <>{children}</>;
  return createPortal(<>{children}</>, document.body);
}
