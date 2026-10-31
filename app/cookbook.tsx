import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { DinnerIdea } from '../src/ai/dinner';
import { buildMealPlan, mealBrief } from '../src/ai/mealSplit';
import { browseCookbook, QUICK_IDS, SORT_IDS, type QuickId, type SortId } from '../src/cookbook/browse';
import { splitCookbook } from '../src/cookbook/cheat';
import { purineWarning } from '../src/cookbook/filters';
import { ideaFromRecipe } from '../src/cookbook/recipes';
import { CookbookFinder } from '../src/components/quest/CookbookFinder';
import { DishCard } from '../src/components/quest/DishCard';
import { FlashNotice, useFlash } from '../src/components/quest/FlashNotice';
import { HudText } from '../src/components/quest/HudText';
import { QuestHeader } from '../src/components/quest/QuestHeader';
import { RecipeDialog } from '../src/components/quest/RecipeDialog';
import { useGameText, type GameKey } from '../src/game/strings';
import { pick as pickPrefs, useMealPrefStore } from '../src/store/useMealPrefStore';
import { useCookbookStore } from '../src/store/useCookbookStore';
import { quest, questRadius } from '../src/theme/quest';
import { screenMaxWidthStyle } from '../src/theme/responsive';
import { useLightStatusBar } from '../src/theme/useLightStatusBar';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)');
}

type Tab = 'mine' | 'cheat' | 'find';
const TABS: Tab[] = ['mine', 'cheat', 'find'];

/** Profile / Camp > Cook book: a search box and three tabs — the user's own dishes, the cheat-day dishes, and the finder
 *  ("what do I feel like", with the AI). The lists are compact cards with sort and quick filters; details open in the recipe dialog. */
