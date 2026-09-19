import { StyleSheet, Text, View } from 'react-native';
import { Card } from './Card';
import type { PlanData } from '../types';
import { shoppingListTotalVnd } from '../constants/plan';

function formatVnd(amount: number): string {
  return amount.toLocaleString('vi-VN') + ' đ';
}

/** Renders a PlanData (meal menus, workouts, shopping list) — reused for both the live plan and an AI proposal preview. */
export function PlanPreview({ plan }: { plan: PlanData }) {
  return (
    <View>
      <Text style={styles.sectionTitle}>Thực đơn tuần - Ngày tập luyện (T2,3,5,6)</Text>
      {plan.mealTemplates.training.map((m) => (
        <Card key={m.slot}>
          <Text style={styles.mealLabel}>
            {m.label} ({m.timeRange})
          </Text>
          <Text style={styles.mealDescription}>{m.description}</Text>
          <Text style={styles.mealMacro}>
            {m.calories} kcal · {m.proteinG}g protein
          </Text>
        </Card>
      ))}

      <Text style={styles.sectionTitle}>Thực đơn tuần - Ngày nghỉ (T4,7,CN)</Text>
      {plan.mealTemplates.rest.map((m) => (
        <Card key={m.slot}>
          <Text style={styles.mealLabel}>
            {m.label} ({m.timeRange})
          </Text>
          <Text style={styles.mealDescription}>{m.description}</Text>
          <Text style={styles.mealMacro}>
            {m.calories} kcal · {m.proteinG}g protein
          </Text>
        </Card>
      ))}

      <Text style={styles.sectionTitle}>Chi tiết bài tập Cardio</Text>
      {plan.workoutTemplates.map((t) => (
        <Card key={t.id}>
          <Text style={styles.mealLabel}>{t.label}</Text>
          <Text style={styles.mealDescription}>{t.description}</Text>
          <Text style={styles.mealMacro}>
            {t.durationMin} phút · {t.caloriesBurned} kcal
          </Text>
        </Card>
      ))}

      <Text style={styles.sectionTitle}>
        Danh sách đi chợ 1 tuần (~{formatVnd(shoppingListTotalVnd(plan.shoppingList))})
      </Text>
      <Card>
        {plan.shoppingList.map((item, index) => (
          <View key={`${item.name}-${index}`} style={styles.shoppingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.shoppingName}>{item.name}</Text>
              <Text style={styles.shoppingMeta}>
                {item.category} · Mua: {item.quantityToBuy}
              </Text>
            </View>
            <Text style={styles.shoppingPrice}>{formatVnd(item.estimatedPriceVnd)}</Text>
          </View>
        ))}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { fontSize: 15, fontWeight: '700', marginTop: 8, marginBottom: 8, color: '#222' },
  mealLabel: { fontSize: 14, fontWeight: '700', color: '#222' },
  mealDescription: { fontSize: 13, color: '#444', marginTop: 6, lineHeight: 18 },
  mealMacro: { fontSize: 13, color: '#4F8EF7', fontWeight: '700', marginTop: 8 },
  shoppingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  shoppingName: { fontSize: 13, fontWeight: '600', color: '#222' },
  shoppingMeta: { fontSize: 11, color: '#888', marginTop: 2 },
  shoppingPrice: { fontSize: 13, fontWeight: '700', color: '#333' },
});
