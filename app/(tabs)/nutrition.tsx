import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HudText } from '../../src/components/quest/HudText';
import { QuestButton } from '../../src/components/quest/QuestButton';
import { QuestHeader } from '../../src/components/quest/QuestHeader';
import { QuestIcon } from '../../src/components/quest/QuestIcon';
import { ProgressBar } from '../../src/components/ProgressBar';
import { ProofCapture } from '../../src/components/ProofCapture';
import { MealRecipeSuggestion } from '../../src/components/MealRecipeSuggestion';
import { MealItemRows } from '../../src/components/PlanPreview';
import { WaterTimeline } from '../../src/components/WaterTimeline';
import { DateOffsetPicker } from '../../src/components/DateOffsetPicker';
import { TdeeCard } from '../../src/components/TdeeCard';
import { DailyMealBreakdownTable } from '../../src/components/DailyMealBreakdownTable';
import { useNutritionStore } from '../../src/store/useNutritionStore';
import { useWorkoutStore } from '../../src/store/useWorkoutStore';
import { useWeightStore } from '../../src/store/useWeightStore';
import { useSettingsStore } from '../../src/store/useSettingsStore';
import { getDayType, WATER_QUICK_ADD_ML } from '../../src/constants/plan';
import { usePlanStore } from '../../src/store/usePlanStore';
import { useTranslation } from '../../src/i18n/useTranslation';
import { useGameText } from '../../src/game/strings';
import type { StringKey } from '../../src/i18n/strings';
import { toDateKey } from '../../src/utils/date';
import type { ExtraMealTime } from '../../src/types';
import { quest, questFonts, questRadius } from '../../src/theme/quest';
import { screenMaxWidthStyle } from '../../src/theme/responsive';
import { useLightStatusBar } from '../../src/theme/useLightStatusBar';
import { extraIntake } from '../../src/utils/dayIntake';
import { useTabBarClearance } from '../../src/components/quest/QuestTabBar';

function isSameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

function endOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(23, 59, 0, 0);
  return copy;
}

const EXTRA_MEAL_TIME_OPTIONS: { value: ExtraMealTime; labelKey: StringKey }[] = [
  { value: 'breakfast', labelKey: 'extraMealTime.breakfast' },
  { value: 'morning_snack', labelKey: 'extraMealTime.morning_snack' },
  { value: 'lunch', labelKey: 'extraMealTime.lunch' },
  { value: 'afternoon_snack', labelKey: 'extraMealTime.afternoon_snack' },
  { value: 'late_afternoon_snack', labelKey: 'extraMealTime.late_afternoon_snack' },
  { value: 'dinner', labelKey: 'extraMealTime.dinner' },
  { value: 'evening_snack', labelKey: 'extraMealTime.evening_snack' },
];

