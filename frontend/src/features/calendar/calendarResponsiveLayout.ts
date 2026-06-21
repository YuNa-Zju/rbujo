export type CalendarDotDensity = "regular" | "compact";

export interface CalendarResponsiveMetrics {
  monthSurfaceHeight: number;
  weekSurfaceHeight: number;
  monthCardMinHeight: number;
  weekCardMinHeight: number;
  dayCellHeight: number;
  weekDayCellHeight: number;
  dayButtonSize: number;
  dotDensity: CalendarDotDensity;
  forceWeekView: boolean;
  cardTop: number;
}

export function getCalendarResponsiveMetrics(
  viewportHeight: number,
): CalendarResponsiveMetrics {
  if (viewportHeight <= 600) {
    return {
      monthSurfaceHeight: 204,
      weekSurfaceHeight: 118,
      monthCardMinHeight: 172,
      weekCardMinHeight: 88,
      dayCellHeight: 22,
      weekDayCellHeight: 30,
      dayButtonSize: 20,
      dotDensity: "compact",
      forceWeekView: true,
      cardTop: 10,
    };
  }

  if (viewportHeight <= 680) {
    return {
      monthSurfaceHeight: 228,
      weekSurfaceHeight: 128,
      monthCardMinHeight: 192,
      weekCardMinHeight: 96,
      dayCellHeight: 24,
      weekDayCellHeight: 32,
      dayButtonSize: 21,
      dotDensity: "compact",
      forceWeekView: true,
      cardTop: 12,
    };
  }

  if (viewportHeight <= 760) {
    return {
      monthSurfaceHeight: 260,
      weekSurfaceHeight: 128,
      monthCardMinHeight: 220,
      weekCardMinHeight: 88,
      dayCellHeight: 28,
      weekDayCellHeight: 32,
      dayButtonSize: 22,
      dotDensity: "compact",
      forceWeekView: false,
      cardTop: 16,
    };
  }

  return {
    monthSurfaceHeight: 300,
    weekSurfaceHeight: 144,
    monthCardMinHeight: 252,
    weekCardMinHeight: 98,
    dayCellHeight: 32,
    weekDayCellHeight: 34,
    dayButtonSize: 24,
    dotDensity: "regular",
    forceWeekView: false,
    cardTop: 20,
  };
}
