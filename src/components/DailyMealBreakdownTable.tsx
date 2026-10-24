import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Button } from './Button';
import { FoodThumb } from './quest/FoodPhoto';
import { useTranslation } from '../i18n/useTranslation';
import { colors, radius, spacing } from '../theme/tokens';
import { quest, questFonts } from '../theme/quest';
import type { StringKey } from '../i18n/strings';
import type { ExtraFoodItem, ExtraMealTime, MealSlot, MealTemplate } from '../types';

const EXTRA_MEAL_TIME_LABEL_KEY: Record<ExtraMealTime, StringKey> = {
  breakfast: 'extraMealTime.breakfast',
  morning_snack: 'extraMealTime.morning_snack',
  lunch: 'extraMealTime.lunch',
  afternoon_snack: 'extraMealTime.afternoon_snack',
  late_afternoon_snack: 'extraMealTime.late_afternoon_snack',
  dinner: 'extraMealTime.dinner',
  evening_snack: 'extraMealTime.evening_snack',
};

export interface DailyLogDraft {
  mealsEaten: Partial<Record<MealSlot, boolean>>;
  extraItems: ExtraFoodItem[];
  removedMealSlots: MealSlot[];
}

interface DailyMealBreakdownTableProps {
  meals: MealTemplate[];
  mealsEaten: Partial<Record<MealSlot, boolean>>;
  extraItems: ExtraFoodItem[];
  removedMealSlots?: MealSlot[];
  /** Enables tapping a meal to toggle eaten/not, deleting a default meal from this specific day,
   *  editing an extra item's name/kcal/protein in place, and an explicit Save button that commits
   *  the whole draft at once. Omit for a read-only view. */
  editable?: boolean;
  onSave?: (draft: DailyLogDraft) => void;
  /** Dark FitQuest look (default off = classic light). */
  dark?: boolean;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** One consolidated table of everything logged for a day — the 3 plan meals (eaten or not) plus
 *  any off-plan food, regardless of which of the two the calories came from. Shared by Nutrition
 *  (today, editable) and History (any past day, editable). Editing works on a local draft; nothing
 *  persists until Save is tapped. Pass a `key` tied to the date from the caller so switching which
 *  day is shown remounts this with a fresh draft instead of carrying over unsaved edits. */
export function DailyMealBreakdownTable({
  meals,
  mealsEaten,
  extraItems,
  removedMealSlots,
  editable,
  onSave,
  dark,
}: DailyMealBreakdownTableProps) {
  const { t } = useTranslation();
  const styles = useMemo(() => makeStyles(!!dark), [dark]);
  const okColor = dark ? quest.xp : colors.success;
  const mutedColor = dark ? quest.textSecondary : colors.textMuted;
  const accentColor = dark ? quest.mana : colors.primary;
  const [draftMealsEaten, setDraftMealsEaten] = useState(mealsEaten);
  const [draftExtraItems, setDraftExtraItems] = useState(extraItems);
  const [draftRemovedSlots, setDraftRemovedSlots] = useState<MealSlot[]>(removedMealSlots ?? []);
  const [dirty, setDirty] = useState(false);

  // Something outside this table (e.g. Nutrition's separate "add extra food" form, or its own
  // meal cards) can change the underlying log while this table is mounted. Resync the draft to
  // match whenever that happens — but only while there's no unsaved local edit in progress, so
  // Save can't silently discard someone else's just-added data, and an in-progress edit isn't
  // clobbered by an unrelated external change either.
  const mealsEatenKey = JSON.stringify(mealsEaten);
  const extraItemsKey = JSON.stringify(extraItems);
  const removedSlotsKey = JSON.stringify(removedMealSlots ?? []);
  useEffect(() => {
    if (dirty) return;
    setDraftMealsEaten(mealsEaten);
    setDraftExtraItems(extraItems);
    setDraftRemovedSlots(removedMealSlots ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mealsEatenKey, extraItemsKey, removedSlotsKey]);

  const visibleMeals = meals.filter((m) => !draftRemovedSlots.includes(m.slot));
  const totalCalories =
    visibleMeals.filter((m) => draftMealsEaten[m.slot]).reduce((s, m) => s + m.calories, 0) +
    draftExtraItems.reduce((s, i) => s + i.calories, 0);
  const totalProtein =
    visibleMeals.filter((m) => draftMealsEaten[m.slot]).reduce((s, m) => s + m.proteinG, 0) +
    draftExtraItems.reduce((s, i) => s + i.proteinG, 0);

  function toggleMeal(slot: MealSlot) {
    if (!editable) return;
    setDraftMealsEaten((prev) => ({ ...prev, [slot]: !prev[slot] }));
    setDirty(true);
  }

  function deleteMeal(slot: MealSlot) {
    setDraftRemovedSlots((prev) => [...prev, slot]);
    setDraftMealsEaten((prev) => ({ ...prev, [slot]: false }));
    setDirty(true);
  }

  function updateExtraItem(itemId: string, patch: Partial<Pick<ExtraFoodItem, 'name' | 'calories' | 'proteinG'>>) {
    setDraftExtraItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, ...patch } : i)));
    setDirty(true);
  }

  function removeExtraItem(itemId: string) {
    setDraftExtraItems((prev) => prev.filter((i) => i.id !== itemId));
    setDirty(true);
  }

  function handleSave() {
    onSave?.({ mealsEaten: draftMealsEaten, extraItems: draftExtraItems, removedMealSlots: draftRemovedSlots });
    setDirty(false);
  }

  return (
    <View style={styles.table}>
      <View style={styles.headerRow}>
        <Text style={[styles.headerCell, styles.nameCol]}>{t('mealLog.tableHeaderItem')}</Text>
        <Text style={[styles.headerCell, styles.statusCol]}>{t('mealLog.tableHeaderStatus')}</Text>
        <Text style={[styles.headerCell, styles.numCol]}>{t('mealLog.tableHeaderKcal')}</Text>
        <Text style={[styles.headerCell, styles.numCol]}>{t('mealLog.tableHeaderProtein')}</Text>
      </View>

      {visibleMeals.map((m) => {
        const eaten = !!draftMealsEaten[m.slot];
        const RowWrapper = editable ? TouchableOpacity : View;
        return (
          <RowWrapper key={m.slot} style={styles.row} {...(editable ? { onPress: () => toggleMeal(m.slot) } : {})}>
            <Text style={[styles.cell, styles.nameCol]}>{m.label}</Text>
            <Text style={[styles.cell, styles.statusCol, { color: eaten ? okColor : mutedColor }]}>
              {eaten ? t('mealLog.statusEaten') : t('mealLog.statusNotEaten')}
            </Text>
            <Text style={[styles.cell, styles.numCol]}>{eaten ? m.calories : '–'}</Text>
            <Text style={[styles.cell, styles.numCol]}>{eaten ? m.proteinG : '–'}</Text>
            {editable && (
              <TouchableOpacity onPress={() => deleteMeal(m.slot)} style={styles.deleteCol}>
                <Text style={styles.deleteText}>✕</Text>
              </TouchableOpacity>
            )}
          </RowWrapper>
        );
      })}

      {draftExtraItems.map((item) =>
        editable ? (
          // Editable extras get their own 2-line layout: the free-text name gets a full-width
          // line to itself (a shared single row is too narrow for a long name to wrap in),
          // then meal-time/kcal/protein/delete on the line below.
          <View key={item.id} style={styles.extraRowEditable}>
            <View style={styles.extraNameRow}>
              <FoodThumb uri={item.photoUri} name={item.name || t('mealLog.extraSectionLabel')} size={40} />
              <TextInput
                placeholderTextColor={mutedColor}
                style={[styles.nameInputFullWidth, styles.extraNameInput]}
                value={item.name}
                onChangeText={(text) => updateExtraItem(item.id, { name: text })}
                placeholder={t('mealLog.extraSectionLabel')}
                multiline
              />
            </View>
            <View style={styles.extraEditableSubRow}>
              <Text style={[styles.cell, styles.statusCol, { color: accentColor }]}>
                {item.mealTime ? t(EXTRA_MEAL_TIME_LABEL_KEY[item.mealTime]) : t('mealLog.extraSectionLabel')}
              </Text>
              <TextInput
                style={[styles.cell, styles.numCol, styles.numInput]}
                value={String(item.calories)}
                keyboardType="decimal-pad"
                onChangeText={(text) => updateExtraItem(item.id, { calories: parseFloat(text.replace(',', '.')) || 0 })}
              />
              <TextInput
                style={[styles.cell, styles.numCol, styles.numInput]}
                value={String(item.proteinG)}
                keyboardType="decimal-pad"
                onChangeText={(text) => updateExtraItem(item.id, { proteinG: parseFloat(text.replace(',', '.')) || 0 })}
              />
              <TouchableOpacity onPress={() => removeExtraItem(item.id)} style={styles.deleteCol}>
                <Text style={styles.deleteText}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View key={item.id} style={styles.row}>
            <View style={[styles.nameCol, styles.extraNameRow]}>
              <FoodThumb uri={item.photoUri} name={item.name || t('mealLog.extraSectionLabel')} size={28} />
              <Text style={[styles.cell, styles.extraNameInput]}>
                {item.name || t('mealLog.extraSectionLabel')} <Text style={styles.extraTime}>({formatTime(item.loggedAtISO)})</Text>
              </Text>
            </View>
            <Text style={[styles.cell, styles.statusCol, { color: accentColor }]}>
              {item.mealTime ? t(EXTRA_MEAL_TIME_LABEL_KEY[item.mealTime]) : t('mealLog.extraSectionLabel')}
            </Text>
            <Text style={[styles.cell, styles.numCol]}>{item.calories}</Text>
            <Text style={[styles.cell, styles.numCol]}>{item.proteinG}</Text>
          </View>
        )
      )}

      <View style={[styles.row, styles.totalRow]}>
        <Text style={[styles.cell, styles.nameCol, styles.totalText]}>{t('mealLog.totalRow')}</Text>
        <View style={styles.statusCol} />
        <Text style={[styles.cell, styles.numCol, styles.totalText]}>{totalCalories}</Text>
        <Text style={[styles.cell, styles.numCol, styles.totalText]}>{totalProtein}</Text>
      </View>

      {editable && dirty && (
        <View style={styles.saveRow}>
          <Text style={styles.unsavedHint}>{t('mealLog.unsavedHint')}</Text>
          {dark ? (
            <TouchableOpacity accessibilityRole="button" onPress={handleSave} style={styles.darkSave}>
              <Text style={styles.darkSaveText}>{t('mealLog.saveButton')}</Text>
            </TouchableOpacity>
          ) : (
            <Button title={t('mealLog.saveButton')} size="sm" onPress={handleSave} />
          )}
        </View>
      )}
    </View>
  );
}

