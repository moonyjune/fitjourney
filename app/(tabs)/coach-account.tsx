import { router } from 'expo-router';
import { ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Card } from '../../src/components/Card';
import { Badge } from '../../src/components/Badge';
import { Button } from '../../src/components/Button';
import { useAuthStore } from '../../src/store/useAuthStore';
import { useSettingsStore } from '../../src/store/useSettingsStore';
import { useSyncQueueStore } from '../../src/sync/syncQueue';
import { signOutAndReset } from '../../src/auth/signOut';
import { useTranslation } from '../../src/i18n/useTranslation';
import { useAccentColors } from '../../src/theme/useAccentColors';
import { screenMaxWidthStyle } from '../../src/theme/responsive';

export default function CoachAccountScreen() {
  const { t } = useTranslation();
  const colors = useAccentColors();
  const session = useAuthStore((s) => s.session);
  const pendingSyncCount = useSyncQueueStore((s) => s.pending.length);
  const coachCode = useSettingsStore((s) => s.coachCode);
  const remindersEnabled = useSettingsStore((s) => s.remindersEnabled);
  const clientSetupDone = useSettingsStore((s) => s.clientSetupDone);
  const language = useSettingsStore((s) => s.language);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const switchToClientMode = useSettingsStore((s) => s.switchToClientMode);

  function handleSwitchToClient() {
    switchToClientMode();
    router.replace('/(tabs)');
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, screenMaxWidthStyle]}>
      <Text style={styles.sectionTitle}>{t('mode.title')}</Text>
      <Card>
        <Text style={styles.fieldLabel}>
          {clientSetupDone ? t('mode.clientAlreadyTracking') : t('mode.clientNotSetUp')}
        </Text>
        <Button
          title={clientSetupDone ? t('mode.switchToClient') : t('mode.startPersonalTracking')}
          onPress={handleSwitchToClient}
        />
      </Card>

      <Text style={styles.sectionTitle}>{t('mode.language')}</Text>
      <Card>
        <View style={styles.languageRow}>
          <TouchableOpacity
            style={[styles.languageButton, language === 'vi' && { backgroundColor: colors.primary }]}
            onPress={() => updateSettings({ language: 'vi' })}
          >
            <Text style={[styles.languageButtonText, language === 'vi' && styles.languageButtonTextActive]}>Tiếng Việt</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.languageButton, language === 'en' && { backgroundColor: colors.primary }]}
            onPress={() => updateSettings({ language: 'en' })}
          >
            <Text style={[styles.languageButtonText, language === 'en' && styles.languageButtonTextActive]}>English</Text>
          </TouchableOpacity>
        </View>
      </Card>

      <Text style={styles.sectionTitle}>{t('coachAccount.codeTitle')}</Text>
      <Card>
        <Text style={styles.hint}>{t('coachAccount.codeHint')}</Text>
        <Text style={[styles.code, { color: colors.primary }]}>{coachCode ?? '...'}</Text>
      </Card>

      <Text style={styles.sectionTitle}>{t('coachAccount.remindersTitle')}</Text>
      <Card>
        <View style={styles.switchRow}>
          <Text style={styles.fieldLabel}>{t('coachAccount.deviceReminders')}</Text>
          <Switch value={remindersEnabled} onValueChange={(v) => updateSettings({ remindersEnabled: v })} />
        </View>
      </Card>

      <Text style={styles.sectionTitle}>{t('tab.account')}</Text>
      <Card>
        <Text style={styles.fieldLabel}>{session?.user.email ?? t('common.notSignedIn')}</Text>
        {pendingSyncCount > 0 && <Badge tone="warning" label={t('sync.pendingCount', { n: pendingSyncCount })} />}
        <Button title={t('common.signOut')} onPress={() => signOutAndReset()} variant="danger" style={{ marginTop: 8 }} />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  content: { padding: 16, paddingBottom: 32 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginTop: 8, marginBottom: 8, color: '#222' },
  hint: { fontSize: 12, color: '#666', marginBottom: 6 },
  code: { fontSize: 28, fontWeight: '800', letterSpacing: 4 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#444', marginBottom: 8 },
  languageRow: { flexDirection: 'row', gap: 8 },
  languageButton: { flex: 1, backgroundColor: '#F0F0F0', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  languageButtonText: { fontSize: 13, fontWeight: '700', color: '#666' },
  languageButtonTextActive: { color: '#fff' },
});
