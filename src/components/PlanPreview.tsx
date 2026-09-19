import { StyleSheet, Text, View } from 'react-native';
import { Card } from './Card';
import type { MealFoodItem, PlanData } from '../types';
import { shoppingListTotalVnd } from '../constants/plan';

function formatVnd(amount: number): string {
  return amount.toLocaleString('vi-VN') + ' đ';
}

/** One food line per row (name + kcal) — shared by the plan reference view and the daily meal cards. */
export function MealItemRows({ items }: { items: MealFoodItem[] }) {
  return (
    <View style={styles.itemsList}>
      {items.map((item, index) => (
        <View key={`${item.name}-${index}`} style={styles.itemRow}>
          <Text style={styles.itemName}>{item.name}</Text>
          <Text style={styles.itemCalories}>{item.calories} kcal</Text>
        </View>
      ))}
    </View>
  );
}

/** Renders a PlanData (meal menus, water schedule, workouts, shopping list) — reused for both the live plan and an AI proposal preview. */
export function PlanPreview({ plan }: { plan: PlanData }) {
  return (
    <View>
      <Text style={styles.sectionTitle}>Thực đơn tuần - Ngày tập luyện (T2,3,5,6)</Text>
      {plan.mealTemplates.training.map((m) => (
        <Card key={m.slot}>
          <Text style={styles.mealLabel}>
            {m.label} ({m.timeRange})
          </Text>
          <MealItemRows items={m.items} />
          <Text style={styles.mealMacro}>
            Tổng: {m.calories} kcal · {m.proteinG}g protein
          </Text>
        </Card>
      ))}

      <Text style={styles.sectionTitle}>Thực đơn tuần - Ngày nghỉ (T4,7,CN)</Text>
      {plan.mealTemplates.rest.map((m) => (
        <Card key={m.slot}>
          <Text style={styles.mealLabel}>
            {m.label} ({m.timeRange})
          </Text>
          <MealItemRows items={m.items} />
          <Text style={styles.mealMacro}>
            Tổng: {m.calories} kcal · {m.proteinG}g protein
          </Text>
        </Card>
      ))}

      <Text style={styles.sectionTitle}>Lịch trình uống nước (mục tiêu cộng dồn)</Text>
      <Card>
        {plan.waterSchedule.map((cp, index) => (
          <View key={`${cp.hour}-${cp.minute}-${index}`} style={styles.waterRow}>
            <Text style={styles.waterTime}>
              {String(cp.hour).padStart(2, '0')}:{String(cp.minute).padStart(2, '0')}
            </Text>
            <Text style={styles.waterLabel}>{cp.label}</Text>
            <Text style={styles.waterTarget}>{cp.cumulativeTargetMl}ml</Text>
          </View>
        ))}
      </Card>

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
  itemsList: { marginTop: 8 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  itemName: { fontSize: 13, color: '#444', flex: 1, paddingRight: 8 },
  itemCalories: { fontSize: 13, color: '#666', fontWeight: '600' },
  waterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    gap: 10,
  },
  waterTime: { fontSize: 12, fontWeight: '700', color: '#0288D1', width: 44 },
  waterLabel: { fontSize: 12, color: '#444', flex: 1 },
  waterTarget: { fontSize: 12, fontWeight: '700', color: '#333' },
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
