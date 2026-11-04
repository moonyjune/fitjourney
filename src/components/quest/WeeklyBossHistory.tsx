import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { BossState } from '../../game/boss';
import { useGameText } from '../../game/strings';
import { quest, questRadius } from '../../theme/quest';
import { isoWeekNumber } from '../../utils/isoWeek';
import { HudText } from './HudText';
import { QuestButton } from './QuestButton';
import { DefaultBossArt } from './StageBossArt';
import { XpBar } from './XpBar';

/** "Boss theo tuần": the weekly bosses newest first (this week's live one, then each earlier week, defeated or not) with the damage
 *  that counted toward each (capped at its HP, so a week never shows more than the boss has). Moved from the Map's chart view to the
 *  weekly boss page (Design/uiux-proposal dialogs.md row 31: the weekly bosses belong with the weekly boss, not on Journey).
 *  The first `limit` weeks show, the rest behind "Xem thêm"; the defeated count above the list covers every week, so it always
 *  matches Profile's "Boss tuần đã hạ" even when a defeated week is folded away (1.0.3 report: 2 counted, 1 visible). */
export function WeeklyBossHistory({ history, limit = 6 }: { history: BossState[]; limit?: number }) {
  const g = useGameText();
  const [shown, setShown] = useState(limit);
  if (history.length === 0) return null;
  const defeated = history.filter((b) => b.defeated).length;
  return (
    <View style={styles.wrap}>
      <HudText size={15} accessibilityRole="header">
        {g('chart.bosses')}
      </HudText>
      <HudText size={11} weight="medium" color={quest.textSecondary}>
        {g('chart.bossHp', { max: history[0].maxHp.toLocaleString('en-US') })}
      </HudText>
      <HudText size={12} weight="medium" color={quest.textSecondary} testID="weekly-boss-tally">
        {g('chart.bossTally', { n: defeated, total: history.length })}
      </HudText>
      <View style={styles.list}>
        {history.slice(0, shown).map((b, i) => {
          const live = i === 0;
          const week = isoWeekNumber(new Date(`${b.weekKey}T12:00:00`));
          const status = live ? g('chart.bossLive') : b.defeated ? g('chart.bossDown') : g('chart.bossAlive');
          // A week can deal more than the boss's HP; show what counted toward it and cap the bar at full.
          const dmg = Math.min(b.totalDamage, b.maxHp).toLocaleString('en-US');
          return (
            <View key={b.weekKey} accessible accessibilityLabel={`${g('chart.bossWeek', { n: week })}. ${g('chart.bossDamage', { dmg })}. ${status}`} style={styles.row}>
              <DefaultBossArt size={36} defeated={b.defeated} />
              <View style={styles.flex}>
                <HudText size={14}>{g('chart.bossWeek', { n: week })}</HudText>
                <HudText size={12} weight="medium" color={quest.textSecondary}>
                  {g('chart.bossDamage', { dmg })}
                </HudText>
                <View style={styles.bar}>
                  <XpBar ratio={Math.min(1, b.totalDamage / b.maxHp)} color={quest.hp} trackColor={quest.bg} height={6} />
                </View>
              </View>
              <HudText size={12} color={live ? quest.gold : b.defeated ? quest.xp : quest.textSecondary}>
                {status}
              </HudText>
            </View>
          );
        })}
      </View>
      {shown < history.length && (
        <QuestButton title={g('chart.bossMore', { n: history.length - shown })} variant="ghost" onPress={() => setShown(history.length)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 2, marginTop: 8 },
  flex: { flex: 1, minWidth: 0 },
  list: { marginTop: 8, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: questRadius.row, backgroundColor: quest.panel, borderWidth: 1.5, borderColor: quest.border },
  bar: { marginTop: 6 },
});
