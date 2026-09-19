import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from '../i18n/useTranslation';
import { colors, spacing, typography } from '../theme/tokens';

export function AppIntro() {
  const { t } = useTranslation();
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 6, useNativeDriver: true }),
    ]).start();
  }, [fade, scale]);

  return (
    <View style={styles.container}>
      <Animated.View style={{ opacity: fade, transform: [{ scale }], alignItems: 'center' }}>
        <Text style={styles.emoji}>🔥</Text>
        <Text style={styles.title}>{t('app.name')}</Text>
        <Text style={styles.tagline}>{t('app.tagline')}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  emoji: { fontSize: 56, marginBottom: spacing.base },
  title: { ...typography.h3, fontSize: 24, color: colors.white, marginBottom: spacing.sm },
  tagline: { ...typography.caption, color: colors.primaryLight, textAlign: 'center', paddingHorizontal: 40 },
});
