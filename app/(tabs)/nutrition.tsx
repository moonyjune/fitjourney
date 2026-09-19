import { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Card } from '../../src/components/Card';
import { ProgressBar } from '../../src/components/ProgressBar';
import { ProofCapture } from '../../src/components/ProofCapture';
import { useNutritionStore, todayKey } from '../../src/store/useNutritionStore';
import { useSettingsStore } from '../../src/store/useSettingsStore';
import { getDayType, MEAL_TEMPLATES, WATER_QUICK_ADD_ML } from '../../src/constants/plan';

export default function NutritionScreen() {
  const dateKey = todayKey();
  const dayType = useMemo(() => getDayType(new Date()), []);
  const meals = MEAL_TEMPLATES[dayType];

  const log = useNutritionStore((s) => s.getLog(dateKey));
  const toggleMeal = useNutritionStore((s) => s.toggleMeal);
  const addWater = useNutritionStore((s) => s.addWater);
  const resetWater = useNutritionStore((s) => s.resetWater);
  const addExtra = useNutritionStore((s) => s.addExtra);
  const settings = useSettingsStore();

  const [extraName, setExtraName] = useState('');
  const [extraCalories, setExtraCalories] = useState('');
  const [extraProtein, setExtraProtein] = useState('');

  const eatenCalories = meals.filter((m) => log.mealsEaten[m.slot]).reduce((s, m) => s + m.calories, 0);
  const eatenProtein = meals.filter((m) => log.mealsEaten[m.slot]).reduce((s, m) => s + m.proteinG, 0);
  const totalCalories = eatenCalories + log.extraCalories;
  const totalProtein = eatenProtein + log.extraProteinG;

  function handleAddExtra() {
    const cal = parseFloat(extraCalories.replace(',', '.')) || 0;
    const protein = parseFloat(extraProtein.replace(',', '.')) || 0;
    if (cal <= 0 && protein <= 0) {
      Alert.alert('Lỗi', 'Nhập ít nhất calo hoặc protein.');
      return;
    }
    addExtra(dateKey, cal, protein);
    setExtraName('');
    setExtraCalories('');
    setExtraProtein('');
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.dayTypeLabel}>{dayType === 'training' ? 'Thực đơn ngày tập luyện' : 'Thực đơn ngày nghỉ'}</Text>

      <Card>
        <Text style={styles.cardTitle}>Tổng hôm nay</Text>
        <ProgressBar label="Calo" current={totalCalories} target={settings.calorieTargetKcal} unit="kcal" color="#F7A44F" />
        <ProgressBar label="Protein" current={totalProtein} target={settings.proteinTargetG} unit="g" color="#4F8EF7" />
      </Card>

      <Card>
        <Text style={styles.cardTitle}>Nước uống</Text>
        <ProgressBar label="Nước" current={log.waterMl} target={settings.waterTargetMl} unit="ml" color="#4FC3F7" />
        <View style={styles.waterButtons}>
          {WATER_QUICK_ADD_ML.map((ml) => (
            <TouchableOpacity key={ml} style={styles.waterButton} onPress={() => addWater(dateKey, ml)}>
              <Text style={styles.waterButtonText}>+{ml}ml</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.waterResetButton} onPress={() => resetWater(dateKey)}>
            <Text style={styles.waterResetText}>Đặt lại</Text>
          </TouchableOpacity>
        </View>
      </Card>

      <Text style={styles.sectionTitle}>Bữa ăn theo kế hoạch</Text>
      {meals.map((meal) => {
        const eaten = !!log.mealsEaten[meal.slot];
        return (
          <TouchableOpacity key={meal.slot} onPress={() => toggleMeal(dateKey, meal.slot)}>
            <Card style={eaten ? styles.mealCardDone : undefined}>
              <View style={styles.mealHeader}>
                <Text style={styles.mealLabel}>{meal.label}</Text>
                <View style={[styles.checkbox, eaten && styles.checkboxChecked]}>
                  {eaten && <Text style={styles.checkboxTick}>✓</Text>}
                </View>
              </View>
              <Text style={styles.mealTime}>{meal.timeRange}</Text>
              <Text style={styles.mealDescription}>{meal.description}</Text>
              <Text style={styles.mealMacro}>
                {meal.calories} kcal · {meal.proteinG}g protein
              </Text>
              <ProofCapture dateKey={dateKey} taskType="meal" taskRefId={meal.slot} />
            </Card>
          </TouchableOpacity>
        );
      })}

      <Text style={styles.sectionTitle}>Thêm món ăn ngoài kế hoạch</Text>
      <Card>
        <TextInput
          style={styles.input}
          placeholder="Tên món (không bắt buộc)"
          value={extraName}
          onChangeText={setExtraName}
        />
        <View style={styles.extraRow}>
          <TextInput
            style={[styles.input, styles.extraInput]}
            placeholder="Calo"
            keyboardType="decimal-pad"
            value={extraCalories}
            onChangeText={setExtraCalories}
          />
          <TextInput
            style={[styles.input, styles.extraInput]}
            placeholder="Protein (g)"
            keyboardType="decimal-pad"
            value={extraProtein}
            onChangeText={setExtraProtein}
          />
        </View>
        <TouchableOpacity style={styles.addButton} onPress={handleAddExtra}>
          <Text style={styles.addButtonText}>Thêm vào tổng hôm nay</Text>
        </TouchableOpacity>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  content: { padding: 16, paddingBottom: 32 },
  dayTypeLabel: { fontSize: 14, color: '#666', marginBottom: 12, fontWeight: '600' },
  cardTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10, color: '#222' },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginTop: 8, marginBottom: 8, color: '#222' },
  waterButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  waterButton: { backgroundColor: '#E1F5FE', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  waterButtonText: { color: '#0288D1', fontWeight: '700', fontSize: 13 },
  waterResetButton: { backgroundColor: '#F0F0F0', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  waterResetText: { color: '#666', fontSize: 13 },
  mealCardDone: { backgroundColor: '#E8F6EC' },
  mealHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mealLabel: { fontSize: 14, fontWeight: '700', color: '#222', flex: 1 },
  mealTime: { fontSize: 12, color: '#888', marginTop: 2 },
  mealDescription: { fontSize: 13, color: '#444', marginTop: 8, lineHeight: 18 },
  mealMacro: { fontSize: 13, color: '#4F8EF7', fontWeight: '700', marginTop: 8 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#CCC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: '#2E9E4E', borderColor: '#2E9E4E' },
  checkboxTick: { color: '#fff', fontWeight: '900', fontSize: 14 },
  input: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 8,
  },
  extraRow: { flexDirection: 'row', gap: 8 },
  extraInput: { flex: 1 },
  addButton: { backgroundColor: '#4F8EF7', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  addButtonText: { color: '#fff', fontWeight: '700' },
});
