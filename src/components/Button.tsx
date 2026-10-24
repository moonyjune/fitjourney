import { useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';
import { useAccentColors } from '../theme/useAccentColors';
import { radius, spacing, typography } from '../theme/tokens';
import { NATIVE_DRIVER } from './quest/motion/tokens';

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

export function Button({ title, onPress, variant = 'primary', size = 'md', loading, disabled, style, flex }: ButtonProps) {
  const colors = useAccentColors();
  const [hovered, setHovered] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;

  const background: Record<ButtonVariant, string> = {
    primary: hovered ? colors.primaryDark : colors.primary,
    secondary: hovered ? colors.border : colors.neutralLight,
    success: colors.success,
    danger: colors.dangerLight,
    outline: hovered ? colors.primaryLight : 'transparent',
  };
  const textColor: Record<ButtonVariant, string> = {
    primary: colors.white,
    secondary: colors.textSecondary,
    success: colors.white,
    danger: colors.danger,
    outline: colors.primary,
  };

  function animateTo(value: number) {
    Animated.spring(scale, { toValue: value, friction: 6, tension: 140, useNativeDriver: NATIVE_DRIVER }).start();
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      onPressIn={() => animateTo(0.96)}
      onPressOut={() => animateTo(1)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
    >
      <Animated.View
        style={[
          styles.base,
          size === 'sm' ? styles.sm : styles.md,
          { backgroundColor: background[variant], transform: [{ scale }] },
          variant === 'outline' && [styles.outlineBorder, { borderColor: colors.primary }],
          flex && { flex: 1 },
          (disabled || loading) && styles.disabled,
          hovered && !disabled && !loading && styles.hovered,
          style,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={textColor[variant]} />
        ) : (
          <Text style={[styles.text, size === 'sm' && styles.textSm, { color: textColor[variant] }]}>{title}</Text>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  md: { paddingVertical: spacing.md, paddingHorizontal: spacing.base },
  sm: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  outlineBorder: { borderWidth: 1 },
  disabled: { opacity: 0.5 },
  hovered: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  text: { ...typography.label, fontWeight: '700' },
  textSm: { fontSize: 12 },
});
