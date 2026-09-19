import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../theme/tokens';

type BadgeTone = 'primary' | 'success' | 'warning' | 'danger' | 'gold' | 'neutral';

const TONE_BG: Record<BadgeTone, string> = {
  primary: colors.primaryLight,
  success: colors.successLight,
  warning: colors.warningLight,
  danger: colors.dangerLight,
  gold: colors.goldLight,
  neutral: colors.neutralLight,
};

const TONE_TEXT: Record<BadgeTone, string> = {
  primary: colors.primary,
  success: colors.success,
  warning: colors.warning,
  danger: colors.danger,
  gold: colors.gold,
  neutral: colors.textSecondary,
};

export function Badge({ label, tone = 'primary' }: { label: string; tone?: BadgeTone }) {
  return (
    <View style={[styles.chip, { backgroundColor: TONE_BG[tone] }]}>
      <Text style={[styles.text, { color: TONE_TEXT[tone] }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 1 },
  text: { fontSize: 11, fontWeight: '700' },
});
