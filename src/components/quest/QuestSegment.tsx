import { Pressable, StyleSheet, View } from 'react-native';
import { quest } from '../../theme/quest';
import { HudText } from './HudText';
import { QuestIcon, type QuestIconName } from './QuestIcon';

interface Option<T extends string> {
  value: T;
  label: string;
  icon?: QuestIconName;
}

interface QuestSegmentProps<T extends string> {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
}

/** Two-or-three-way switch (e.g. Map | Chart). The selected segment is gold. */
export function QuestSegment<T extends string>({ options, value, onChange, accessibilityLabel }: QuestSegmentProps<T>) {
  return (
    <View accessibilityRole="tablist" accessibilityLabel={accessibilityLabel} style={styles.wrap}>
      {options.map((o) => {
        const selected = o.value === value;
        const color = selected ? quest.onGold : quest.textSecondary;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityLabel={o.label}
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={[styles.seg, selected && { backgroundColor: quest.gold }]}
          >
            {o.icon && <QuestIcon name={o.icon} size={16} color={color} strokeWidth={2.2} />}
            <HudText size={14} color={color}>
              {o.label}
            </HudText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', padding: 4, gap: 4, borderRadius: 14, backgroundColor: quest.panel, borderWidth: 1.5, borderColor: quest.border },
  seg: { flex: 1, minHeight: 44, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
});
