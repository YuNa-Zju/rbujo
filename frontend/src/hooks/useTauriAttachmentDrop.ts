import { useEffect, useRef, type RefObject } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  isPointInsideElement,
  normalizeTauriAttachmentDropPayload,
  shouldAcceptTauriAttachmentDrop,
  type AttachmentDropPoint,
} from "../services/attachmentService";

interface UseTauriAttachmentDropOptions {
  targetRef: RefObject<HTMLElement | null>;
  enabled?: boolean;
  onDraggingChange?: (isDragging: boolean) => void;
  onDropPaths: (paths: string[]) => void | Promise<void>;
}

const isPositionInsideTarget = (
  position: AttachmentDropPoint,
  element: HTMLElement | null,
  scaleFactor: number,
) =>
  isPointInsideElement(
    { x: position.x / scaleFactor, y: position.y / scaleFactor },
    element,
  ) || isPointInsideElement(position, element);

export function useTauriAttachmentDrop({
  targetRef,
  enabled = true,
  onDraggingChange,
  onDropPaths,
}: UseTauriAttachmentDropOptions) {
  const scaleFactorRef = useRef(
    typeof window === "undefined" ? 1 : window.devicePixelRatio || 1,
  );
  const lastDropRef = useRef<{ key: string; at: number } | null>(null);

  useEffect(() => {
    if (!enabled || !isTauri()) return;

    let disposed = false;
    const unlisteners: Array<() => void> = [];
    const currentWindow = getCurrentWindow();

    currentWindow
      .scaleFactor()
      .then((scaleFactor) => {
        if (!disposed) {
          scaleFactorRef.current = scaleFactor;
        }
      })
      .catch((error) => {
        console.warn("Failed to read Tauri window scale factor", error);
      });

    const isInsideTarget = (position: AttachmentDropPoint) =>
      isPositionInsideTarget(
        position,
        targetRef.current,
        scaleFactorRef.current,
      );

    const updateDragging = (rawPayload: unknown) => {
      const payload = normalizeTauriAttachmentDropPayload(rawPayload);
      if (!payload) return;
      if (payload.type === "leave") {
        onDraggingChange?.(false);
        return;
      }
      if (payload.type === "drop") {
        onDraggingChange?.(false);
        return;
      }
      onDraggingChange?.(
        payload.position ? isInsideTarget(payload.position) : false,
      );
    };

    const handleDragDropEvent = (event: unknown) => {
      const rawPayload =
        event && typeof event === "object" && "payload" in event
          ? (event as { payload: unknown }).payload
          : event;
      updateDragging(rawPayload);

      const acceptedPaths = shouldAcceptTauriAttachmentDrop(
        rawPayload,
        targetRef.current,
        scaleFactorRef.current,
        typeof document === "undefined" ? null : document.activeElement,
      );
      if (acceptedPaths.length === 0) return;

      const now = Date.now();
      const key = acceptedPaths.join("\n");
      if (
        lastDropRef.current?.key === key &&
        now - lastDropRef.current.at < 600
      ) {
        return;
      }
      lastDropRef.current = { key, at: now };
      void onDropPaths(acceptedPaths);
    };

    const registerListener = (
      name: string,
      register: (handler: (event: unknown) => void) => Promise<() => void>,
    ) => {
      register(handleDragDropEvent)
        .then((nextUnlisten) => {
          if (disposed) {
            nextUnlisten();
            return;
          }
          unlisteners.push(nextUnlisten);
        })
        .catch((error) => {
          console.warn(`Failed to attach Tauri ${name} file drop listener`, error);
        });
    };

    registerListener("webview", (handler) =>
      getCurrentWebview().onDragDropEvent(handler),
    );
    registerListener("window", (handler) =>
      currentWindow.onDragDropEvent(handler),
    );

    return () => {
      disposed = true;
      for (const unlisten of unlisteners) {
        unlisten();
      }
    };
  }, [enabled, onDraggingChange, onDropPaths, targetRef]);
}
