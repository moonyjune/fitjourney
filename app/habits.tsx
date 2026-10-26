import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HudText } from '../src/components/quest/HudText';
import { QuestButton } from '../src/components/quest/QuestButton';
import { QuestChip } from '../src/components/quest/QuestChip';
import { QuestField } from '../src/components/quest/QuestField';
import { QuestHeader } from '../src/components/quest/QuestHeader';
import { QuestIcon } from '../src/components/quest/QuestIcon';
import { autoSignals } from '../src/habits/auto';
import { buildHabitWeeks, dayRatio, FORMED_RATE, streak, trackedHabits } from '../src/habits/rates';
import { useHabitText, type HabitKey } from '../src/habits/strings';
import { HABIT_STATUSES, type CheckValue, type Habit, type HabitAuto, type HabitStatus } from '../src/habits/types';
import { addDaysToKey } from '../src/insights/dateMath';
import { fmtDayMonth } from '../src/insights/format';
import { useHabitStore } from '../src/store/useHabitStore';
import { useNutritionStore } from '../src/store/useNutritionStore';
import { useWeightStore } from '../src/store/useWeightStore';
import { useWorkoutStore } from '../src/store/useWorkoutStore';
import { quest, questRadius } from '../src/theme/quest';
import { screenMaxWidthStyle } from '../src/theme/responsive';
import { useLightStatusBar } from '../src/theme/useLightStatusBar';
import { toDateKey } from '../src/utils/date';

const STATUS_KEY: Record<HabitStatus, HabitKey> = { formed: 'hb.s.formed', building: 'hb.s.building', todo: 'hb.s.todo' };
const STATUS_COLOR: Record<HabitStatus, string> = { formed: quest.xp, building: quest.gold, todo: quest.hpText };
const AUTO_WHAT: Record<HabitAuto, HabitKey> = { water: 'hb.autoWater', weigh: 'hb.autoWeigh', walk: 'hb.autoWalk' };
const DAYS_BACK = 7;
const pct = (v: number) => Math.round(v * 100);

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)/profile');
}

/** none -> done -> missed -> none */
const nextValue = (v: CheckValue | undefined): CheckValue | null => (v === undefined ? 'done' : v === 'done' ? 'missed' : null);

interface FormState {
  name: string;
  status: HabitStatus;
  assessment: string;
  kaizen: string;
  measuredBy: string;
  tracked: boolean;
}
const blank = (): FormState => ({ name: '', status: 'building', assessment: '', kaizen: '', measuredBy: '', tracked: true });

function HabitForm({ habit, onDone }: { habit: Habit | null; onDone: () => void }) {
  const h = useHabitText();
  const addHabit = useHabitStore((s) => s.addHabit);
  const updateHabit = useHabitStore((s) => s.updateHabit);
  const [form, setForm] = useState<FormState>(
    habit ? { name: habit.name, status: habit.status, assessment: habit.assessment, kaizen: habit.kaizen, measuredBy: habit.measuredBy, tracked: habit.tracked } : blank()
  );
  const [error, setError] = useState(false);
  const set = (patch: Partial<FormState>) => {
    setForm((f) => ({ ...f, ...patch }));
    setError(false);
  };

  function save() {
    if (!form.name.trim()) {
      setError(true);
      return;
    }
    if (habit) updateHabit(habit.id, form);
    else addHabit({ ...form, auto: null });
    onDone();
  }

  return (
    <View style={styles.form}>
      <QuestField label={h('hb.formName')} value={form.name} onChangeText={(v) => set({ name: v })} />
      <HudText size={12} weight="medium" color={quest.textSecondary}>
        {h('hb.formStatus')}
      </HudText>
      <View style={styles.chips}>
        {HABIT_STATUSES.map((s) => (
          <QuestChip key={s} label={h(STATUS_KEY[s])} selected={form.status === s} onPress={() => set({ status: s })} />
        ))}
      </View>
      <QuestField label={h('hb.formAssessment')} value={form.assessment} onChangeText={(v) => set({ assessment: v })} multiline />
      <QuestField label={h('hb.formKaizen')} value={form.kaizen} onChangeText={(v) => set({ kaizen: v })} multiline />
      <QuestField label={h('hb.formMeasured')} value={form.measuredBy} onChangeText={(v) => set({ measuredBy: v })} />
      <View style={styles.switchRow}>
        <HudText size={14} style={styles.flex}>
          {h('hb.formTracked')}
        </HudText>
        <Switch accessibilityLabel={h('hb.formTracked')} value={form.tracked} onValueChange={(v) => set({ tracked: v })} trackColor={{ false: quest.raised2, true: quest.gold }} thumbColor={quest.text} />
      </View>
      {error && (
        <HudText size={12} weight="medium" color={quest.hpText} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {h('hb.errName')}
        </HudText>
      )}
      <QuestButton title={h('hb.save')} icon="check" onPress={save} />
      <QuestButton title={h('hb.cancel')} variant="ghost" onPress={onDone} />
    </View>
  );
}

