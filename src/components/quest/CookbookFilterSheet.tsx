import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import type { DinnerBrief } from '../../ai/dinner';
import { SORT_IDS, type SortId } from '../../cookbook/browse';
import {
  CRAVING_IDS,
  DISH_TYPE_IDS,
  EMPTY_FILTERS,
  filtersEmpty,
  ingredientPool,
  MAX_INGREDIENTS_PICKED,
  OCCASION_IDS,
  suggestIngredients,
  type CookbookFilters,
} from '../../cookbook/filters';
import { foodKey } from '../../food/remember';
import { useGameText, type GameKey } from '../../game/strings';
import { useCookbookFinderStore } from '../../store/useCookbookFinderStore';
import { useCookbookStore } from '../../store/useCookbookStore';
import { useAllFoods } from '../../store/useFoodDbStore';
import { quest, questRadius } from '../../theme/quest';
import { BottomSheet } from './BottomSheet';
import { HudText } from './HudText';
import { QuestButton } from './QuestButton';

type Group = 'occasions' | 'cravings' | 'types';
export const FILTER_GROUPS: { group: Group; ids: readonly string[]; title: GameKey; prefix: string }[] = [
  { group: 'occasions', ids: OCCASION_IDS, title: 'cookbook.finder.occasion', prefix: 'cookbook.occ.' },
  { group: 'cravings', ids: CRAVING_IDS, title: 'cookbook.finder.craving', prefix: 'cookbook.crave.' },
  { group: 'types', ids: DISH_TYPE_IDS, title: 'cookbook.finder.type', prefix: 'cookbook.type.' },
];

const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
const room = (n: number) => Math.max(0, Math.round(n * 10) / 10);

/** How many filters are on (the badge of the filter button). */
export const filterCount = (f: CookbookFilters): number => f.occasions.length + f.cravings.length + f.types.length + f.have.length + f.avoid.length;

/** A 44 pt chip of the filter sheet. */
export function FilterChip({ label, on, onPress, avoid, a11y }: { label: string; on: boolean; onPress: () => void; avoid?: boolean; a11y?: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y ?? label} accessibilityState={{ selected: on }} onPress={onPress} style={[styles.chip, on && (avoid ? styles.chipAvoid : styles.chipOn)]}>
      <HudText size={13} color={on ? quest.onGold : quest.text}>
        {label}
      </HudText>
    </Pressable>
  );
}

/** "What is left for {meal}": kcal, protein and the limits still free. */
export function LeftLine({ brief, what }: { brief: DinnerBrief; what: string }) {
  const g = useGameText();
  return (
    <View style={styles.left}>
      <HudText size={12} weight="medium" color={quest.textSecondary}>
        {g('cookbook.ui.left', { what })}
      </HudText>
      <HudText size={12} weight="semibold" color={quest.text}>
        {g('cookbook.ui.leftNums', {
          kcal: Math.round(brief.budgetKcal),
          protein: Math.round(brief.proteinLeftG),
          purine: room(brief.headroom.purine),
          salt: room(brief.headroom.salt),
          sugar: room(brief.headroom.sugar),
        })}
      </HudText>
    </View>
  );
}

/** Cook book > filter button (dialog 23): what is left for the meal, then four groups of 44 pt chips (meal / occasion, craving, kind of
 *  dish, ingredients to use or avoid, typed with suggestions) and the sort. The filters are kept on the device (finder store) and
 *  also steer "Gợi ý món mới". */
