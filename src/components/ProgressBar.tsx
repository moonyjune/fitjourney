import { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/tokens';
import { quest, questFonts } from '../theme/quest';

interface ProgressBarProps {
  label: string;
  current: number;
  target: number;
  unit: string;
  /** Overrides the automatic red/blue/yellow/green-by-percentage coloring below. */
  color?: string;
  /** Dark FitQuest look (default off = classic light). */
  dark?: boolean;
}

// Below 50% of target: red (behind). 50-69%: blue (on track). 70-89%: yellow (almost there).
// 90%+: green (met). Applied to every goal-tracking bar (calories/protein/water) so a glance
// at any dashboard tells you which metrics need attention today.
function colorForRatio(pct: number, dark?: boolean): string {
  if (dark) return pct >= 0.9 ? quest.xp : pct >= 0.7 ? quest.gold : pct >= 0.5 ? quest.mana : quest.hp;
  if (pct >= 0.9) return colors.success;
  if (pct >= 0.7) return colors.warning;
  if (pct >= 0.5) return colors.primary;
  return colors.danger;
}

export function ProgressBar({ label, current, target, unit, color, dark }: ProgressBarProps) {
  const styles = useMemo(() => makeStyles(!!dark), [dark]);
  const pct = target > 0 ? current / target : 0;
  const fillRatio = Math.min(pct, 1);
  const barColor = color ?? colorForRatio(pct, dark);

  // Animate width changes (new log entries, tab re-focus) instead of snapping, so the bar
  // reads as "filling up" rather than jumping — matches the app's other Animated affordances.
  const widthAnim = useRef(new Animated.Value(fillRatio)).current;
  useEffect(() => {
    Animated.timing(widthAnim, { toValue: fillRatio, duration: 450, useNativeDriver: false }).start();
  }, [fillRatio, widthAnim]);

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>
          {Math.round(current)} / {Math.round(target)} {unit}
        </Text>
      </View>
      <View style={styles.track}>
        <Animated.View
          style={[
            styles.fill,
            { width: widthAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }), backgroundColor: barColor },
          ]}
        />
      </View>
    </View>
  );
}

const makeStyles = (dark: boolean) =>
  StyleSheet.create({
    container: { marginVertical: 6 },
    labelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    label: dark ? { fontSize: 13, color: quest.text, fontFamily: questFonts.semibold } : { fontSize: 13, color: '#333', fontWeight: '600' },
    value: dark ? { fontSize: 12, color: quest.textSecondary, fontFamily: questFonts.medium } : { fontSize: 12, color: '#666' },
    track: { height: 10, borderRadius: 6, backgroundColor: dark ? quest.raised2 : '#EAEEF3', overflow: 'hidden' },
    fill: { height: '100%', borderRadius: 6 },
  });