/** Profile > Habits: tick the habits day by day, see how steady each one is week by week, and keep the list. */
export default function HabitsScreen() {
  const h = useHabitText();
  const insets = useSafeAreaInsets();
  useLightStatusBar();
  const habits = useHabitStore((s) => s.habits);
  const checks = useHabitStore((s) => s.checks);
  const setCheck = useHabitStore((s) => s.setCheck);
  const archiveHabit = useHabitStore((s) => s.archiveHabit);
  const nutritionLogs = useNutritionStore((s) => s.logs);
  const weights = useWeightStore((s) => s.entries);
  const workouts = useWorkoutStore((s) => s.entries);

  const todayKey = toDateKey(new Date());
  const [day, setDay] = useState(todayKey);
  const [editing, setEditing] = useState<{ habit: Habit | null } | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<string | null>(null);

  const active = useMemo(() => habits.filter((x) => !x.archived).sort((a, b) => a.sort - b.sort), [habits]);
  const tracked = useMemo(() => trackedHabits(habits), [habits]);
  const days = useMemo(() => Array.from({ length: DAYS_BACK }, (_, i) => addDaysToKey(todayKey, -i)), [todayKey]);
  const weeks = useMemo(() => buildHabitWeeks(checks, habits, todayKey), [checks, habits, todayKey]);
  const signals = useMemo(() => autoSignals(day, { waterMl: nutritionLogs[day]?.waterMl ?? 0, weights, workouts }), [day, nutritionLogs, weights, workouts]);
  const dayChecks = checks[day] ?? {};
  const ratio = dayRatio(checks, day, habits);
  const marked = tracked.filter((x) => dayChecks[x.id]).length;
  const done = tracked.filter((x) => dayChecks[x.id] === 'done').length;

  const stateText = (v: CheckValue | undefined) => h(v === 'done' ? 'hb.stateDone' : v === 'missed' ? 'hb.stateMissed' : 'hb.stateNone');

  return (
    <View style={styles.screen}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, screenMaxWidthStyle, { paddingTop: insets.top + 16 }]}>
        <QuestHeader title={h('hb.title')} onBack={goBack} backLabel={h('hb.back')} />

        {editing ? (
          <HabitForm key={editing.habit?.id ?? 'new'} habit={editing.habit} onDone={() => setEditing(null)} />
        ) : (
          <>
            <HudText size={17} accessibilityRole="header" style={styles.section}>
              {h('hb.checkTitle')}
            </HudText>
            <View style={styles.chips}>
              {days.map((d) => (
                <QuestChip key={d} label={d === todayKey ? h('hb.today') : fmtDayMonth(d)} selected={day === d} onPress={() => setDay(d)} accessibilityLabel={d === todayKey ? h('hb.today') : fmtDayMonth(d)} />
              ))}
            </View>

            {tracked.length === 0 ? (
              <HudText size={13} weight="medium" color={quest.textSecondary} style={styles.note}>
                {h('hb.noTracked')}
              </HudText>
            ) : (
              <View style={styles.card}>
                {tracked.map((habit) => {
                  const v = dayChecks[habit.id];
                  const run = streak(checks, habit.id, todayKey);
                  const signal = habit.auto ? signals[habit.auto] : null;
                  return (
                    <View key={habit.id} style={styles.checkRow}>
                      <View style={styles.flex}>
                        <HudText size={14}>{habit.name}</HudText>
                        {run >= 2 && (
                          <HudText size={11} weight="medium" color={quest.gold}>
                            {h('hb.streak', { n: run })}
                          </HudText>
                        )}
                        {habit.auto && signal !== null && (
                          <View style={styles.autoRow}>
                            <HudText size={11} weight="medium" color={signal ? quest.xp : quest.textSecondary}>
                              {signal ? h('hb.autoYes', { what: h(AUTO_WHAT[habit.auto]) }) : h('hb.autoNo', { what: h(AUTO_WHAT[habit.auto]) })}
                            </HudText>
                            {signal && v !== 'done' && (
                              <Pressable accessibilityRole="button" accessibilityLabel={`${h('hb.autoUse')}: ${habit.name}`} onPress={() => setCheck(day, habit.id, 'done')} style={styles.useAuto}>
                                <HudText size={11} color={quest.manaText}>
                                  {h('hb.autoUse')}
                                </HudText>
                              </Pressable>
                            )}
                          </View>
                        )}
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${habit.name}: ${stateText(v)}`}
                        onPress={() => setCheck(day, habit.id, nextValue(v))}
                        style={[styles.tick, v === 'done' && { backgroundColor: quest.xp, borderColor: quest.xp }, v === 'missed' && { backgroundColor: quest.hp, borderColor: quest.hp }]}
                      >
                        {v === 'done' && <QuestIcon name="check" size={20} color={quest.onGold} strokeWidth={3} />}
                        {v === 'missed' && <QuestIcon name="x" size={20} color={quest.text} strokeWidth={3} />}
                      </Pressable>
                    </View>
                  );
                })}
                <HudText size={12} weight="medium" color={ratio === null ? quest.textSecondary : ratio >= FORMED_RATE ? quest.xp : quest.gold}>
                  {ratio === null ? h('hb.dayNone') : h('hb.dayRatio', { p: pct(ratio), d: done, m: marked })}
                </HudText>
              </View>
            )}

            <HudText size={17} accessibilityRole="header" style={styles.section}>
              {h('hb.weeksTitle')}
            </HudText>
            {weeks.length === 0 ? (
              <HudText size={13} weight="medium" color={quest.textSecondary} style={styles.note}>
                {h('hb.weeksEmpty')}
              </HudText>
            ) : (
              weeks.map((w) => (
                <View key={w.weekStart} style={styles.card}>
                  <HudText size={15}>{h('hb.week', { from: fmtDayMonth(w.weekStart), to: fmtDayMonth(w.weekEnd) })}</HudText>
                  {w.weakest === null ? (
                    <HudText size={12} weight="medium" color={quest.textSecondary}>
                      {h('hb.weekEmpty')}
                    </HudText>
                  ) : (
                    <>
                      {w.rates
                        .filter((r) => r.rate !== null)
                        .map((r) => (
                          <HudText key={r.habit.id} size={12} weight="medium" color={r.rate! >= FORMED_RATE ? quest.xp : quest.gold}>
                            {h('hb.weekRow', { name: r.habit.name, done: r.done, total: r.done + r.missed, p: pct(r.rate!) })}
                          </HudText>
                        ))}
                      <HudText size={12} weight="medium" color={w.allFormed ? quest.xp : quest.hpText}>
                        {w.allFormed ? h('hb.weekAll') : h('hb.weekWeakest', { name: w.weakest.habit.name, p: pct(w.weakest.rate!) })}
                      </HudText>
                    </>
                  )}
                </View>
              ))
            )}
            <HudText size={11} weight="medium" color={quest.textSecondary} style={styles.note}>
              {h('hb.rule')}
            </HudText>

            <HudText size={17} accessibilityRole="header" style={styles.section}>
              {h('hb.listTitle')}
            </HudText>
            {active.length === 0 && (
              <HudText size={13} weight="medium" color={quest.textSecondary} style={styles.note}>
                {h('hb.listEmpty')}
              </HudText>
            )}
            {active.map((habit) => (
              <View key={habit.id} style={styles.card}>
                <View style={styles.headRow}>
                  <HudText size={14} style={styles.flex}>
                    {habit.name}
                  </HudText>
                  <HudText size={11} color={STATUS_COLOR[habit.status]}>
                    {h(STATUS_KEY[habit.status])}
                  </HudText>
                </View>
                {habit.assessment ? (
                  <HudText size={12} weight="medium" color={quest.textSecondary}>
                    {habit.assessment}
                  </HudText>
                ) : null}
                {habit.kaizen ? (
                  <HudText size={12} weight="medium" color={quest.text}>
                    {`${h('hb.kaizen')}: ${habit.kaizen}`}
                  </HudText>
                ) : null}
                {habit.measuredBy ? (
                  <HudText size={11} weight="medium" color={quest.textSecondary}>
                    {`${h('hb.measured')}: ${habit.measuredBy}`}
                  </HudText>
                ) : null}
                {!habit.tracked && (
                  <HudText size={11} weight="medium" color={quest.textSecondary}>
                    {h('hb.untracked')}
                  </HudText>
                )}
                <View style={styles.chips}>
                  <QuestChip label={h('hb.edit')} accessibilityLabel={`${h('hb.edit')}: ${habit.name}`} onPress={() => setEditing({ habit })} />
                  <QuestChip
                    label={confirmArchive === habit.id ? h('hb.archiveConfirm') : h('hb.archive')}
                    accessibilityLabel={`${confirmArchive === habit.id ? h('hb.archiveConfirm') : h('hb.archive')}: ${habit.name}`}
                    tone="mana"
                    onPress={() => (confirmArchive === habit.id ? archiveHabit(habit.id) : setConfirmArchive(habit.id))}
                  />
                </View>
              </View>
            ))}
            <View style={styles.addRow}>
              <QuestButton title={h('hb.add')} icon="plus" variant="ghost" onPress={() => setEditing({ habit: null })} />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: quest.bg },
  content: { paddingHorizontal: 16, paddingBottom: 120 },
  section: { marginTop: 20, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  note: { marginTop: 8 },
  flex: { flex: 1, minWidth: 0 },
  card: { marginTop: 8, gap: 6, padding: 14, borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 4 },
  tick: { width: 44, height: 44, borderRadius: 12, borderWidth: 2, borderColor: quest.border, backgroundColor: quest.bg, alignItems: 'center', justifyContent: 'center' },
  autoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  useAuto: { minHeight: 32, justifyContent: 'center' },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addRow: { marginTop: 14 },
  form: { marginTop: 16, gap: 12 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
});
