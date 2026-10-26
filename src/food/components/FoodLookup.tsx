import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { HudText } from '../../components/quest/HudText';
import { QuestButton } from '../../components/quest/QuestButton';
import { QuestField } from '../../components/quest/QuestField';
import { QuestIcon } from '../../components/quest/QuestIcon';
import { useFoodDbStore, useAllFoods } from '../../store/useFoodDbStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { quest, questRadius } from '../../theme/quest';
import { fmtDec, fmtInt } from '../../insights/format';
import { amountOf, baseUnit, defaultQty, describeLine, purineLevel, sumAmounts } from '../calc';
import { searchFoods } from '../search';
import { unitLabel, useFoodText } from '../strings';
import type { FoodEntry } from '../types';

/** What the lookup hands back to the form: a meal name and its nutrition. */
export interface LookupResult {
  name: string;
  calories: number;
  proteinG: number;
  purineMg: number;
  saltG: number;
  sugarG: number;
}

interface BasketLine {
  food: FoodEntry;
  qty: string;
}

const MAX_RESULTS = 8;
const LEVEL_COLOR = { low: quest.xp, medium: quest.gold, high: quest.hpText } as const;

const toQty = (text: string): number => {
  const v = parseFloat(text.replace(',', '.'));
  return Number.isFinite(v) && v > 0 ? v : 0;
};

