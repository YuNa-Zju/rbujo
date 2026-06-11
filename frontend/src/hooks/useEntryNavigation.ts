// src/hooks/useEntryNavigation.ts
import { useNavigate, useLocation } from "react-router-dom";
import { isValid, parseISO, format } from "date-fns";
import { entryEventBus, type CloseModalsPayload } from "../lib/entryEventBus";

// ✅ 必须定义这个接口
interface JumpOptions {
  skipCloseModal?: boolean;
}

export function useEntryNavigation() {
  const navigate = useNavigate();
  const location = useLocation();

  // ✅ 必须添加 options 参数
  const handleJump = (
    targetDate: string | undefined | null,
    options?: JumpOptions,
  ) => {
    // 1. Future Log
    if (!targetDate) {
      if (!options?.skipCloseModal) {
        const payload: CloseModalsPayload = { except: ["FutureLogModal"] };
        entryEventBus.emit("window:close_all_modals", payload);
      }
      // 延时发送打开信号，确保 FutureLogModal 有机会响应
      setTimeout(() => {
        entryEventBus.emit("window:open_future_log", {});
      }, 0);

      navigate("/", { state: { openFutureLog: true, t: Date.now() } });
      return;
    }

    // 2. Daily Log
    let dateStr = targetDate;

    // ✅ 逻辑：只有没有跳过标志时，才关闭其他弹窗
    if (!options?.skipCloseModal) {
      entryEventBus.emit("window:close_all_modals", {});
    }

    if (targetDate.includes("T")) {
      const parsed = parseISO(targetDate);
      if (isValid(parsed)) {
        dateStr = format(parsed, "yyyy-MM-dd");
      }
    }

    sessionStorage.setItem("calendar_focus_date", dateStr);

    const shouldGoToCalendar =
      location.pathname === "/" || location.pathname === "/timeline";

    if (shouldGoToCalendar) {
      navigate("/", {
        state: { focusDate: dateStr, t: Date.now() },
        replace: true,
      });
    } else {
      navigate(`/daily/${dateStr}`);
    }
  };

  return { handleJump };
}
