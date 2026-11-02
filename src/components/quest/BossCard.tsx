import { StyleSheet, View } from 'react-native';
import type { BossState } from '../../game/boss';
import { useGameText } from '../../game/strings';
import { quest, questRadius } from '../../theme/quest';
import { HudText } from './HudText';
import { DefaultBossArt } from './StageBossArt';
import { XpBar } from './XpBar';
import { AnimatedNumber } from './motion/AnimatedNumber';
import { PressScale } from './motion/PressScale';

interface BossCardProps {
  boss: BossState;
  /** Damage dealt so far today (already capped). */
  todayDamage: number;
  /** Today's damage waiting on the day being settled (meals still to come): shown as a faded part of the HP bar, not taken off yet. */
  pendingDamage?: number;
  /** Opens the boss detail screen when given. */
  onPress?: () => void;
}

export function BossCard({ boss, todayDamage, pendingDamage = 0, onPress }: BossCardProps) {
  const g = useGameText();
  const name = g('boss.name');
  const sub = boss.defeated
    ? g('boss.defeated')
    : todayDamage > 0
      ? g('boss.today', { n: todayDamage.toLocaleString('en-US'), d: boss.daysUntilReset })
      : pendingDamage > 0
        ? g('boss.todayPending', { n: pendingDamage.toLocaleString('en-US'), d: boss.daysUntilReset })
        : g('boss.todayNone', { d: boss.daysUntilReset });

  const label = `${g('boss.eyebrow')}. ${g('boss.a11y', { name, left: boss.hpLeft, max: boss.maxHp })}. ${sub}`;
  const inner = (
    <>
      <DefaultBossArt size={52} defeated={boss.defeated} />
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <HudText size={15}>{name}</HudText>
          <HudText size={12} weight="medium" color={quest.hpText}>
            <AnimatedNumber value={boss.hpLeft}>
              {(left) => g('boss.hp', { left: left.toLocaleString('en-US'), max: boss.maxHp.toLocaleString('en-US') })}
            </AnimatedNumber>
          </HudText>
        </View>
        <View style={styles.bar}>
          <XpBar ratio={boss.maxHp > 0 ? boss.hpLeft / boss.maxHp : 0} color={quest.hp} trackColor={quest.bg} height={8} from={1} delay={350} />
          {pendingDamage > 0 && boss.maxHp > 0 && !boss.defeated && (
            <View
              style={[
                styles.pending,
                {
                  left: `${(Math.max(0, boss.hpLeft - pendingDamage) / boss.maxHp) * 100}%`,
                  width: `${(Math.min(pendingDamage, boss.hpLeft) / boss.maxHp) * 100}%`,
                },
              ]}
            />
          )}
        </View>
        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {sub}
        </HudText>
      </View>
    </>
  );

  if (!onPress) {
    return (
      <View accessible accessibilityLabel={label} style={styles.card}>
        {inner}
      </View>
    );
  }
  return (
    <PressScale
      scaleTo={0.98}
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={g('boss.detail.open')}
      onPress={onPress}
      style={styles.card}
    >
      {inner}
    </PressScale>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: questRadius.panel,
    borderWidth: 1.5,
    backgroundColor: quest.bossPanel,
    borderColor: quest.bossBorder,
  },
  body: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  bar: { marginTop: 6, marginBottom: 4 },
  // The HP today's hit will take once settled: dimmed, not gone yet.
  pending: { position: 'absolute', top: 0, height: 8, borderRadius: 4, backgroundColor: quest.bg, opacity: 0.6, pointerEvents: 'none' },
});
