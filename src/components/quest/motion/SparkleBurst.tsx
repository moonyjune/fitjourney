import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { quest } from '../../../theme/quest';
import { hiddenSvgProps } from '../hiddenSvg';
import { DURATION, EASE_OUT, NATIVE_DRIVER, useMotionEnabled } from './tokens';

interface SparkleBurstProps {
  /** Plays once when it turns true (or on mount while true). */
  play?: boolean;
  count?: number;
  radius?: number;
  size?: number;
  colors?: string[];
}

/** Gold diamonds that fly out from the centre and fade, then unmount. Purely decorative (hidden from screen readers);
 *  with reduced motion nothing is drawn. Put it in a positioned container, centred on the thing being celebrated. */
export function SparkleBurst({ play = true, count = 12, radius = 96, size = 9, colors = [quest.gold, quest.goldLight, quest.xp] }: SparkleBurstProps) {
  const enabled = useMotionEnabled();
  const progress = useRef(new Animated.Value(0)).current;
  const [running, setRunning] = useState(false);
  const particles = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2 + (i % 2) * 0.18;
        const reach = radius * (0.7 + 0.3 * ((i * 7) % 5) / 4);
        return { dx: Math.cos(angle) * reach, dy: Math.sin(angle) * reach, color: colors[i % colors.length], turn: i % 2 ? '90deg' : '-90deg' };
      }),
    [count, radius, colors]
  );

  useEffect(() => {
    if (!play || !enabled) {
      setRunning(false);
      return;
    }
    progress.setValue(0);
    setRunning(true);
    const run = Animated.timing(progress, { toValue: 1, duration: DURATION.celebrate, easing: EASE_OUT, useNativeDriver: NATIVE_DRIVER });
    run.start(({ finished }) => {
      if (finished) setRunning(false);
    });
    return () => {
      run.stop();
      setRunning(false);
    };
  }, [play, enabled, progress]);

  if (!running) return null;
  return (
    <View style={styles.center} {...hiddenSvgProps}>
      {particles.map((p, i) => (
        <Animated.View
          key={i}
          style={[
            styles.dot,
            {
              width: size,
              height: size,
              backgroundColor: p.color,
              opacity: progress.interpolate({ inputRange: [0, 0.1, 0.65, 1], outputRange: [0, 1, 1, 0] }),
              transform: [
                { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, p.dx] }) },
                { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, p.dy] }) },
                { rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['45deg', p.turn] }) },
                { scale: progress.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.3, 1.2, 0.4] }) },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' },
  dot: { position: 'absolute', borderRadius: 2 },
});
