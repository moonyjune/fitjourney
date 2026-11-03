import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { BottomSheet } from '../src/components/quest/BottomSheet';
import { HudText } from '../src/components/quest/HudText';
import { QuestButton } from '../src/components/quest/QuestButton';
import { QuestChip } from '../src/components/quest/QuestChip';
import { QuestField } from '../src/components/quest/QuestField';
import { QuestIcon } from '../src/components/quest/QuestIcon';
import { ScreenTemplate } from '../src/components/quest/ScreenTemplate';
import { useGameText } from '../src/game/strings';
import { showToast } from '../src/store/useToastStore';
import { amountOf, baseUnit, defaultQty, purineLevel } from '../src/food/calc';
import { searchFoods } from '../src/food/search';
import { GROUP_LABEL, unitLabel, useFoodText, type FoodKey } from '../src/food/strings';
import { FOOD_GROUPS, type FoodEntry, type FoodGroup } from '../src/food/types';
import { fmtDec, fmtInt } from '../src/insights/format';
import { BUILT_IN_FOODS } from '../src/food/foodData';
import { useAllFoods, useFoodDbStore, validateFood, type FoodFields, type FoodValidation } from '../src/store/useFoodDbStore';
import { useSettingsStore } from '../src/store/useSettingsStore';
import { quest, questRadius } from '../src/theme/quest';
import { useLightStatusBar } from '../src/theme/useLightStatusBar';

const ERROR_KEY: Record<Exclude<FoodValidation, null>, FoodKey> = {
  name: 'fdb.errName',
  duplicate: 'fdb.errDuplicate',
  unit: 'fdb.errUnit',
  amount: 'fdb.errAmount',
  kcal: 'fdb.errKcal',
};
const LEVEL_COLOR = { low: quest.xp, medium: quest.gold, high: quest.hpText } as const;
const LEVEL_KEY = { low: 'fdb.purineLow', medium: 'fdb.purineMedium', high: 'fdb.purineHigh' } as const;
const CONF_KEY = { high: 'fdb.confHigh', medium: 'fdb.confMedium', low: 'fdb.confLow' } as const;

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)/profile');
}

const toNum = (text: string): number => {
  const v = parseFloat(text.replace(',', '.'));
  return Number.isFinite(v) ? v : 0;
};

interface FormState {
  name: string;
  group: FoodGroup;
  unit: string;
  unitG: string;
  kcal: string;
  proteinG: string;
  purineMg: string;
  sugarG: string;
  sodiumMg: string;
  note: string;
}

const blankForm = (): FormState => ({ name: '', group: 'starch', unit: 'g', unitG: '1', kcal: '', proteinG: '', purineMg: '', sugarG: '', sodiumMg: '', note: '' });
const formFrom = (food: FoodEntry): FormState => ({
  name: food.name,
  group: food.group,
  unit: food.unit,
  unitG: String(food.unitG),
  kcal: String(food.kcal),
  proteinG: String(food.proteinG),
  purineMg: String(food.purineMg),
  sugarG: String(food.sugarG),
  sodiumMg: String(food.sodiumMg),
  note: food.note ?? '',
});

