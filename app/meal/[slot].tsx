import { useMemo, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { MealRecipeSuggestion } from '../../src/components/MealRecipeSuggestion';
import { ProofCapture } from '../../src/components/ProofCapture';
import { DishThumb } from '../../src/components/quest/DishThumb';
import { HudText } from '../../src/components/quest/HudText';
import { ImpactNote } from '../../src/components/quest/ImpactNote';
import { LogDateBanner } from '../../src/components/quest/LogDateBanner';
import { LoggedFoodSheet } from '../../src/components/quest/LoggedFoodSheet';
import { NutrientTiles } from '../../src/components/quest/NutrientTiles';
import { QuestButton } from '../../src/components/quest/QuestButton';
import { QuestChip } from '../../src/components/quest/QuestChip';
import { QuestIcon, type QuestIconName } from '../../src/components/quest/QuestIcon';
import { ScreenTemplate } from '../../src/components/quest/ScreenTemplate';
import { getDayType } from '../../src/constants/plan';
import { allEaten, planMealFoodName, planMealOutcome, type PlanItemChoice, type PlanMealSwapDish } from '../../src/food/planMeal';
import { isSkippedMealItem } from '../../src/food/skipMeal';
import { mealNames } from '../../src/game/deficitView';
import type { DayMeal } from '../../src/game/missions';
import { sumItemNutrients } from '../../src/game/nutrients';
import { logWithMealToggled, previewDayChange } from '../../src/game/preview';
import { useGameText } from '../../src/game/strings';
import { useNow, useTodayInput } from '../../src/game/useGameState';
import { useLogDate } from '../../src/game/useLogDate';
import { PLAN_SLOT_MEAL } from '../../src/insights/days';
import { useNutritionStore } from '../../src/store/useNutritionStore';
import { useSkippedMealStore } from '../../src/store/useSkippedMealStore';
import { showToast } from '../../src/store/useToastStore';
import { quest, questFonts, questRadius } from '../../src/theme/quest';
import { useLightStatusBar } from '../../src/theme/useLightStatusBar';
import type { MealSlot, MealTemplate } from '../../src/types';
import { dateOfKey } from '../../src/utils/logDate';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)');
}

/** A plan meal (dialog 09): filled from the plan, each dish marked eaten / not eaten / swapped, a proof photo, "Muốn đổi món?" (the AI
 *  suggestion with its recipe, which can take the whole meal's place), the impact on the day's missions, "Bỏ bữa" (0.23 rules: the meal no
 *  longer counts as missing) and the sticky "Đã ăn · X kcal". Eaten as planned it ticks the plan meal; otherwise what was really eaten is
 *  logged as one food of that meal. Both can be undone from the toast. */
export default function PlanMealScreen() {
  const g = useGameText();
  useLightStatusBar();
  const { slot } = useLocalSearchParams<{ slot: string }>();
  const now = useNow();
  const day = useLogDate(now);
  const input = useTodayInput(now, day.dateKey);
  const meals = input.mealTemplatesByDayType[getDayType(day.isToday ? now : dateOfKey(day.dateKey))];
  const meal = meals.find((m) => m.slot === slot);

  if (!meal) {
    return (
      <ScreenTemplate title={g('meal.notFound')} onBack={goBack} backLabel={g('common.back')}>
        <View style={styles.section}>
          <QuestButton variant="ghost" icon="camp" title={g('meal.backToCamp')} onPress={() => router.replace('/(tabs)')} />
        </View>
      </ScreenTemplate>
    );
  }
  // A fresh set of choices for each meal and day.
  return <PlanMeal key={`${day.dateKey}-${meal.slot}`} meal={meal} meals={meals} now={now} day={day} input={input} />;
}

interface PlanMealProps {
  meal: MealTemplate;
  meals: MealTemplate[];
  now: Date;
  day: ReturnType<typeof useLogDate>;
  input: ReturnType<typeof useTodayInput>;
}

