import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { quest } from '../../theme/quest';
import { useReducedMotion } from '../../theme/useReducedMotion';
import { EASE_OUT } from './motion/tokens';

interface XpBarProps {
  /** 0..1 */
  ratio: number;
  color?: string;
  trackColor?: string;
  height?: number;
  accessibilityLabel?: string;
  /** Where the fill starts on first appearance (0..1): 0 grows an XP bar in, 1 drains a boss bar down. Defaults to 0. */
  from?: number;
  /** Delay before the first fill, in ms (lets a bar wait for the card around it to fade in). */
  delay?: number;
}

/** Progress bar whose fill eases to its new value; snaps instantly when reduced motion is on. */
export function XpBar({ ratio, color = quest.xp, trackColor = quest.raised2, height = 10, accessibilityLabel, from = 0, delay = 0 }: XpBarProps) {
  const reduced = useReducedMotion();
  const clamped = Math.max(0, Math.min(1, ratio));
  const fill = useRef(new Animated.Value(reduced ? clamped : Math.max(0, Math.min(1, from)))).current;
  const firstFill = useRef(true);

  useEffect(() => {
    if (reduced) {
      fill.setValue(clamped);
      return;
    }
    const run = Animated.timing(fill, { toValue: clamped, duration: 600, delay: firstFill.current ? delay : 0, easing: EASE_OUT, useNativeDriver: false });
    firstFill.current = false;
    run.start();
    return () => run.stop();
  }, [clamped, reduced, fill, delay]);

  return (
    <View
      accessible={accessibilityLabel != null}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={[styles.track, { height, borderRadius: height / 3, backgroundColor: trackColor }]}
    >
      <Animated.View
        style={{
          height: '100%',
          borderRadius: height / 3,
          backgroundColor: color,
          width: fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({ track: { overflow: 'hidden' } });
