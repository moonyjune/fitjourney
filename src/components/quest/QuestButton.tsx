import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { PressScale } from './motion/PressScale';
import { quest, questRadius } from '../../theme/quest';
import { HudText } from './HudText';
import { QuestIcon, type QuestIconName } from './QuestIcon';

interface QuestButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'gold' | 'ghost' | 'mana' | 'danger';
  icon?: QuestIconName;
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
  /** `large`: 64 pt high with an 18 pt label, for the one action pressed over and over (the session's "Xong set"). */
  size?: 'default' | 'large';
}

/** Full-width 56 px action button. `gold` is the primary call to action. */
export function QuestButton({ title, onPress, variant = 'gold', icon, disabled, loading, accessibilityLabel, size = 'default' }: QuestButtonProps) {
  const large = size === 'large';
  // 'danger' (delete) is outlined in red on a dark red panel, so it never looks like the main action.
  const danger = variant === 'danger';
  const filled = variant === 'gold' || variant === 'mana';
  const background = variant === 'gold' ? quest.gold : variant === 'mana' ? quest.mana : danger ? quest.bossPanel : quest.panel;
  const foreground = filled ? quest.onGold : danger ? quest.hpText : quest.text;
  return (
    <PressScale
      scaleTo={0.97}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!disabled || !!loading, busy: !!loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        large && styles.large,
        { backgroundColor: background, borderColor: filled ? background : danger ? quest.hp : quest.border },
        (disabled || loading) && { opacity: 0.5 },
        pressed && { opacity: 0.85 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <View style={styles.row}>
          {icon && <QuestIcon name={icon} size={large ? 20 : 18} color={foreground} strokeWidth={2.4} />}
          <HudText size={large ? 18 : 16} color={foreground}>
            {title}
          </HudText>
        </View>
      )}
    </PressScale>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 56, borderRadius: questRadius.button, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  large: { minHeight: 64 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
