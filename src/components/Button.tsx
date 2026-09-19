import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, type ViewStyle } from 'react-native';
import { colors, radius, spacing, typography } from '../theme/tokens';

type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'outline';
type ButtonSize = 'md' | 'sm';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  flex?: boolean;
}

const VARIANT_BACKGROUND: Record<ButtonVariant, string> = {
  primary: colors.primary,
  secondary: colors.neutralLight,
  success: colors.success,
  danger: colors.dangerLight,
  outline: 'transparent',
};

const VARIANT_TEXT_COLOR: Record<ButtonVariant, string> = {
  primary: colors.white,
  secondary: colors.textSecondary,
  success: colors.white,
  danger: colors.danger,
  outline: colors.primary,
};

export function Button({ title, onPress, variant = 'primary', size = 'md', loading, disabled, style, flex }: ButtonProps) {
  return (
    <TouchableOpacity
      style={[
        styles.base,
        size === 'sm' ? styles.sm : styles.md,
        { backgroundColor: VARIANT_BACKGROUND[variant] },
        variant === 'outline' && styles.outlineBorder,
        flex && { flex: 1 },
        (disabled || loading) && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.75}
    >
      {loading ? (
        <ActivityIndicator color={VARIANT_TEXT_COLOR[variant]} />
      ) : (
        <Text style={[styles.text, size === 'sm' && styles.textSm, { color: VARIANT_TEXT_COLOR[variant] }]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  md: { paddingVertical: spacing.md, paddingHorizontal: spacing.base },
  sm: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  outlineBorder: { borderWidth: 1, borderColor: colors.primary },
  disabled: { opacity: 0.5 },
  text: { ...typography.label, fontWeight: '700' },
  textSm: { fontSize: 12 },
});