function FoodForm({ initial, editingId, onDone }: { initial: FormState; editingId: string | null; onDone: () => void }) {
  const f = useFoodText();
  const lang = useSettingsStore((s) => s.language);
  const foods = useAllFoods();
  const addCustom = useFoodDbStore((s) => s.addCustom);
  const updateFood = useFoodDbStore((s) => s.updateFood);
  const [form, setForm] = useState<FormState>(initial);
  const [error, setError] = useState<FoodValidation>(null);
  const set = (patch: Partial<FormState>) => {
    setForm((x) => ({ ...x, ...patch }));
    setError(null);
  };
  const editingBuiltIn = editingId !== null && BUILT_IN_FOODS.some((b) => b.id === editingId);

  function save() {
    const fields: FoodFields = {
      name: form.name,
      group: form.group,
      unit: form.unit.trim(),
      unitG: toNum(form.unitG),
      kcal: toNum(form.kcal),
      proteinG: toNum(form.proteinG),
      purineMg: toNum(form.purineMg),
      sugarG: toNum(form.sugarG),
      sodiumMg: toNum(form.sodiumMg),
      confidence: editingBuiltIn ? foods.find((x) => x.id === editingId)?.confidence ?? 'medium' : 'medium',
      ...(form.note.trim() ? { note: form.note.trim() } : {}),
    };
    const problem = validateFood(fields, foods, editingId ?? undefined);
    if (problem) {
      setError(problem);
      return;
    }
    if (editingId) updateFood(editingId, fields);
    else addCustom(fields);
    onDone();
  }

  const num = (key: keyof FormState, label: FoodKey) => (
    <View style={styles.pairCell}>
      <QuestField label={f(label)} keyboardType="decimal-pad" value={form[key]} onChangeText={(v) => set({ [key]: v } as Partial<FormState>)} />
    </View>
  );

  return (
    <View style={styles.form}>
      <QuestField label={f('fdb.formName')} value={form.name} onChangeText={(v) => set({ name: v })} />
      <HudText size={12} weight="medium" color={quest.textSecondary}>
        {f('fdb.formGroup')}
      </HudText>
      <View style={styles.chips}>
        {FOOD_GROUPS.map((g) => (
          <QuestChip key={g} label={GROUP_LABEL[lang][g]} selected={form.group === g} onPress={() => set({ group: g })} />
        ))}
      </View>
      <View style={styles.pair}>
        <View style={styles.pairCell}>
          <QuestField label={f('fdb.formUnit')} value={form.unit} onChangeText={(v) => set({ unit: v })} autoCapitalize="none" />
        </View>
        {num('unitG', 'fdb.formUnitG')}
      </View>
      <HudText size={12} weight="medium" color={quest.textSecondary}>
        {f('fdb.formHint')}
      </HudText>
      <View style={styles.pair}>
        {num('kcal', 'fdb.kcal')}
        {num('proteinG', 'fdb.protein')}
      </View>
      <View style={styles.pair}>
        {num('purineMg', 'fdb.purine')}
        {num('sugarG', 'fdb.sugar')}
        {num('sodiumMg', 'fdb.sodium')}
      </View>
      {error && (
        <HudText size={12} weight="medium" color={quest.hpText} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {f(ERROR_KEY[error])}
        </HudText>
      )}
      <QuestButton title={f('fdb.save')} icon="check" onPress={save} />
      <QuestButton title={f('fdb.cancel')} variant="ghost" onPress={onDone} />
    </View>
  );
}

