import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card } from '../../src/components/Card';
import { useNutritionStore } from '../../src/store/useNutritionStore';
import { useWorkoutStore } from '../../src/store/useWorkoutStore';
import { useWeightStore } from '../../src/store/useWeightStore';
import { useProofStore } from '../../src/store/useProofStore';
import { useSettingsStore } from '../../src/store/useSettingsStore';
import { getDayType } from '../../src/constants/plan';
import { usePlanStore } from '../../src/store/usePlanStore';
import { formatDateVi, toDateKey } from '../../src/utils/date';
import { weekStartKey } from '../../src/utils/weekKey';
import { computeMilestones } from '../../src/utils/milestones';
import { computeCurrentStreak, unlockedStreakBadges, badgeLabel } from '../../src/utils/streak';

interface DaySummary {
  dateKey: string;
  calories: number;
  proteinG: number;
  waterMl: number;
  mealsEatenCount: number;
  workoutsCount: number;
  caloriesBurned: number;
  proofsCount: number;
  weightKg: number | null;
}

const MILESTONE_STATUS_LABEL: Record<string, string> = {
  upcoming: 'Chưa tới ngày',
  achieved: 'Đã đạt mục tiêu',
  missed: 'Chưa đạt mục tiêu',
};

const MILESTONE_STATUS_COLOR: Record<string, string> = {
  upcoming: '#888',
  achieved: '#2E9E4E',
  missed: '#E0563A',
};

