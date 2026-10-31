import { StyleSheet } from 'react-native';
import { useGameText } from '../../game/strings';
import { quest } from '../../theme/quest';
import type { WaterCheckpoint } from '../../types';
import { clockText, nextDrink } from '../../water/schedule';
import { HudText } from './HudText';

interface Props {
  schedule: WaterCheckpoint[];
  waterMl: number;
  now?: Date;
}

/** One line under today's water bar: the next planned drink (or the one to catch up on), or that the day's target is met. */
export function WaterNextDrink({ schedule, waterMl, now = new Date() }: Props) {
  const g = useGameText();
  if (schedule.length === 0) return null;
  const next = nextDrink(schedule, waterMl, now);
  const text = !next
    ? g('water.done')
    : g(next.overdue ? 'water.nextLate' : 'water.next', { ml: next.ml, time: clockText(next.hour, next.minute) });
  return (
    <HudText size={13} weight="medium" color={!next ? quest.xp : next.overdue ? quest.hpText : quest.manaText} style={styles.line} accessibilityLiveRegion="polite">
      {next ? `${text} · ${next.label}` : text}
    </HudText>
  );
}

const styles = StyleSheet.create({
  line: { lineHeight: 18 },
});
