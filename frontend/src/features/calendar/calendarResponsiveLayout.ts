export type CalendarDotDensity = "regular" | "compact";

export interface CalendarResponsiveMetrics {
  monthSurfaceHeight: number;
  monthSurfaceMinHeight: number;
  monthSurfaceMaxHeight: number;
  weekSurfaceHeight: number;
  manualWeekSwitchHeight: number;
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
      monthSurfaceMinHeight: 118,
      monthSurfaceMaxHeight: 224,
      weekSurfaceHeight: 118,
      manualWeekSwitchHeight: 156,
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
      monthSurfaceMinHeight: 128,
      monthSurfaceMaxHeight: 252,
      weekSurfaceHeight: 128,
      manualWeekSwitchHeight: 170,
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
      monthSurfaceHeight: 292,
      monthSurfaceMinHeight: 144,
      monthSurfaceMaxHeight: 318,
      weekSurfaceHeight: 136,
      manualWeekSwitchHeight: 196,
      monthCardMinHeight: 244,
      weekCardMinHeight: 98,
      dayCellHeight: 34,
      weekDayCellHeight: 34,
      dayButtonSize: 24,
      dotDensity: "compact",
      forceWeekView: false,
      cardTop: 16,
    };
  }

  return {
    monthSurfaceHeight: 372,
    monthSurfaceMinHeight: 172,
    monthSurfaceMaxHeight: 408,
    weekSurfaceHeight: 166,
    manualWeekSwitchHeight: 232,
    monthCardMinHeight: 316,
    weekCardMinHeight: 118,
    dayCellHeight: 42,
    weekDayCellHeight: 42,
    dayButtonSize: 28,
    dotDensity: "regular",
    forceWeekView: false,
    cardTop: 24,
  };
}
