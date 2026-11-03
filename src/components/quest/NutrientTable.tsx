import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import type { Limits, MissionId } from '../../game/constants';
import { MISSION_COOKBOOK } from '../../game/missionCopy';
import type { DayEvaluation, MissionResult } from '../../game/missions';
import { useGameText, type GameKey } from '../../game/strings';
import { quest, questRadius } from '../../theme/quest';
import { HudText } from './HudText';
import { QuestIcon } from './QuestIcon';

type RowId = 'kcal' | 'protein' | 'purine' | 'salt' | 'sugar' | 'junk';
type Tone = 'done' | 'holding' | 'open' | 'over' | 'short' | 'cheat';

interface NutrientTableProps {
  day: DayEvaluation;
  /** What the day may take in and still meet the deficit target: TDEE + training − target. */
  budgetKcal: number;
  limits: Limits;
  /** The mission opened from Camp: its row is lit and gets the cook-book link. */
  focus?: MissionId;
  /** Offer "Gợi ý món …" under the lit row (the user's own journal only). */
  cookbookLinks?: boolean;
}

const TONE_COLOR: Record<Tone, string> = {
  done: quest.xp,
  holding: quest.manaText,
  open: quest.gold,
  over: quest.hpText,
  short: quest.textSecondary,
  cheat: quest.manaText,
};

const ROW_NAME: Record<RowId, GameKey> = {
  kcal: 'journal2.nutr.kcal',
  protein: 'journal2.nutr.protein',
  purine: 'journal2.nutr.purine',
  salt: 'journal2.nutr.salt',
  sugar: 'journal2.nutr.sugar',
  junk: 'journal2.nutr.junk',
};

function toneOf(m: MissionResult | undefined, limit: boolean): Tone {
  if (!m) return 'open';
  if (m.status === 'done') return 'done';
  if (m.status === 'holding') return 'holding';
  if (m.status === 'open') return 'open';
  return limit && m.value > m.target ? 'over' : 'short';
}

/** Journal › Ngày: the day's energy, protein, purine, salt, sugar and junk food, each against its goal or limit, with the same status
 *  the missions give. A mission opened from Camp lights its row (Design/uiux-proposal dialogs.md decision 6) and offers the cook book
 *  filtered for it. */
export function NutrientTable({ day, budgetKcal, limits, focus, cookbookLinks }: NutrientTableProps) {
  const g = useGameText();
  const mission = (id: MissionId) => day.missions.find((m) => m.id === id);
  const kcalTone: Tone = day.cheat ? 'cheat' : day.eatenKcal > budgetKcal ? 'over' : day.settled ? 'done' : 'holding';
  const rows: { id: RowId; value: string; unit: string; limit: string; tone: Tone }[] = [
    { id: 'kcal', value: Math.round(day.eatenKcal).toLocaleString('en-US'), unit: 'kcal', limit: g('journal2.nutr.limit', { n: Math.round(budgetKcal).toLocaleString('en-US') }), tone: kcalTone },
    { id: 'protein', value: String(Math.round(day.proteinG)), unit: 'g', limit: g('journal2.nutr.goal', { n: Math.round(mission('protein')?.target ?? 0) }), tone: toneOf(mission('protein'), false) },
    { id: 'purine', value: String(Math.round(day.nutrients.purineMg)), unit: 'mg', limit: g('journal2.nutr.limit', { n: limits.purineMg }), tone: toneOf(mission('purine'), true) },
    { id: 'salt', value: day.nutrients.saltG.toFixed(1), unit: 'g', limit: g('journal2.nutr.limit', { n: limits.saltG }), tone: toneOf(mission('salt'), true) },
    { id: 'sugar', value: String(Math.round(day.nutrients.sugarG)), unit: 'g', limit: g('journal2.nutr.limit', { n: limits.sugarG }), tone: toneOf(mission('sugar'), true) },
    { id: 'junk', value: String(day.junkCount), unit: g('journal2.nutr.junkUnit'), limit: g('journal2.nutr.limit', { n: 0 }), tone: toneOf(mission('junk'), true) },
  ];

  return (
    <View style={styles.wrap} testID="nutrient-table">
      <HudText size={17} accessibilityRole="header" style={styles.title}>
        {g('journal2.nutr.title')}
      </HudText>
      <View style={styles.table}>
        {rows.map((r, i) => {
          const lit = r.id === focus;
          const status = g(`journal2.nutr.${r.tone}` as GameKey);
          const cook = lit && cookbookLinks && r.id !== 'kcal' ? MISSION_COOKBOOK[r.id] : undefined;
          return (
            <View key={r.id} style={[i > 0 && styles.divider, lit && styles.lit]} testID={lit ? 'nutrient-focus' : undefined}>
              <View
                accessible
                accessibilityLabel={g('journal2.nutr.a11y', { name: g(ROW_NAME[r.id]), value: r.value, unit: r.unit, limit: r.limit, status })}
                accessibilityState={{ selected: lit }}
                style={styles.row}
              >
                <HudText size={14} color={lit ? quest.gold : quest.text} style={styles.name}>
                  {g(ROW_NAME[r.id])}
                </HudText>
                <HudText size={14} style={styles.value}>
                  {r.value} <HudText size={12} weight="medium" color={quest.textSecondary}>{r.unit}</HudText>
                </HudText>
                <HudText size={12} weight="medium" color={quest.textSecondary} style={styles.limit}>
                  {r.limit}
                </HudText>
                <View style={[styles.badge, { borderColor: TONE_COLOR[r.tone] }]}>
                  <HudText size={12} color={TONE_COLOR[r.tone]} numberOfLines={1}>
                    {status}
                  </HudText>
                </View>
              </View>
              {cook && (
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={g(cook.label)}
                  onPress={() => router.push({ pathname: '/cookbook', params: { quick: cook.quick } })}
                  style={styles.cookLink}
                >
                  <HudText size={13} weight="medium" color={quest.manaText}>
                    {g(cook.label)}
                  </HudText>
                  <QuestIcon name="chevron" size={13} color={quest.manaText} />
                </Pressable>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 20 },
  title: { marginBottom: 8 },
  table: { borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel, overflow: 'hidden' },
  divider: { borderTopWidth: 1, borderTopColor: quest.border },
  lit: { backgroundColor: quest.raised, borderLeftWidth: 3, borderLeftColor: quest.gold },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 12, paddingVertical: 6 },
  name: { flex: 1.1, minWidth: 0 },
  value: { flex: 1, textAlign: 'right' },
  limit: { flex: 1, textAlign: 'right' },
  badge: { minWidth: 72, alignItems: 'center', paddingHorizontal: 6, minHeight: 24, justifyContent: 'center', borderRadius: 6, borderWidth: 1.5 },
  cookLink: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', gap: 2, minHeight: 44, paddingHorizontal: 12 },
});
