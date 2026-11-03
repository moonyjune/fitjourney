import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { mealCardVisible, type MealKind } from '../../ai/mealSplit';
import { recipeKey } from '../../cookbook/recipes';
import { useGameText, type GameKey } from '../../game/strings';
import { useCookbookStore } from '../../store/useCookbookStore';
import { useAllFoods } from '../../store/useFoodDbStore';
import { useMealIdeasStore } from '../../store/useMealIdeasStore';
import { quest, questRadius } from '../../theme/quest';
import { toDateKey } from '../../utils/date';
import { BottomSheet } from './BottomSheet';
import { DishThumb } from './DishThumb';
import { HudText } from './HudText';
import { MealSuggestionsCard, mealIdeas, openInAddFood, useMealPlan, useMealPrefs } from './MealSuggestionsCard';
import { QuestIcon } from './QuestIcon';

const KIND_KEY: Record<MealKind, GameKey> = {
  breakfast: 'meals.kind.breakfast',
  lunch: 'meals.kind.lunch',
  dinner: 'meals.kind.dinner',
  meal: 'meals.kind.meal',
};
const pad = (n: number) => String(n).padStart(2, '0');

/** Camp › "Bữa kế tiếp": the next meal still to come, its share (ⓘ opens every meal's share, the wishes per meal and all the ways to get
 *  ideas, in a sheet), and its first dish with a photo: "Ghi món này" (Add food, filled in) or "Món khác" (cook book filtered to dishes
 *  that fit). Hidden when no meal is left or outside the eating window, like the full card. */
export function NextMealCard({ now }: { now: Date }) {
  const g = useGameText();
  const plan = useMealPlan(now);
  const prefs = useMealPrefs();
  const foods = useAllFoods();
  const book = useCookbookStore((s) => s.recipes);
  const stored = useMealIdeasStore((s) => s.byDay[toDateKey(now)]);
  const [open, setOpen] = useState(false);

  if (!plan || !mealCardVisible(now, plan) || plan.split.meals.length === 0) return null;
  const meal = plan.split.meals[0];
  const name = meal.slot.label ?? g(KIND_KEY[meal.slot.kind]);
  const { ideas } = mealIdeas({ totals: plan.totals, meal, prefs, foods, asked: stored?.[meal.slot.id], book });
  const idea = ideas[0];
  const more = ideas.length - 1;
  const otherDish = () => router.push({ pathname: '/cookbook', params: { quick: 'fits' } });

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <HudText size={17} accessibilityRole="header" style={styles.flex} numberOfLines={1}>
          {`${name} · ${pad(meal.slot.startHour)}:${pad(meal.slot.startMinute)}`}
        </HudText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${g('camp.nextMealInfo')}: ${g('camp.nextMealKcal', { kcal: meal.kcal })}`}
          onPress={() => setOpen(true)}
          hitSlop={6}
          style={styles.info}
        >
          <HudText size={13} weight="medium" color={quest.textSecondary}>
            {g('camp.nextMealKcal', { kcal: meal.kcal })}
          </HudText>
          <View style={styles.infoDot}>
            <HudText size={11} color={quest.textSecondary}>
              i
            </HudText>
          </View>
        </Pressable>
      </View>

      <View style={styles.card}>
        {idea ? (
          <>
            <DishThumb name={idea.name} emoji={idea.recipe?.emoji} photoUri={book.find((r) => r.id === recipeKey(idea.name))?.photoUri ?? null} size={96} radius={12} />
            <View style={styles.body}>
              <HudText size={16} numberOfLines={2}>
                {idea.name}
              </HudText>
              <HudText size={13} weight="medium" color={quest.textSecondary}>
                {g('camp.dishFigures', { kcal: idea.calories, p: idea.proteinG })}
              </HudText>
              <View style={styles.buttons}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={g('dinner.logLabel', { name: idea.name })}
                  onPress={() => openInAddFood(idea, meal.slot.kind)}
                  style={({ pressed }) => [styles.btn, styles.btnGold, pressed && styles.pressed]}
                >
                  <HudText size={13} color={quest.onGold}>
                    {g('dinner.log')}
                  </HudText>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={g('camp.otherDishA11y', { meal: name })}
                  onPress={otherDish}
                  style={({ pressed }) => [styles.btn, styles.btnGhost, pressed && styles.pressed]}
                >
                  <HudText size={13}>{g('camp.otherDish')}</HudText>
                </Pressable>
              </View>
            </View>
          </>
        ) : (
          <View style={styles.body}>
            <HudText size={13} weight="medium" color={quest.textSecondary}>
              {g('meals.none', { meal: name })}
            </HudText>
            <View style={styles.buttons}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={g('camp.otherDishA11y', { meal: name })}
                onPress={otherDish}
                style={({ pressed }) => [styles.btn, styles.btnGhost, pressed && styles.pressed]}
              >
                <HudText size={13}>{g('camp.otherDish')}</HudText>
              </Pressable>
            </View>
          </View>
        )}
      </View>

      <View style={styles.foot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={more > 0 ? g('meals.expand', { meal: name }) : g('camp.nextMealInfo')}
          onPress={() => setOpen(true)}
          hitSlop={6}
          style={styles.footLink}
        >
          <HudText size={13} color={quest.goldLight}>
            {more > 0 ? g('meals.showMore', { n: more }) : g('camp.nextMealInfo')}
          </HudText>
        </Pressable>
        <Pressable accessibilityRole="link" accessibilityLabel={g('camp.cookbookLink')} onPress={() => router.push('/cookbook')} hitSlop={6} style={styles.footLink}>
          <HudText size={13} weight="medium" color={quest.textSecondary}>
            {g('camp.cookbookLink')}
          </HudText>
          <QuestIcon name="chevron" size={12} color={quest.textSecondary} />
        </Pressable>
      </View>

      <BottomSheet visible={open} onClose={() => setOpen(false)} eyebrow={g('meals.title')} title={g('camp.nextMealInfo')} testID="meal-budget-sheet">
        <MealSuggestionsCard now={now} bare />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  wrap: { marginTop: 20 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32, marginBottom: 8 },
  info: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  infoDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: quest.textSecondary, alignItems: 'center', justifyContent: 'center' },
  card: { flexDirection: 'row', gap: 12, padding: 12, borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  body: { flex: 1, minWidth: 0, gap: 4, justifyContent: 'center' },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  btn: { minHeight: 44, paddingHorizontal: 14, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  btnGold: { backgroundColor: quest.gold },
  btnGhost: { borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.raised },
  pressed: { opacity: 0.85 },
  foot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  footLink: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 44 },
});