const makeStyles = (dark: boolean) => {
  const c = {
    border: dark ? quest.border : '#EEE', head: dark ? quest.raised : colors.neutralLight, muted: dark ? quest.textSecondary : colors.textMuted,
    line: dark ? quest.border : '#F3F3F3', text: dark ? quest.text : colors.textPrimary, input: dark ? quest.border : colors.border,
    danger: dark ? quest.hpText : colors.danger, total: dark ? quest.raised2 : colors.primaryLight, totalText: dark ? quest.gold : colors.primaryDark,
    saveBorder: dark ? quest.border : '#E0E0E0', saveBg: dark ? quest.raised : colors.neutralLight,
  };
  const font = dark ? { fontFamily: questFonts.semibold } : {};
  return StyleSheet.create({
  table: { marginTop: spacing.sm, borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: c.border },
  headerRow: { flexDirection: 'row', backgroundColor: c.head, paddingVertical: spacing.xs + 2, paddingHorizontal: spacing.sm },
  headerCell: { fontSize: 10, fontWeight: '800', color: c.muted, textTransform: 'uppercase' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs + 3,
    paddingHorizontal: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: c.line,
  },
  cell: { fontSize: 12, color: c.text, ...font },
  nameCol: { flex: 2.4, paddingRight: spacing.xs },
  extraNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  extraNameInput: { flex: 1, minWidth: 0 },
  statusCol: { flex: 1.1 },
  numCol: { flex: 0.7, textAlign: 'right' },
  numInput: { borderWidth: 1, borderColor: c.input, borderRadius: radius.sm, paddingHorizontal: spacing.xs, paddingVertical: 2 },
  extraRowEditable: {
    paddingVertical: spacing.xs + 3,
    paddingHorizontal: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: c.line,
    gap: spacing.xs,
  },
  nameInputFullWidth: {
    fontSize: 12,
    color: c.text,
    borderWidth: 1,
    borderColor: c.input,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  extraEditableSubRow: { flexDirection: 'row', alignItems: 'center' },
  extraTime: { fontSize: 10, color: c.muted },
  deleteCol: { paddingLeft: spacing.xs },
  deleteText: { color: c.danger, fontSize: 12, fontWeight: '700' },
  totalRow: { backgroundColor: c.total, borderTopWidth: 1, borderTopColor: c.saveBorder },
  totalText: { fontWeight: '800', color: c.totalText },
  saveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: c.saveBorder,
    backgroundColor: c.saveBg,
    gap: spacing.sm,
  },
  unsavedHint: { fontSize: 11, color: c.muted, flex: 1 },
  darkSave: { backgroundColor: quest.gold, borderRadius: radius.sm, paddingHorizontal: spacing.md, minHeight: 44, justifyContent: 'center' },
  darkSaveText: { color: quest.onGold, fontSize: 13, fontFamily: questFonts.bold },
});
};