export default function HistoryScreen() {
  const nutritionLogs = useNutritionStore((s) => s.logs);
  const workoutEntries = useWorkoutStore((s) => s.entries);
  const weightEntries = useWeightStore((s) => s.entries);
  const proofs = useProofStore((s) => s.photos);
  const settings = useSettingsStore();
  const latestWeight = useWeightStore((s) => s.latest());
  const mealTemplates = usePlanStore((s) => s.plan.mealTemplates);

  const daySummaries = useMemo<DaySummary[]>(() => {
    const dateKeys = new Set<string>();
    Object.keys(nutritionLogs).forEach((k) => dateKeys.add(k));
    workoutEntries.forEach((e) => dateKeys.add(toDateKey(new Date(e.dateISO))));
    weightEntries.forEach((e) => dateKeys.add(toDateKey(new Date(e.dateISO))));
    proofs.forEach((p) => dateKeys.add(toDateKey(new Date(p.dateISO))));

    return [...dateKeys]
      .sort()
      .reverse()
      .map((dateKey) => {
        const dayType = getDayType(new Date(dateKey));
        const meals = mealTemplates[dayType];
        const log = nutritionLogs[dateKey];
        const eatenMeals = meals.filter((m) => log?.mealsEaten[m.slot]);
        const calories = eatenMeals.reduce((s, m) => s + m.calories, 0) + (log?.extraCalories ?? 0);
        const proteinG = eatenMeals.reduce((s, m) => s + m.proteinG, 0) + (log?.extraProteinG ?? 0);
        const dayWorkouts = workoutEntries.filter((e) => toDateKey(new Date(e.dateISO)) === dateKey);
        const dayWeight = weightEntries.find((e) => toDateKey(new Date(e.dateISO)) === dateKey);
        const dayProofs = proofs.filter((p) => toDateKey(new Date(p.dateISO)) === dateKey);

        return {
          dateKey,
          calories,
          proteinG,
          waterMl: log?.waterMl ?? 0,
          mealsEatenCount: eatenMeals.length,
          workoutsCount: dayWorkouts.length,
          caloriesBurned: dayWorkouts.reduce((s, w) => s + w.caloriesBurned, 0),
          proofsCount: dayProofs.length,
          weightKg: dayWeight?.weightKg ?? null,
        };
      });
  }, [nutritionLogs, workoutEntries, weightEntries, proofs, mealTemplates]);

  const weeklySummaries = useMemo(() => {
    const groups = new Map<string, DaySummary[]>();
    for (const day of daySummaries) {
      const week = weekStartKey(new Date(day.dateKey));
      if (!groups.has(week)) groups.set(week, []);
      groups.get(week)!.push(day);
    }
    return [...groups.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([weekKey, days]) => {
        const avgCalories = days.reduce((s, d) => s + d.calories, 0) / days.length;
        const totalWorkouts = days.reduce((s, d) => s + d.workoutsCount, 0);
        const weightsLogged = days.map((d) => d.weightKg).filter((w): w is number => w !== null);
        const weightChange =
          weightsLogged.length >= 2 ? weightsLogged[weightsLogged.length - 1] - weightsLogged[0] : null;
        return { weekKey, days, avgCalories, totalWorkouts, weightChange };
      });
  }, [daySummaries]);

  const milestones = useMemo(
    () =>
      computeMilestones(
        settings.startDateISO,
        settings.startWeightKg,
        settings.goalWeightKg,
        latestWeight?.weightKg ?? settings.startWeightKg
      ),
    [settings.startDateISO, settings.startWeightKg, settings.goalWeightKg, latestWeight]
  );

  const streak = useMemo(
    () => computeCurrentStreak(nutritionLogs, 3, settings.waterTargetMl),
    [nutritionLogs, settings.waterTargetMl]
  );
  const badges = unlockedStreakBadges(streak);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Thành tích</Text>
      <Card>
        <Text style={styles.streakValue}>🔥 {streak} ngày liên tiếp</Text>
        {badges.length > 0 ? (
          <View style={styles.badgeRow}>
            {badges.map((b) => (
              <View key={b} style={styles.badgeChip}>
                <Text style={styles.badgeChipText}>{badgeLabel(b)}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.dayMeta}>Hoàn thành 3 ngày liên tiếp để mở huy hiệu đầu tiên.</Text>
        )}
      </Card>

      <Text style={styles.sectionTitle}>Mốc tiến trình</Text>
      {milestones.map((m) => (
        <Card key={m.key}>
          <View style={styles.milestoneRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.milestoneLabel}>{m.label}</Text>
              <Text style={styles.milestoneMeta}>
                Hạn: {formatDateVi(toDateKey(m.targetDate))} · Mục tiêu: {m.targetWeightKg.toFixed(1)} kg
              </Text>
            </View>
            <Text style={[styles.milestoneStatus, { color: MILESTONE_STATUS_COLOR[m.status] }]}>
              {MILESTONE_STATUS_LABEL[m.status]}
            </Text>
          </View>
        </Card>
      ))}

      <Text style={styles.sectionTitle}>Tổng kết theo tuần</Text>
      {weeklySummaries.length === 0 && <Text style={styles.emptyText}>Chưa có dữ liệu.</Text>}
      {weeklySummaries.map((w) => (
        <Card key={w.weekKey}>
          <Text style={styles.weekLabel}>Tuần bắt đầu {formatDateVi(w.weekKey)}</Text>
          <Text style={styles.weekMeta}>
            TB {Math.round(w.avgCalories)} kcal/ngày · {w.totalWorkouts} buổi tập
            {w.weightChange !== null
              ? ` · Cân nặng ${w.weightChange > 0 ? '+' : ''}${w.weightChange.toFixed(1)} kg`
              : ''}
          </Text>
        </Card>
      ))}

      <Text style={styles.sectionTitle}>Nhật ký hằng ngày</Text>
      {daySummaries.length === 0 && <Text style={styles.emptyText}>Chưa có dữ liệu.</Text>}
      {daySummaries.map((d) => (
        <Card key={d.dateKey}>
          <Text style={styles.dayLabel}>{formatDateVi(d.dateKey)}</Text>
          <Text style={styles.dayMeta}>
            {d.calories} kcal · {d.proteinG}g protein · {d.waterMl}ml nước
          </Text>
          <Text style={styles.dayMeta}>
            {d.mealsEatenCount}/3 bữa · {d.workoutsCount} buổi tập ({d.caloriesBurned} kcal){' '}
            {d.weightKg !== null ? `· ${d.weightKg.toFixed(1)} kg` : ''}
          </Text>
          {d.proofsCount > 0 && <Text style={styles.proofBadge}>📷 {d.proofsCount} ảnh minh chứng</Text>}
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  content: { padding: 16, paddingBottom: 32 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginTop: 8, marginBottom: 8, color: '#222' },
  milestoneRow: { flexDirection: 'row', alignItems: 'center' },
  milestoneLabel: { fontSize: 14, fontWeight: '700', color: '#222' },
  milestoneMeta: { fontSize: 12, color: '#888', marginTop: 4 },
  milestoneStatus: { fontSize: 12, fontWeight: '700' },
  weekLabel: { fontSize: 14, fontWeight: '700', color: '#222' },
  weekMeta: { fontSize: 12, color: '#666', marginTop: 4 },
  dayLabel: { fontSize: 14, fontWeight: '700', color: '#222' },
  dayMeta: { fontSize: 12, color: '#666', marginTop: 4 },
  proofBadge: { fontSize: 12, color: '#4F8EF7', fontWeight: '700', marginTop: 6 },
  emptyText: { textAlign: 'center', color: '#999', marginBottom: 12 },
  streakValue: { fontSize: 20, fontWeight: '800', color: '#8A5A00' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  badgeChip: { backgroundColor: '#FFE8B3', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  badgeChipText: { fontSize: 11, fontWeight: '700', color: '#8A5A00' },
});
