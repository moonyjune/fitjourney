import { Pressable, StyleSheet, View } from 'react-native';
import { HudText } from '../../components/quest/HudText';
import { quest } from '../../theme/quest';
import { fmtDayMonth } from '../format';
import { stampText, type RangeStatus } from '../snapshot';
import type { InsightsKey } from '../strings';
import type { RefreshState } from '../useAnalysisRefresh';
import { Line } from './ui';

type T = (key: InsightsKey, params?: Record<string, string | number>) => string;

const MAX_DATES = 5;

/** "dd/mm, dd/mm, … +n" for the days that changed. */
export function changedDates(days: string[]): string {
  const shown = days.slice(0, MAX_DATES).map(fmtDayMonth).join(', ');
  return days.length > MAX_DATES ? `${shown} +${days.length - MAX_DATES}` : shown;
}

/** When a part of the analysis was made, whether the data changed since (outdated), and its "analyse again" button. */
export function AnalysisStamp({
  status,
  t,
  title,
  label,
  onRefresh,
  result,
}: {
  status: RangeStatus;
  t: T;
  /** Text of the button. */
  title: string;
  /** Spoken name of the button (says what is analysed again). */
  label: string;
  onRefresh: () => void;
  result?: RefreshState;
}) {
  const busy = result?.state === 'busy';
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Line size={11} color={status.outdated ? quest.gold : quest.textSecondary} style={styles.at}>
          {status.atISO ? t('ins.analysedAt', { at: stampText(status.atISO) }) : t('ins.analysedNever')}
        </Line>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ busy, disabled: busy }}
          disabled={busy}
          onPress={onRefresh}
          style={({ pressed }) => [styles.chip, status.outdated && styles.chipOutdated, pressed && styles.pressed]}
        >
          <HudText size={12} color={quest.manaText}>
            {busy ? t('ins.reanalyzing') : `↻ ${title}`}
          </HudText>
        </Pressable>
      </View>
      {status.outdated && (
        <Line size={11} color={quest.gold}>
          {t('ins.outdated', { dates: changedDates(status.changed) })}
        </Line>
      )}
      {result && result.state !== 'busy' && (
        <Line size={11} color={result.state === 'done' ? quest.xp : quest.gold}>
          {t(result.state === 'done' ? 'ins.reanalyzed' : 'ins.reanalyzeLocal', { time: stampText(result.atISO).slice(6) })}
        </Line>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 6, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  at: { flexShrink: 1 },
  chip: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5, borderColor: quest.mana, backgroundColor: quest.raised2 },
  chipOutdated: { borderColor: quest.gold },
  pressed: { opacity: 0.7 },
});
