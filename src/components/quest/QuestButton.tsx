import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { quest, questRadius } from '../../theme/quest';
import { HudText } from './HudText';
import { QuestIcon, type QuestIconName } from './QuestIcon';

interface QuestButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'gold' | 'ghost' | 'mana';
  icon?: QuestIconName;
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
}

/** Full-width 56 px action button. `gold` is the primary call to action. */
export function QuestButton({ title, onPress, variant = 'gold', icon, disabled, loading, accessibilityLabel }: QuestButtonProps) {
  const filled = variant !== 'ghost';
  const background = variant === 'gold' ? quest.gold : variant === 'mana' ? quest.mana : quest.panel;
  const foreground = filled ? quest.onGold : quest.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!disabled || !!loading, busy: !!loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: background, borderColor: filled ? background : quest.border },
        (disabled || loading) && { opacity: 0.5 },
        pressed && { opacity: 0.85 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <View style={styles.row}>
          {icon && <QuestIcon name={icon} size={18} color={foreground} strokeWidth={2.4} />}
          <HudText size={16} color={foreground}>
            {title}
          </HudText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 56, borderRadius: questRadius.button, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
