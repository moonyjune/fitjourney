import { Pressable, StyleSheet, View } from 'react-native';
import { useGameText, type GameKey } from '../../game/strings';
import { tuneRange, type Tunable } from '../../game/training/session';
import type { Unit } from '../../game/training/exercises';
import { quest, questRadius } from '../../theme/quest';
import { HudText } from './HudText';
import { QuestIcon } from './QuestIcon';

interface Props {
  values: { sets: number; amount: number; restSec: number };
  unit: Unit;
  perSide?: boolean;
  onChange: (key: Tunable, value: number) => void;
  /** Shown when the numbers differ from the level's defaults. */
  onReset?: () => void;
  /** Which rows to show (all by default). */
  keys?: Tunable[];
}

/** − value + rows for the sets, the length of a set and the rest between sets. */
export function StepTuner({ values, unit, perSide, onChange, onReset, keys = ['sets', 'amount', 'restSec'] }: Props) {
  const g = useGameText();
  const label = (key: Tunable): string => {
    if (key === 'sets') return g('train.tune.sets');
    if (key === 'restSec') return g('train.tune.rest');
    return g(unit === 'seconds' ? 'train.tune.amountSec' : perSide ? 'train.tune.amountSide' : 'train.tune.amountReps');
  };
  return (
    <View style={styles.box}>
      <View style={styles.head}>
        <HudText size={14} color={quest.gold} style={styles.flex}>
          {g('train.tune.title')}
        </HudText>
        {onReset && (
          <Pressable accessibilityRole="button" accessibilityLabel={g('train.tune.reset')} onPress={() => onReset()} hitSlop={8}>
            <HudText size={12} weight="medium" color={quest.manaText}>
              {g('train.tune.reset')}
            </HudText>
          </Pressable>
        )}
      </View>
      {keys.map((key) => {
        const { min, max, step } = tuneRange(key, unit);
        const v = values[key];
        const name = label(key);
        const button = (dir: -1 | 1) => {
          const disabled = dir < 0 ? v <= min : v >= max;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={g((dir < 0 ? 'train.tune.less' : 'train.tune.more') as GameKey, { what: name })}
              accessibilityState={{ disabled }}
              disabled={disabled}
              onPress={() => {
                onChange(key, v + dir * step);
              }}
              style={[styles.btn, disabled && styles.off]}
            >
              <QuestIcon name={dir < 0 ? 'minus' : 'plus'} size={16} color={quest.text} strokeWidth={2.6} />
            </Pressable>
          );
        };
        return (
          <View key={key} style={styles.row}>
            <HudText size={13} weight="medium" color={quest.textSecondary} style={styles.flex}>
              {name}
            </HudText>
            {button(-1)}
            <HudText size={16} style={styles.value} accessibilityLabel={`${name}: ${v}`}>
              {v}
            </HudText>
            {button(1)}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { padding: 12, borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flex: { flex: 1, minWidth: 0 },
  btn: { width: 40, height: 40, borderRadius: 10, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.bg, alignItems: 'center', justifyContent: 'center' },
  off: { opacity: 0.35 },
  value: { minWidth: 44, textAlign: 'center' },
});
