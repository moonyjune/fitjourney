import { Easing, Platform } from 'react-native';
import { useReducedMotion } from '../../../theme/useReducedMotion';

/** The native animation driver is unavailable on web (react-native-web would warn), so only ask for it elsewhere. Under
 *  Jest the native module is a stub that never advances values, so tests run the same animations on the JS driver. */
export const NATIVE_DRIVER = Platform.OS !== 'web' && process.env.NODE_ENV !== 'test';

/** Everything eases out: quick to react, soft to land. */
export const EASE_OUT = Easing.out(Easing.cubic);

/** Durations in ms. Interactions stay under ~300; only celebrations run longer. */
export const DURATION = { press: 110, fast: 180, base: 280, slow: 420, celebrate: 1100 } as const;

/** False when the OS asks for reduced motion: every motion component then jumps straight to its final state and
 *  never starts a loop. */
export function useMotionEnabled(): boolean {
  return !useReducedMotion();
}
