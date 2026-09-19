import { ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Card } from '../../src/components/Card';
import { useAuthStore } from '../../src/store/useAuthStore';
import { useSettingsStore } from '../../src/store/useSettingsStore';
import { supabase } from '../../src/lib/supabase';

export default function CoachAccountScreen() {
  const session = useAuthStore((s) => s.session);
  const coachCode = useSettingsStore((s) => s.coachCode);
  const remindersEnabled = useSettingsStore((s) => s.remindersEnabled);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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

      <Text style={styles.sectionTitle}>Tài khoản</Text>
      <Card>
        <Text style={styles.fieldLabel}>{session?.user.email ?? 'Chưa đăng nhập'}</Text>
        <TouchableOpacity style={styles.signOutButton} onPress={() => supabase.auth.signOut()}>
          <Text style={styles.signOutText}>Đăng xuất</Text>
        </TouchableOpacity>
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
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#444' },
  signOutButton: { backgroundColor: '#FDEDEA', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 10 },
  signOutText: { color: '#E0563A', fontWeight: '700' },
});
