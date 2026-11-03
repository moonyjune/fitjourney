import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { browseCookbook, dishBadge, QUICK_IDS, splitByFilters, type QuickId, type SortId } from '../src/cookbook/browse';
import { splitCookbook } from '../src/cookbook/cheat';
import { filtersEmpty } from '../src/cookbook/filters';
import { ideaFromRecipe, type CookbookRecipe } from '../src/cookbook/recipes';
import { useNextMealBrief } from '../src/cookbook/useNextMealBrief';
import { CookbookFilterSheet, filterCount } from '../src/components/quest/CookbookFilterSheet';
import { CookbookSuggestSheet, useBriefWhat, useFinderBrief } from '../src/components/quest/CookbookSuggestSheet';
import { DishTile } from '../src/components/quest/DishCard';
import { HudText } from '../src/components/quest/HudText';
import { QuestIcon } from '../src/components/quest/QuestIcon';
import { QuestSegment } from '../src/components/quest/QuestSegment';
import { ScreenTemplate } from '../src/components/quest/ScreenTemplate';
import { useGameText, type GameKey } from '../src/game/strings';
import { useCookbookFinderStore } from '../src/store/useCookbookFinderStore';
import { useCookbookStore } from '../src/store/useCookbookStore';
import { openRecipe } from '../src/store/useRecipeViewStore';
import { quest, questRadius } from '../src/theme/quest';
import { useLightStatusBar } from '../src/theme/useLightStatusBar';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)');
}

type Tab = 'mine' | 'cheat';

/** Profile / Camp > Cook book (README §3.6): search + filter button (badge; the filters open in a sheet), "Món của tôi | 🎉 Cheat day",
 *  quick chips, a 2-column grid of photo cards, and "✨ Gợi ý món mới cho <bữa>" kept at the bottom. A card opens the recipe page;
 *  the cheat-day side leads to the Cheat day screen. Camp can open it already filtered (?quick=fits, ?quick=lowPurine). */
