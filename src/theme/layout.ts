import { useWindowDimensions } from 'react-native';

export const WINDOW_BREAKPOINTS = {
  medium: 600,
  twoPane: 1000,
} as const;

export const NAVIGATION_RAIL_WIDTH = 96;
export const FORM_MAX_WIDTH = 720;
export const READING_MAX_WIDTH = 840;
export const APP_MAX_WIDTH = 1120;

export function useResponsiveLayout() {
  const { width, fontScale } = useWindowDimensions();
  const isMedium = width >= WINDOW_BREAKPOINTS.medium;

  return {
    isNarrow: width < 360 || (width < WINDOW_BREAKPOINTS.medium && fontScale > 1.2),
    isMedium,
    isTwoPane: width >= WINDOW_BREAKPOINTS.twoPane,
    horizontalPadding: width < 360 ? 16 : isMedium ? 24 : 20,
  };
}