export default function CookbookScreen() {
  const g = useGameText();
  const insets = useSafeAreaInsets();
  useLightStatusBar();
  const all = useCookbookStore((s) => s.recipes);
  const parts = useMemo(() => splitCookbook(all), [all]);
  const prefKcal = useMealPrefStore((s) => s.kcal);
  const prefProtein = useMealPrefStore((s) => s.proteinG);
  const prefStrict = useMealPrefStore((s) => s.strictKcal);
  const [tab, setTab] = useState<Tab>('mine');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortId>('newest');
  const [quick, setQuick] = useState<QuickId[]>([]);
  const [open, setOpen] = useState<DinnerIdea | null>(null);
  const [flash, showFlash] = useFlash();
  // The share of the next meal still to come today, to tell which dishes fit it.
  const brief = useMemo(() => {
    const prefs = pickPrefs({ kcal: prefKcal, proteinG: prefProtein, strictKcal: prefStrict });
    const plan = buildMealPlan(new Date(), prefs);
    return plan && plan.split.meals[0] ? mealBrief(plan.totals, plan.split.meals[0], prefs) : null;
  }, [prefKcal, prefProtein, prefStrict, all.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const isCheat = tab === 'cheat';
  const book = isCheat ? parts.cheat : parts.everyday;
  // "Fits the next meal" means nothing on a cheat day.
  const quickIds = QUICK_IDS.filter((q) => !(q === 'fits' && (isCheat || !brief)));
  const shown = useMemo(
    () => browseCookbook(book, { query, sort, quick: quick.filter((q) => quickIds.includes(q)), brief }),
    [book, query, sort, quick, brief] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const toggleQuick = (q: QuickId) => setQuick((list) => (list.includes(q) ? list.filter((x) => x !== q) : [...list, q]));

  const pill = (key: string, label: string, on: boolean, onPress: () => void, role: 'button' | 'tab' = 'button') => (
    <Pressable key={key} accessibilityRole={role} accessibilityLabel={label} accessibilityState={{ selected: on }} onPress={onPress} hitSlop={4} style={[styles.pill, on && styles.pillOn]}>
      <HudText size={12} color={on ? quest.onGold : quest.text} numberOfLines={1}>
        {label}
      </HudText>
    </Pressable>
  );

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, screenMaxWidthStyle, { paddingTop: insets.top + 16 }]} keyboardShouldPersistTaps="handled">
        <QuestHeader title={g('cookbook.title')} onBack={goBack} backLabel={g('common.back')} />
        <FlashNotice text={flash} />

        <View style={styles.segment} accessibilityRole="tablist">
          {TABS.map((t) => {
            const label = t === 'find' ? g('cookbook.ui.tab.find') : g(`cookbook.ui.tab.${t}` as GameKey, { n: t === 'mine' ? parts.everyday.length : parts.cheat.length });
            const on = tab === t;
            return (
              <Pressable key={t} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: on }} onPress={() => setTab(t)} style={[styles.seg, on && styles.segOn]}>
                <HudText size={12} color={on ? quest.onGold : quest.text} numberOfLines={1}>
                  {label}
                </HudText>
              </Pressable>
            );
          })}
        </View>

        {tab === 'find' ? (
          <CookbookFinder />
        ) : (
          <View style={styles.list}>
            <View style={styles.searchRow}>
              <HudText size={14} color={quest.textSecondary}>
                🔍
              </HudText>
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
                  <HudText size={13} color={quest.textSecondary}>
                    ✕
                  </HudText>
                </Pressable>
              ) : null}
            </View>
            {book.length > 0 && (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
                  <HudText size={11} weight="medium" color={quest.textSecondary}>
                    {`${g('cookbook.ui.sort')}:`}
                  </HudText>
                  {SORT_IDS.map((id) => pill(`s-${id}`, g(`cookbook.ui.sort.${id}` as GameKey), sort === id, () => setSort(id)))}
                </ScrollView>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
                  {quickIds.map((id) => pill(`q-${id}`, g(`cookbook.ui.quick.${id}` as GameKey), quick.includes(id), () => toggleQuick(id)))}
                </ScrollView>
                <HudText size={11} weight="medium" color={quest.textSecondary}>
                  {g('cookbook.ui.count', { n: shown.length })}
                </HudText>
              </>
            )}
            {book.length === 0 ? (
              <HudText size={13} weight="medium" color={quest.textSecondary} style={styles.empty}>
                {isCheat ? g('cookbook.ui.cheatEmpty') : g('cookbook.ui.empty')}
              </HudText>
            ) : shown.length === 0 ? (
              <HudText size={13} weight="medium" color={quest.textSecondary} style={styles.empty}>
                {g('cookbook.ui.noHits')}
              </HudText>
            ) : (
              shown.map((r) => {
                const idea = ideaFromRecipe(r);
                return (
                  <DishCard
                    key={r.id}
                    idea={idea}
                    onPress={() => setOpen(idea)}
                    purineHigh={!isCheat && purineWarning(idea)}
                    cheat={isCheat}
                    rating={r.rating}
                    cooked={r.cookedCount}
                  />
                );
              })
            )}
          </View>
        )}
      </ScrollView>
      <RecipeDialog idea={open} brief={open?.cheat ? undefined : (brief ?? undefined)} mealLabel="" onClose={() => setOpen(null)} onRemoved={(name) => showFlash(g('recipe.removed', { name }))} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: quest.bg },
  content: { paddingHorizontal: 16, paddingBottom: 120, gap: 12 },
  segment: { flexDirection: 'row', padding: 4, gap: 4, borderRadius: questRadius.button, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  seg: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, borderRadius: 10 },
  segOn: { backgroundColor: quest.gold },
  list: { gap: 8 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  search: { flex: 1, minHeight: 44, color: quest.text, paddingVertical: 8 },
  clear: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  strip: { gap: 6, alignItems: 'center', paddingRight: 8 },
  pill: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  pillOn: { backgroundColor: quest.gold, borderColor: quest.gold },
  empty: { paddingVertical: 12 },
});
