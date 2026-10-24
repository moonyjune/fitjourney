import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { quest } from '../../theme/quest';
import { useReducedMotion } from '../../theme/useReducedMotion';

interface XpBarProps {
  /** 0..1 */
  ratio: number;
  color?: string;
  trackColor?: string;
  height?: number;
  accessibilityLabel?: string;
}

/** Progress bar whose fill eases to its new value; snaps instantly when reduced motion is on. */
export function XpBar({ ratio, color = quest.xp, trackColor = quest.raised2, height = 10, accessibilityLabel }: XpBarProps) {
  const reduced = useReducedMotion();
  const clamped = Math.max(0, Math.min(1, ratio));
  const fill = useRef(new Animated.Value(clamped)).current;

  useEffect(() => {
    if (reduced) {
      fill.setValue(clamped);
      return;
    }
    Animated.timing(fill, { toValue: clamped, duration: 600, useNativeDriver: false }).start();
  }, [clamped, reduced, fill]);

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
