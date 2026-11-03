import { StyleSheet, View } from 'react-native';
import type { BossDay, BossState } from '../../game/boss';
import { bossNum as num, deficitSplitText } from '../../game/bossView';
import { DEFICIT_LEVEL_COLOR } from '../../game/deficitLevel';
import { useGameText, type GameKey } from '../../game/strings';
import { quest, questRadius } from '../../theme/quest';
import { HudText } from './HudText';

/** The weekly boss's full 7-day log (moved from /boss to Journal › Tuần, Design/uiux-proposal dialogs.md decision 7): each day up to
 *  today with its hit on the boss, why (deficit from eating and from training, cheat day, no data) and today's hit still waiting.
 *  `todayKey` is the real today (a past week has none). `footer` goes under the rows (the "chờ chốt" line and its ⓘ). */
export function BossWeekLog({ boss, todayKey, footer }: { boss: BossState; todayKey: string; footer?: React.ReactNode }) {
  const g = useGameText();
  const splitText = (d: BossDay) => deficitSplitText(d, g);
  return (
    <View style={styles.log}>
      <HudText size={16} accessibilityRole="header">
        {g('journal2.week.log')}
      </HudText>
      {boss.days.map((d, i) => {
        const isToday = d.dateKey === todayKey;
        const dow = new Date(`${d.dateKey}T12:00:00`).getDay();
        const name = isToday ? g('boss.detail.today') : g(`weekday.${dow}` as GameKey);
        const noData = d.deficitKcal == null;
        // Today with meals still to come: its hit is an estimate, not dealt yet.
        const amount = noData ? '—' : d.pending ? `~−${num(d.pendingDamage)}` : `−${num(d.damage)}`;
        const sub = d.cheat
          ? g('boss.detail.cheat')
          : noData
            ? g('boss.detail.noData')
            : [d.deficitKcal! > 0 ? g(d.pending ? 'boss.detail.pending' : 'boss.detail.deficit', { n: num(d.deficitKcal!) }) : '', splitText(d)].filter(Boolean).join(' · ');
        return (
          <View
            key={d.dateKey}
            accessible
            accessibilityLabel={`${name}. ${d.cheat ? g('boss.detail.cheat') : noData ? g('boss.detail.noData') : `${amount} HP`}`}
            style={[styles.logRow, i > 0 && styles.logDivider]}
          >
            <View style={styles.flex}>
              <HudText size={15} color={isToday ? quest.text : quest.textTertiary}>
                {name}{' '}
                <HudText size={12} weight="medium" color={quest.textSecondary}>
                  {d.dateKey.slice(8)}/{d.dateKey.slice(5, 7)}
                </HudText>
              </HudText>
              {sub ? (
                <HudText size={12} weight="medium" color={d.cheat ? DEFICIT_LEVEL_COLOR.cheat : quest.textSecondary}>
                  {sub}
                </HudText>
              ) : null}
            </View>
            <HudText size={17} color={noData || d.pending ? quest.textSecondary : isToday ? quest.gold : quest.hpText}>
              {amount}
            </HudText>
          </View>
        );
      })}
      {footer}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  log: { padding: 14, borderRadius: questRadius.panel, backgroundColor: quest.panel, borderWidth: 1.5, borderColor: quest.border, gap: 2 },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48 },
  logDivider: { borderTopWidth: 1, borderTopColor: quest.border },
});
