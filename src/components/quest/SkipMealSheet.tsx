import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import { getDayType } from '../../constants/plan';
import { isSkippedMealItem } from '../../food/skipMeal';
import { PLAN_SLOT_MEAL, type MainMeal } from '../../insights/days';
import { coveredMealIds, mealDefs, periodOfItem, type MealSlotDef } from '../../game/mealSlots';
import { useGameText, type GameKey } from '../../game/strings';
import { useMealModeStore } from '../../store/useMealModeStore';
import { useNutritionStore } from '../../store/useNutritionStore';
import { usePlanStore } from '../../store/usePlanStore';
import { useSkippedMealStore } from '../../store/useSkippedMealStore';
import { showToast } from '../../store/useToastStore';
import { quest, questRadius } from '../../theme/quest';
import type { MealSlot } from '../../types';
import { BottomSheet } from './BottomSheet';
import { DateChip } from './DateChip';
import { HudText } from './HudText';
import { QuestIcon } from './QuestIcon';

/** What a meal of the day is, as the sheet shows it. */
export type SkipMealState = 'open' | 'skipped' | 'marked' | 'logged';

const KIND_KEY: Record<MealSlotDef['kind'], GameKey> = {
  breakfast: 'meals.kind.breakfast',
  lunch: 'meals.kind.lunch',
  dinner: 'meals.kind.dinner',
  meal: 'meals.kind.meal',
};

const pad = (n: number) => String(n).padStart(2, '0');

/** The main meal a meal of the day stands for (a fasting plan's slot: its plan meal's). */
function mainMealOf(def: MealSlotDef): MainMeal | null {
  if (Object.prototype.hasOwnProperty.call(PLAN_SLOT_MEAL, def.id)) return PLAN_SLOT_MEAL[def.id as MealSlot];
  return def.id === 'breakfast' || def.id === 'lunch' || def.id === 'dinner' ? def.id : null;
}

interface SkipMealSheetProps {
  visible: boolean;
  onClose: () => void;
  /** The day the quick-add sheet logs on (its date chip). */
  dateKey: string;
}

/** "Bỏ bữa / Không ăn" from Quick add (+): the day's meals (a normal day's breakfast / lunch / dinner, or the fasting plan's meals) with
 *  their state. A meal not yet eaten is marked skipped for that day ("Bỏ bữa", useSkippedMealStore) with "Hoàn tác"; one already skipped
 *  reads "Đã bỏ · Hoàn tác" and is un-skipped; one with food (or the diary's "Không ăn") logged is shown, not tappable. With "Tôi không
 *  ăn sáng" on, breakfast is listed as "không ăn sáng (cài đặt)". */
