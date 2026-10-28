import { useMemo } from 'react';
import { AccessibilityInfo, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProofCapture } from '../../src/components/ProofCapture';
import { HudText } from '../../src/components/quest/HudText';
import { ImpactNote } from '../../src/components/quest/ImpactNote';
import { NutrientTiles } from '../../src/components/quest/NutrientTiles';
import { QuestButton } from '../../src/components/quest/QuestButton';
import { QuestChip } from '../../src/components/quest/QuestChip';
import { QuestHeader } from '../../src/components/quest/QuestHeader';
import { getDayType } from '../../src/constants/plan';
import { sumItemNutrients } from '../../src/game/nutrients';
import { logWithMealToggled, previewDayChange } from '../../src/game/preview';
import { useGameText } from '../../src/game/strings';
import { useNow, useTodayInput } from '../../src/game/useGameState';
import { useLogDate } from '../../src/game/useLogDate';
import { LogDateBanner } from '../../src/components/quest/LogDateBanner';
import { dateOfKey } from '../../src/utils/logDate';
import { useNutritionStore } from '../../src/store/useNutritionStore';
import { quest, questRadius } from '../../src/theme/quest';
import { screenMaxWidthStyle } from '../../src/theme/responsive';
import { useLightStatusBar } from '../../src/theme/useLightStatusBar';
import type { MealSlot } from '../../src/types';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)');
}

