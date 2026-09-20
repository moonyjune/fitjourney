import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/tokens';

interface ProgressBarProps {
  label: string;
  current: number;
  target: number;
  unit: string;
  /** Overrides the automatic red/blue/yellow/green-by-percentage coloring below. */
  color?: string;
}

// Below 50% of target: red (behind). 50-69%: blue (on track). 70-89%: yellow (almost there).
// 90%+: green (met). Applied to every goal-tracking bar (calories/protein/water) so a glance
// at any dashboard tells you which metrics need attention today.
function colorForRatio(pct: number): string {
  if (pct >= 0.9) return colors.success;
  if (pct >= 0.7) return colors.warning;
  if (pct >= 0.5) return colors.primary;
  return colors.danger;
}

export function ProgressBar({ label, current, target, unit, color }: ProgressBarProps) {
  const pct = target > 0 ? current / target : 0;
  const fillRatio = Math.min(pct, 1);
  const barColor = color ?? colorForRatio(pct);
  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>
          {Math.round(current)} / {Math.round(target)} {unit}
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${fillRatio * 100}%`, backgroundColor: barColor }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginVertical: 6 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  label: { fontSize: 13, color: '#333', fontWeight: '600' },
  value: { fontSize: 12, color: '#666' },
  track: { height: 10, borderRadius: 6, backgroundColor: '#EAEEF3', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 6 },
});
