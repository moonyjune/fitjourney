import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { HudText } from '../../components/quest/HudText';
import { fmtInt } from '../../insights/format';
import { Line, Panel } from '../../insights/components/ui';
import type { InsightsView } from '../../insights/useInsights';
import type { DayRow } from '../../insights/days';
import type { Thresholds } from '../../insights/thresholds';
import { quest } from '../../theme/quest';
import { buildDayFeedback, type Advice, type DayFeedback } from '../day';
import { useFeedbackText, type FeedbackKey } from '../strings';
import { FeedbackLines } from './FeedbackLines';

type Lang = 'vi' | 'en';
const MAX_DAYS = 14;

const ADVICE_KEY: Record<Advice['key'], FeedbackKey> = {
  missing: 'fb.a.missing',
  lowKcal: 'fb.a.lowKcal',
  skipped: 'fb.a.skipped',
  alcohol: 'fb.a.alcohol',
  sodiumStreak: 'fb.a.sodiumStreak',
  sodiumHigh: 'fb.a.sodiumHigh',
  purineStreak: 'fb.a.purineStreak',
  purineOver: 'fb.a.purineOver',
  surplus: 'fb.a.surplus',
  lowDeficitStreak: 'fb.a.lowDeficitStreak',
  lowProtein: 'fb.a.lowProtein',
  sugar: 'fb.a.sugar',
  noExercise: 'fb.a.noExercise',
  goodSaltOnly: 'fb.a.goodSaltOnly',
  veryGood: 'fb.a.veryGood',
};

const dateText = (key: string) => {
  const [y, m, d] = key.split('-');
  return `${d}/${m}/${y}`;
};

/** The whole day's sodium, purine and sugar against the daily limits (a meal warning below is about one meal only). */
function DayTotals({ row, th, lang }: { row: DayRow; th: Thresholds; lang: Lang }) {
  const f = useFeedbackText();
  const parts = [
    { key: 'sodium' as const, v: row.sodiumMg, max: th.sodiumMax, unit: ' mg' },
    { key: 'purine' as const, v: row.purineMg, max: th.purineMax, unit: ' mg' },
    { key: 'sugar' as const, v: row.sugarG, max: th.sugarMax, unit: ' g' },
  ];
  return (
    <View style={styles.block}>
      <HudText size={12} color={quest.textSecondary}>
        {f('fb.dayTotals')}
      </HudText>
      {parts.map((p) => {
        const over = Math.round(p.v) > p.max;
        return (
          <Line key={p.key} color={over ? quest.hpText : quest.xp}>
            {`${f(`fb.total.${p.key}`, { v: fmtInt(p.v, lang), max: fmtInt(p.max, lang) })} · ${over ? f('fb.total.over', { d: `${fmtInt(p.v - p.max, lang)}${p.unit}` }) : f('fb.total.ok')}`}
          </Line>
        );
      })}
    </View>
  );
}

function DayCard({ day, row, th, lang }: { day: DayFeedback; row: DayRow; th: Thresholds; lang: Lang }) {
  const kcal = row.kcal;
  const f = useFeedbackText();
  const good = day.advice.filter((a) => a.key === 'veryGood' || a.key === 'goodSaltOnly');
  const todo = day.advice.filter((a) => a.key !== 'veryGood' && a.key !== 'goodSaltOnly');
  const adviceText = (a: Advice) => f(ADVICE_KEY[a.key], { v: a.value === undefined ? '' : fmtInt(a.value, lang) });
  return (
    <Panel>
      <View style={styles.head}>
        <HudText size={15}>{f('fb.dayHead', { date: dateText(day.dateKey), kcal: fmtInt(kcal, lang) })}</HudText>
        {day.score !== null && (
          <HudText size={12} color={quest.textSecondary} style={styles.score}>
            {f('fb.score', { s: day.score })}
          </HudText>
        )}
      </View>

      <DayTotals row={row} th={th} lang={lang} />

      {good.map((a) => (
        <Line key={a.key} color={quest.xp}>
          {adviceText(a)}
        </Line>
      ))}

      {day.replace.length > 0 && (
        <View style={styles.block}>
          <HudText size={12} color={quest.hpText}>
            {f('fb.replaceTitle')}
          </HudText>
          {day.replace.map((r) => (
            <Line key={r.keyword}>{f('fb.replaceRow', { short: r.short, to: r.shortReplace })}</Line>
          ))}
        </View>
      )}

      {day.repeats.length > 0 && (
        <View style={styles.block}>
          <HudText size={12} color={quest.gold}>
            {f('fb.repeatTitle')}
          </HudText>
          {day.repeats.map((r) => (
            <Line key={r.rule.keyword}>{f('fb.repeatRow', { short: r.rule.short, n: r.count, hint: r.rule.repeatHint || f('fb.repeatDefault') })}</Line>
          ))}
        </View>
      )}

      {todo.length > 0 && (
        <View style={styles.advice}>
          <HudText size={11} color={quest.gold} style={styles.adviceTitle}>
            {f('fb.adviceTitle').toUpperCase()}
          </HudText>
          {todo.map((a) => (
            <Line key={a.key} color={quest.text}>
              {adviceText(a)}
            </Line>
          ))}
        </View>
      )}

      <View style={styles.block}>
        <HudText size={12} color={quest.textSecondary}>
          {f('fb.mealsTitle')}
        </HudText>
        {day.items.map((it) => (
          <View key={it.item.id} style={styles.item}>
            <HudText size={13}>{it.item.text}</HudText>
            <FeedbackLines lines={it.lines} warnings={it.warnings} />
          </View>
        ))}
      </View>
    </Panel>
  );
}

/** Food comments for the latest logged days: what to swap, repeats, tomorrow's to-do and a comment on every food. */
export function FeedbackTab({ view, lang }: { view: InsightsView; lang: Lang }) {
  const f = useFeedbackText();
  const { insights, thresholds, items } = view;
  const days = [...insights.rows].reverse().slice(0, MAX_DAYS);
  if (days.length === 0) return <Line>{f('fb.empty')}</Line>;
  return (
    <View style={styles.wrap}>
      {days.map((row) => {
        const day = buildDayFeedback(row.dateKey, items, insights.rows, thresholds);
        return day ? <DayCard key={row.dateKey} day={day} row={row} th={thresholds} lang={lang} /> : null;
      })}
      <Pressable accessibilityRole="link" accessibilityLabel={f('fb.snackLink')} onPress={() => router.push('/learn')} style={styles.link}>
        <HudText size={13} color={quest.manaText}>
          {f('fb.snackLink')}
        </HudText>
      </Pressable>
      <Line size={11} style={styles.note}>
        {f('fb.note')}
      </Line>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  score: { marginLeft: 'auto' },
  block: { marginTop: 8, gap: 3 },
  advice: { marginTop: 10, padding: 10, borderRadius: 12, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.raised2, gap: 4 },
  adviceTitle: { letterSpacing: 1.2 },
  item: { gap: 3, marginTop: 4 },
  note: { textAlign: 'center', marginTop: 8 },
  link: { minHeight: 44, justifyContent: 'center', alignItems: 'center', marginTop: 4 },
});
