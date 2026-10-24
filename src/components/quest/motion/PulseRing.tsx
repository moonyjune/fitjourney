import { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { EASE_OUT, NATIVE_DRIVER, useMotionEnabled } from './tokens';

interface PulseRingProps {
  color: string;
  borderRadius: number;
  /** Stops and hides the ring when false. */
  active?: boolean;
  borderWidth?: number;
  /** Opacity range of the breathing. */
  min?: number;
  max?: number;
  /** One full in-and-out, in ms. */
  period?: number;
}

/** A thin ring laid over a card that slowly breathes, marking the thing that is "live" right now. Draws nothing and runs
 *  no loop with reduced motion. Never takes touches. */
export function PulseRing({ color, borderRadius, active = true, borderWidth = 2, min = 0.12, max = 0.65, period = 2200 }: PulseRingProps) {
  const enabled = useMotionEnabled() && active;
  const opacity = useRef(new Animated.Value(min)).current;

  useEffect(() => {
    if (!enabled) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: max, duration: period / 2, easing: EASE_OUT, useNativeDriver: NATIVE_DRIVER }),
        Animated.timing(opacity, { toValue: min, duration: period / 2, easing: EASE_OUT, useNativeDriver: NATIVE_DRIVER }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [enabled, opacity, min, max, period]);

  if (!enabled) return null;
  return <Animated.View style={[StyleSheet.absoluteFill, { pointerEvents: 'none', borderRadius, borderWidth, borderColor: color, opacity }]} />;
}