export function CookbookFilterSheet({
  visible,
  onClose,
  brief,
  what,
  sort,
  onSort,
  hits,
}: {
  visible: boolean;
  onClose: () => void;
  brief: DinnerBrief;
  what: string;
  sort: SortId;
  onSort: (s: SortId) => void;
  /** Dishes matching the filters now (the "Xem n món khớp" button). */
  hits: number;
}) {
  const g = useGameText();
  const filters = useCookbookFinderStore((s) => s.filters);
  const book = useCookbookStore((s) => s.recipes);
  const foods = useAllFoods();
  const [mode, setMode] = useState<'have' | 'avoid'>('have');
  const [query, setQuery] = useState('');
  const pool = useMemo(() => ingredientPool(book, foods), [book, foods]);
  const picked = [...filters.have, ...filters.avoid];
  const options = suggestIngredients(pool, query, picked, query.trim() ? 8 : 10);
  const setFilters = (f: CookbookFilters) => useCookbookFinderStore.getState().setFilters(f);
  const n = filterCount(filters);

  function addIngredient(raw: string) {
    const name = raw.replace(/\s+/g, ' ').trim().slice(0, 40);
    const key = foodKey(name);
    if (!key) return;
    const other = mode === 'have' ? 'avoid' : 'have';
    const list = filters[mode].filter((x) => foodKey(x) !== key);
    if (list.length >= MAX_INGREDIENTS_PICKED) return;
    setFilters({ ...filters, [mode]: [...list, name], [other]: filters[other].filter((x) => foodKey(x) !== key) });
    setQuery('');
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={n > 0 ? g('cookbook.ui.filtersCount', { n }) : g('cookbook.ui.filters')}
      footer={
        <View style={styles.footer}>
          {!filtersEmpty(filters) ? (
            <View style={styles.flex}>
              <QuestButton variant="ghost" title={g('cookbook.finder.clear')} onPress={() => setFilters(EMPTY_FILTERS)} />
            </View>
          ) : null}
          <View style={styles.flex2}>
            <QuestButton variant="gold" title={g('rd4.filter.show', { n: hits })} onPress={onClose} />
          </View>
        </View>
      }
    >
      <View style={styles.body}>
        <LeftLine brief={brief} what={what} />
        {n === 0 ? (
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {g('cookbook.ui.noFilters')}
          </HudText>
        ) : null}
        {FILTER_GROUPS.map(({ group, ids, title, prefix }) => (
          <View key={group} style={styles.group}>
            <HudText size={13} color={quest.goldLight}>
              {g(title)}
            </HudText>
            <View style={styles.wrap}>
              {ids.map((id) => (
                <FilterChip
                  key={id}
                  label={g(`${prefix}${id}` as GameKey)}
                  on={(filters[group] as string[]).includes(id)}
                  onPress={() => setFilters({ ...filters, [group]: toggle(filters[group] as string[], id) })}
                />
              ))}
            </View>
          </View>
        ))}
        <View style={styles.group}>
          <HudText size={13} color={quest.goldLight}>
            {g('cookbook.finder.ingredients')}
          </HudText>
          <View style={styles.wrap}>
            {(['have', 'avoid'] as const).map((m) => (
              <FilterChip key={m} label={g(`cookbook.finder.${m}`)} a11y={`${g('cookbook.finder.addTo')}: ${g(`cookbook.finder.${m}`)}`} on={mode === m} avoid={m === 'avoid'} onPress={() => setMode(m)} />
            ))}
          </View>
          <TextInput
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => addIngredient(query)}
            placeholder={g('cookbook.finder.ingredientInput')}
            placeholderTextColor={quest.textSecondary}
            accessibilityLabel={g('cookbook.finder.ingredientInput')}
            maxLength={40}
            returnKeyType="done"
          />
          {picked.length > 0 ? (
            <View style={styles.wrap}>
              {filters.have.map((x) => (
                <FilterChip key={`h-${x}`} label={`✓ ${x} ✕`} a11y={g('cookbook.finder.remove', { name: x })} on onPress={() => setFilters({ ...filters, have: filters.have.filter((y) => y !== x) })} />
              ))}
              {filters.avoid.map((x) => (
                <FilterChip key={`a-${x}`} label={`⊘ ${x} ✕`} a11y={g('cookbook.finder.remove', { name: x })} on avoid onPress={() => setFilters({ ...filters, avoid: filters.avoid.filter((y) => y !== x) })} />
              ))}
            </View>
          ) : null}
          <View style={styles.wrap}>
            {query.trim() && !options.some((o) => foodKey(o) === foodKey(query)) ? (
              <FilterChip label={g('cookbook.finder.add', { name: query.trim() })} on={false} onPress={() => addIngredient(query)} />
            ) : null}
            {options.map((o) => (
              <FilterChip key={o} label={`+ ${o}`} a11y={g('cookbook.finder.add', { name: o })} on={false} onPress={() => addIngredient(o)} />
            ))}
          </View>
        </View>
        <View style={styles.group}>
          <HudText size={13} color={quest.goldLight}>
            {g('cookbook.ui.sort')}
          </HudText>
          <View style={styles.wrap}>
            {SORT_IDS.map((id) => (
              <FilterChip key={id} label={g(`cookbook.ui.sort.${id}` as GameKey)} on={sort === id} onPress={() => onSort(id)} />
            ))}
          </View>
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: 14, paddingBottom: 8 },
  group: { gap: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  chipOn: { backgroundColor: quest.gold, borderColor: quest.gold },
  chipAvoid: { backgroundColor: quest.hp, borderColor: quest.hp },
  input: { minHeight: 44, borderWidth: 1.5, borderColor: quest.border, borderRadius: questRadius.row, paddingHorizontal: 12, paddingVertical: 8, color: quest.text, backgroundColor: quest.bg },
  left: { gap: 2, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: quest.bg },
  footer: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
  flex2: { flex: 2 },
});
