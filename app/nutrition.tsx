import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HudText } from '../src/components/quest/HudText';
import { QuestButton } from '../src/components/quest/QuestButton';
import { QuestHeader } from '../src/components/quest/QuestHeader';
import { QuestIcon } from '../src/components/quest/QuestIcon';
import { ProgressBar } from '../src/components/ProgressBar';
import { ProofCapture } from '../src/components/ProofCapture';
import { MealRecipeSuggestion } from '../src/components/MealRecipeSuggestion';
import { MealItemRows } from '../src/components/PlanPreview';
import { WaterTimeline } from '../src/components/WaterTimeline';
import { WaterNextDrink } from '../src/components/quest/WaterNextDrink';
import { DateOffsetPicker } from '../src/components/DateOffsetPicker';
import { TdeeCard } from '../src/components/TdeeCard';
import { DailyMealBreakdownTable } from '../src/components/DailyMealBreakdownTable';
import { useNutritionStore } from '../src/store/useNutritionStore';
import { useCheatDayStore } from '../src/store/useCheatDayStore';
import { useWorkoutStore } from '../src/store/useWorkoutStore';
import { useWeightStore } from '../src/store/useWeightStore';
import { useSettingsStore } from '../src/store/useSettingsStore';
import { getDayType, WATER_QUICK_ADD_ML } from '../src/constants/plan';
import { usePlanStore } from '../src/store/usePlanStore';
import { useTranslation } from '../src/i18n/useTranslation';
import { useGameText } from '../src/game/strings';
import { useDayEvaluator, useNow } from '../src/game/useGameState';
import { toDateKey } from '../src/utils/date';
import { quest, questFonts, questRadius } from '../src/theme/quest';
import { screenMaxWidthStyle } from '../src/theme/responsive';
import { useLightStatusBar } from '../src/theme/useLightStatusBar';
import { extraIntake } from '../src/utils/dayIntake';
import { useWaterPlan } from '../src/water/useWaterPlan';
import { useTabBarClearance } from '../src/components/quest/QuestTabBar';

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
  const g = useGameText();
  const insets = useSafeAreaInsets();
  const tabClearance = useTabBarClearance();
  useLightStatusBar();
  const [viewDate, setViewDate] = useState(new Date());
  const dateKey = toDateKey(viewDate);
  // The game's reading of the day: whether food is logged, and its end-of-day estimate while meals are still to come.
  const evaluate = useDayEvaluator(useNow(60_000));
  const dayEval = useMemo(() => evaluate(dateKey), [evaluate, dateKey]);
  const dayType = useMemo(() => getDayType(viewDate), [viewDate]);
  const isToday = isSameDay(viewDate, new Date());
  const mealTemplates = usePlanStore((s) => s.plan.mealTemplates);
  // Generated from the day's own target (a past day keeps the one it was lived under).
  const water = useWaterPlan(dateKey);
  const meals = mealTemplates[dayType];

  const log = useNutritionStore((s) => s.getLog(dateKey));
  const cheatDay = useCheatDayStore((s) => s.days.includes(dateKey));
  const toggleMeal = useNutritionStore((s) => s.toggleMeal);
  const addWater = useNutritionStore((s) => s.addWater);
  const resetWater = useNutritionStore((s) => s.resetWater);
  const saveDayLog = useNutritionStore((s) => s.saveDayLog);
  const settings = useSettingsStore();
  const latestWeight = useWeightStore((s) => s.latest());
  const currentWeight = latestWeight?.weightKg ?? settings.startWeightKg;
  const workoutEntries = useWorkoutStore((s) => s.entries);
  const caloriesBurnedOnViewDate = useMemo(
    () => workoutEntries.filter((e) => toDateKey(new Date(e.dateISO)) === dateKey).reduce((sum, e) => sum + e.caloriesBurned, 0),
    [workoutEntries, dateKey]
  );

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
        cheatDay={cheatDay}
        hasFood={dayEval.eatenKcal > 0 || dayEval.deficitKcal != null}
        projectedDeficitKcal={dayEval.projectedDeficitKcal}
      />

      <View style={styles.card}>
        <HudText size={15}>{t('nutrition.waterTitle')}</HudText>
        <ProgressBar dark label={t('common.water')} current={log.waterMl} target={water.targetMl} unit="ml" />
        {isToday && <WaterNextDrink schedule={water.schedule} waterMl={log.waterMl} />}
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
        <WaterTimeline dark schedule={water.schedule} currentMl={log.waterMl} now={isToday ? new Date() : endOfDay(viewDate)} />
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
      <QuestButton
        variant="ghost"
        icon="plus"
        title={g('nutritionScreen.logMeal')}
        onPress={() => router.push({ pathname: '/add-food', params: isToday ? {} : { date: dateKey } })}
      />

      {sectionTitle(t('nutrition.diaryTitle'))}
      <View style={styles.card}>
        <DailyMealBreakdownTable
          dark
          key={dateKey}
          meals={meals}
          mealsEaten={log.mealsEaten}
          extraItems={log.extraItems}
          legacyTotals={{ kcal: log.extraCalories, proteinG: log.extraProteinG }}
          dateKey={dateKey}
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
  waterChip: { minHeight: 44, paddingHorizontal: 14, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.manaBorder, backgroundColor: quest.manaPanel, alignItems: 'center', justifyContent: 'center' },
  customWaterRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { minHeight: 48, paddingHorizontal: 12, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.bg, color: quest.text, fontSize: 15, fontFamily: questFonts.semibold },
  addButton: { minHeight: 48, paddingHorizontal: 16, borderRadius: questRadius.row, backgroundColor: quest.gold, alignItems: 'center', justifyContent: 'center' },
});
