import { StyleSheet, Text, View } from 'react-native';

interface ProgressBarProps {
  label: string;
  current: number;
  target: number;
  unit: string;
  color?: string;
}

export function ProgressBar({ label, current, target, unit, color = '#4F8EF7' }: ProgressBarProps) {
  const ratio = target > 0 ? Math.min(current / target, 1) : 0;
  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>
          {Math.round(current)} / {Math.round(target)} {unit}
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${ratio * 100}%`, backgroundColor: color }]} />
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
