import { useState, useEffect } from "react";
import {
  format,
  subMonths,
  addMonths,
  subWeeks,
  addWeeks,
  subYears,
  addYears,
  startOfMonth,
  startOfWeek,
  isSameMonth,
  isValid,
  parseISO,
} from "date-fns";
import { useLocation } from "react-router-dom";

type ViewMode = "year" | "month" | "week";

export function useCalendarState() {
  const location = useLocation();

  // 初始化日期
  const getInitialDate = () => {
    if (location.state?.focusDate) {
      const p = new Date(location.state.focusDate);
      if (isValid(p)) return p;
    }
    const saved = sessionStorage.getItem("calendar_focus_date");
    if (saved) {
      const p = parseISO(saved);
      if (isValid(p)) return p;
    }
    return new Date();
  };

  const [currentDate, setCurrentDate] = useState<Date>(getInitialDate);
  const [selectedDate, setSelectedDate] = useState<Date>(getInitialDate);
  const [viewMode, setViewMode] = useState<ViewMode>(
    () => (localStorage.getItem("calendar_view_mode") as ViewMode) || "month",
  );
  const [lastViewMode, setLastViewMode] = useState<ViewMode>(viewMode);

  // 处理路由传参跳转
  useEffect(() => {
    const state = location.state as any;
    if (!state) return;

    if (state.focusDate) {
      const target = parseISO(state.focusDate);
      if (isValid(target)) {
        setSelectedDate(target);
        setCurrentDate(target);
        sessionStorage.setItem(
          "calendar_focus_date",
          format(target, "yyyy-MM-dd"),
        );
        if (viewMode === "year") setViewMode("month");
        // 清理 history state 防止刷新重复触发
        window.history.replaceState({}, document.title);
      }
    }
  }, [location]);

  // 持久化视图模式
  useEffect(() => {
    localStorage.setItem("calendar_view_mode", viewMode);
  }, [viewMode]);

  // --- Actions ---

  const handleDateClick = (day: Date) => {
    setSelectedDate(day);
    sessionStorage.setItem("calendar_focus_date", format(day, "yyyy-MM-dd"));

    if (viewMode === "year") {
      setCurrentDate(day);
      setViewMode("month");
      setLastViewMode("month");
      return;
    }
    if (viewMode === "month" && !isSameMonth(day, currentDate)) {
      setCurrentDate(day);
    }
    if (viewMode === "week") {
      setCurrentDate(day);
    }
  };

  const handleMonthClick = (monthDate: Date) => {
    setCurrentDate(monthDate);
    const firstDay = startOfMonth(monthDate);
    setSelectedDate(firstDay);
    sessionStorage.setItem(
      "calendar_focus_date",
      format(firstDay, "yyyy-MM-dd"),
    );
    setViewMode("month");
    setLastViewMode("month");
  };

  const handleNav = (direction: "prev" | "next") => {
    let fn;
    if (viewMode === "year") fn = direction === "prev" ? subYears : addYears;
    else if (viewMode === "month")
      fn = direction === "prev" ? subMonths : addMonths;
    else fn = direction === "prev" ? subWeeks : addWeeks;

    const newDate = fn(currentDate, 1);
    setCurrentDate(newDate);

    if (viewMode !== "year") {
      const newSelected =
        viewMode === "month"
          ? startOfMonth(newDate)
          : startOfWeek(newDate, { weekStartsOn: 1 });
      setSelectedDate(newSelected);
      sessionStorage.setItem(
        "calendar_focus_date",
        format(newSelected, "yyyy-MM-dd"),
      );
    }
  };

  const handleJumpToDate = (targetDate: Date) => {
    setCurrentDate(targetDate);
    setSelectedDate(targetDate);
    sessionStorage.setItem(
      "calendar_focus_date",
      format(targetDate, "yyyy-MM-dd"),
    );
  };

  const toggleViewMode = () => {
    if (viewMode === "year") {
      setViewMode(lastViewMode || "month");
    } else {
      setLastViewMode(viewMode);
      setViewMode("year");
    }
  };

  return {
    currentDate,
    selectedDate,
    viewMode,
    setViewMode, // 暴露给手势操作使用
    lastViewMode,
    setLastViewMode,
    setCurrentDate, // 暴露给手势
    handleDateClick,
    handleMonthClick,
    handleNav,
    handleJumpToDate,
    toggleViewMode,
  };
}
