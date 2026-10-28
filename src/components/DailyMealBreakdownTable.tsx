import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Button } from './Button';
import { FoodThumb } from './quest/FoodPhoto';
import { extraPhotoRefs } from '../utils/photoOrder';
import { useTranslation } from '../i18n/useTranslation';
import { colors, radius, spacing } from '../theme/tokens';
import { quest, questFonts } from '../theme/quest';
import type { StringKey } from '../i18n/strings';
import type { ExtraFoodItem, ExtraMealTime, MealPart, MealSlot, MealTemplate } from '../types';
import type { ExtraPatch } from '../store/useNutritionStore';
import { replacePartPatch } from '../food/partScale';
import { useGameText } from '../game/strings';
import { useProofStore } from '../store/useProofStore';
import { PartEditForm } from './quest/PartEditForm';
import { QuestIcon } from './quest/QuestIcon';
import { partsMatchTotals } from '../food/mealParts';
import { parseClock, timeTextInvalid } from '../utils/mealClock';
import { toDateKey } from '../utils/date';

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
  /** The day's leftover total (a day with no items of its own but calories in its running total) was removed. */
  clearTotals?: boolean;
}

interface DailyMealBreakdownTableProps {
  meals: MealTemplate[];
  mealsEaten: Partial<Record<MealSlot, boolean>>;
  extraItems: ExtraFoodItem[];
  removedMealSlots?: MealSlot[];
  /** Calories / protein the day carries as a bare total with no item to show (older days). Shown as one row that can be removed. */
  legacyTotals?: { kcal: number; proteinG: number };
  /** The day shown (YYYY-MM-DD). With it an editable table can add a food to that day. */
  dateKey?: string;
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
  legacyTotals,
  dateKey,
  editable,
  onSave,
  dark,
}: DailyMealBreakdownTableProps) {
  const { t } = useTranslation();
  const styles = useMemo(() => makeStyles(!!dark), [dark]);
  const okColor = dark ? quest.xp : colors.success;
  const mutedColor = dark ? quest.textSecondary : colors.textMuted;
  const accentColor = dark ? quest.mana : colors.primary;
  const proofs = useProofStore((st) => st.photos);
  const thumbsOf = (item: ExtraFoodItem) => extraPhotoRefs(proofs, item).map((p) => p.uri);
  const [draftMealsEaten, setDraftMealsEaten] = useState(mealsEaten);
  const [draftExtraItems, setDraftExtraItems] = useState(extraItems);
  const [draftRemovedSlots, setDraftRemovedSlots] = useState<MealSlot[]>(removedMealSlots ?? []);
  const [dirty, setDirty] = useState(false);
  const [totalsCleared, setTotalsCleared] = useState(false);
  const legacy = extraItems.length === 0 && !totalsCleared && legacyTotals && legacyTotals.kcal > 0 ? legacyTotals : null;
  /** What is typed in a meal's time box, by item id (shown as typed until it is a valid time; a valid one is applied at once). */
  const [timeTexts, setTimeTexts] = useState<Record<string, string>>({});

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
  const totalCalories = Math.round(
    visibleMeals.filter((m) => draftMealsEaten[m.slot]).reduce((s, m) => s + m.calories, 0) +
    draftExtraItems.reduce((s, i) => s + i.calories, 0)
  );
  const totalProtein = Math.round(10 * (
    visibleMeals.filter((m) => draftMealsEaten[m.slot]).reduce((s, m) => s + m.proteinG, 0) +
    draftExtraItems.reduce((s, i) => s + i.proteinG, 0) + (legacy?.proteinG ?? 0)
  )) / 10;

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

  function updateExtraItem(itemId: string, patch: ExtraPatch & Partial<Pick<ExtraFoodItem, 'loggedAtISO'>>) {
    const { photoUri: _ignored, ...fields } = patch;
    setDraftExtraItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, ...fields } : i)));
    setDirty(true);
  }

  /** The time of a meal changed: the meal keeps its day and takes the new time of day. Its parts have no time of their own, so they
   *  move with it. A text that is not (yet) a time is only shown, nothing is applied. */
  function changeTime(item: ExtraFoodItem, text: string) {
    setTimeTexts((prev) => ({ ...prev, [item.id]: text }));
    const clock = parseClock(text);
    if (!clock) return;
    const at = new Date(item.loggedAtISO);
    at.setHours(clock[0], clock[1], 0, 0);
    updateExtraItem(item.id, { loggedAtISO: at.toISOString() });
  }

  function removeExtraItem(itemId: string) {
    setDraftExtraItems((prev) => prev.filter((i) => i.id !== itemId));
    setDirty(true);
  }

  /** A new blank food on this day, to be typed over (name, time, calories, protein). */
  function addExtraItem() {
    if (!dateKey) return;
    const today = new Date();
    const at = toDateKey(today) === dateKey ? today : new Date(`${dateKey}T12:00:00`);
    setDraftExtraItems((prev) => [...prev, { id: `${Date.now()}-${prev.length}`, name: '', calories: 0, proteinG: 0, mealTime: null, loggedAtISO: at.toISOString() }]);
    setDirty(true);
  }

  function restoreMeals() {
    setDraftRemovedSlots([]);
    setDirty(true);
  }

  function handleSave() {
    // A food added here and left blank (no name, no calories) is not kept.
    const kept = draftExtraItems.filter((i) => i.name.trim() !== '' || i.calories > 0 || i.proteinG > 0);
    onSave?.({ mealsEaten: draftMealsEaten, extraItems: kept, removedMealSlots: draftRemovedSlots, ...(totalsCleared ? { clearTotals: true } : {}) });
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
              <FoodThumb uris={thumbsOf(item)} name={item.name || t('mealLog.extraSectionLabel')} size={40} />
              <TextInput
                placeholderTextColor={mutedColor}
                style={[styles.nameInputFullWidth, styles.extraNameInput]}
                value={item.name}
                onChangeText={(text) => updateExtraItem(item.id, { name: text })}
                placeholder={t('mealLog.extraSectionLabel')}
                multiline
              />
            </View>
            <Text style={[styles.mealTimeCaption, { color: accentColor }]}>
              {item.mealTime ? t(EXTRA_MEAL_TIME_LABEL_KEY[item.mealTime]) : t('mealLog.extraSectionLabel')}
            </Text>
            <View style={styles.extraEditableSubRow}>
              <View style={styles.fieldTime}>
                <Text style={styles.fieldLabel} numberOfLines={1}>{t('mealLog.timeShort')}</Text>
                <TextInput
                  accessibilityLabel={t('mealLog.timeEdit')}
                  style={[styles.fieldInput, timeTextInvalid(timeTexts[item.id]) && styles.timeInvalid]}
                  value={timeTexts[item.id] ?? formatTime(item.loggedAtISO)}
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                  onChangeText={(text) => changeTime(item, text)}
                />
              </View>
              <View style={styles.fieldNum}>
                <Text style={styles.fieldLabel} numberOfLines={1}>{t('mealLog.tableHeaderKcal')}</Text>
                <TextInput
                  accessibilityLabel={t('mealLog.tableHeaderKcal')}
                  style={styles.fieldInput}
                  value={String(item.calories)}
                  keyboardType="decimal-pad"
                  onChangeText={(text) => updateExtraItem(item.id, { calories: parseFloat(text.replace(',', '.')) || 0 })}
                />
              </View>
              <View style={styles.fieldNum}>
                <Text style={styles.fieldLabel} numberOfLines={1}>{t('mealLog.tableHeaderProtein')}</Text>
                <TextInput
                  accessibilityLabel={t('mealLog.tableHeaderProtein')}
                  style={styles.fieldInput}
                  value={String(item.proteinG)}
                  keyboardType="decimal-pad"
                  onChangeText={(text) => updateExtraItem(item.id, { proteinG: parseFloat(text.replace(',', '.')) || 0 })}
                />
              </View>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="✕" onPress={() => removeExtraItem(item.id)} style={styles.deleteBtn}>
                <Text style={styles.deleteText}>✕</Text>
              </TouchableOpacity>
            </View>
            <PartsDetail item={item} styles={styles} title={t('mealLog.partsTitle')} line={(p) => t('mealLog.partLine', { name: p.name, kcal: p.calories, protein: p.proteinG })} onEditPart={(index, part) => { const patch = replacePartPatch(item, index, part); if (patch) updateExtraItem(item.id, patch); }} />
          </View>
        ) : (
          <View key={item.id}>
          <View style={styles.row}>
            <View style={[styles.nameCol, styles.extraNameRow]}>
              <FoodThumb uris={thumbsOf(item)} name={item.name || t('mealLog.extraSectionLabel')} size={28} />
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
          <PartsDetail item={item} styles={styles} title={t('mealLog.partsTitle')} line={(p) => t('mealLog.partLine', { name: p.name, kcal: p.calories, protein: p.proteinG })} />
          </View>
        )
      )}

      {legacy && (
        <View style={styles.row}>
          <Text style={[styles.cell, styles.nameCol]}>{t('mealLog.legacyTotal')}</Text>
          <Text style={[styles.cell, styles.statusCol, { color: accentColor }]}>{t('mealLog.extraSectionLabel')}</Text>
          <Text style={[styles.cell, styles.numCol]}>{legacy.kcal}</Text>
          <Text style={[styles.cell, styles.numCol]}>{legacy.proteinG}</Text>
          {editable && (
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="✕" onPress={() => { setTotalsCleared(true); setDirty(true); }} style={styles.deleteCol}>
              <Text style={styles.deleteText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <View style={[styles.row, styles.totalRow]}>
        <Text style={[styles.cell, styles.nameCol, styles.totalText]}>{t('mealLog.totalRow')}</Text>
        <View style={styles.statusCol} />
        <Text style={[styles.cell, styles.numCol, styles.totalText]}>{totalCalories}</Text>
        <Text style={[styles.cell, styles.numCol, styles.totalText]}>{totalProtein}</Text>
      </View>

      {editable && (draftRemovedSlots.length > 0 || dateKey) && (
        <View style={styles.actionsRow}>
          {draftRemovedSlots.length > 0 && (
            <TouchableOpacity accessibilityRole="button" onPress={restoreMeals} style={styles.actionBtn}>
              <Text style={styles.actionText}>{t('mealLog.restoreMeals', { n: draftRemovedSlots.length })}</Text>
            </TouchableOpacity>
          )}
          {dateKey && (
            <TouchableOpacity accessibilityRole="button" onPress={addExtraItem} style={styles.actionBtn}>
              <Text style={styles.actionText}>{t('mealLog.addItem')}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

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

/** The breakdown of a meal (its parts), shown under it, only while the parts still add up to the meal's calories. */
function PartsDetail({ item, styles, title, line, onEditPart }: { item: ExtraFoodItem; styles: ReturnType<typeof makeStyles>; title: string; line: (p: NonNullable<ExtraFoodItem['parts']>[number]) => string; onEditPart?: (index: number, part: MealPart) => void }) {
  const g = useGameText();
  const [editing, setEditing] = useState<number | null>(null);
  if (!partsMatchTotals(item)) return null;
  return (
    <View style={styles.parts}>
      <Text style={styles.partsTitle}>{title}</Text>
      {item.parts!.map((p, i) => (
        <View key={i}>
          <View style={styles.partRow}>
            <Text style={[styles.partLine, { flex: 1 }]}>{`• ${line(p)}`}</Text>
            {onEditPart && (
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={g('journal.partEdit', { name: p.name })} hitSlop={8} onPress={() => setEditing(i)} style={styles.partEditBtn}>
                <QuestIcon name="edit" size={16} color={quest.gold} strokeWidth={2.2} />
              </TouchableOpacity>
            )}
          </View>
          {editing === i && onEditPart && (
            <PartEditForm
              part={p}
              onCancel={() => setEditing(null)}
              onSave={(next) => {
                onEditPart(i, next);
                setEditing(null);
              }}
            />
          )}
        </View>
      ))}
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
  extraEditableSubRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xs + 2 },
  mealTimeCaption: { fontSize: 11, fontWeight: '700' },
  fieldLabel: { fontSize: 10, fontWeight: '800', color: c.muted, textTransform: 'uppercase', marginBottom: 2 },
  fieldTime: { width: 64 },
  fieldNum: { flex: 1, minWidth: 56 },
  fieldInput: { fontSize: 13, color: c.text, borderWidth: 1, borderColor: c.input, borderRadius: radius.sm, paddingHorizontal: spacing.xs + 2, paddingVertical: 6, minHeight: 36, ...font },
  deleteBtn: { minWidth: 30, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  extraTime: { fontSize: 10, color: c.muted },
  timeInvalid: { borderColor: c.danger },
  partRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  partEditBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  parts: { paddingHorizontal: spacing.sm, paddingBottom: spacing.xs + 2, gap: 2 },
  partsTitle: { fontSize: 10, fontWeight: '800', color: c.muted, textTransform: 'uppercase' },
  partLine: { fontSize: 11, color: c.muted },
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
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, padding: spacing.sm },
  actionBtn: { minHeight: 40, paddingHorizontal: spacing.md, borderRadius: radius.sm, borderWidth: 1, borderColor: c.border, justifyContent: 'center' },
  actionText: { fontWeight: '700', fontSize: 13, color: c.totalText, ...font },
  darkSave: { backgroundColor: quest.gold, borderRadius: radius.sm, paddingHorizontal: spacing.md, minHeight: 44, justifyContent: 'center' },
  darkSaveText: { color: quest.onGold, fontSize: 13, fontFamily: questFonts.bold },
});
};