function FoodRow({ food, expanded, onToggle, onEdit }: { food: FoodEntry; expanded: boolean; onToggle: () => void; onEdit: () => void }) {
  const f = useFoodText();
  const lang = useSettingsStore((s) => s.language);
  const isCustom = food.id.startsWith('c-');
  const edited = useFoodDbStore((s) => !!s.overrides[food.id]);
  const removeCustom = useFoodDbStore((s) => s.removeCustom);
  const resetOverride = useFoodDbStore((s) => s.resetOverride);
  const g = useGameText();
  const [qty, setQty] = useState(String(defaultQty(food)));
  const level = purineLevel(food.purineMg);
  const base = baseUnit(food);
  const amount = amountOf(food, toNum(qty));
  const int = (v: number) => fmtInt(v, lang);

  return (
    <View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={food.name} onPress={onToggle} style={styles.rowHead}>
        <View style={styles.flex}>
          <HudText size={14}>{food.name}</HudText>
          <HudText size={11} weight="medium" color={quest.textSecondary}>
            {`${int(food.kcal)} kcal · ${fmtDec(food.proteinG, 1, lang)} g · ${int(food.purineMg)} mg purine / 100 ${base}`}
          </HudText>
        </View>
        <HudText size={11} color={LEVEL_COLOR[level]}>
          {f(LEVEL_KEY[level])}
        </HudText>
      </Pressable>

      {expanded && (
        <View style={styles.detail}>
          <View style={styles.tags}>
            {isCustom && <Tag text={food.auto ? f('fdb.auto') : f('fdb.custom')} color={quest.manaText} />}
            {edited && <Tag text={f('fdb.edited')} color={quest.gold} />}
            <Tag text={f(CONF_KEY[food.confidence])} color={food.confidence === 'low' ? quest.hpText : quest.textSecondary} />
          </View>
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {f('fdb.per100', { u: base })}
          </HudText>
          <View style={styles.grid}>
            {([
              ['fdb.kcal', int(food.kcal)],
              ['fdb.protein', fmtDec(food.proteinG, 1, lang)],
              ['fdb.purine', int(food.purineMg)],
              ['fdb.sugar', fmtDec(food.sugarG, 1, lang)],
              ['fdb.sodium', int(food.sodiumMg)],
            ] as [FoodKey, string][]).map(([key, value]) => (
              <View key={key} style={styles.gridCell}>
                <HudText size={15}>{value}</HudText>
                <HudText size={10} weight="medium" color={quest.textSecondary}>
                  {f(key)}
                </HudText>
              </View>
            ))}
          </View>
          {food.unit !== 'g' && food.unit !== 'ml' && (
            <HudText size={12} weight="medium" color={quest.textSecondary}>
              {f('fdb.perUnit', { unit: unitLabel(food.unit, lang), g: int(food.unitG), kcal: int((food.kcal * food.unitG) / 100) })}
            </HudText>
          )}
          {food.note ? (
            <HudText size={12} weight="medium" color={quest.textSecondary}>
              {food.note}
            </HudText>
          ) : null}

          <HudText size={11} color={quest.textSecondary} style={styles.eyebrow}>
            {f('fdb.calcTitle').toUpperCase()}
          </HudText>
          <View style={styles.calc}>
            <TextInput accessibilityLabel={f('fdb.calcQty', { unit: unitLabel(food.unit, lang) })} keyboardType="decimal-pad" value={qty} onChangeText={setQty} style={styles.qty} />
            <HudText size={12} weight="medium" color={quest.textSecondary}>
              {unitLabel(food.unit, lang)}
            </HudText>
          </View>
          <HudText size={13} color={quest.gold}>
            {f('fdb.calcResult', {
              q: qty || '0',
              unit: unitLabel(food.unit, lang),
              kcal: int(amount.kcal),
              p: fmtDec(amount.proteinG, 1, lang),
              pu: int(amount.purineMg),
              s: fmtDec(amount.sugarG, 1, lang),
              na: int(amount.sodiumMg),
            })}
          </HudText>

          <View style={styles.actions}>
            <QuestChip label={isCustom ? f('fdb.edit') : f('fdb.editBuiltIn')} onPress={onEdit} />
            {edited && <QuestChip label={f('fdb.resetEdit')} onPress={() => resetOverride(food.id)} />}
            {isCustom && (
              <QuestChip
                label={f('fdb.delete')}
                tone="mana"
                onPress={() => {
                  // Gone at once; the toast's "Hoàn tác" adds it back (README §4: undo instead of a second tap).
                  const { id: _id, ...fields } = food;
                  removeCustom(food.id);
                  showToast({ text: g('rd4.fdb.removed', { name: food.name }), undo: () => useFoodDbStore.getState().addCustom(fields) });
                }}
              />
            )}
          </View>
        </View>
      )}
    </View>
  );
}

function Tag({ text, color }: { text: string; color: string }) {
  return (
    <View style={[styles.tag, { borderColor: color }]}>
      <HudText size={10} color={color}>
        {text}
      </HudText>
    </View>
  );
}

