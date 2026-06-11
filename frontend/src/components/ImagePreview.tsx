import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCw,
  RefreshCcw,
  RotateCcw,
} from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";

interface Props {
  src: string;
  alt?: string;
  onClose: () => void;
}

export default function ImagePreview({ src, alt, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [rotation, setRotation] = useState(0);
  const [isResetting, setIsResetting] = useState(false);

  // 拖拽/点击判断逻辑
  const clickStartPos = useRef({ x: 0, y: 0 });
  const shouldClose = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
      // ✅ 核心修复：强制聚焦到 dialog 容器，防止焦点跳到第一个按钮上
      dialog.focus();
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // --- 交互逻辑 ---
  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    shouldClose.current = false;
    clickStartPos.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    const deltaX = Math.abs(e.clientX - clickStartPos.current.x);
    const deltaY = Math.abs(e.clientY - clickStartPos.current.y);
    if (deltaX < 5 && deltaY < 5) {
      const target = e.target as HTMLElement;
      if (!target.closest(".preview-toolbar") && target.tagName !== "IMG") {
        shouldClose.current = true;
      }
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (shouldClose.current) {
      dialogRef.current?.close();
    }
  };

  const handleNativeClose = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      // 这里不需要手动调 onClose，因为 dialog 的默认行为会触发 onClose
    }
  };

  const handleReset = (resetTransform: () => void) => {
    resetTransform();
    const nearestUprightAngle = Math.round(rotation / 360) * 360;

    if (nearestUprightAngle === rotation) {
      setIsResetting(true);
      setRotation(0);
      setTimeout(() => setIsResetting(false), 50);
    } else {
      setRotation(nearestUprightAngle);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      // ✅ 修复点1：移除 autoFocus 属性 (它有时不靠谱)
      // ✅ 修复点2：添加 tabIndex={-1} 确保 div 可聚焦但不在 Tab 序列中
      tabIndex={-1}
      className="image-preview-modal outline-none"
      onClose={handleNativeClose}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onClick={handleClick}
    >
      <TransformWrapper
        centerOnInit={true}
        centerZoomedOut={true}
        initialScale={1}
        minScale={0.5}
        maxScale={4}
        smooth={true}
        wheel={{ step: 0.2 }}
        alignmentAnimation={{ sizeX: 0, sizeY: 0 }}
      >
        {({ zoomIn, zoomOut, resetTransform }) => (
          <>
            <div
              className="preview-toolbar fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-1 z-[100] p-1.5 rounded-full bg-base-100/10 backdrop-blur-md border border-white/10 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => handleReset(resetTransform)}
                className="btn btn-circle btn-sm btn-ghost text-white/90 hover:bg-white/20"
                data-tip="Reset"
              >
                <RefreshCcw size={18} />
              </button>
              <button
                onClick={() => zoomOut()}
                className="btn btn-circle btn-sm btn-ghost text-white/90 hover:bg-white/20"
              >
                <ZoomOut size={20} />
              </button>
              <button
                onClick={() => zoomIn()}
                className="btn btn-circle btn-sm btn-ghost text-white/90 hover:bg-white/20"
              >
                <ZoomIn size={20} />
              </button>
              <button
                onClick={() => setRotation((r) => r - 90)}
                className="btn btn-circle btn-sm btn-ghost text-white/90 hover:bg-white/20"
              >
                <RotateCcw size={20} />
              </button>
              <button
                onClick={() => setRotation((r) => r + 90)}
                className="btn btn-circle btn-sm btn-ghost text-white/90 hover:bg-white/20"
              >
                <RotateCw size={20} />
              </button>

              <div className="w-px h-5 bg-white/20 mx-1"></div>
              <button
                onClick={() => dialogRef.current?.close()}
                className="btn btn-circle btn-sm btn-ghost text-red-400 hover:bg-red-500/20"
              >
                <X size={22} />
              </button>
            </div>

            <TransformComponent
              wrapperClass="!w-screen !h-screen flex items-center justify-center"
              contentClass="!w-full !h-full flex items-center justify-center"
            >
              <img
                src={src}
                alt={alt}
                style={{
                  transform: `rotate(${rotation}deg)`,
                  transition: isResetting
                    ? "none"
                    : "transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)",
                }}
                className="max-w-[95vw] max-h-[95vh] object-contain shadow-2xl"
                draggable={false}
              />
            </TransformComponent>
          </>
        )}
      </TransformWrapper>
    </dialog>
  );
}
