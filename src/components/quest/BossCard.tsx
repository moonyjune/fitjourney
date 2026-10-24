import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import type { BossState } from '../../game/boss';
import { useGameText } from '../../game/strings';
import { quest, questRadius } from '../../theme/quest';
import { HudText } from './HudText';
import { XpBar } from './XpBar';
import { hiddenSvgProps } from './hiddenSvg';
import { AnimatedNumber } from './motion/AnimatedNumber';
import { PressScale } from './motion/PressScale';

export function BossFace({ size = 44, defeated }: { size?: number; defeated: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" {...hiddenSvgProps}>
      <Path d="M16 20 L10 6 L24 15 Z M48 20 L54 6 L40 15 Z" fill={quest.hp} />
      <Path d="M8 40 C8 22 20 14 32 14 C44 14 56 22 56 40 C56 52 46 58 32 58 C18 58 8 52 8 40 Z" fill={quest.hp} />
      <Circle cx={24} cy={34} r={4} fill={quest.bg} />
      <Circle cx={40} cy={34} r={4} fill={quest.bg} />
      <Path
        d={defeated ? 'M22 48 Q32 42 42 48' : 'M22 46 Q32 52 42 46'}
        fill="none"
        stroke={quest.bg}
        strokeWidth={3}
        strokeLinecap="round"
      />
    </Svg>
  );
}

interface BossCardProps {
  boss: BossState;
  /** Damage dealt so far today (already capped). */
  todayDamage: number;
  /** Opens the boss detail screen when given. */
  onPress?: () => void;
}

export function BossCard({ boss, todayDamage, onPress }: BossCardProps) {
  const g = useGameText();
  const name = g('boss.name');
  const sub = boss.defeated
    ? g('boss.defeated')
    : todayDamage > 0
      ? g('boss.today', { n: todayDamage.toLocaleString('en-US'), d: boss.daysUntilReset })
      : g('boss.todayNone', { d: boss.daysUntilReset });

  const label = `${g('boss.eyebrow')}. ${g('boss.a11y', { name, left: boss.hpLeft, max: boss.maxHp })}. ${sub}`;
  const inner = (
    <>
      <BossFace defeated={boss.defeated} />
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
});