/** Profile > Food database (dialog 30, ScreenTemplate): browse and search the table, calculate an amount, edit values from a label, add
 *  your own foods (the form opens in a sheet), delete one of yours with "Hoàn tác". */
export default function FoodDbScreen() {
  const f = useFoodText();
  const lang = useSettingsStore((s) => s.language);
  useLightStatusBar();
  const foods = useAllFoods();
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<FoodGroup | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState<{ initial: FormState; editingId: string | null } | null>(null);
  const shown = useMemo(() => searchFoods(foods, query, group), [foods, query, group]);

  return (
    <ScreenTemplate
      title={f('fdb.title')}
      eyebrow={f('fdb.count', { n: foods.length })}
      onBack={goBack}
      backLabel={f('fdb.back')}
      right={
        <Pressable accessibilityRole="button" accessibilityLabel={f('fdb.add')} onPress={() => setForm({ initial: blankForm(), editingId: null })} style={styles.iconBtn}>
          <QuestIcon name="plus" size={20} color={quest.gold} strokeWidth={2.4} />
        </Pressable>
      }
    >
      <QuestField label={f('fdb.search')} value={query} onChangeText={setQuery} autoCapitalize="none" />
      <View style={styles.chips}>
        <QuestChip label={f('fdb.all')} selected={group === null} onPress={() => setGroup(null)} />
        {FOOD_GROUPS.map((g) => (
          <QuestChip key={g} label={GROUP_LABEL[lang][g]} selected={group === g} onPress={() => setGroup(group === g ? null : g)} />
        ))}
      </View>
      {shown.length === 0 ? (
        <View style={styles.emptyBox}>
          <HudText size={40}>🥣</HudText>
          <HudText size={13} weight="medium" color={quest.textSecondary} style={styles.empty}>
            {f('fdb.empty')}
          </HudText>
          <QuestButton title={f('fdb.add')} icon="plus" variant="ghost" onPress={() => setForm({ initial: blankForm(), editingId: null })} />
        </View>
      ) : (
        shown.map((food) => (
          <FoodRow
            key={food.id}
            food={food}
            expanded={openId === food.id}
            onToggle={() => setOpenId(openId === food.id ? null : food.id)}
            onEdit={() => setForm({ initial: formFrom(food), editingId: food.id })}
          />
        ))
      )}
      <HudText size={11} weight="medium" color={quest.textSecondary} style={styles.note}>
        {f('fdb.disclaimer')}
      </HudText>
      <BottomSheet visible={form !== null} onClose={() => setForm(null)} title={form?.editingId ? f('fdb.edit') : f('fdb.add')}>
        {form ? <FoodForm key={form.editingId ?? 'new'} initial={form.initial} editingId={form.editingId} onDone={() => setForm(null)} /> : null}
      </BottomSheet>
    </ScreenTemplate>
  );
}

const styles = StyleSheet.create({
  iconBtn: { width: 44, height: 44, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, marginBottom: 4 },
  emptyBox: { alignItems: 'center', gap: 10, paddingVertical: 24 },
  flex: { flex: 1, minWidth: 0 },
  row: { marginTop: 8, borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel, overflow: 'hidden' },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingVertical: 8, paddingHorizontal: 14 },
  detail: { gap: 8, paddingHorizontal: 14, paddingBottom: 14 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { borderWidth: 1.2, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  grid: { flexDirection: 'row', justifyContent: 'space-between' },
  gridCell: { alignItems: 'center', flex: 1 },
  eyebrow: { letterSpacing: 1.4, marginTop: 4 },
  calc: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qty: { width: 90, height: 44, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.bg, color: quest.text, textAlign: 'center', fontSize: 15 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  form: { gap: 12, paddingBottom: 8 },
  pair: { flexDirection: 'row', gap: 10 },
  pairCell: { flex: 1, minWidth: 0 },
  empty: { marginTop: 18, textAlign: 'center' },
  note: { marginTop: 16, textAlign: 'center' },
});
