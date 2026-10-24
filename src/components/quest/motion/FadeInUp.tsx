import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';
import { DURATION, EASE_OUT, NATIVE_DRIVER, useMotionEnabled } from './tokens';

interface FadeInUpProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Position in a staggered group: each step starts 60 ms later (capped at 360 ms). */
  index?: number;
  /** Explicit start delay in ms; overrides `index`. */
  delay?: number;
  distance?: number;
  duration?: number;
  /** false renders the final state with no animation at all (e.g. rows far below the fold). */
  animate?: boolean;
}

/** Fades and slides its content up into place once, when it first appears. The content is in the tree from the first
 *  render (only opacity and a small offset animate), so screen readers and tests never wait for it. */
export function FadeInUp({ children, style, index = 0, delay, distance = 12, duration = DURATION.base, animate = true }: FadeInUpProps) {
  const enabled = useMotionEnabled() && animate;
  const progress = useRef(new Animated.Value(enabled ? 0 : 1)).current;

  useEffect(() => {
    if (!enabled) {
      progress.setValue(1);
      return;
    }
    const run = Animated.timing(progress, {
      toValue: 1,
      duration,
      delay: delay ?? Math.min(index * 60, 360),
      easing: EASE_OUT,
      useNativeDriver: NATIVE_DRIVER,
    });
    run.start();
    return () => run.stop();
  }, [enabled, progress, duration, delay, index]);

  return (
    <Animated.View style={[style, { opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}
