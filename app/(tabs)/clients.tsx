import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Card } from '../../src/components/Card';
import { useSettingsStore } from '../../src/store/useSettingsStore';
import { fetchCoachClients } from '../../src/sync/cloudSync';
import { useTranslation } from '../../src/i18n/useTranslation';
import { colors, spacing, typography } from '../../src/theme/tokens';
import { screenMaxWidthStyle } from '../../src/theme/responsive';
import type { CoachClientSummary } from '../../src/types';

export default function ClientsScreen() {
  const { t } = useTranslation();
  const coachCode = useSettingsStore((s) => s.coachCode);
  const [clients, setClients] = useState<CoachClientSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchCoachClients();
    setClients(data);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, screenMaxWidthStyle]}>
      <Text style={styles.sectionTitle}>{t('clients.yourCodeTitle')}</Text>
      <Card>
        <Text style={styles.codeLabel}>{t('clients.shareCodeHint')}</Text>
        <Text style={styles.code}>{coachCode ?? '...'}</Text>
      </Card>

      <Text style={styles.sectionTitle}>{t('clients.listTitle', { n: clients.length })}</Text>
      {loading && <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.md }} />}
      {!loading && clients.length === 0 && <Text style={styles.emptyText}>{t('clients.empty')}</Text>}
      {clients.map((client) => {
        const change =
          client.latestWeightKg != null && client.startWeightKg != null
            ? client.latestWeightKg - client.startWeightKg
            : null;
        return (
          <TouchableOpacity key={client.id} onPress={() => router.push(`/client/${client.id}`)}>
            <Card>
              <Text style={styles.clientEmail}>{client.email ?? client.id}</Text>
              <Text style={styles.clientMeta}>
                {client.latestWeightKg != null ? `${client.latestWeightKg.toFixed(1)} kg` : t('clients.noWeight')}
                {client.goalWeightKg != null ? t('clients.goalSuffix', { kg: client.goalWeightKg }) : ''}
                {change != null ? ` · ${change > 0 ? '+' : ''}${change.toFixed(1)} kg` : ''}
              </Text>
            </Card>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.base, paddingBottom: spacing.xxl },
  sectionTitle: { ...typography.title, marginTop: spacing.sm, marginBottom: spacing.sm, color: colors.textPrimary },
  codeLabel: { fontSize: 12, color: colors.textSecondary, marginBottom: spacing.sm - 2 },
  code: { fontSize: 28, fontWeight: '800', letterSpacing: 4, color: colors.primary },
  emptyText: { textAlign: 'center', color: colors.textMuted, marginTop: spacing.md },
  clientEmail: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  clientMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },
});
