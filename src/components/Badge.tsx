import { StyleSheet, Text, View } from 'react-native';
import { useAccentColors } from '../theme/useAccentColors';
import { radius, spacing } from '../theme/tokens';

type BadgeTone = 'primary' | 'success' | 'warning' | 'danger' | 'gold' | 'neutral';

export function Badge({ label, tone = 'primary' }: { label: string; tone?: BadgeTone }) {
  const colors = useAccentColors();
  const bg: Record<BadgeTone, string> = {
    primary: colors.primaryLight,
    success: colors.successLight,
    warning: colors.warningLight,
    danger: colors.dangerLight,
    gold: colors.goldLight,
    neutral: colors.neutralLight,
  };
  const text: Record<BadgeTone, string> = {
    primary: colors.primary,
    success: colors.success,
    warning: colors.warning,
    danger: colors.danger,
    gold: colors.gold,
    neutral: colors.textSecondary,
  };
  return (
    <View style={[styles.chip, { backgroundColor: bg[tone] }]}>
      <Text style={[styles.text, { color: text[tone] }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 1 },
  text: { fontSize: 11, fontWeight: '700' },
});
