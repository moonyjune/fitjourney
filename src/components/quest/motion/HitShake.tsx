import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';
import { NATIVE_DRIVER, useMotionEnabled } from './tokens';

interface HitShakeProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Shakes once on mount while true. */
  play?: boolean;
  delay?: number;
}

/** A single quick left-right shake (about 0.3 s): the boss flinching from the damage dealt today. */
export function HitShake({ children, style, play = true, delay = 350 }: HitShakeProps) {
  const enabled = useMotionEnabled();
  const x = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!enabled || !play) return;
    const step = (to: number) => Animated.timing(x, { toValue: to, duration: 55, useNativeDriver: NATIVE_DRIVER });
    const run = Animated.sequence([Animated.delay(delay), step(-9), step(9), step(-6), step(5), step(0)]);
    run.start();
    return () => run.stop();
  }, [enabled, play, delay, x]);

  return <Animated.View style={[style, { transform: [{ translateX: x }] }]}>{children}</Animated.View>;
}