export default function MealDetailScreen() {
  const g = useGameText();
  const insets = useSafeAreaInsets();
  useLightStatusBar();
  const { slot } = useLocalSearchParams<{ slot: string }>();
  const now = useNow();
  const day = useLogDate(now);
  const input = useTodayInput(now, day.dateKey);
  const toggleMeal = useNutritionStore((s) => s.toggleMeal);

  const meals = input.mealTemplatesByDayType[getDayType(day.isToday ? now : dateOfKey(day.dateKey))];
  const meal = meals.find((m) => m.slot === slot);
  const eaten = !!(meal && input.log?.mealsEaten[meal.slot]);

  const nutrients = useMemo(() => (meal ? sumItemNutrients(meal.items) : null), [meal]);
  // What eating (or, if already eaten, the state with it eaten) does to today's missions.
  const preview = useMemo(
    () => (meal ? previewDayChange(input, logWithMealToggled(input.log, input.dateKey, meal.slot)) : null),
    [input, meal]
  );

  if (!meal || !nutrients || !preview) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 16 }, screenMaxWidthStyle, styles.pad]}>
        <QuestHeader title={g('meal.notFound')} onBack={goBack} backLabel={g('common.back')} />
      </View>
    );
  }

  const dayState = eaten ? preview.before : preview.after; // the day with this meal counted as eaten
  const over = (id: 'purine' | 'salt' | 'sugar') => {
    const m = dayState.missions.find((x) => x.id === id);
    return m?.status === 'missed' && m.value > m.target;
  };

  function handleToggle() {
    if (!meal) return;
    toggleMeal(input.dateKey, meal.slot);
    AccessibilityInfo.announceForAccessibility(g(eaten ? 'meal.undo' : 'meal.statusEaten'));
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, screenMaxWidthStyle, { paddingTop: insets.top + 16 }]}>
        <QuestHeader
          title={meal.label}
          eyebrow={g('meal.eyebrow', { range: meal.timeRange })}
          onBack={goBack}
          backLabel={g('common.back')}
          right={
            <View style={[styles.status, eaten ? styles.statusEaten : styles.statusPending]}>
              <HudText size={11} color={eaten ? quest.onGold : quest.textSecondary} style={styles.statusText}>
                {g(eaten ? 'meal.statusEaten' : 'meal.statusPending').toUpperCase()}
              </HudText>
            </View>
          }
        />

        {!day.isToday && <LogDateBanner label={day.label} />}

        <View style={styles.switchRow} accessibilityLabel={g('meal.switch')}>
          {meals.map((m, i) => (
            <QuestChip
              key={m.slot}
              label={g('meal.slotShort', { n: i + 1 })}
              selected={m.slot === meal.slot}
              onPress={() => router.setParams({ slot: m.slot as MealSlot })}
            />
          ))}
        </View>

        <View style={styles.section}>
          <HudText size={11} color={quest.textSecondary} style={styles.eyebrow}>
            {g('meal.photo').toUpperCase()}
          </HudText>
          <View style={styles.panel}>
            <ProofCapture
              variant="quest"
              dateKey={input.dateKey}
              taskType="meal"
              taskRefId={meal.slot}
              contextLabel={meal.label}
              plannedCalories={meal.calories}
            />
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <HudText size={15}>{g('meal.items')}</HudText>
            <HudText size={12} weight="medium" color={quest.textSecondary}>
              {g('meal.itemCount', { n: meal.items.length })}
            </HudText>
          </View>
          <View style={styles.panel}>
            {meal.items.map((item, i) => (
              <View key={`${item.name}-${i}`} style={[styles.itemRow, i > 0 && styles.itemDivider]}>
                <HudText size={13} weight="medium" color={quest.textTertiary} style={styles.itemName}>
                  {item.name}
                </HudText>
                <HudText size={13} color={quest.text}>
                  {item.calories} kcal
                </HudText>
              </View>
            ))}
            <View style={[styles.itemRow, styles.totalRow]}>
              <HudText size={14}>{g('meal.total')}</HudText>
              <HudText size={14} color={quest.gold}>
                {g('meal.totalValue', { kcal: meal.calories, protein: meal.proteinG })}
              </HudText>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <HudText size={11} color={quest.textSecondary} style={styles.eyebrow}>
            {g('meal.nutrients').toUpperCase()}
          </HudText>
          <View style={styles.gap8}>
            <NutrientTiles
              nutrients={nutrients.total}
              exceeded={{ purine: over('purine'), salt: over('salt'), sugar: over('sugar') }}
            />
          </View>
          {nutrients.unknownItems > 0 && (
            <HudText size={11} weight="medium" color={quest.textSecondary} style={styles.note}>
              {g('meal.unknownItems', { n: nutrients.unknownItems })}
            </HudText>
          )}
        </View>

        {!eaten && (
          <View style={styles.section}>
            <ImpactNote newlyDone={preview.newlyDone} newlyMissed={preview.newlyMissed} />
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <View style={screenMaxWidthStyle}>
          {eaten ? (
            <QuestButton variant="ghost" title={g('meal.undo')} onPress={handleToggle} />
          ) : (
            <QuestButton
              icon="check"
              title={preview.xpDelta > 0 ? g('meal.eatXp', { xp: preview.xpDelta }) : g('meal.eat')}
              onPress={handleToggle}
            />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: quest.bg },
  pad: { paddingHorizontal: 16 },
  content: { paddingHorizontal: 16, paddingBottom: 24 },
  status: { borderRadius: 8, paddingHorizontal: 10, minHeight: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  statusPending: { borderColor: quest.border, backgroundColor: 'transparent' },
  statusEaten: { borderColor: quest.gold, backgroundColor: quest.gold },
  statusText: { letterSpacing: 1.2 },
  switchRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  section: { marginTop: 18 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 },
  eyebrow: { letterSpacing: 1.6, marginBottom: 8 },
  panel: { padding: 12, borderRadius: questRadius.panel, backgroundColor: quest.panel, borderWidth: 1.5, borderColor: quest.border },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 8 },
  itemDivider: { borderTopWidth: 1, borderTopColor: quest.raised2 },
  itemName: { flex: 1 },
  totalRow: { borderTopWidth: 1.5, borderTopColor: quest.border, marginTop: 4, paddingTop: 12 },
  gap8: { marginTop: 0 },
  note: { marginTop: 8 },
  footer: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: quest.bg, borderTopWidth: 1.5, borderTopColor: quest.border, alignItems: 'center' },
});
