import { StyleSheet, View } from 'react-native';
import { hpColour, hpFraction, hpLevelKey } from '../../game/hpColour';
import { useGameText } from '../../game/strings';
import { quest } from '../../theme/quest';
import { XpBar } from './XpBar';

export interface HpBarProps {
  left: number;
  max: number;
  /** Damage not dealt yet (today's hit, "chờ chốt"), drawn as a faded end of the bar. */
  pending?: number;
  height?: number;
  trackColor?: string;
  /** Where the fill starts on first appearance (1 drains the bar down). */
  from?: number;
  delay?: number;
}

/** A boss's HP bar, coloured by the HP left (green → yellow → red, see `hpColour`); its accessible name says the level. */
export function HpBar({ left, max, pending = 0, height = 8, trackColor = quest.bg, from = 1, delay = 0 }: HpBarProps) {
  const g = useGameText();
  const fraction = hpFraction(left, max);
  const showPending = pending > 0 && max > 0 && left > 0;
  return (
    <View>
      <XpBar ratio={fraction} color={hpColour(fraction)} trackColor={trackColor} height={height} from={from} delay={delay} accessibilityLabel={g(hpLevelKey(fraction))} />
      {showPending && (
        <View
          testID="hp-bar-pending"
          style={[
            styles.pending,
            {
              height,
              borderRadius: height / 2,
              left: `${(Math.max(0, left - pending) / max) * 100}%`,
              width: `${(Math.min(pending, left) / max) * 100}%`,
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pending: { position: 'absolute', top: 0, backgroundColor: quest.bg, opacity: 0.6, pointerEvents: 'none' },
});
