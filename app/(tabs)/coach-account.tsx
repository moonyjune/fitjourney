import { router } from 'expo-router';
import { ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Card } from '../../src/components/Card';
import { Button } from '../../src/components/Button';
import { useAuthStore } from '../../src/store/useAuthStore';
import { useSettingsStore } from '../../src/store/useSettingsStore';
import { supabase } from '../../src/lib/supabase';
import { useTranslation } from '../../src/i18n/useTranslation';
import { colors } from '../../src/theme/tokens';

export default function CoachAccountScreen() {
  const { t } = useTranslation();
  const session = useAuthStore((s) => s.session);
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>{t('mode.title')}</Text>
      <Card>
        <Text style={styles.fieldLabel}>
          {clientSetupDone ? 'Bạn cũng đang tự theo dõi cân nặng/dinh dưỡng.' : 'Bạn có thể tự theo dõi cân nặng/dinh dưỡng của chính mình.'}
        </Text>
        <Button
          title={clientSetupDone ? 'Chuyển sang chế độ tự tập' : 'Bắt đầu theo dõi cá nhân'}
          onPress={handleSwitchToClient}
        />
      </Card>

      <Text style={styles.sectionTitle}>{t('mode.language')}</Text>
      <Card>
        <View style={styles.languageRow}>
          <TouchableOpacity
            style={[styles.languageButton, language === 'vi' && styles.languageButtonActive]}
            onPress={() => updateSettings({ language: 'vi' })}
          >
            <Text style={[styles.languageButtonText, language === 'vi' && styles.languageButtonTextActive]}>Tiếng Việt</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.languageButton, language === 'en' && styles.languageButtonActive]}
            onPress={() => updateSettings({ language: 'en' })}
          >
            <Text style={[styles.languageButtonText, language === 'en' && styles.languageButtonTextActive]}>English</Text>
          </TouchableOpacity>
        </View>
      </Card>

      <Text style={styles.sectionTitle}>Mã Coach</Text>
      <Card>
        <Text style={styles.hint}>Chia sẻ mã này cho học viên để họ liên kết tài khoản:</Text>
        <Text style={styles.code}>{coachCode ?? '...'}</Text>
      </Card>

      <Text style={styles.sectionTitle}>Nhắc nhở</Text>
      <Card>
        <View style={styles.switchRow}>
          <Text style={styles.fieldLabel}>Nhắc nhở trên thiết bị</Text>
          <Switch value={remindersEnabled} onValueChange={(v) => updateSettings({ remindersEnabled: v })} />
        </View>
      </Card>

      <Text style={styles.sectionTitle}>{t('tab.account')}</Text>
      <Card>
        <Text style={styles.fieldLabel}>{session?.user.email ?? 'Chưa đăng nhập'}</Text>
        <Button title={t('common.signOut')} onPress={() => supabase.auth.signOut()} variant="danger" />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  content: { padding: 16, paddingBottom: 32 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginTop: 8, marginBottom: 8, color: '#222' },
  hint: { fontSize: 12, color: '#666', marginBottom: 6 },
  code: { fontSize: 28, fontWeight: '800', letterSpacing: 4, color: '#4F8EF7' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#444', marginBottom: 8 },
  languageRow: { flexDirection: 'row', gap: 8 },
  languageButton: { flex: 1, backgroundColor: '#F0F0F0', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  languageButtonActive: { backgroundColor: colors.primary },
  languageButtonText: { fontSize: 13, fontWeight: '700', color: '#666' },
  languageButtonTextActive: { color: '#fff' },
});