export default function CookbookScreen() {
  const g = useGameText();
  useLightStatusBar();
  const all = useCookbookStore((s) => s.recipes);
  const parts = useMemo(() => splitCookbook(all), [all]);
  const filters = useCookbookFinderStore((s) => s.filters);
  const [tab, setTab] = useState<Tab>('mine');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortId>('newest');
  const [sheet, setSheet] = useState<'filters' | 'suggest' | null>(null);
  const [showMisses, setShowMisses] = useState(false);
  const { quick: quickParam } = useLocalSearchParams<{ quick?: string }>();
  const [quick, setQuick] = useState<QuickId[]>(() =>
    typeof quickParam === 'string' ? quickParam.split(',').filter((q): q is QuickId => (QUICK_IDS as readonly string[]).includes(q)) : []
  );
  const brief = useNextMealBrief();
  const { brief: finderBrief } = useFinderBrief();
  const finderWhat = useBriefWhat(finderBrief);
  const nextWhat = brief ? g(`meals.kind.${brief.meal ?? 'meal'}` as GameKey).toLowerCase() : '';

  const isCheat = tab === 'cheat';
  const book = isCheat ? parts.cheat : parts.everyday;
  // "Fits the next meal" means nothing on a cheat day or when no meal is left today.
  const quickIds = QUICK_IDS.filter((q) => !(q === 'fits' && (isCheat || !brief)));
  const browsed = useMemo(
    () => browseCookbook(book, { query, sort, quick: quick.filter((q) => quickIds.includes(q)), brief }),
    [book, query, sort, quick, brief] // eslint-disable-line react-hooks/exhaustive-deps
  );
  // The filter sheet's filters apply to the everyday dishes: matches first, the rest folded.
  const filtered = !isCheat && !filtersEmpty(filters);
  const { hits, misses } = useMemo(() => (filtered ? splitByFilters(browsed, filters) : { hits: browsed, misses: [] as CookbookRecipe[] }), [browsed, filters, filtered]);
  const toggleQuick = (q: QuickId) => setQuick((list) => (list.includes(q) ? list.filter((x) => x !== q) : [...list, q]));
  const quickLabel = (q: QuickId) => (q === 'fits' && brief ? g('rd4.quick.fits', { meal: nextWhat }) : g(`rd4.quick.${q}` as GameKey));
  const nFilters = filterCount(filters);

  const grid = (list: CookbookRecipe[]) => {
    const rows: CookbookRecipe[][] = [];
    for (let i = 0; i < list.length; i += 2) rows.push(list.slice(i, i + 2));
    return rows.map((pair) => (
      <View key={pair.map((r) => r.id).join('|')} style={styles.gridRow}>
        {pair.map((r) => {
          const idea = ideaFromRecipe(r);
          return <DishTile key={r.id} idea={idea} badge={dishBadge(idea, brief, isCheat)} rating={r.rating} photoUri={r.photoUri} onPress={() => openRecipe(idea, isCheat ? undefined : (brief ?? undefined))} />;
        })}
        {pair.length === 1 ? <View style={styles.gridGap} /> : null}
      </View>
    ));
  };

  return (
    <ScreenTemplate
      title={g('cookbook.title')}
      onBack={goBack}
      backLabel={g('common.back')}
      right={
        <Pressable accessibilityRole="button" accessibilityLabel={g('rd4.cookbook.foodDb')} onPress={() => router.push('/food-db')} style={styles.iconBtn}>
          <QuestIcon name="bowl" size={20} color={quest.text} />
        </Pressable>
      }
      primary={
        isCheat
          ? { label: g('rd4.cookbook.openCheat'), onPress: () => router.push('/cheat-day') }
          : { label: g('rd4.cookbook.suggestNew', { meal: finderWhat }), onPress: () => setSheet('suggest'), variant: 'mana' }
      }
      contentStyle={styles.content}
    >
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <QuestIcon name="search" size={18} color={quest.textSecondary} />
          <TextInput
            style={styles.search}
            value={query}
            onChangeText={setQuery}
            placeholder={g('cookbook.ui.search')}
            placeholderTextColor={quest.textSecondary}
            accessibilityLabel={g('cookbook.ui.search')}
            maxLength={60}
            returnKeyType="search"
          />
          {query ? (
            <Pressable accessibilityRole="button" accessibilityLabel={g('cookbook.ui.clearSearch')} onPress={() => setQuery('')} hitSlop={8} style={styles.clear}>
              <QuestIcon name="x" size={16} color={quest.textSecondary} />
            </Pressable>
          ) : null}
        </View>
        {isCheat ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={nFilters ? g('cookbook.ui.filtersCount', { n: nFilters }) : g('cookbook.ui.filters')}
            onPress={() => setSheet('filters')}
            style={[styles.iconBtn, nFilters > 0 && styles.iconBtnOn]}
          >
            <QuestIcon name="list" size={20} color={quest.text} />
            {nFilters > 0 ? (
              <View style={styles.badge}>
                <HudText size={11} color={quest.onGold}>
                  {String(nFilters)}
                </HudText>
              </View>
            ) : null}
          </Pressable>
        )}
      </View>

      <QuestSegment<Tab>
        accessibilityLabel={g('cookbook.title')}
        value={tab}
        onChange={(t) => {
          setTab(t);
          setShowMisses(false);
        }}
        options={[
          { value: 'mine', label: g('rd4.cookbook.mine', { n: parts.everyday.length }) },
          { value: 'cheat', label: g('rd4.cookbook.cheat', { n: parts.cheat.length }) },
        ]}
      />

      {book.length > 0 && quickIds.length > 0 ? (
        <View style={styles.quick}>
          {quickIds.map((q) => {
            const on = quick.includes(q);
            const label = quickLabel(q);
            return (
              <Pressable key={q} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: on }} onPress={() => toggleQuick(q)} style={[styles.chip, on && styles.chipOn]}>
                <HudText size={13} color={on ? quest.onGold : quest.text} numberOfLines={1}>
                  {label}
                </HudText>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {book.length > 0 ? (
        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {filtered ? g('rd4.cookbook.countFiltered', { n: browsed.length, hits: hits.length }) : g('cookbook.ui.count', { n: browsed.length })}
        </HudText>
      ) : null}

      {book.length === 0 ? (
        <View style={styles.empty}>
          <HudText size={44}>{isCheat ? '🎉' : '📖'}</HudText>
          <HudText size={13} weight="medium" color={quest.textSecondary} style={styles.center}>
            {isCheat ? g('rd4.cookbook.cheatEmpty') : g('cookbook.ui.empty')}
          </HudText>
        </View>
      ) : browsed.length === 0 || (hits.length === 0 && !showMisses) ? (
        <HudText size={13} weight="medium" color={quest.textSecondary} style={styles.emptyLine}>
          {g('cookbook.ui.noHits')}
        </HudText>
      ) : null}
      {hits.length > 0 ? <View style={styles.grid}>{grid(hits)}</View> : null}
      {misses.length > 0 ? (
        <>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: showMisses }} accessibilityLabel={g('rd4.cookbook.misses', { n: misses.length })} onPress={() => setShowMisses(!showMisses)} style={styles.more}>
            <HudText size={13} weight="medium" color={quest.textSecondary}>
              {`${g('rd4.cookbook.misses', { n: misses.length })} ${showMisses ? '▴' : '▾'}`}
            </HudText>
          </Pressable>
          {showMisses ? <View style={styles.grid}>{grid(misses)}</View> : null}
        </>
      ) : null}

      <CookbookFilterSheet visible={sheet === 'filters'} onClose={() => setSheet(null)} brief={finderBrief} what={finderWhat} sort={sort} onSort={setSort} hits={hits.length} />
      <CookbookSuggestSheet visible={sheet === 'suggest'} onClose={() => setSheet(null)} onEditFilters={() => setSheet('filters')} />
    </ScreenTemplate>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  search: { flex: 1, minHeight: 44, color: quest.text, paddingVertical: 8 },
  clear: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  iconBtn: { width: 44, height: 44, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel, alignItems: 'center', justifyContent: 'center' },
  iconBtnOn: { borderColor: quest.gold },
  badge: { position: 'absolute', top: -6, right: -6, minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: quest.gold },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  chipOn: { backgroundColor: quest.gold, borderColor: quest.gold },
  grid: { gap: 10 },
  gridRow: { flexDirection: 'row', gap: 10 },
  gridGap: { flex: 1 },
  more: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 32 },
  center: { textAlign: 'center' },
  emptyLine: { paddingVertical: 12 },
});
