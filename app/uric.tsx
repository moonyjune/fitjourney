import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HudText } from '../src/components/quest/HudText';
import { QuestButton } from '../src/components/quest/QuestButton';
import { QuestChip } from '../src/components/quest/QuestChip';
import { QuestField } from '../src/components/quest/QuestField';
import { QuestHeader } from '../src/components/quest/QuestHeader';
import { QuestIcon } from '../src/components/quest/QuestIcon';
import { fmtDec, fmtInt, fmtSigned } from '../src/insights/format';
import { useInsights } from '../src/insights/useInsights';
import { useUricStore, TARGET_RANGE } from '../src/store/useUricStore';
import { useSettingsStore } from '../src/store/useSettingsStore';
import { quest, questRadius } from '../src/theme/quest';
import { chartWidthFor, screenMaxWidthStyle } from '../src/theme/responsive';
import { useLightStatusBar } from '../src/theme/useLightStatusBar';
import { thinLabels } from '../src/utils/chartLabels';
import { toDateKey } from '../src/utils/date';
import { contextFor, fromUmol, isPlausibleUmol, parseDateInput, sortReadings, summarizeReadings, toUmol, type UricStatus } from '../src/uric/analysis';
import { useUricText, type UricKey } from '../src/uric/strings';
import type { UricReading, UricUnit } from '../src/uric/types';

const STATUS_KEY: Record<UricStatus, UricKey> = { onTarget: 'ur.s.onTarget', above: 'ur.s.above', high: 'ur.s.high' };
const STATUS_COLOR: Record<UricStatus, string> = { onTarget: quest.xp, above: quest.gold, high: quest.hpText };
const chartConfig = {
  backgroundColor: quest.panel,
  backgroundGradientFrom: quest.panel,
  backgroundGradientTo: quest.panel,
  decimalPlaces: 0,
  color: (opacity = 1) => `rgba(255, 200, 61, ${opacity})`,
  labelColor: (opacity = 1) => `rgba(179, 170, 207, ${opacity})`,
  propsForDots: { r: '4' },
};

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)/profile');
}

const shortDate = (key: string) => {
  const [y, m, d] = key.split('-');
  return `${d}/${m}/${y}`;
};

function ReadingForm({ reading, onDone }: { reading: UricReading | null; onDone: () => void }) {
  const t = useUricText();
  const addReading = useUricStore((s) => s.addReading);
  const updateReading = useUricStore((s) => s.updateReading);
  const [date, setDate] = useState(shortDate(reading?.dateKey ?? toDateKey(new Date())));
  const [unit, setUnit] = useState<UricUnit>('umol');
  const [value, setValue] = useState(reading ? String(reading.valueUmol) : '');
  const [note, setNote] = useState(reading?.note ?? '');
  const [error, setError] = useState<UricKey | null>(null);

  function switchUnit(next: UricUnit) {
    const n = parseFloat(value.replace(',', '.'));
    if (Number.isFinite(n) && n > 0) setValue(String(Math.round(fromUmol(toUmol(n, unit), next) * (next === 'mgdl' ? 10 : 1)) / (next === 'mgdl' ? 10 : 1)));
    setUnit(next);
  }

  function save() {
    const dateKey = parseDateInput(date);
    if (!dateKey) return setError('ur.errDate');
    if (dateKey > toDateKey(new Date())) return setError('ur.errFuture');
    const umol = toUmol(parseFloat(value.replace(',', '.')), unit);
    if (!isPlausibleUmol(umol)) return setError('ur.errValue');
    const fields = { dateKey, valueUmol: Math.round(umol), note };
    if (reading) updateReading(reading.id, fields);
    else addReading(fields);
    onDone();
  }

  return (
    <View style={styles.form}>
      <QuestField label={t('ur.formDate')} value={date} onChangeText={(v) => { setDate(v); setError(null); }} autoCapitalize="none" />
      <View style={styles.chips}>
        <QuestChip label={t('ur.unitUmol')} selected={unit === 'umol'} onPress={() => switchUnit('umol')} />
        <QuestChip label={t('ur.unitMgdl')} selected={unit === 'mgdl'} onPress={() => switchUnit('mgdl')} />
      </View>
      <QuestField label={t('ur.formValue')} keyboardType="decimal-pad" value={value} onChangeText={(v) => { setValue(v); setError(null); }} unit={t(unit === 'umol' ? 'ur.unitUmol' : 'ur.unitMgdl')} />
      <QuestField label={t('ur.formNote')} value={note} onChangeText={setNote} />
      {error && (
        <HudText size={12} weight="medium" color={quest.hpText} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {t(error)}
        </HudText>
      )}
      <QuestButton title={t('ur.save')} icon="check" onPress={save} />
      <QuestButton title={t('ur.cancel')} variant="ghost" onPress={onDone} />
    </View>
  );
}