/** Pick foods from the food database, enter how much was eaten, and use the total for the item being added. */
export function FoodLookup({ onApply, onOpenDb }: { onApply: (result: LookupResult) => void; onOpenDb: () => void }) {
  const f = useFoodText();
  const lang = useSettingsStore((s) => s.language);
  const foods = useAllFoods();
  const recentIds = useFoodDbStore((s) => s.recent);
  const touchRecent = useFoodDbStore((s) => s.touchRecent);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [basket, setBasket] = useState<BasketLine[]>([]);

  const results = useMemo(() => (query.trim() ? searchFoods(foods, query).slice(0, MAX_RESULTS) : []), [foods, query]);
  const recent = useMemo(() => recentIds.map((id) => foods.find((x) => x.id === id)).filter((x): x is FoodEntry => !!x), [recentIds, foods]);
  const suggestions = query.trim() ? results : recent;

  const lines = basket.map((l) => ({ ...l, amount: amountOf(l.food, toQty(l.qty)) }));
  const total = sumAmounts(lines.map((l) => l.amount));
  const lowConfidence = basket.some((l) => l.food.confidence === 'low');

  function add(food: FoodEntry) {
    setBasket((b) => [...b, { food, qty: String(defaultQty(food)) }]);
    touchRecent(food.id);
    setQuery('');
  }

  function apply() {
    const used = lines.filter((l) => toQty(l.qty) > 0);
    if (used.length === 0) return;
    onApply({
      name: used.map((l) => describeLine(l.food, toQty(l.qty))).join('; '),
      calories: Math.round(total.kcal),
      proteinG: Math.round(total.proteinG * 10) / 10,
      purineMg: Math.round(total.purineMg),
      saltG: Math.round(total.saltG * 100) / 100,
      sugarG: Math.round(total.sugarG * 10) / 10,
    });
    setBasket([]);
    setOpen(false);
  }

  return (
    <View style={styles.card}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={f('fdb.lookupTitle')} onPress={() => setOpen(!open)} style={styles.head}>
        <QuestIcon name="bowl" size={20} color={quest.gold} />
        <HudText size={14} style={styles.flex}>
          {f('fdb.lookupTitle')}
        </HudText>
        <QuestIcon name="chevron" size={18} color={quest.textSecondary} />
      </Pressable>

      {open && (
        <View style={styles.body}>
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {f('fdb.lookupHint')}
          </HudText>
          <QuestField label={f('fdb.search')} value={query} onChangeText={setQuery} autoCapitalize="none" />

          {suggestions.length > 0 && (
            <View style={styles.list}>
              {!query.trim() && (
                <HudText size={11} color={quest.textSecondary} style={styles.eyebrow}>
                  {f('fdb.recent').toUpperCase()}
                </HudText>
              )}
              {suggestions.map((food) => (
                <Pressable key={food.id} accessibilityRole="button" accessibilityLabel={f('fdb.addToBasket', { name: food.name })} onPress={() => add(food)} style={styles.result}>
                  <View style={styles.flex}>
                    <HudText size={13}>{food.name}</HudText>
                    <HudText size={11} weight="medium" color={quest.textSecondary}>
                      {`${fmtInt(food.kcal, lang)} kcal / 100 ${baseUnit(food)}`}
                    </HudText>
                  </View>
                  <HudText size={11} color={LEVEL_COLOR[purineLevel(food.purineMg)]}>
                    {f(purineLevel(food.purineMg) === 'low' ? 'fdb.purineLow' : purineLevel(food.purineMg) === 'medium' ? 'fdb.purineMedium' : 'fdb.purineHigh')}
                  </HudText>
                </Pressable>
              ))}
            </View>
          )}

          {basket.length > 0 && (
            <View style={styles.list}>
              <HudText size={11} color={quest.textSecondary} style={styles.eyebrow}>
                {f('fdb.basket').toUpperCase()}
              </HudText>
              {lines.map((l, i) => (
                <View key={`${l.food.id}-${i}`} style={styles.basketRow}>
                  <View style={styles.flex}>
                    <HudText size={13}>{l.food.name}</HudText>
                    <HudText size={11} weight="medium" color={quest.textSecondary}>
                      {fmtInt(l.amount.kcal, lang)} kcal
                    </HudText>
                  </View>
                  <TextInput
                    accessibilityLabel={`${f('fdb.qty')} ${l.food.name}`}
                    keyboardType="decimal-pad"
                    value={l.qty}
                    onChangeText={(v) => setBasket((b) => b.map((x, j) => (j === i ? { ...x, qty: v } : x)))}
                    style={styles.qty}
                  />
                  <HudText size={12} weight="medium" color={quest.textSecondary} style={styles.unit}>
                    {unitLabel(l.food.unit, lang)}
                  </HudText>
                  <Pressable accessibilityRole="button" accessibilityLabel={f('fdb.remove', { name: l.food.name })} onPress={() => setBasket((b) => b.filter((_, j) => j !== i))} style={styles.remove}>
                    <QuestIcon name="x" size={16} color={quest.textSecondary} />
                  </Pressable>
                </View>
              ))}
              <HudText size={13} color={quest.gold}>
                {f('fdb.total', {
                  kcal: fmtInt(total.kcal, lang),
                  p: fmtDec(total.proteinG, 1, lang),
                  pu: fmtInt(total.purineMg, lang),
                  salt: fmtDec(total.saltG, 2, lang),
                  s: fmtDec(total.sugarG, 1, lang),
                })}
              </HudText>
              {lowConfidence && (
                <HudText size={12} weight="medium" color={quest.hpText}>
                  {f('fdb.lowConf')}
                </HudText>
              )}
              <QuestButton title={f('fdb.apply')} icon="check" onPress={apply} disabled={total.kcal <= 0 && total.proteinG <= 0} />
            </View>
          )}

          <Pressable accessibilityRole="button" accessibilityLabel={f('fdb.openDb')} onPress={onOpenDb} style={styles.link}>
            <HudText size={12} color={quest.manaText}>
              {f('fdb.openDb')}
            </HudText>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingHorizontal: 14 },
  flex: { flex: 1, minWidth: 0 },
  body: { gap: 12, paddingHorizontal: 14, paddingBottom: 14 },
  list: { gap: 8 },
  eyebrow: { letterSpacing: 1.4 },
  result: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingVertical: 6, paddingHorizontal: 10, borderRadius: questRadius.row, backgroundColor: quest.raised2 },
  basketRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52 },
  qty: { width: 72, height: 44, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.bg, color: quest.text, textAlign: 'center', fontSize: 15 },
  unit: { minWidth: 34 },
  remove: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
  link: { minHeight: 36, justifyContent: 'center' },
});