export default function NutritionScreen() {
  const { t } = useTranslation();
  const g = useGameText();
  const insets = useSafeAreaInsets();
  const tabClearance = useTabBarClearance();
  useLightStatusBar();
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
  const saveDayLog = useNutritionStore((s) => s.saveDayLog);
  const settings = useSettingsStore();
  const latestWeight = useWeightStore((s) => s.latest());
  const currentWeight = latestWeight?.weightKg ?? settings.startWeightKg;
  const workoutEntries = useWorkoutStore((s) => s.entries);
  const caloriesBurnedOnViewDate = useMemo(
    () => workoutEntries.filter((e) => toDateKey(new Date(e.dateISO)) === dateKey).reduce((sum, e) => sum + e.caloriesBurned, 0),
    [workoutEntries, dateKey]
  );

  const [extraName, setExtraName] = useState('');
  const [extraCalories, setExtraCalories] = useState('');
  const [extraProtein, setExtraProtein] = useState('');
  const [extraMealTime, setExtraMealTime] = useState<ExtraMealTime | null>(null);
  const [customWaterMl, setCustomWaterMl] = useState('');

  function handleAddCustomWater() {
    const ml = parseFloat(customWaterMl.replace(',', '.'));
    if (!ml || ml <= 0) return;
    addWater(dateKey, ml);
    setCustomWaterMl('');
  }

  const eatenCalories = meals.filter((m) => log.mealsEaten[m.slot]).reduce((s, m) => s + m.calories, 0);
  const eatenProtein = meals.filter((m) => log.mealsEaten[m.slot]).reduce((s, m) => s + m.proteinG, 0);
  const extraNow = extraIntake(log);
  const totalCalories = Math.round(eatenCalories + extraNow.kcal);
  const totalProtein = Math.round((eatenProtein + extraNow.proteinG) * 10) / 10;

  function handleAddExtra() {
    const cal = parseFloat(extraCalories.replace(',', '.')) || 0;
    const protein = parseFloat(extraProtein.replace(',', '.')) || 0;
    if (cal <= 0 && protein <= 0) {
      Alert.alert(t('common.error'), t('nutrition.errorMissingValue'));
      return;
    }
    addExtra(dateKey, extraName.trim(), cal, protein, extraMealTime);
    setExtraName('');
    setExtraCalories('');
    setExtraProtein('');
    setExtraMealTime(null);
  }

  const sectionTitle = (text: string) => (
    <HudText size={16} style={styles.sectionTitle} accessibilityRole="header">
      {text}
    </HudText>
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, screenMaxWidthStyle, { paddingTop: insets.top + 16, paddingBottom: tabClearance }]}
      keyboardShouldPersistTaps="handled"
    >
      <QuestHeader
        title={g('nutritionScreen.title')}
        eyebrow={g('nutritionScreen.eyebrow')}
        backLabel={g('nutritionScreen.back')}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profile'))}
      />

      {sectionTitle(t('common.logDateTitle'))}
      <DateOffsetPicker dark selectedDate={viewDate} onChange={setViewDate} />

      <HudText size={13} weight="medium" color={quest.textSecondary}>
        {dayType === 'training' ? t('nutrition.dayTraining') : t('nutrition.dayRest')}
      </HudText>

      <View style={styles.card}>
        <HudText size={15}>{t('nutrition.totalTitle')}</HudText>
        <ProgressBar dark label={t('common.calories')} current={totalCalories} target={settings.calorieTargetKcal} unit="kcal" />
        <ProgressBar dark label={t('common.protein')} current={totalProtein} target={settings.proteinTargetG} unit="g" />
      </View>

      <TdeeCard
        dark
        calorieTargetKcal={settings.calorieTargetKcal}
        targetDailyDeficitKcal={settings.targetDailyDeficitKcal}
        heightCm={settings.heightCm}
        age={settings.age}
        gender={settings.gender}
        activityLevel={settings.activityLevel}
        weightKg={currentWeight}
        caloriesConsumedToday={totalCalories}
        caloriesBurnedExerciseToday={caloriesBurnedOnViewDate}
      />

      <View style={styles.card}>
        <HudText size={15}>{t('nutrition.waterTitle')}</HudText>
        <ProgressBar dark label={t('common.water')} current={log.waterMl} target={settings.waterTargetMl} unit="ml" />
        <View style={styles.chipRow}>
          {WATER_QUICK_ADD_ML.map((ml) => (
            <Pressable
              key={ml}
              accessibilityRole="button"
              accessibilityLabel={`+${ml}ml`}
              style={({ pressed }) => [styles.waterChip, pressed && { opacity: 0.8 }]}
              onPress={() => addWater(dateKey, ml)}
            >
              <HudText size={13} color={quest.manaText}>
                +{ml}ml
              </HudText>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.reset')}
            style={({ pressed }) => [styles.chip, pressed && { opacity: 0.8 }]}
            onPress={() => resetWater(dateKey)}
          >
            <HudText size={13} weight="medium" color={quest.textSecondary}>
              {t('common.reset')}
            </HudText>
          </Pressable>
        </View>
        <View style={styles.customWaterRow}>
          <TextInput
            accessibilityLabel={t('nutrition.customWaterPlaceholder')}
            placeholderTextColor={quest.textSecondary}
            style={[styles.input, styles.flex]}
            keyboardType="decimal-pad"
            placeholder={t('nutrition.customWaterPlaceholder')}
            value={customWaterMl}
            onChangeText={setCustomWaterMl}
          />
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.add')} style={styles.addButton} onPress={handleAddCustomWater}>
            <HudText size={14} color={quest.onGold}>
              {t('common.add')}
            </HudText>
          </Pressable>
        </View>
      </View>

      {sectionTitle(t('nutrition.waterScheduleTitle'))}
      <View style={styles.card}>
        {/* For a backdated day, treat every checkpoint's time as already past — "behind/complete"
            should be judged purely by ml logged, not by comparing to today's clock. */}
        <WaterTimeline dark schedule={waterSchedule} currentMl={log.waterMl} now={isToday ? new Date() : endOfDay(viewDate)} />
      </View>

      {sectionTitle(t('nutrition.mealsTitle'))}
      {meals.map((meal) => {
        const eaten = !!log.mealsEaten[meal.slot];
        return (
          <View key={meal.slot} style={[styles.card, eaten && styles.mealCardDone]}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: eaten }}
              accessibilityLabel={`${meal.label}. ${eaten ? g('nutritionScreen.mealDone') : g('nutritionScreen.mealTodo')}`}
              onPress={() => toggleMeal(dateKey, meal.slot)}
              style={styles.mealToggle}
            >
              <View style={styles.mealHeader}>
                <HudText size={14} style={styles.flex}>
                  {meal.label}
                </HudText>
                <View style={[styles.checkbox, eaten && styles.checkboxChecked]}>
                  {eaten && <QuestIcon name="check" size={16} color={quest.onGold} strokeWidth={3} />}
                </View>
              </View>
              <HudText size={12} weight="medium" color={quest.textSecondary}>
                {meal.timeRange}
              </HudText>
              <MealItemRows dark items={meal.items} />
              <HudText size={13} color={quest.gold} style={styles.mealMacro}>
                {t('nutrition.mealTotal', { kcal: meal.calories, protein: meal.proteinG })}
              </HudText>
            </Pressable>
            <ProofCapture variant="quest" dateKey={dateKey} taskType="meal" taskRefId={meal.slot} contextLabel={meal.label} plannedCalories={meal.calories} />
            <MealRecipeSuggestion
              dark
              dayType={dayType}
              mealSlot={meal.slot}
              mealLabel={meal.label}
              targetCalories={meal.calories}
              targetProtein={meal.proteinG}
            />
          </View>
        );
      })}

      {sectionTitle(t('nutrition.extraTitle'))}
      <View style={styles.card}>
        <TextInput
          accessibilityLabel={t('nutrition.extraNamePlaceholder')}
          placeholderTextColor={quest.textSecondary}
          style={styles.input}
          placeholder={t('nutrition.extraNamePlaceholder')}
          value={extraName}
          onChangeText={setExtraName}
        />
        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {t('nutrition.extraMealTimeLabel')}
        </HudText>
        <View style={styles.chipRow}>
          {EXTRA_MEAL_TIME_OPTIONS.map((opt) => {
            const active = extraMealTime === opt.value;
            return (
              <Pressable
                key={opt.value}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={t(opt.labelKey)}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setExtraMealTime(active ? null : opt.value)}
              >
                <HudText size={12} weight={active ? 'bold' : 'medium'} color={active ? quest.onGold : quest.textSecondary}>
                  {t(opt.labelKey)}
                </HudText>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.customWaterRow}>
          <TextInput
            accessibilityLabel={t('common.calories')}
            placeholderTextColor={quest.textSecondary}
            style={[styles.input, styles.flex]}
            placeholder={t('common.calories')}
            keyboardType="decimal-pad"
            value={extraCalories}
            onChangeText={setExtraCalories}
          />
          <TextInput
            accessibilityLabel={t('nutrition.extraProteinPlaceholder')}
            placeholderTextColor={quest.textSecondary}
            style={[styles.input, styles.flex]}
            placeholder={t('nutrition.extraProteinPlaceholder')}
            keyboardType="decimal-pad"
            value={extraProtein}
            onChangeText={setExtraProtein}
          />
        </View>
        <QuestButton title={t('nutrition.addExtraButton')} onPress={handleAddExtra} />
      </View>

      {sectionTitle(t('nutrition.diaryTitle'))}
      <View style={styles.card}>
        <DailyMealBreakdownTable
          dark
          key={dateKey}
          meals={meals}
          mealsEaten={log.mealsEaten}
          extraItems={log.extraItems}
          legacyTotals={{ kcal: log.extraCalories, proteinG: log.extraProteinG }}
          removedMealSlots={log.removedMealSlots}
          editable
          onSave={(draft) => saveDayLog(dateKey, draft)}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: quest.bg },
  content: { paddingHorizontal: 16, paddingBottom: 48, gap: 12 },
  flex: { flex: 1 },
  sectionTitle: { marginTop: 8 },
  card: { gap: 8, padding: 14, borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  mealCardDone: { borderColor: quest.xp },
  mealToggle: { gap: 4, minHeight: 44 },
  mealHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mealMacro: { marginTop: 4 },
  checkbox: { width: 28, height: 28, borderRadius: 8, borderWidth: 2, borderColor: quest.border, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: quest.xp, borderColor: quest.xp },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 36, paddingHorizontal: 12, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.raised, alignItems: 'center', justifyContent: 'center' },
  chipActive: { backgroundColor: quest.gold, borderColor: quest.gold },
  waterChip: { minHeight: 44, paddingHorizontal: 14, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.manaBorder, backgroundColor: quest.manaPanel, alignItems: 'center', justifyContent: 'center' },
  customWaterRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { minHeight: 48, paddingHorizontal: 12, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.bg, color: quest.text, fontSize: 15, fontFamily: questFonts.semibold },
  addButton: { minHeight: 48, paddingHorizontal: 16, borderRadius: questRadius.row, backgroundColor: quest.gold, alignItems: 'center', justifyContent: 'center' },
});
