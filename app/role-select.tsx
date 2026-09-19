import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useSettingsStore } from '../src/store/useSettingsStore';

export default function RoleSelectScreen() {
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
      <Text style={styles.title}>Bạn là ai?</Text>
      <Text style={styles.subtitle}>Chọn vai trò để mình thiết lập đúng trải nghiệm cho bạn.</Text>

      <TouchableOpacity style={styles.card} onPress={handleClient} disabled={busy}>
        <Text style={styles.cardEmoji}>🏃</Text>
        <Text style={styles.cardTitle}>Tôi tự tập (Client)</Text>
        <Text style={styles.cardDescription}>
          Theo dõi cân nặng, dinh dưỡng, tập luyện theo kế hoạch. Có thể liên kết với Coach sau.
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.card} onPress={handleCoach} disabled={busy}>
        <Text style={styles.cardEmoji}>🧑‍🏫</Text>
        <Text style={styles.cardTitle}>Tôi là Coach (Huấn luyện viên)</Text>
        <Text style={styles.cardDescription}>
          Quản lý nhiều học viên, chỉnh thực đơn/lịch tập cho từng người bằng trợ lý AI.
        </Text>
        {busy && <ActivityIndicator style={{ marginTop: 10 }} color="#4F8EF7" />}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 24, paddingTop: 80 },
  title: { fontSize: 26, fontWeight: '800', marginBottom: 8, color: '#222' },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 32 },
  card: {
    borderWidth: 1,
    borderColor: '#EEE',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    backgroundColor: '#F9FAFB',
  },
  cardEmoji: { fontSize: 32, marginBottom: 10 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: '#222', marginBottom: 6 },
  cardDescription: { fontSize: 13, color: '#666', lineHeight: 19 },
});
