import { Pressable, StyleSheet } from 'react-native';
import { quest } from '../../theme/quest';
import { HudText } from './HudText';

interface QuestChipProps {
  label: string;
  selected?: boolean;
  onPress: () => void;
  tone?: 'gold' | 'mana';
  accessibilityLabel?: string;
}

/** Pill toggle / quick action. 40 px tall plus a hit slop so the touch target is still 44 px. */
export function QuestChip({ label, selected, onPress, tone = 'gold', accessibilityLabel }: QuestChipProps) {
  const accent = tone === 'gold' ? quest.gold : quest.mana;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: !!selected }}
      hitSlop={{ top: 2, bottom: 2 }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected ? { backgroundColor: accent, borderColor: accent } : { backgroundColor: quest.panel, borderColor: quest.border },
        pressed && { opacity: 0.85 },
      ]}
    >
      <HudText size={13} color={selected ? quest.onGold : quest.text}>
        {label}
      </HudText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
