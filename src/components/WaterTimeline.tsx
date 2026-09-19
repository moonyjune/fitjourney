import { StyleSheet, Text, View } from 'react-native';
import type { WaterCheckpoint } from '../types';

interface WaterTimelineProps {
  schedule: WaterCheckpoint[];
  currentMl: number;
  now?: Date;
}

type CheckpointStatus = 'complete' | 'behind' | 'notStarted';

function getStatus(checkpoint: WaterCheckpoint, currentMl: number, now: Date): CheckpointStatus {
  if (currentMl >= checkpoint.cumulativeTargetMl) return 'complete';
  const checkpointTime = checkpoint.hour * 60 + checkpoint.minute;
  const nowTime = now.getHours() * 60 + now.getMinutes();
  return nowTime >= checkpointTime ? 'behind' : 'notStarted';
}

const STATUS_COLOR: Record<CheckpointStatus, string> = {
  complete: '#2E9E4E',
  behind: '#E0563A',
  notStarted: '#CCC',
};

const STATUS_LABEL: Record<CheckpointStatus, string> = {
  complete: 'Hoàn thành',
  behind: 'Chưa đạt',
  notStarted: 'Chưa tới giờ',
};

export function WaterTimeline({ schedule, currentMl, now = new Date() }: WaterTimelineProps) {
  return (
    <View>
      {schedule.map((checkpoint, index) => {
        const status = getStatus(checkpoint, currentMl, now);
        const isLast = index === schedule.length - 1;
        return (
          <View key={`${checkpoint.hour}-${checkpoint.minute}-${index}`} style={styles.row}>
            <View style={styles.markerColumn}>
              <View style={[styles.dot, { backgroundColor: STATUS_COLOR[status] }]} />
              {!isLast && <View style={styles.line} />}
            </View>
            <View style={styles.content}>
              <View style={styles.headerRow}>
                <Text style={styles.time}>
                  {String(checkpoint.hour).padStart(2, '0')}:{String(checkpoint.minute).padStart(2, '0')}
                </Text>
                <Text style={[styles.statusText, { color: STATUS_COLOR[status] }]}>{STATUS_LABEL[status]}</Text>
              </View>
              <Text style={styles.label}>{checkpoint.label}</Text>
              <Text style={styles.target}>Mục tiêu cộng dồn: {checkpoint.cumulativeTargetMl}ml</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  markerColumn: { width: 20, alignItems: 'center' },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 3 },
  line: { flex: 1, width: 2, backgroundColor: '#E5E5E5', marginVertical: 2 },
  content: { flex: 1, paddingBottom: 14 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  time: { fontSize: 13, fontWeight: '700', color: '#222' },
  statusText: { fontSize: 11, fontWeight: '700' },
  label: { fontSize: 13, color: '#444', marginTop: 2 },
  target: { fontSize: 11, color: '#888', marginTop: 2 },
});
