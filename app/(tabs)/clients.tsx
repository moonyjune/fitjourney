import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Card } from '../../src/components/Card';
import { useSettingsStore } from '../../src/store/useSettingsStore';
import { fetchCoachClients } from '../../src/sync/cloudSync';
import type { CoachClientSummary } from '../../src/types';

export default function ClientsScreen() {
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Mã của bạn</Text>
      <Card>
        <Text style={styles.codeLabel}>Chia sẻ mã này cho học viên để họ liên kết tài khoản:</Text>
        <Text style={styles.code}>{coachCode ?? '...'}</Text>
      </Card>

      <Text style={styles.sectionTitle}>Học viên ({clients.length})</Text>
      {loading && <ActivityIndicator color="#4F8EF7" style={{ marginTop: 12 }} />}
      {!loading && clients.length === 0 && (
        <Text style={styles.emptyText}>Chưa có học viên nào liên kết. Gửi mã ở trên cho họ nhé.</Text>
      )}
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
                {client.latestWeightKg != null ? `${client.latestWeightKg.toFixed(1)} kg` : 'Chưa có cân nặng'}
                {client.goalWeightKg != null ? ` · Mục tiêu ${client.goalWeightKg} kg` : ''}
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
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  content: { padding: 16, paddingBottom: 32 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginTop: 8, marginBottom: 8, color: '#222' },
  codeLabel: { fontSize: 12, color: '#666', marginBottom: 6 },
  code: { fontSize: 28, fontWeight: '800', letterSpacing: 4, color: '#4F8EF7' },
  emptyText: { textAlign: 'center', color: '#999', marginTop: 12 },
  clientEmail: { fontSize: 14, fontWeight: '700', color: '#222' },
  clientMeta: { fontSize: 12, color: '#666', marginTop: 4 },
});