export function SkipMealSheet({ visible, onClose, dateKey }: SkipMealSheetProps) {
  const g = useGameText();
  const fasting = useMealModeStore((s) => s.fasting);
  const skipBreakfast = useMealModeStore((s) => s.skipBreakfast);
  const mealTemplates = usePlanStore((s) => s.plan.mealTemplates);
  const log = useNutritionStore((s) => s.logs[dateKey]);
  const skippedIds = useSkippedMealStore((s) => s.days[dateKey]);

  const date = new Date(`${dateKey}T12:00:00`);
  const dayLabel = `${g(`weekday.${date.getDay()}` as GameKey)} ${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
  const planMeals = mealTemplates[getDayType(date)];
  const defs = mealDefs(fasting, planMeals, skipBreakfast);
  const covered = coveredMealIds(fasting, defs, planMeals, log);
  const marks = new Set((log?.extraItems ?? []).filter(isSkippedMealItem).map((i) => periodOfItem(i)));

  const stateOf = (d: MealSlotDef): SkipMealState => {
    if ((skippedIds ?? []).includes(d.id)) return 'skipped';
    const main = mainMealOf(d);
    if (main && marks.has(main)) return 'marked';
    return covered.has(d.id) ? 'logged' : 'open';
  };
  const nameOf = (d: MealSlotDef) => d.label ?? g(KIND_KEY[d.kind]);

  function toggle(d: MealSlotDef, state: SkipMealState) {
    const meal = nameOf(d);
    const store = useSkippedMealStore.getState();
    const target = dateKey;
    store.toggle(target, d.id);
    const text = state === 'open' ? g('deficit.skippedLine', { meals: meal }) : g('journal.skippedUndone', { meal });
    onClose();
    AccessibilityInfo.announceForAccessibility(text);
    showToast({
      text,
      tone: 'neutral',
      // Undo puts back what it was, whatever happened in between.
      undo: () => {
        const now = useSkippedMealStore.getState().isSkipped(target, d.id);
        if (now === (state === 'open')) useSkippedMealStore.getState().toggle(target, d.id);
      },
    });
  }

  const statusLabel: Record<Exclude<SkipMealState, 'open'>, GameKey> = { skipped: 'quick.skipDone', marked: 'quick.skipMarked', logged: 'quick.skipLogged' };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={g('quick.skipTitle')}
      subtitle={g('quick.skipSubtitle')}
      headerRight={<DateChip size="small" hint={g('quick.dateHintAll')} />}
      testID="skip-meal-sheet"
    >
      <View style={styles.list}>
        {!fasting && skipBreakfast && (
          <View style={[styles.row, styles.disabled]} accessible accessibilityLabel={`${g('meals.kind.breakfast')}: ${g('quick.skipNoBreakfast')}`}>
            <HudText size={15} style={styles.flex}>
              {g('meals.kind.breakfast')}
            </HudText>
            <HudText size={12} weight="medium" color={quest.textSecondary}>
              {g('quick.skipNoBreakfast')}
            </HudText>
          </View>
        )}
        {defs.length === 0 && (
          <HudText size={13} weight="medium" color={quest.textSecondary}>
            {g('quick.skipNone')}
          </HudText>
        )}
        {defs.map((d) => {
          const state = stateOf(d);
          const meal = nameOf(d);
          const time = `${pad(d.startHour)}:${pad(d.startMinute)}`;
          const enabled = state === 'open' || state === 'skipped';
          const body = (
            <>
              <View style={styles.flex}>
                <HudText size={15} color={enabled ? quest.text : quest.textSecondary} numberOfLines={1}>
                  {meal}
                </HudText>
                <HudText size={12} weight="medium" color={quest.textSecondary}>
                  {time}
                </HudText>
              </View>
              {state === 'open' ? (
                <View style={[styles.chip, { borderColor: quest.bossBorder }]}>
                  <QuestIcon name="x" size={12} color={quest.hpText} strokeWidth={2.4} />
                  <HudText size={12} color={quest.hpText}>
                    {g('quick.skipDo')}
                  </HudText>
                </View>
              ) : (
                <View style={[styles.chip, { borderColor: quest.border }]}>
                  {state === 'skipped' && <QuestIcon name="undo" size={12} color={quest.textSecondary} strokeWidth={2.4} />}
                  {state === 'logged' && <QuestIcon name="check" size={12} color={quest.textSecondary} strokeWidth={2.4} />}
                  <HudText size={12} color={quest.textSecondary}>
                    {g(statusLabel[state])}
                  </HudText>
                </View>
              )}
            </>
          );
          if (!enabled) {
            return (
              <View key={d.id} style={[styles.row, styles.disabled]} accessible accessibilityLabel={`${meal} ${time}: ${g(statusLabel[state as 'marked' | 'logged'])}`} accessibilityState={{ disabled: true }}>
                {body}
              </View>
            );
          }
          return (
            <Pressable
              key={d.id}
              accessibilityRole="button"
              accessibilityLabel={g(state === 'open' ? 'deficit.skipLabel' : 'deficit.skipUndoLabel', { meal, day: dayLabel })}
              onPress={() => toggle(d, state)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              {body}
            </Pressable>
          );
        })}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8, paddingBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 56,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: questRadius.row,
    borderWidth: 1.5,
    borderColor: quest.border,
    backgroundColor: quest.raised,
  },
  disabled: { backgroundColor: 'transparent', opacity: 0.75 },
  flex: { flex: 1, minWidth: 0 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32, paddingHorizontal: 10, borderRadius: 16, borderWidth: 1.5 },
  pressed: { opacity: 0.85 },
});
