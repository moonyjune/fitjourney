import { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Card } from '../../src/components/Card';
import { Button } from '../../src/components/Button';
import { ProgressBar } from '../../src/components/ProgressBar';
import { ProofCapture } from '../../src/components/ProofCapture';
import { MealItemRows } from '../../src/components/PlanPreview';
import { WaterTimeline } from '../../src/components/WaterTimeline';
import { DateOffsetPicker } from '../../src/components/DateOffsetPicker';
import { useNutritionStore } from '../../src/store/useNutritionStore';
import { useSettingsStore } from '../../src/store/useSettingsStore';
import { getDayType, WATER_QUICK_ADD_ML } from '../../src/constants/plan';
import { usePlanStore } from '../../src/store/usePlanStore';
import { useTranslation } from '../../src/i18n/useTranslation';
import { toDateKey } from '../../src/utils/date';
import { colors, radius, spacing, typography } from '../../src/theme/tokens';
import { screenMaxWidthStyle } from '../../src/theme/responsive';
import { useAmbientBackground } from '../../src/theme/useAmbientBackground';

function isSameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

function endOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(23, 59, 0, 0);
  return copy;
}

export default function NutritionScreen() {
  const { t } = useTranslation();
  const ambientBg = useAmbientBackground();
  const [viewDate, setViewDate] = useState(new Date());
  const dateKey = toDateKey(viewDate);
  const dayType = useMemo(() => getDayType(viewDate), [viewDate]);
  const isToday = isSameDay(viewDate, new Date());
  const mealTemplates = usePlanStore((s) => s.plan.mealTemplates);
  const waterSchedule = usePlanStore((s) => s.plan.waterSchedule);
  const meals = mealTemplates[dayType];

  const log = useNutritionStore((s) => s.getLog(dateKey));
  const toggleMeal = useNutritionStore((s) => s.toggleMeal);
  const addWater = useNutritionStore((s) => s.addWater);
  const resetWater = useNutritionStore((s) => s.resetWater);
  const addExtra = useNutritionStore((s) => s.addExtra);
  const settings = useSettingsStore();

  const [extraName, setExtraName] = useState('');
  const [extraCalories, setExtraCalories] = useState('');
  const [extraProtein, setExtraProtein] = useState('');
  const [customWaterMl, setCustomWaterMl] = useState('');

  function handleAddCustomWater() {
    const ml = parseFloat(customWaterMl.replace(',', '.'));
    if (!ml || ml <= 0) return;
    addWater(dateKey, ml);
    setCustomWaterMl('');
  }

  const eatenCalories = meals.filter((m) => log.mealsEaten[m.slot]).reduce((s, m) => s + m.calories, 0);
  const eatenProtein = meals.filter((m) => log.mealsEaten[m.slot]).reduce((s, m) => s + m.proteinG, 0);
  const totalCalories = eatenCalories + log.extraCalories;
  const totalProtein = eatenProtein + log.extraProteinG;

  function handleAddExtra() {
    const cal = parseFloat(extraCalories.replace(',', '.')) || 0;
    const protein = parseFloat(extraProtein.replace(',', '.')) || 0;
    if (cal <= 0 && protein <= 0) {
      Alert.alert(t('common.error'), t('nutrition.errorMissingValue'));
      return;
    }
    addExtra(dateKey, cal, protein);
    setExtraName('');
    setExtraCalories('');
    setExtraProtein('');
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: ambientBg }]} contentContainerStyle={[styles.content, screenMaxWidthStyle]}>
      <Text style={styles.sectionTitle}>{t('common.logDateTitle')}</Text>
      <DateOffsetPicker selectedDate={viewDate} onChange={setViewDate} />

      <Text style={styles.dayTypeLabel}>{dayType === 'training' ? t('nutrition.dayTraining') : t('nutrition.dayRest')}</Text>

      <Card>
        <Text style={styles.cardTitle}>{t('nutrition.totalTitle')}</Text>
        <ProgressBar label={t('common.calories')} current={totalCalories} target={settings.calorieTargetKcal} unit="kcal" />
        <ProgressBar label={t('common.protein')} current={totalProtein} target={settings.proteinTargetG} unit="g" />
      </Card>

      <Card>
        <Text style={styles.cardTitle}>{t('nutrition.waterTitle')}</Text>
        <ProgressBar label={t('common.water')} current={log.waterMl} target={settings.waterTargetMl} unit="ml" />
        <View style={styles.waterButtons}>
          {WATER_QUICK_ADD_ML.map((ml) => (
            <TouchableOpacity key={ml} style={styles.waterButton} onPress={() => addWater(dateKey, ml)}>
              <Text style={styles.waterButtonText}>+{ml}ml</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.waterResetButton} onPress={() => resetWater(dateKey)}>
            <Text style={styles.waterResetText}>{t('common.reset')}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.customWaterRow}>
          <TextInput
            style={[styles.input, styles.customWaterInput]}
            keyboardType="decimal-pad"
            placeholder={t('nutrition.customWaterPlaceholder')}
            value={customWaterMl}
            onChangeText={setCustomWaterMl}
          />
          <Button title={t('common.add')} size="sm" onPress={handleAddCustomWater} />
        </View>
      </Card>

      <Text style={styles.sectionTitle}>{t('nutrition.waterScheduleTitle')}</Text>
      <Card>
        {/* For a backdated day, treat every checkpoint's time as already past — "behind/complete"
            should be judged purely by ml logged, not by comparing to today's clock. */}
        <WaterTimeline schedule={waterSchedule} currentMl={log.waterMl} now={isToday ? new Date() : endOfDay(viewDate)} />
      </Card>

      <Text style={styles.sectionTitle}>{t('nutrition.mealsTitle')}</Text>
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
              <MealItemRows items={meal.items} />
              <Text style={styles.mealMacro}>{t('nutrition.mealTotal', { kcal: meal.calories, protein: meal.proteinG })}</Text>
              <ProofCapture dateKey={dateKey} taskType="meal" taskRefId={meal.slot} contextLabel={meal.label} plannedCalories={meal.calories} />
            </Card>
          </TouchableOpacity>
        );
      })}

      <Text style={styles.sectionTitle}>{t('nutrition.extraTitle')}</Text>
      <Card>
        <TextInput
          style={styles.input}
          placeholder={t('nutrition.extraNamePlaceholder')}
          value={extraName}
          onChangeText={setExtraName}
        />
        <View style={styles.extraRow}>
          <TextInput
            style={[styles.input, styles.extraInput]}
            placeholder={t('common.calories')}
            keyboardType="decimal-pad"
            value={extraCalories}
            onChangeText={setExtraCalories}
          />
          <TextInput
            style={[styles.input, styles.extraInput]}
            placeholder={t('nutrition.extraProteinPlaceholder')}
            keyboardType="decimal-pad"
            value={extraProtein}
            onChangeText={setExtraProtein}
          />
        </View>
        <Button title={t('nutrition.addExtraButton')} onPress={handleAddExtra} />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.base, paddingBottom: spacing.xxl },
  dayTypeLabel: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.md, fontWeight: '600' },
  cardTitle: { ...typography.title, marginBottom: spacing.md, color: colors.textPrimary },
  sectionTitle: { ...typography.title, marginTop: spacing.sm, marginBottom: spacing.sm, color: colors.textPrimary },
  waterButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  waterButton: { backgroundColor: colors.infoLight, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  waterButtonText: { color: '#0288D1', fontWeight: '700', fontSize: 13 },
  waterResetButton: { backgroundColor: colors.neutralLight, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  waterResetText: { color: colors.textSecondary, fontSize: 13 },
  customWaterRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, alignItems: 'center' },
  customWaterInput: { flex: 1, marginBottom: 0 },
  mealCardDone: { backgroundColor: colors.successLight },
  mealHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mealLabel: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, flex: 1 },
  mealTime: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  mealMacro: { fontSize: 13, color: colors.primary, fontWeight: '700', marginTop: spacing.sm },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#CCC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.success, borderColor: colors.success },
  checkboxTick: { color: colors.white, fontWeight: '900', fontSize: 14 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    fontSize: 15,
    marginBottom: spacing.sm,
  },
  extraRow: { flexDirection: 'row', gap: spacing.sm },
  extraInput: { flex: 1 },
});