function PlanMeal({ meal, meals, now, day, input }: PlanMealProps) {
  const g = useGameText();
  const toggleMeal = useNutritionStore((s) => s.toggleMeal);
  const toggleSkipped = useSkippedMealStore((s) => s.toggle);
  const [choices, setChoices] = useState<PlanItemChoice[]>(() => allEaten(meal));
  const [recipe, setRecipe] = useState<PlanMealSwapDish | null>(null);
  const [openFood, setOpenFood] = useState<string | null>(null);
  const eaten = !!input.log?.mealsEaten[meal.slot];
  const mainMeal = PLAN_SLOT_MEAL[meal.slot];

  const outcome = useMemo(() => planMealOutcome(meal, choices, recipe), [meal, choices, recipe]);
  const nutrients = useMemo(() => sumItemNutrients(meal.items), [meal]);
  // What eating it as planned (or, if already eaten, the state with it eaten) does to the day's missions.
  const preview = useMemo(() => previewDayChange(input, logWithMealToggled(input.log, input.dateKey, meal.slot)), [input, meal]);
  const dayState = eaten ? preview.before : preview.after;
  const over = (id: 'purine' | 'salt' | 'sugar') => {
    const m = dayState.missions.find((x) => x.id === id);
    return m?.status === 'missed' && m.value > m.target;
  };

  // Food already logged at this meal (not the "Không ăn" mark): shown so it is not logged twice, each opening its detail sheet.
  const logged = (input.log?.extraItems ?? []).filter((i) => i.mealTime === mainMeal && !isSkippedMealItem(i));
  // "Bỏ bữa" (0.23–0.25): this meal as the day's evaluation knows it (a fasting plan's slot, else breakfast / lunch / dinner).
  const before = preview.before;
  const isThis = (m: DayMeal) => m.id === meal.slot || m.id === mainMeal;
  const skipped = before.skippedMeals.find(isThis);
  const skippable = !eaten && logged.length === 0 ? [...before.pendingMeals, ...before.missingMeals].find(isThis) : undefined;

  function setChoice(i: number, next: PlanItemChoice) {
    setChoices((cur) => cur.map((c, j) => (j === i ? next : c)));
  }

  function eat() {
    const dateKey = input.dateKey;
    const kcalText = Math.round(outcome.kcal).toLocaleString('en-US');
    if (outcome.asPlanned) {
      toggleMeal(dateKey, meal.slot);
      AccessibilityInfo.announceForAccessibility(g('meal.statusEaten'));
      showToast({
        text: g('meal.eatenToast', { meal: meal.label, kcal: kcalText }),
        undo: () => {
          if (useNutritionStore.getState().logs[dateKey]?.mealsEaten[meal.slot]) useNutritionStore.getState().toggleMeal(dateKey, meal.slot);
        },
      });
      return;
    }
    if (outcome.parts.length === 0) return;
    const id = useNutritionStore.getState().addExtra(dateKey, planMealFoodName(outcome.parts), outcome.kcal, outcome.proteinG, mainMeal, {
      purineMg: outcome.purineMg,
      saltG: outcome.saltG,
      sugarG: outcome.sugarG,
      parts: outcome.parts.length > 1 ? outcome.parts : undefined,
      fromFoodDb: true,
    });
    setChoices(allEaten(meal));
    setRecipe(null);
    AccessibilityInfo.announceForAccessibility(g('meal.eatenToast', { meal: meal.label, kcal: kcalText }));
    showToast({ text: g('meal.eatenToast', { meal: meal.label, kcal: kcalText }), undo: () => useNutritionStore.getState().removeExtraItem(dateKey, id) });
  }

  function skip(m: DayMeal) {
    const dateKey = input.dateKey;
    toggleSkipped(dateKey, m.id);
    showToast({
      text: g('deficit.skippedLine', { meals: mealNames([m], g) }),
      tone: 'neutral',
      undo: () => {
        if (useSkippedMealStore.getState().isSkipped(dateKey, m.id)) useSkippedMealStore.getState().toggle(dateKey, m.id);
      },
    });
  }

  const xp = preview.xpDelta > 0 ? preview.xpDelta : 0;
  const kcalLabel = Math.round(outcome.kcal).toLocaleString('en-US');
  const primaryLabel = outcome.asPlanned
    ? xp > 0
      ? g('meal.eatPlanXp', { kcal: kcalLabel, xp })
      : g('meal.eatPlan', { kcal: kcalLabel })
    : outcome.parts.length > 0
      ? g('meal.eatPartial', { kcal: kcalLabel })
      : g('meal.eatNothing');

  const status = (
    <View style={[styles.status, eaten ? styles.statusEaten : styles.statusPending]}>
      <HudText size={12} color={eaten ? quest.onGold : quest.textSecondary} style={styles.statusText}>
        {g(eaten ? 'meal.statusEaten' : 'meal.statusPending').toUpperCase()}
      </HudText>
    </View>
  );

  return (
    <ScreenTemplate
      title={meal.label}
      eyebrow={g('meal.eyebrow', { range: meal.timeRange })}
      onBack={goBack}
      backLabel={g('common.back')}
      right={status}
      primary={eaten ? undefined : { label: primaryLabel, onPress: eat, disabled: !outcome.asPlanned && outcome.parts.length === 0 }}
    >
      {!day.isToday && (
        <View style={styles.banner}>
          <LogDateBanner label={day.label} />
        </View>
      )}

      <View style={styles.switchRow} accessibilityLabel={g('meal.switch')}>
        {meals.map((m, i) => (
          <QuestChip key={m.slot} label={g('meal.slotShort', { n: i + 1 })} selected={m.slot === meal.slot} onPress={() => router.setParams({ slot: m.slot as MealSlot })} />
        ))}
      </View>

      <View style={styles.section}>
        <HudText size={12} color={quest.textSecondary} style={styles.eyebrow}>
          {g('meal.photo').toUpperCase()}
        </HudText>
        <View style={styles.panel}>
          <ProofCapture variant="quest" dateKey={input.dateKey} taskType="meal" taskRefId={meal.slot} contextLabel={meal.label} plannedCalories={meal.calories} />
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <HudText size={15}>{g('meal.items')}</HudText>
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {g('meal.itemCount', { n: meal.items.length })}
          </HudText>
        </View>
        {!eaten && !recipe && (
          <HudText size={12} weight="medium" color={quest.textSecondary} style={styles.hint}>
            {g('meal.itemsHint')}
          </HudText>
        )}
        <View style={styles.panel}>
          {meal.items.map((item, i) => {
            const choice = choices[i] ?? { kind: 'eaten' };
            const off = !!recipe || (!eaten && choice.kind !== 'eaten');
            return (
              <View key={`${item.name}-${i}`} style={[styles.item, i > 0 && styles.itemDivider]}>
                <View style={styles.itemRow}>
                  <DishThumb name={item.name} size={44} radius={10} style={off ? styles.dim : undefined} />
                  <HudText size={13} weight="medium" color={off ? quest.textSecondary : quest.text} style={[styles.flex, off && styles.strike]}>
                    {item.name}
                  </HudText>
                  <HudText size={13} color={off ? quest.textSecondary : quest.text}>
                    {item.calories} kcal
                  </HudText>
                </View>
                {!eaten && !recipe && (
                  <View style={styles.choiceRow}>
                    {(
                      [
                        ['eaten', 'check', 'meal.itemEaten'],
                        ['skipped', 'x', 'meal.itemSkipped'],
                        ['swap', 'swap', 'meal.itemSwap'],
                      ] as const
                    ).map(([kind, icon, key]) => (
                      <ChoiceButton
                        key={kind}
                        icon={icon}
                        label={g(key)}
                        a11y={g('meal.itemChoice', { name: item.name, choice: g(key) })}
                        selected={choice.kind === kind}
                        onPress={() => setChoice(i, kind === 'swap' ? (choice.kind === 'swap' ? choice : { kind: 'swap', name: '', kcal: '', protein: '' }) : { kind })}
                      />
                    ))}
                  </View>
                )}
                {!eaten && !recipe && choice.kind === 'swap' && (
                  <View style={styles.swapBox}>
                    <HudText size={12} weight="medium" color={quest.textSecondary}>
                      {g('meal.swapFor', { name: item.name })}
                    </HudText>
                    <TextInput
                      accessibilityLabel={g('meal.swapName')}
                      placeholder={g('meal.swapName')}
                      placeholderTextColor={quest.textSecondary}
                      value={choice.name}
                      onChangeText={(name) => setChoice(i, { ...choice, name })}
                      style={styles.input}
                    />
                    <View style={styles.inputRow}>
                      <TextInput
                        accessibilityLabel={g('meal.swapKcal')}
                        placeholder={g('meal.swapKcal')}
                        placeholderTextColor={quest.textSecondary}
                        keyboardType="decimal-pad"
                        value={choice.kcal}
                        onChangeText={(kcal) => setChoice(i, { ...choice, kcal })}
                        style={[styles.input, styles.flex]}
                      />
                      <TextInput
                        accessibilityLabel={g('meal.swapProtein')}
                        placeholder={g('meal.swapProtein')}
                        placeholderTextColor={quest.textSecondary}
                        keyboardType="decimal-pad"
                        value={choice.protein}
                        onChangeText={(protein) => setChoice(i, { ...choice, protein })}
                        style={[styles.input, styles.flex]}
                      />
                    </View>
                  </View>
                )}
              </View>
            );
          })}
          {recipe && (
            <View style={[styles.itemRow, styles.itemDivider, styles.recipeRow]}>
              <DishThumb name={recipe.name} size={44} radius={10} />
              <HudText size={13} color={quest.gold} style={styles.flex}>
                {g('meal.recipeUsed', { name: recipe.name })}
              </HudText>
              <Pressable accessibilityRole="button" accessibilityLabel={g('meal.recipeRemove', { name: recipe.name })} onPress={() => setRecipe(null)} style={styles.iconBtn}>
                <QuestIcon name="x" size={16} color={quest.textSecondary} strokeWidth={2.4} />
              </Pressable>
            </View>
          )}
          <View style={[styles.itemRow, styles.totalRow]}>
            <HudText size={14}>{g('meal.total')}</HudText>
            <HudText size={14} color={quest.gold}>
              {eaten || outcome.asPlanned
                ? g('meal.totalValue', { kcal: meal.calories, protein: meal.proteinG })
                : g('meal.totalValue', { kcal: outcome.kcal, protein: outcome.proteinG })}
            </HudText>
          </View>
        </View>
        {!eaten && !outcome.asPlanned && (
          <HudText size={12} weight="medium" color={quest.textSecondary} style={styles.note}>
            {g('meal.partialNote')}
          </HudText>
        )}
      </View>

      <View style={styles.section}>
        <HudText size={12} color={quest.textSecondary} style={styles.eyebrow}>
          {g('meal.nutrients').toUpperCase()}
        </HudText>
        <NutrientTiles nutrients={nutrients.total} exceeded={{ purine: over('purine'), salt: over('salt'), sugar: over('sugar') }} />
        {nutrients.unknownItems > 0 && (
          <HudText size={12} weight="medium" color={quest.textSecondary} style={styles.note}>
            {g('meal.unknownItems', { n: nutrients.unknownItems })}
          </HudText>
        )}
      </View>

      {!eaten && outcome.asPlanned && (
        <View style={styles.section}>
          <ImpactNote newlyDone={preview.newlyDone} newlyMissed={preview.newlyMissed} />
        </View>
      )}

      {logged.length > 0 && (
        <View style={styles.section}>
          <HudText size={12} color={quest.textSecondary} style={styles.eyebrow}>
            {g('meal.logged').toUpperCase()}
          </HudText>
          <View style={styles.panel}>
            {logged.map((f, i) => (
              <Pressable
                key={f.id}
                accessibilityRole="button"
                accessibilityLabel={g('meal.loggedOpen', { name: f.name, kcal: Math.round(f.calories) })}
                onPress={() => setOpenFood(f.id)}
                style={({ pressed }) => [styles.itemRow, i > 0 && styles.itemDivider, pressed && styles.pressed]}
              >
                <DishThumb name={f.name} photoUri={f.photoUri} size={44} radius={10} />
                <HudText size={13} weight="medium" style={styles.flex} numberOfLines={2}>
                  {f.name}
                </HudText>
                <HudText size={13}>{Math.round(f.calories)} kcal</HudText>
                <QuestIcon name="chevron" size={16} color={quest.textSecondary} />
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {!eaten && (
        <View style={styles.section}>
          <HudText size={15} style={styles.eyebrow}>
            {g('meal.changeTitle')}
          </HudText>
          <MealRecipeSuggestion
            dark
            dayType={getDayType(day.isToday ? now : dateOfKey(day.dateKey))}
            mealSlot={meal.slot}
            mealLabel={meal.label}
            targetCalories={meal.calories}
            targetProtein={meal.proteinG}
            useLabel={g('meal.useRecipe')}
            onUse={(r) => setRecipe({ name: r.dishName, calories: r.caloriesKcal, proteinG: r.proteinG })}
          />
        </View>
      )}

      {skipped ? (
        <View style={[styles.section, styles.skipRow]}>
          <HudText size={12} weight="medium" color={quest.textSecondary} style={styles.flex}>
            {g('meal.skipped')}
          </HudText>
          <Pressable accessibilityRole="button" accessibilityLabel={g('meal.skipUndoLabel')} onPress={() => toggleSkipped(input.dateKey, skipped.id)} style={styles.skipChip}>
            <QuestIcon name="undo" size={14} color={quest.textSecondary} strokeWidth={2.2} />
            <HudText size={12} color={quest.textSecondary}>
              {g('deficit.skipUndo')}
            </HudText>
          </Pressable>
        </View>
      ) : skippable ? (
        <View style={styles.section}>
          <QuestButton variant="ghost" icon="x" title={g('meal.skip')} accessibilityLabel={g('meal.skipLabel')} onPress={() => skip(skippable)} />
        </View>
      ) : null}

      {eaten && (
        <View style={styles.section}>
          <QuestButton variant="ghost" title={g('meal.undo')} onPress={() => {
            toggleMeal(input.dateKey, meal.slot);
            AccessibilityInfo.announceForAccessibility(g('meal.undo'));
          }} />
        </View>
      )}

      <LoggedFoodSheet dateKey={input.dateKey} itemId={openFood} now={now} onClose={() => setOpenFood(null)} />
    </ScreenTemplate>
  );
}

function ChoiceButton({ icon, label, a11y, selected, onPress }: { icon: QuestIconName; label: string; a11y: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={a11y}
      onPress={onPress}
      style={({ pressed }) => [styles.choice, selected && styles.choiceOn, pressed && styles.pressed]}
    >
      <QuestIcon name={icon} size={14} color={selected ? quest.onGold : quest.textSecondary} strokeWidth={2.4} />
      <HudText size={12} color={selected ? quest.onGold : quest.textSecondary}>
        {label}
      </HudText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  banner: { marginTop: 4 },
  status: { borderRadius: 8, paddingHorizontal: 10, minHeight: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  statusPending: { borderColor: quest.border, backgroundColor: 'transparent' },
  statusEaten: { borderColor: quest.gold, backgroundColor: quest.gold },
  statusText: { letterSpacing: 1.2 },
  switchRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  section: { marginTop: 18 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 },
  eyebrow: { letterSpacing: 1.2, marginBottom: 8 },
  hint: { marginBottom: 8 },
  panel: { padding: 12, borderRadius: questRadius.panel, backgroundColor: quest.panel, borderWidth: 1.5, borderColor: quest.border },
  item: { gap: 8, paddingVertical: 8 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  itemDivider: { borderTopWidth: 1, borderTopColor: quest.raised2 },
  recipeRow: { paddingTop: 10 },
  dim: { opacity: 0.7 },
  strike: { textDecorationLine: 'line-through' },
  choiceRow: { flexDirection: 'row', gap: 6 },
  choice: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 44, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.raised },
  choiceOn: { backgroundColor: quest.gold, borderColor: quest.gold },
  swapBox: { gap: 8, padding: 10, borderRadius: questRadius.row, backgroundColor: quest.bg, borderWidth: 1.5, borderColor: quest.border },
  inputRow: { flexDirection: 'row', gap: 8 },
  input: { minHeight: 44, paddingHorizontal: 12, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.raised, color: quest.text, fontFamily: questFonts.medium, fontSize: 14 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  totalRow: { borderTopWidth: 1.5, borderTopColor: quest.border, marginTop: 4, paddingTop: 12 },
  note: { marginTop: 8 },
  pressed: { opacity: 0.8 },
  skipRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  skipChip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 12, borderRadius: 22, borderWidth: 1.5, borderColor: quest.border },
});
