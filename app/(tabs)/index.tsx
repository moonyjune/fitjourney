import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Card } from '../../src/components/Card';
import { ProgressBar } from '../../src/components/ProgressBar';
import { useSettingsStore } from '../../src/store/useSettingsStore';
import { useWeightStore } from '../../src/store/useWeightStore';
import { useNutritionStore, todayKey } from '../../src/store/useNutritionStore';
import { useWorkoutStore } from '../../src/store/useWorkoutStore';
import { getDayType, MEAL_TEMPLATES } from '../../src/constants/plan';
import { getIfStatus } from '../../src/utils/intermittentFasting';
import { computeMilestones } from '../../src/utils/milestones';
import { formatDateVi, toDateKey } from '../../src/utils/date';

export default function TodayScreen() {
  const [now, setNow] = useState(new Date());
  useFocusEffect(
    useCallback(() => {
      setNow(new Date());
    }, [])
  );

  const settings = useSettingsStore();
  const latestWeight = useWeightStore((s) => s.latest());
  const nutritionLog = useNutritionStore((s) => s.getLog(todayKey()));
  const allWorkoutEntries = useWorkoutStore((s) => s.entries);
  const workoutEntries = useMemo(
    () => allWorkoutEntries.filter((e) => toDateKey(new Date(e.dateISO)) === todayKey()),
    [allWorkoutEntries]
  );

  const dayType = useMemo(() => getDayType(now), [now]);
  const ifStatus = useMemo(() => getIfStatus(now), [now]);
  const meals = MEAL_TEMPLATES[dayType];

  const eatenCalories = meals
    .filter((m) => nutritionLog.mealsEaten[m.slot])
    .reduce((sum, m) => sum + m.calories, 0);
  const eatenProtein = meals
    .filter((m) => nutritionLog.mealsEaten[m.slot])
    .reduce((sum, m) => sum + m.proteinG, 0);
  const totalCalories = eatenCalories + nutritionLog.extraCalories;
  const totalProtein = eatenProtein + nutritionLog.extraProteinG;

  const caloriesBurnedToday = workoutEntries.reduce((sum, w) => sum + w.caloriesBurned, 0);

  const currentWeight = latestWeight?.weightKg ?? settings.startWeightKg;
  const weightChange = currentWeight - settings.startWeightKg;

  const nextMilestone = useMemo(() => {
    const milestones = computeMilestones(
      settings.startDateISO,
      settings.startWeightKg,
      settings.goalWeightKg,
      currentWeight,
      now
    );
    return milestones.find((m) => m.status === 'upcoming') ?? milestones[milestones.length - 1];
  }, [settings.startDateISO, settings.startWeightKg, settings.goalWeightKg, currentWeight, now]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.dateLabel}>
        {now.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' })} ·{' '}
        {dayType === 'training' ? 'Ngày tập luyện' : 'Ngày nghỉ ngơi'}
      </Text>

      <Card style={ifStatus.isEatingWindow ? styles.eatingCard : styles.fastingCard}>
        <Text style={styles.ifLabel}>{ifStatus.label}</Text>
        <Text style={styles.ifSubLabel}>
          Còn khoảng {ifStatus.hoursUntilTransition.toFixed(1)} giờ nữa đến{' '}
          {ifStatus.isEatingWindow ? 'giờ nhịn' : 'giờ ăn'}
        </Text>
      </Card>

      <Card>
        <Text style={styles.cardTitle}>Cân nặng</Text>
        <View style={styles.weightRow}>
          <Text style={styles.weightValue}>{currentWeight.toFixed(1)} kg</Text>
          <Text style={[styles.weightChange, { color: weightChange <= 0 ? '#2E9E4E' : '#E0563A' }]}>
            {weightChange > 0 ? '+' : ''}
            {weightChange.toFixed(1)} kg so với lúc bắt đầu
          </Text>
        </View>
        <Text style={styles.goalLabel}>Mục tiêu: {settings.goalWeightKg} kg</Text>
      </Card>

      <Card>
        <Text style={styles.cardTitle}>{nextMilestone.label}</Text>
        <Text style={styles.milestoneMeta}>
          Hạn {formatDateVi(toDateKey(nextMilestone.targetDate))} · Mục tiêu {nextMilestone.targetWeightKg.toFixed(1)} kg
          {nextMilestone.status === 'upcoming' ? ` · còn ${nextMilestone.daysRemaining} ngày` : ''}
        </Text>
      </Card>

      <Card>
        <Text style={styles.cardTitle}>Dinh dưỡng hôm nay</Text>
        <ProgressBar label="Calo" current={totalCalories} target={settings.calorieTargetKcal} unit="kcal" color="#F7A44F" />
        <ProgressBar label="Protein" current={totalProtein} target={settings.proteinTargetG} unit="g" color="#4F8EF7" />
        <ProgressBar label="Nước" current={nutritionLog.waterMl} target={settings.waterTargetMl} unit="ml" color="#4FC3F7" />
      </Card>

      <Card>
        <Text style={styles.cardTitle}>Tập luyện hôm nay</Text>
        <Text style={styles.workoutSummary}>
          Đã tập {workoutEntries.length} buổi · Đốt {caloriesBurnedToday} kcal
        </Text>
        {dayType === 'rest' && <Text style={styles.restNote}>Hôm nay là ngày nghỉ theo kế hoạch.</Text>}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  content: { padding: 16, paddingBottom: 32 },
  dateLabel: { fontSize: 14, color: '#666', marginBottom: 12, textTransform: 'capitalize' },
  eatingCard: { backgroundColor: '#E8F6EC' },
  fastingCard: { backgroundColor: '#FFF3E0' },
  ifLabel: { fontSize: 16, fontWeight: '700', color: '#333' },
  ifSubLabel: { fontSize: 13, color: '#666', marginTop: 4 },
  cardTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10, color: '#222' },
  weightRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap' },
  weightValue: { fontSize: 28, fontWeight: '800', color: '#222' },
  weightChange: { fontSize: 12, fontWeight: '600' },
  goalLabel: { fontSize: 13, color: '#888', marginTop: 4 },
  milestoneMeta: { fontSize: 12, color: '#666' },
  workoutSummary: { fontSize: 14, color: '#333' },
  restNote: { fontSize: 12, color: '#888', marginTop: 6 },
});
