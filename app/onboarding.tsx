import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useSettingsStore } from '../src/store/useSettingsStore';
import { DEFAULT_START_WEIGHT_KG } from '../src/constants/plan';

export default function OnboardingScreen() {
  const completeOnboarding = useSettingsStore((s) => s.completeOnboarding);
  const [startWeight, setStartWeight] = useState(String(DEFAULT_START_WEIGHT_KG));
  const [goalWeight, setGoalWeight] = useState(String(DEFAULT_START_WEIGHT_KG - 15));
  const [height, setHeight] = useState('');

  function handleSubmit() {
    const startWeightKg = parseFloat(startWeight.replace(',', '.'));
    const goalWeightKg = parseFloat(goalWeight.replace(',', '.'));
    const heightCm = height ? parseFloat(height.replace(',', '.')) : null;

    if (!startWeightKg || startWeightKg <= 0) {
      Alert.alert('Lỗi', 'Vui lòng nhập cân nặng hiện tại hợp lệ.');
      return;
    }
    if (!goalWeightKg || goalWeightKg <= 0 || goalWeightKg >= startWeightKg) {
      Alert.alert('Lỗi', 'Cân nặng mục tiêu phải nhỏ hơn cân nặng hiện tại.');
      return;
    }

    completeOnboarding(startWeightKg, goalWeightKg, heightCm);
    router.replace('/(tabs)');
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Chào mừng!</Text>
      <Text style={styles.subtitle}>
        Nhập thông tin ban đầu để bắt đầu theo dõi hành trình giảm cân theo kế hoạch IF 16:8.
      </Text>

      <Text style={styles.label}>Cân nặng hiện tại (kg)</Text>
      <TextInput
        style={styles.input}
        keyboardType="decimal-pad"
        value={startWeight}
        onChangeText={setStartWeight}
        placeholder="110"
      />

      <Text style={styles.label}>Cân nặng mục tiêu (kg)</Text>
      <TextInput
        style={styles.input}
        keyboardType="decimal-pad"
        value={goalWeight}
        onChangeText={setGoalWeight}
        placeholder="95"
      />

      <Text style={styles.label}>Chiều cao (cm) - không bắt buộc</Text>
      <TextInput
        style={styles.input}
        keyboardType="decimal-pad"
        value={height}
        onChangeText={setHeight}
        placeholder="170"
      />

      <TouchableOpacity style={styles.button} onPress={handleSubmit}>
        <Text style={styles.buttonText}>Bắt đầu</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 60, backgroundColor: '#fff', flexGrow: 1 },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 24, lineHeight: 20 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 6, marginTop: 12, color: '#333' },
  input: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#4F8EF7',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 32,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
