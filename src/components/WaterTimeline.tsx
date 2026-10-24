import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { WaterCheckpoint } from '../types';
import { useTranslation } from '../i18n/useTranslation';
import type { StringKey } from '../i18n/strings';
import { colors } from '../theme/tokens';
import { quest, questFonts } from '../theme/quest';

interface WaterTimelineProps {
  schedule: WaterCheckpoint[];
  currentMl: number;
  now?: Date;
  /** Dark FitQuest look (default off = classic light). */
  dark?: boolean;
}

type CheckpointStatus = 'complete' | 'behind' | 'notStarted';

function getStatus(checkpoint: WaterCheckpoint, currentMl: number, now: Date): CheckpointStatus {
  if (currentMl >= checkpoint.cumulativeTargetMl) return 'complete';
  const checkpointTime = checkpoint.hour * 60 + checkpoint.minute;
  const nowTime = now.getHours() * 60 + now.getMinutes();
  return nowTime >= checkpointTime ? 'behind' : 'notStarted';
}

const STATUS_COLOR: Record<CheckpointStatus, string> = {
  complete: colors.success,
  behind: colors.danger,
  notStarted: '#CCC',
};

const STATUS_KEY: Record<CheckpointStatus, StringKey> = {
  complete: 'waterTimeline.complete',
  behind: 'waterTimeline.behind',
  notStarted: 'waterTimeline.notStarted',
};

export function WaterTimeline({ schedule, currentMl, now = new Date(), dark }: WaterTimelineProps) {
  const { t } = useTranslation();
  const styles = useMemo(() => makeStyles(!!dark), [dark]);
  const statusColor: Record<CheckpointStatus, string> = dark
    ? { complete: quest.xp, behind: quest.hpText, notStarted: quest.border }
    : STATUS_COLOR;
  return (
    <View>
      {schedule.map((checkpoint, index) => {
        const status = getStatus(checkpoint, currentMl, now);
        const isLast = index === schedule.length - 1;
        const previousTarget = index > 0 ? schedule[index - 1].cumulativeTargetMl : 0;
        const incrementMl = checkpoint.cumulativeTargetMl - previousTarget;
        return (
          <View key={`${checkpoint.hour}-${checkpoint.minute}-${index}`} style={styles.row}>
            <View style={styles.markerColumn}>
              <View style={[styles.dot, { backgroundColor: statusColor[status] }]} />
              {!isLast && <View style={styles.line} />}
            </View>
            <View style={styles.content}>
              <View style={styles.headerRow}>
                <Text style={styles.time}>
                  {String(checkpoint.hour).padStart(2, '0')}:{String(checkpoint.minute).padStart(2, '0')}
                </Text>
                <Text style={[styles.statusText, { color: statusColor[status] }]}>{t(STATUS_KEY[status])}</Text>
              </View>
              <Text style={styles.label}>{checkpoint.label}</Text>
              <Text style={styles.target}>
                {t('waterTimeline.increment', { ml: incrementMl })} · {t('waterTimeline.target', { ml: checkpoint.cumulativeTargetMl })}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const makeStyles = (dark: boolean) =>
  StyleSheet.create({
    row: { flexDirection: 'row' },
    markerColumn: { width: 20, alignItems: 'center' },
    dot: { width: 12, height: 12, borderRadius: 6, marginTop: 3 },
    line: { flex: 1, width: 2, backgroundColor: dark ? quest.border : '#E5E5E5', marginVertical: 2 },
    content: { flex: 1, paddingBottom: 14 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
    time: dark ? { fontSize: 13, color: quest.text, fontFamily: questFonts.bold } : { fontSize: 13, fontWeight: '700', color: '#222' },
    statusText: dark ? { fontSize: 11, fontFamily: questFonts.bold } : { fontSize: 11, fontWeight: '700' },
    label: { fontSize: 13, color: dark ? quest.textTertiary : '#444', marginTop: 2, ...(dark ? { fontFamily: questFonts.medium } : {}) },
    target: { fontSize: 11, color: dark ? quest.textSecondary : '#888', marginTop: 2, ...(dark ? { fontFamily: questFonts.medium } : {}) },
  });
