import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';
import { NATIVE_DRIVER, useMotionEnabled } from './tokens';

interface BumpProps {
  /** Whenever this changes the content gives a quick scale bump (not on first render). */
  value: string | number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Peak scale. */
  peak?: number;
}

/** A tiny "tick" for counters: the number swells and settles each time it changes. */
export function Bump({ value, children, style, peak = 1.14 }: BumpProps) {
  const enabled = useMotionEnabled();
  const scale = useRef(new Animated.Value(1)).current;
  const previous = useRef(value);

  useEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    if (!enabled) {
      scale.setValue(1);
      return;
    }
    scale.setValue(peak);
    const run = Animated.spring(scale, { toValue: 1, friction: 5, tension: 200, useNativeDriver: NATIVE_DRIVER });
    run.start();
    return () => run.stop();
  }, [value, enabled, peak, scale]);

  return <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>;
}
