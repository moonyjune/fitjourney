import { Pressable, StyleSheet, View } from 'react-native';
import { quest, questRadius } from '../../theme/quest';
import { HudText } from './HudText';

interface ScaleRowProps {
  /** Spoken name of the scale, e.g. "Mức thèm ăn". */
  label: string;
  value: number | null;
  onChange: (value: number) => void;
  max?: number;
}

/** 1..max segmented picker. Each segment is a 48 px button announced as "<label> <n>". */
export function ScaleRow({ label, value, onChange, max = 5 }: ScaleRowProps) {
  return (
    <View style={styles.row}>
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => {
        const selected = value === n;
        return (
          <Pressable
            key={n}
            accessibilityRole="button"
            accessibilityLabel={`${label} ${n}`}
            accessibilityState={{ selected }}
            onPress={() => onChange(n)}
            style={({ pressed }) => [
              styles.cell,
              selected ? { backgroundColor: quest.gold, borderColor: quest.gold } : { backgroundColor: quest.panel, borderColor: quest.border },
              pressed && { opacity: 0.85 },
            ]}
          >
            <HudText size={16} color={selected ? quest.onGold : quest.text}>
              {n}
            </HudText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  cell: { flex: 1, minHeight: 48, borderRadius: questRadius.row, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
