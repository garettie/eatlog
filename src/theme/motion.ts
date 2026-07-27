import { Easing } from 'react-native-reanimated';

export const DURATION = {
  short: 200,
  medium: 300,
  long: 400,
} as const;

export const EASING = {
  emphasized: Easing.bezier(0.2, 0, 0, 1),
  emphasizedAccelerate: Easing.bezier(0.3, 0, 0.8, 0.15),
  emphasizedDecelerate: Easing.bezier(0.05, 0.7, 0.1, 1),
  standard: Easing.bezier(0.2, 0, 0, 1),
  standardAccelerate: Easing.bezier(0.3, 0, 1, 1),
  standardDecelerate: Easing.bezier(0, 0, 0, 1),
} as const;

export const SPRING = {
  gentle: { damping: 30, stiffness: 240, mass: 0.9 },
  snappy: { damping: 28, stiffness: 300, mass: 0.8 },
  emphasized: { damping: 30, stiffness: 260, mass: 0.9 },
} as const;
