import { StyleSheet, View } from 'react-native';
import type { BossState } from '../../game/boss';
import { deficitColor, deficitLevel } from '../../game/deficitLevel';
import { shownDeficit } from '../../game/deficitView';
import type { DayEvaluation } from '../../game/missions';
import { useGameText, type GameKey } from '../../game/strings';
import { quest, questRadius } from '../../theme/quest';
import { DayDeficitNotes } from './DayDeficitNotes';
import { HudText } from './HudText';
import { AnimatedNumber } from './motion/AnimatedNumber';
import { PressScale } from './motion/PressScale';
import { ProgressRing } from './ProgressRing';
import { QuestIcon } from './QuestIcon';
import { DefaultBossArt } from './StageBossArt';
import { BossHpBar } from './WeeklyBossSheet';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

interface CampHeroProps {
  /** The selected day (today unless another day was picked with the date chip). */
  day: DayEvaluation;
  dateKey: string;
  /** "T6 23/10", for the buttons' accessible names. */
  dayLabel: string;
  boss: BossState;
  tdeeKcal: number;
  targetDeficitKcal: number;
  proteinTargetG: number;
  onOpenBoss: () => void;
}

/** Camp's "Hôm nay" card: the ring of what is left to eat, eaten / training / deficit (the estimate "~X" with "chờ chốt" until the day
 *  is settled, else its level) / protein, the 0.23–0.25 lines under the deficit (Bỏ bữa, ⚠ Chưa ghi + Ghi bổ sung), and the weekly
 *  boss's HP bar with today's pending hit; the bar opens the boss sheet. */
export function CampHero({ day, dateKey, dayLabel, boss, tdeeKcal, targetDeficitKcal, proteinTargetG, onOpenBoss }: CampHeroProps) {
  const g = useGameText();
  const targetKcal = Math.max(0, Math.round(tdeeKcal - targetDeficitKcal));
  const leftKcal = Math.max(0, Math.round(tdeeKcal + day.burnedKcal - targetDeficitKcal - day.eatenKcal));
  const shown = shownDeficit(day);
  const level = shown.incomplete ? null : deficitLevel(shown.kcal, targetDeficitKcal, day.cheat, { burnedKcal: day.burnedKcal, tdeeKcal });
  const deficitText = day.cheat ? g('deficit.cheatShort') : shown.kcal == null ? '—' : `${shown.projected ? '~' : ''}${fmt(shown.kcal)}`;
  const badge = day.cheat || shown.kcal == null || shown.incomplete ? null : shown.projected ? g('camp.pendingBadge') : level ? g(`deficit.level.${level}` as GameKey) : null;
  const rows: { label: string; value: string; color: string; unit?: string; badge?: string | null }[] = [
    { label: g('camp.eaten'), value: fmt(day.eatenKcal), color: quest.text },
    { label: g('camp.burned'), value: day.burnedKcal > 0 ? `−${fmt(day.burnedKcal)}` : '0', color: quest.hpText },
    {
      label: g(shown.projected ? 'camp.projected' : 'camp.deficit'),
      value: deficitText,
      color: shown.incomplete ? quest.textSecondary : deficitColor(level, quest.textSecondary),
      badge,
    },
    { label: g('camp.protein'), value: fmt(day.proteinG), unit: `/${fmt(proteinTargetG)} g`, color: quest.text },
  ];

  const bossSub = boss.defeated
    ? g('boss.defeated')
    : (boss.days[boss.days.length - 1]?.damage ?? 0) > 0
      ? g('boss.today', { n: fmt(boss.days[boss.days.length - 1].damage), d: boss.daysUntilReset })
      : boss.pendingDamage > 0
        ? g('boss.todayPending', { n: fmt(boss.pendingDamage), d: boss.daysUntilReset })
        : g('boss.todayNone', { d: boss.daysUntilReset });

  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <View accessible accessibilityLabel={g('camp.ringA11y', { left: leftKcal, target: targetKcal })}>
          <ProgressRing ratio={targetKcal > 0 ? leftKcal / targetKcal : 0} size={128} stroke={11} color={quest.gold}>
            <HudText size={12} weight="medium" color={quest.textSecondary}>
              {g('camp.leftToEat')}
            </HudText>
            <AnimatedNumber value={leftKcal}>
              {(n) => (
                <HudText size={28} numberOfLines={1}>
                  {fmt(n)}
                </HudText>
              )}
            </AnimatedNumber>
            <HudText size={11} weight="medium" color={quest.textSecondary}>
              {g('camp.ofKcal', { n: fmt(targetKcal) })}
            </HudText>
          </ProgressRing>
        </View>
        <View style={styles.stats}>
          {rows.map((r) => (
            <View key={r.label} accessible accessibilityLabel={`${r.label} ${r.value}${r.unit ?? ''}${r.badge ? `, ${r.badge}` : ''}`} style={styles.stat}>
              <HudText size={13} weight="medium" color={quest.textSecondary} style={styles.flex} numberOfLines={1}>
                {r.label}
              </HudText>
              <HudText size={16} color={r.color}>
                {r.value}
                {r.unit ? (
                  <HudText size={12} weight="medium" color={quest.textSecondary}>
                    {r.unit}
                  </HudText>
                ) : null}
              </HudText>
              {r.badge ? (
                <View style={styles.badge}>
                  <HudText size={11} color={quest.textTertiary} numberOfLines={1}>
                    {r.badge}
                  </HudText>
                </View>
              ) : null}
            </View>
          ))}
        </View>
      </View>

      <View style={styles.notes}>
        {shown.projected && shown.kcal != null && (
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {g('sub.deficitPending', { kcal: fmt(shown.kcal) })}
          </HudText>
        )}
        <DayDeficitNotes day={day} dateKey={dateKey} dayLabel={dayLabel} hidePendingLine />
      </View>

      <PressScale
        scaleTo={0.98}
        accessible
        accessibilityRole="button"
        accessibilityLabel={`${g('boss.eyebrow')}. ${g('boss.a11y', { name: g('boss.name'), left: boss.hpLeft, max: boss.maxHp })}. ${bossSub}`}
        accessibilityHint={g('camp.bossOpen')}
        onPress={onOpenBoss}
        style={styles.boss}
      >
        <DefaultBossArt size={40} defeated={boss.defeated} />
        <View style={styles.flex}>
          <View style={styles.bossHead}>
            <HudText size={14} style={styles.flex} numberOfLines={1}>
              {g('boss.name')}
            </HudText>
            <HudText size={12} weight="medium" color={quest.hpText}>
              {g('boss.hp', { left: fmt(boss.hpLeft), max: fmt(boss.maxHp) })}
            </HudText>
          </View>
          <View style={styles.bossBar}>
            <BossHpBar boss={boss} height={7} />
          </View>
          <HudText size={12} weight="medium" color={quest.textSecondary} numberOfLines={2}>
            {bossSub}
          </HudText>
        </View>
        <QuestIcon name="chevron" size={18} color={quest.textSecondary} />
      </PressScale>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  card: { padding: 16, gap: 12, borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  top: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stats: { flex: 1, minWidth: 0, gap: 8 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 24 },
  badge: { paddingHorizontal: 8, minHeight: 20, borderRadius: 10, backgroundColor: quest.raised2, justifyContent: 'center', maxWidth: 96 },
  notes: { gap: 6 },
  boss: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: quest.border },
  bossHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  bossBar: { marginVertical: 5 },
});
