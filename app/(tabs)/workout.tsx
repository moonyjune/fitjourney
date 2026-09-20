import { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Card } from '../../src/components/Card';
import { Button } from '../../src/components/Button';
import { ProofCapture } from '../../src/components/ProofCapture';
import { WorkoutStepsList } from '../../src/components/PlanPreview';
import { DateOffsetPicker } from '../../src/components/DateOffsetPicker';
import { useWorkoutStore } from '../../src/store/useWorkoutStore';
import { todayKey } from '../../src/store/useNutritionStore';
import { getDayType } from '../../src/constants/plan';
import { usePlanStore } from '../../src/store/usePlanStore';
import { formatDateVi, toDateKey } from '../../src/utils/date';
import { useTranslation } from '../../src/i18n/useTranslation';
import { colors, radius, spacing, typography } from '../../src/theme/tokens';
import { screenMaxWidthStyle } from '../../src/theme/responsive';

export default function WorkoutScreen() {
  const { t } = useTranslation();
  const dateKey = todayKey();
  const dayType = useMemo(() => getDayType(new Date()), []);
  const workoutTemplates = usePlanStore((s) => s.plan.workoutTemplates);
  const entries = useWorkoutStore((s) => s.entries);
  const addEntry = useWorkoutStore((s) => s.addEntry);
  const removeEntry = useWorkoutStore((s) => s.removeEntry);

  const todayEntries = useMemo(
    () => entries.filter((e) => toDateKey(new Date(e.dateISO)) === dateKey).reverse(),
    [entries, dateKey]
  );
  const recentEntries = useMemo(
    () => entries.filter((e) => toDateKey(new Date(e.dateISO)) !== dateKey).slice(-10).reverse(),
    [entries, dateKey]
  );

  const [customLabel, setCustomLabel] = useState('');
  const [customDuration, setCustomDuration] = useState('');
  const [customCalories, setCustomCalories] = useState('');
  const [logDate, setLogDate] = useState(new Date());

  function logTemplate(templateId: string, label: string, durationMin: number, caloriesBurned: number) {
    addEntry({ templateId, label, durationMin, caloriesBurned }, logDate.toISOString());
  }

  function logCustom() {
    const duration = parseFloat(customDuration.replace(',', '.'));
    const calories = parseFloat(customCalories.replace(',', '.'));
    if (!customLabel || !duration || !calories) {
      Alert.alert(t('common.error'), t('workout.errorMissingFields'));
      return;
    }
    addEntry({ templateId: null, label: customLabel, durationMin: duration, caloriesBurned: calories }, logDate.toISOString());
    setCustomLabel('');
    setCustomDuration('');
    setCustomCalories('');
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, screenMaxWidthStyle]}>
      <Text style={styles.dayTypeLabel}>{dayType === 'training' ? t('workout.dayTraining') : t('workout.dayRest')}</Text>

      <Text style={styles.sectionTitle}>{t('common.logDateTitle')}</Text>
      <DateOffsetPicker selectedDate={logDate} onChange={setLogDate} />

      <Text style={styles.sectionTitle}>{t('workout.suggestedTitle')}</Text>
      {workoutTemplates.map((template) => (
        <Card key={template.id}>
          <Text style={styles.templateLabel}>{template.label}</Text>
          <Text style={styles.templateTime}>{template.timeRange}</Text>
          {template.steps && template.steps.length > 0 ? (
            <WorkoutStepsList steps={template.steps} />
          ) : (
            <Text style={styles.templateDescription}>{template.description}</Text>
          )}
          <View style={styles.templateFooter}>
            <Text style={styles.templateMacro}>{t('workout.templateMacro', { min: template.durationMin, kcal: template.caloriesBurned })}</Text>
            <View style={styles.templateActions}>
              <TouchableOpacity
                style={styles.editButton}
                onPress={() => router.push(`/(tabs)/plan?editWorkout=${encodeURIComponent(template.label)}`)}
              >
                <Text style={styles.editButtonText}>{t('workout.editWithAiButton')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.logButton}
                onPress={() => logTemplate(template.id, template.label, template.durationMin, template.caloriesBurned)}
              >
                <Text style={styles.logButtonText}>{t('workout.logTemplateButton')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Card>
      ))}

      <Text style={styles.sectionTitle}>{t('workout.customTitle')}</Text>
      <Card>
        <TextInput style={styles.input} placeholder={t('workout.namePlaceholder')} value={customLabel} onChangeText={setCustomLabel} />
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.rowInput]}
            placeholder={t('workout.durationPlaceholder')}
            keyboardType="decimal-pad"
            value={customDuration}
            onChangeText={setCustomDuration}
          />
          <TextInput
            style={[styles.input, styles.rowInput]}
            placeholder={t('workout.caloriesPlaceholder')}
            keyboardType="decimal-pad"
            value={customCalories}
            onChangeText={setCustomCalories}
          />
        </View>
        <Button title={t('workout.logButton')} onPress={logCustom} />
      </Card>

      <Text style={styles.sectionTitle}>{t('workout.todayTitle', { n: todayEntries.length })}</Text>
      {todayEntries.length === 0 && <Text style={styles.emptyText}>{t('workout.emptyToday')}</Text>}
      {todayEntries.map((e) => (
        <Card key={e.id}>
          <View style={styles.historyTopRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.historyLabel}>{e.label}</Text>
              <Text style={styles.historyMeta}>{t('workout.templateMacro', { min: e.durationMin, kcal: e.caloriesBurned })}</Text>
            </View>
            <TouchableOpacity onPress={() => removeEntry(e.id)}>
              <Text style={styles.deleteText}>{t('common.delete')}</Text>
            </TouchableOpacity>
          </View>
          <ProofCapture dateKey={dateKey} taskType="workout" taskRefId={e.id} contextLabel={e.label} plannedCalories={e.caloriesBurned} />
        </Card>
      ))}

      {recentEntries.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>{t('workout.recentTitle')}</Text>
          {recentEntries.map((e) => (
            <View key={e.id} style={styles.historyRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.historyLabel}>{e.label}</Text>
                <Text style={styles.historyMeta}>
                  {formatDateVi(toDateKey(new Date(e.dateISO)))} · {t('workout.templateMacro', { min: e.durationMin, kcal: e.caloriesBurned })}
                </Text>
              </View>
              <TouchableOpacity onPress={() => removeEntry(e.id)}>
                <Text style={styles.deleteText}>{t('common.delete')}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.base, paddingBottom: spacing.xxl },
  dayTypeLabel: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.md, fontWeight: '600' },
  sectionTitle: { ...typography.title, marginTop: spacing.sm, marginBottom: spacing.sm, color: colors.textPrimary },
  templateLabel: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  templateTime: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  templateDescription: { fontSize: 13, color: '#444', marginTop: spacing.sm, lineHeight: 18 },
  templateFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md, flexWrap: 'wrap', gap: spacing.sm },
  templateMacro: { fontSize: 13, color: colors.primary, fontWeight: '700' },
  templateActions: { flexDirection: 'row', gap: spacing.sm },
  editButton: { backgroundColor: colors.neutralLight, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2 },
  editButtonText: { color: colors.textSecondary, fontWeight: '700', fontSize: 12 },
  logButton: { backgroundColor: colors.primary, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2 },
  logButtonText: { color: colors.white, fontWeight: '700', fontSize: 12 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    fontSize: 15,
    marginBottom: spacing.sm,
  },
  row: { flexDirection: 'row', gap: spacing.sm },
  rowInput: { flex: 1 },
  historyTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  historyLabel: { fontWeight: '700', fontSize: 14, color: colors.textPrimary },
  historyMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  deleteText: { color: colors.danger, fontSize: 13 },
  emptyText: { textAlign: 'center', color: colors.textMuted, marginBottom: spacing.md },
});
