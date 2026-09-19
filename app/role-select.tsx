import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useSettingsStore } from '../src/store/useSettingsStore';
import { useTranslation } from '../src/i18n/useTranslation';
import { colors, radius, spacing, typography } from '../src/theme/tokens';

export default function RoleSelectScreen() {
  const { t } = useTranslation();
  const chooseClientRole = useSettingsStore((s) => s.chooseClientRole);
  const chooseCoachRole = useSettingsStore((s) => s.chooseCoachRole);
  const [busy, setBusy] = useState(false);

  function handleClient() {
    chooseClientRole();
    router.replace('/onboarding');
  }

  async function handleCoach() {
    setBusy(true);
    await chooseCoachRole();
    setBusy(false);
    router.replace('/(tabs)/clients');
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('role.title')}</Text>
      <Text style={styles.subtitle}>{t('role.subtitle')}</Text>

      <TouchableOpacity style={styles.card} onPress={handleClient} disabled={busy}>
        <Text style={styles.cardEmoji}>🏃</Text>
        <Text style={styles.cardTitle}>{t('role.clientTitle')}</Text>
        <Text style={styles.cardDescription}>{t('role.clientDescription')}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.card} onPress={handleCoach} disabled={busy}>
        <Text style={styles.cardEmoji}>🧑‍🏫</Text>
        <Text style={styles.cardTitle}>{t('role.coachTitle')}</Text>
        <Text style={styles.cardDescription}>{t('role.coachDescription')}</Text>
        {busy && <ActivityIndicator style={{ marginTop: spacing.md }} color={colors.primary} />}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface, padding: spacing.xl, paddingTop: 80 },
  title: { ...typography.h2, marginBottom: spacing.sm, color: colors.textPrimary },
  subtitle: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.xxl },
  card: {
    borderWidth: 1,
    borderColor: '#EEE',
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.base,
    backgroundColor: '#F9FAFB',
  },
  cardEmoji: { fontSize: 32, marginBottom: spacing.md },
  cardTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.xs + 2 },
  cardDescription: { ...typography.body, color: colors.textSecondary, lineHeight: 19 },
});