/** Profile > Uric acid: log blood test results, see them against the target, and see what the diary looked like before each one. */
export default function UricScreen() {
  const t = useUricText();
  const lang = useSettingsStore((s) => s.language);
  const insets = useSafeAreaInsets();
  useLightStatusBar();
  const width = chartWidthFor(useWindowDimensions().width) - 16;
  const readings = useUricStore((s) => s.readings);
  const targetUmol = useUricStore((s) => s.targetUmol);
  const nudgeTarget = useUricStore((s) => s.nudgeTarget);
  const removeReading = useUricStore((s) => s.removeReading);
  const { insights, thresholds, items } = useInsights();
  const weighs = insights.weighs;

  const [editing, setEditing] = useState<{ reading: UricReading | null } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const todayKey = toDateKey(new Date());
  const sorted = useMemo(() => sortReadings(readings), [readings]);
  const summary = useMemo(() => summarizeReadings(readings, targetUmol, todayKey), [readings, targetUmol, todayKey]);
  const mg = (umol: number) => fmtDec(fromUmol(umol, 'mgdl'), 1, lang);
  const chart = useMemo(() => {
    if (sorted.length < 2) return null;
    return {
      labels: thinLabels(sorted.map((r) => shortDate(r.dateKey).slice(0, 5))),
      datasets: [
        { data: sorted.map((r) => r.valueUmol), color: () => quest.gold, strokeWidth: 3 },
        { data: sorted.map(() => targetUmol), color: () => quest.xp, strokeWidth: 2 },
      ],
    };
  }, [sorted, targetUmol]);

  return (
    <View style={styles.screen}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, screenMaxWidthStyle, { paddingTop: insets.top + 16 }]}>
        <QuestHeader title={t('ur.title')} onBack={goBack} backLabel={t('ur.back')} />

        {editing ? (
          <ReadingForm key={editing.reading?.id ?? 'new'} reading={editing.reading} onDone={() => setEditing(null)} />
        ) : (
          <>
            {summary ? (
              <View style={styles.card}>
                <View style={styles.headRow}>
                  <HudText size={24} color={STATUS_COLOR[summary.status]}>
                    {t('ur.latest', { v: fmtInt(summary.latest.valueUmol, lang), mg: mg(summary.latest.valueUmol) })}
                  </HudText>
                </View>
                <HudText size={13} color={STATUS_COLOR[summary.status]}>
                  {t(STATUS_KEY[summary.status])}
                </HudText>
                <HudText size={12} weight="medium" color={quest.textSecondary}>
                  {summary.daysSince === 0 ? t('ur.dateToday', { date: shortDate(summary.latest.dateKey) }) : t('ur.dateAgo', { date: shortDate(summary.latest.dateKey), n: summary.daysSince })}
                </HudText>
                <HudText size={13} weight="medium" color={summary.aboveTarget > 0 ? quest.text : quest.xp}>
                  {summary.aboveTarget > 0 ? t('ur.vsTargetAbove', { t: fmtInt(targetUmol, lang), d: fmtInt(summary.aboveTarget, lang) }) : t('ur.vsTargetOk', { t: fmtInt(targetUmol, lang) })}
                </HudText>
                {summary.previous && summary.deltaVsPrevious !== null && (
                  <HudText size={12} weight="medium" color={summary.deltaVsPrevious <= 0 ? quest.xp : quest.hpText}>
                    {t('ur.deltaPrev', { date: shortDate(summary.previous.dateKey), d: fmtSigned(summary.deltaVsPrevious, lang) })}
                  </HudText>
                )}
                {summary.deltaVsFirst !== null && summary.previous && sorted.length > 2 && (
                  <HudText size={12} weight="medium" color={quest.textSecondary}>
                    {t('ur.deltaFirst', { d: fmtSigned(summary.deltaVsFirst, lang) })}
                  </HudText>
                )}
                {summary.status === 'high' && (
                  <HudText size={12} weight="medium" color={quest.hpText}>
                    {t('ur.highAlert')}
                  </HudText>
                )}
              </View>
            ) : (
              <HudText size={13} weight="medium" color={quest.textSecondary} style={styles.note}>
                {t('ur.none')}
              </HudText>
            )}

            {chart && (
              <View style={styles.card}>
                <HudText size={12} weight="medium" color={quest.textSecondary}>
                  {t('ur.chartTitle')}
                </HudText>
                <LineChart data={chart} width={width} height={180} chartConfig={chartConfig} bezier={false} fromZero={false} withShadow={false} style={styles.chart} />
                <View style={styles.legend}>
                  <View style={[styles.dot, { backgroundColor: quest.gold }]} />
                  <HudText size={11} weight="medium" color={quest.textSecondary}>
                    {t('ur.legendResult')}
                  </HudText>
                  <View style={[styles.dot, { backgroundColor: quest.xp }]} />
                  <HudText size={11} weight="medium" color={quest.textSecondary}>
                    {t('ur.legendTarget')}
                  </HudText>
                </View>
              </View>
            )}

            <View style={styles.addRow}>
              <QuestButton title={t('ur.add')} icon="plus" onPress={() => setEditing({ reading: null })} />
            </View>

            {sorted.length > 0 && (
              <>
                <HudText size={17} accessibilityRole="header" style={styles.section}>
                  {t('ur.listTitle')}
                </HudText>
                {[...sorted].reverse().map((r) => {
                  const index = sorted.indexOf(r);
                  const ctx = contextFor(r, sorted[index - 1] ?? null, { rows: insights.rows, items, weighs, thresholds });
                  const status = summarizeReadings([r], targetUmol, todayKey)!.status;
                  return (
                    <View key={r.id} style={styles.card}>
                      <View style={styles.headRow}>
                        <HudText size={15} style={styles.flex}>
                          {t('ur.row', { date: shortDate(r.dateKey), v: fmtInt(r.valueUmol, lang) })}
                        </HudText>
                        <HudText size={11} color={STATUS_COLOR[status]}>
                          {t(STATUS_KEY[status])}
                        </HudText>
                      </View>
                      {r.note ? (
                        <HudText size={12} weight="medium" color={quest.textSecondary}>
                          {r.note}
                        </HudText>
                      ) : null}
                      <HudText size={11} color={quest.textSecondary} style={styles.eyebrow}>
                        {t('ur.ctxTitle').toUpperCase()}
                      </HudText>
                      {ctx.daysWithData === 0 ? (
                        <HudText size={12} weight="medium" color={quest.textSecondary}>
                          {t('ur.ctxNone')}
                        </HudText>
                      ) : (
                        <>
                          <HudText size={12} weight="medium" color={ctx.purineOverDays > 0 ? quest.hpText : quest.text}>
                            {t('ur.ctxPurine', { mg: fmtInt(ctx.avgPurineMg ?? 0, lang), n: ctx.purineOverDays, d: ctx.daysWithData })}
                          </HudText>
                          <HudText size={12} weight="medium" color={ctx.alcoholDays > 0 ? quest.hpText : quest.text}>
                            {ctx.alcoholDays > 0 ? t('ur.ctxAlcohol', { n: ctx.alcoholDays }) : t('ur.ctxNoAlcohol')}
                          </HudText>
                          <HudText size={12} weight="medium" color={quest.text}>
                            {t('ur.ctxDeficit', { d: fmtInt(ctx.avgDeficit ?? 0, lang) })}
                          </HudText>
                        </>
                      )}
                      {ctx.weightKg !== null && (
                        <HudText size={12} weight="medium" color={quest.text}>
                          {ctx.weightChangeKg !== null
                            ? t('ur.ctxWeightChange', { kg: fmtDec(ctx.weightKg, 1, lang), d: `${ctx.weightChangeKg > 0 ? '+' : ''}${fmtDec(ctx.weightChangeKg, 1, lang)}` })
                            : t('ur.ctxWeight', { kg: fmtDec(ctx.weightKg, 1, lang) })}
                        </HudText>
                      )}
                      <View style={styles.chips}>
                        <QuestChip label={t('ur.edit')} accessibilityLabel={`${t('ur.edit')}: ${shortDate(r.dateKey)}`} onPress={() => setEditing({ reading: r })} />
                        <QuestChip
                          label={confirmDelete === r.id ? t('ur.deleteConfirm') : t('ur.delete')}
                          accessibilityLabel={`${confirmDelete === r.id ? t('ur.deleteConfirm') : t('ur.delete')}: ${shortDate(r.dateKey)}`}
                          tone="mana"
                          onPress={() => (confirmDelete === r.id ? removeReading(r.id) : setConfirmDelete(r.id))}
                        />
                      </View>
                    </View>
                  );
                })}
              </>
            )}

            <HudText size={17} accessibilityRole="header" style={styles.section}>
              {t('ur.targetTitle')}
            </HudText>
            <View style={styles.card}>
              <View style={styles.headRow}>
                <Pressable accessibilityRole="button" accessibilityLabel={t('ur.targetLess')} disabled={targetUmol <= TARGET_RANGE.min} onPress={() => nudgeTarget(-1)} style={styles.step}>
                  <QuestIcon name="minus" size={18} color={quest.text} />
                </Pressable>
                <HudText size={15} style={styles.targetText}>
                  {t('ur.targetValue', { t: fmtInt(targetUmol, lang), mg: mg(targetUmol) })}
                </HudText>
                <Pressable accessibilityRole="button" accessibilityLabel={t('ur.targetMore')} disabled={targetUmol >= TARGET_RANGE.max} onPress={() => nudgeTarget(1)} style={styles.step}>
                  <QuestIcon name="plus" size={18} color={quest.text} />
                </Pressable>
              </View>
              <HudText size={12} weight="medium" color={quest.textSecondary}>
                {t('ur.targetHint')}
              </HudText>
            </View>
            <HudText size={11} weight="medium" color={quest.textSecondary} style={styles.note}>
              {t('ur.note')}
            </HudText>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: quest.bg },
  content: { paddingHorizontal: 16, paddingBottom: 120 },
  section: { marginTop: 20, marginBottom: 4 },
  note: { marginTop: 14 },
  flex: { flex: 1, minWidth: 0 },
  card: { marginTop: 12, gap: 6, padding: 14, borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chart: { borderRadius: questRadius.row },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  addRow: { marginTop: 14 },
  eyebrow: { letterSpacing: 1.3, marginTop: 4 },
  form: { marginTop: 16, gap: 12 },
  step: { width: 44, height: 44, borderRadius: 12, borderWidth: 1.5, borderColor: quest.border, alignItems: 'center', justifyContent: 'center' },
  targetText: { flex: 1, textAlign: 'center' },
});
