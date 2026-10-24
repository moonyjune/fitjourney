import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { hiddenSvgProps } from '../hiddenSvg';
import { EASE_OUT, NATIVE_DRIVER, useMotionEnabled } from './tokens';

interface ShineProps {
  size: number;
  borderRadius?: number;
  delay?: number;
  duration?: number;
}

/** One soft highlight sweeping across a square item (an earned sticker) a single time, shortly after it appears.
 *  Decorative, never takes touches, and nothing is drawn with reduced motion. */
export function Shine({ size, borderRadius = size / 2, delay = 250, duration = 700 }: ShineProps) {
  const enabled = useMotionEnabled();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!enabled) return;
    const run = Animated.timing(progress, { toValue: 1, duration, delay, easing: EASE_OUT, useNativeDriver: NATIVE_DRIVER });
    run.start();
    return () => run.stop();
  }, [enabled, progress, delay, duration]);

  if (!enabled) return null;
  return (
    <View style={[StyleSheet.absoluteFill, { borderRadius, overflow: 'hidden', pointerEvents: 'none' }]} {...hiddenSvgProps}>
      <Animated.View
        style={{
          position: 'absolute',
          top: -size * 0.3,
          width: size * 0.3,
          height: size * 1.6,
          backgroundColor: 'rgba(255,255,255,0.28)',
          opacity: progress.interpolate({ inputRange: [0, 0.15, 0.85, 1], outputRange: [0, 1, 1, 0] }),
          transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-size * 0.5, size * 1.2] }) }, { rotate: '20deg' }],
        }}
      />
    </View>
  );
}
