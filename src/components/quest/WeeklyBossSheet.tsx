import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import type { BossState } from '../../game/boss';
import { bossHitTexts, bossNum, bossStatusText } from '../../game/bossView';
import { BOSS_DEFEAT_XP, DAILY_DAMAGE_CAP_KCAL } from '../../game/constants';
import { DEFICIT_LEVEL_COLOR } from '../../game/deficitLevel';
import type { DayEvaluation } from '../../game/missions';
import { useGameText, type GameKey } from '../../game/strings';
import { quest, questRadius } from '../../theme/quest';
import { toDateKey } from '../../utils/date';
import { isoWeekNumber } from '../../utils/isoWeek';
import { addDays } from '../../utils/milestones';
import { BottomSheet } from './BottomSheet';
import { HudText } from './HudText';
import { HitShake } from './motion/HitShake';
import { QuestButton } from './QuestButton';
import { DefaultBossArt } from './StageBossArt';
import { HpBar } from './HpBar';

/** The weekly boss's HP bar, coloured by the HP left, with today's pending hit (not dealt until the day is settled) as a faded part of it. */
export function BossHpBar({ boss, height = 8, trackColor = quest.bg, delay = 350 }: { boss: BossState; height?: number; trackColor?: string; delay?: number }) {
  return <HpBar left={boss.hpLeft} max={boss.maxHp} pending={boss.defeated ? 0 : boss.pendingDamage} height={height} trackColor={trackColor} from={1} delay={delay} />;
}

interface WeeklyBossSheetProps {
  visible: boolean;
  onClose: () => void;
  boss: BossState;
  today: DayEvaluation;
  now: Date;
}

/** "Boss tuần" (dialog 18): HP with today's pending hit, how much is still needed, today's hit and why, a strip of the week's 7 days
 *  and the way to the full week ("Xem cả tuần" → Journal › Tuần, where the 7-day log is) and to the AI weekly review. */
export function WeeklyBossSheet({ visible, onClose, boss, today, now }: WeeklyBossSheetProps) {
  const g = useGameText();
  const weekNo = isoWeekNumber(new Date(`${boss.weekKey}T12:00:00`));
  const { headline, reason } = bossHitTexts(boss, today, g);
  const todayDay = boss.days[boss.days.length - 1];
  const hitAmount = !todayDay || todayDay.deficitKcal == null ? '—' : todayDay.pending ? `~−${bossNum(todayDay.pendingDamage)}` : `−${bossNum(todayDay.damage)}`;
  const monday = new Date(`${boss.weekKey}T12:00:00`);
  const todayKey = toDateKey(now);
  const week = Array.from({ length: 7 }, (_, i) => {
    const key = toDateKey(addDays(monday, i));
    return { key, day: boss.days.find((d) => d.dateKey === key), weekday: new Date(`${key}T12:00:00`).getDay() };
  });
  const go = (to: Parameters<typeof router.push>[0]) => {
    onClose();
    router.push(to);
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} eyebrow={g('boss.detail.eyebrow', { n: weekNo })} title={g('boss.name')} testID="weekly-boss-sheet">
      <View style={styles.top}>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <HitShake play={!!todayDay && todayDay.damage > 0}>
            <DefaultBossArt size={88} defeated={boss.defeated} idle />
          </HitShake>
        </View>
        <View style={styles.flex}>
          <HudText size={22} accessibilityLabel={g('boss.a11y', { name: g('boss.name'), left: boss.hpLeft, max: boss.maxHp })}>
            {bossNum(boss.hpLeft)} <HudText size={13} weight="medium" color={quest.textSecondary}>/ {bossNum(boss.maxHp)} HP</HudText>
          </HudText>
          <View style={styles.bar}>
            <BossHpBar boss={boss} height={10} trackColor={quest.bossPanel} />
          </View>
          {boss.pendingDamage > 0 && !boss.defeated && (
            <HudText size={12} weight="medium" color={quest.textSecondary}>
              {g('camp.bossPendingPart', { n: bossNum(boss.pendingDamage) })}
            </HudText>
          )}
          <HudText size={12} weight="medium" color={quest.textTertiary}>
            {bossStatusText(boss, g)}
          </HudText>
        </View>
      </View>
      {!boss.defeated && boss.neededPerRemainingDay > DAILY_DAMAGE_CAP_KCAL && (
        <HudText size={12} weight="medium" color={quest.hpText} style={styles.gap}>
          {g('boss.detail.unreachable', { cap: bossNum(DAILY_DAMAGE_CAP_KCAL) })}
        </HudText>
      )}

      <View style={styles.hitCard}>
        <View style={styles.hitHead}>
          <HudText size={15} style={styles.flex}>
            {g('boss.detail.hitTitle')}
          </HudText>
          <HudText size={17} color={todayDay && !todayDay.pending && todayDay.damage > 0 ? quest.hpText : quest.textSecondary}>
            {hitAmount}
          </HudText>
        </View>
        {headline ? <HudText size={14}>{headline}</HudText> : null}
        {reason ? (
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {reason}
          </HudText>
        ) : null}
      </View>

      <View style={styles.week} accessibilityLabel={g('camp.bossWeekA11y')}>
        {week.map(({ key, day, weekday }) => {
          const future = key > todayKey;
          const isToday = key === todayKey;
          const color = day?.cheat
            ? DEFICIT_LEVEL_COLOR.cheat
            : future || !day || day.deficitKcal == null
              ? 'transparent'
              : day.pending
                ? 'transparent'
                : day.damage > 0
                  ? quest.hp
                  : quest.textSecondary;
          const amount = future || !day || day.deficitKcal == null ? (day?.cheat ? g('deficit.cheatShort') : '—') : day.pending ? `~${bossNum(day.pendingDamage)}` : bossNum(day.damage);
          const wd = g(`weekday.${weekday}` as GameKey);
          return (
            <View key={key} accessible accessibilityLabel={`${wd} ${amount}`} style={styles.dayCell}>
              <HudText size={11} weight="medium" color={isToday ? quest.gold : quest.textSecondary}>
                {wd}
              </HudText>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: color, borderColor: day?.pending ? quest.gold : color === 'transparent' ? quest.border : color },
                  day?.pending && styles.dotPending,
                  isToday && styles.dotToday,
                ]}
              />
              <HudText size={10} weight="medium" color={quest.textSecondary} numberOfLines={1}>
                {amount}
              </HudText>
            </View>
          );
        })}
      </View>

      <View style={styles.buttons}>
        <QuestButton icon="chart" variant="ghost" title={g('week.bossButton')} onPress={() => go('/weekly-report')} />
        <QuestButton icon="calendar" variant="ghost" title={g('camp.bossSeeWeek')} onPress={() => go({ pathname: '/journal', params: { tab: 'week' } })} />
      </View>
      <HudText size={12} weight="medium" color={quest.textSecondary} style={styles.reward}>
        {g('boss.detail.reward', { xp: BOSS_DEFEAT_XP, max: bossNum(boss.maxHp) })}
      </HudText>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  gap: { marginTop: 8 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bar: { marginVertical: 6 },
  // The HP today's hit will take once settled: dimmed, not gone yet.
  hitCard: { marginTop: 12, gap: 4, padding: 12, borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.bossBorder, backgroundColor: quest.bossPanel },
  hitHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  week: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  dayCell: { flex: 1, alignItems: 'center', gap: 4 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
  dotPending: { borderStyle: 'dashed' },
  dotToday: { transform: [{ scale: 1.15 }] },
  buttons: { gap: 8, marginTop: 14 },
  reward: { marginTop: 10, textAlign: 'center' },
});
