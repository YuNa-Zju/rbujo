const DEBUG_STORAGE_KEY = "rbujo_debug_ui";

const getDebugContext = () => {
  const activeElement = document.activeElement;
  return {
    path: window.location.pathname,
    calendarViewMode: localStorage.getItem("calendar_view_mode"),
    activeElement:
      activeElement instanceof HTMLElement
        ? {
            tag: activeElement.tagName,
            id: activeElement.id || undefined,
            className:
              typeof activeElement.className === "string"
                ? activeElement.className
                : undefined,
          }
        : null,
  };
};

export const isUIDebugEnabled = () => {
  try {
    return localStorage.getItem(DEBUG_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

export const debugLog = (
  scope: string,
  message: string,
  details?: Record<string, unknown>,
) => {
  if (!isUIDebugEnabled()) return;
  console.info(`[rbujo-ui:${scope}] ${message}`, {
    ...getDebugContext(),
    ...details,
  });
};
