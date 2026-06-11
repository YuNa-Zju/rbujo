import { useState, useEffect, useMemo, useCallback } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  addWeeks,
  addYears,
  parseISO,
  isValid,
} from "date-fns";
import { api } from "../../../lib/api";
import type {
  ViewMode,
  DayOverview,
  OverviewCache,
} from "../../../types/calendar";

export function useCalendarLogic() {
  // === 1. 状态初始化 (带持久化恢复) ===

  // 视图模式：优先从 localStorage 读取
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    return (localStorage.getItem("calendar_view_mode") as ViewMode) || "month";
  });

  // 当前焦点日期：优先从 sessionStorage 读取 (从 DailyLog 返回时很有用)
  const [currentDate, setCurrentDate] = useState<Date>(() => {
    const saved = sessionStorage.getItem("calendar_focus_date");
    if (saved) {
      const date = parseISO(saved);
      if (isValid(date)) return date;
    }
    return new Date();
  });

  // 数据缓存
  const [overviewCache, setOverviewCache] = useState<OverviewCache>({});
  const [loading, setLoading] = useState(false);

  // === 2. 副作用：状态持久化 ===
  useEffect(() => {
    localStorage.setItem("calendar_view_mode", viewMode);
  }, [viewMode]);

  useEffect(() => {
    // 每次日期变动，更新 sessionStorage，这样刷新或跳转后能回来
    sessionStorage.setItem("calendar_focus_date", currentDate.toISOString());
  }, [currentDate]);

  // === 3. 数据获取逻辑 ===
  const fetchMonthOverview = useCallback(
    async (date: Date) => {
      // 年视图不需要加载每日详情，节省资源
      if (viewMode === "year") return;

      const monthStr = format(date, "yyyy-MM");
      // 简单缓存策略：如果这个月已经有数据了，暂时不重复请求 (根据实际需求可调整)
      // 这里为了演示“乐观更新”，我们允许它在切换月份时总是请求最新
      setLoading(true);
      try {
        const res = await api.get<Record<string, DayOverview[]>>(
          `/log/month_overview/${monthStr}`,
        );
        setOverviewCache((prev) => ({ ...prev, ...res.data }));
      } catch (e) {
        console.error("Failed to fetch overview", e);
      } finally {
        setLoading(false);
      }
    },
    [viewMode],
  );

  // 监听日期变化自动拉取数据
  useEffect(() => {
    fetchMonthOverview(currentDate);
  }, [currentDate, fetchMonthOverview]); // 依赖 fetchMonthOverview (已用 useCallback 包裹)

  // === 4. 日期计算逻辑 (核心) ===
  const daysToRender = useMemo(() => {
    if (viewMode === "year") return []; // 年视图由 UI 单独处理

    let start: Date, end: Date;

    if (viewMode === "month") {
      const monthStart = startOfMonth(currentDate);
      const monthEnd = endOfMonth(currentDate);
      // 扩展到完整的周，保证网格整齐
      start = startOfWeek(monthStart, { weekStartsOn: 1 }); // 周一作为第一天
      end = endOfWeek(monthEnd, { weekStartsOn: 1 });
    } else {
      // 周视图
      start = startOfWeek(currentDate, { weekStartsOn: 1 });
      end = endOfWeek(currentDate, { weekStartsOn: 1 });
    }

    return eachDayOfInterval({ start, end });
  }, [currentDate, viewMode]);

  // === 5. 导航操作 ===
  const navigate = (direction: "prev" | "next") => {
    const modifier = direction === "next" ? 1 : -1;
    let newDate = new Date(currentDate);

    if (viewMode === "month") newDate = addMonths(currentDate, modifier);
    else if (viewMode === "week") newDate = addWeeks(currentDate, modifier);
    else if (viewMode === "year") newDate = addYears(currentDate, modifier);

    setCurrentDate(newDate);
  };

  const goToToday = () => setCurrentDate(new Date());

  // === 6. 乐观更新接口 ===
  // 允许外部（如 DailyLog 返回时）手动更新缓存，无需等待 API
  const optimisticUpdate = (dateStr: string, items: DayOverview[]) => {
    setOverviewCache((prev) => ({ ...prev, [dateStr]: items }));
  };

  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    // ... 初始化逻辑 ...
    return new Date();
  });

  return {
    viewMode,
    setViewMode,
    currentDate,
    setCurrentDate,
    selectedDate,
    setSelectedDate,
    daysToRender,
    overviewCache,
    navigate,
    goToToday,
    loading,
    optimisticUpdate,
  };
}
