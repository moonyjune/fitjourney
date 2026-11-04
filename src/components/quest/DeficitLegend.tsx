import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { DEFICIT_LEVEL_COLOR } from '../../game/deficitLevel';
import type { DayDeficitMark } from '../../game/deficitView';
import { useGameText, type GameKey } from '../../game/strings';
import { quest } from '../../theme/quest';
import { HudText } from './HudText';

/** The faded fill of today's estimate: the level colour at about a third. */
const PENDING_ALPHA = '55';

/** How a calendar cell is painted for a day's mark (Journal › Tháng and the date sheet share it). `logged`: the day has something
 *  logged without a deficit figure (water, a workout…), drawn raised. */
export function deficitCellLook(mark: DayDeficitMark, logged = false): { backgroundColor: string; textColor: string; dashed: boolean } {
  if ((mark.kind === 'settled' || mark.kind === 'cheat') && mark.color) return { backgroundColor: mark.color, textColor: quest.onGold, dashed: false };
  if (mark.kind === 'pending' && mark.color) return { backgroundColor: `${mark.color}${PENDING_ALPHA}`, textColor: quest.text, dashed: false };
  if (mark.kind === 'incomplete') return { backgroundColor: quest.raised, textColor: quest.text, dashed: true };
  return { backgroundColor: mark.kind !== 'none' || logged ? quest.raised : 'transparent', textColor: quest.text, dashed: false };
}

/** The colour key under a deficit calendar, every level the cells can show (the full rules stay behind Journal's ⓘ). */
const LEGEND: { key: GameKey; color: string; look?: 'pending' | 'missing' }[] = [
  { key: 'journal2.month.legend.met', color: DEFICIT_LEVEL_COLOR.met },
  { key: 'journal2.month.legend.ok', color: DEFICIT_LEVEL_COLOR.ok },
  { key: 'journal2.month.legend.low', color: DEFICIT_LEVEL_COLOR.low },
  { key: 'deficitLegend.flat', color: DEFICIT_LEVEL_COLOR.flat },
  { key: 'journal2.month.legend.over', color: DEFICIT_LEVEL_COLOR.over },
  { key: 'journal2.month.legend.warn', color: DEFICIT_LEVEL_COLOR.excess },
  { key: 'journal2.month.legend.cheat', color: DEFICIT_LEVEL_COLOR.cheat },
  { key: 'deficitLegend.pending', color: `${DEFICIT_LEVEL_COLOR.met}${PENDING_ALPHA}`, look: 'pending' },
  { key: 'deficitLegend.missing', color: quest.raised, look: 'missing' },
];

export function DeficitLegend({ children }: { children?: ReactNode }) {
  const g = useGameText();
  return (
    <View style={styles.legend}>
      {LEGEND.map((l) => (
        <View key={l.key} style={styles.item}>
          <View style={[styles.swatch, { backgroundColor: l.color }, l.look === 'missing' && styles.missing]} />
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {g(l.key)}
          </HudText>
        </View>
      ))}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 10, rowGap: 2, marginTop: 8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 20 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  missing: { borderWidth: 1, borderStyle: 'dashed', borderColor: quest.textSecondary },
});
