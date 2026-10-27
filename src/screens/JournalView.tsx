import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FoodThumb } from '../components/quest/FoodPhoto';
import { HudText } from '../components/quest/HudText';
import { MealDetailDialog, type MealDetail } from '../components/quest/MealDetailDialog';
import { MoodFace } from '../components/quest/MoodFace';
import { QuestHeader } from '../components/quest/QuestHeader';
import { QuestIcon } from '../components/quest/QuestIcon';
import { getDayType } from '../constants/plan';
import { useGameText, type GameKey } from '../game/strings';
import { buildTimeline, type TimelineItem } from '../game/timeline';
import { buildDayEvaluator } from '../game/dayEvaluator';
import { useDayEvaluator, useNow } from '../game/useGameState';
import type { ClientSnapshot } from '../coach/clientSnapshot';
import type { StringKey } from '../i18n/strings';
import { useTranslation } from '../i18n/useTranslation';
import { useFeelingStore } from '../store/useFeelingStore';
import { useNutritionStore } from '../store/useNutritionStore';
import { usePlanStore } from '../store/usePlanStore';
import { extraProofRef } from '../types';
import { useProofStore } from '../store/useProofStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useWorkoutStore } from '../store/useWorkoutStore';
import { quest, questRadius } from '../theme/quest';
import { screenMaxWidthStyle } from '../theme/responsive';
import { useLightStatusBar } from '../theme/useLightStatusBar';
import { toDateKey } from '../utils/date';
import { isoWeekNumber } from '../utils/isoWeek';
import { addDays } from '../utils/milestones';
import { weekStartKey } from '../utils/weekKey';

const MOOD_LABEL: Record<string, StringKey> = {
  great: 'feeling.moodGreat',
  good: 'feeling.moodGood',
  neutral: 'feeling.moodNeutral',
  stressed: 'feeling.moodStressed',
  tired: 'feeling.moodTired',
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
function clock(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}
function dateOf(key: string): Date {
  return new Date(`${key}T12:00:00`);
}
function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)');
}

type Translate = (key: GameKey, params?: Record<string, string | number>) => string;

function Chip({ label, tone }: { label: string; tone: 'ok' | 'mana' | 'gold' | 'muted' | 'hp' }) {
  const palette = {
    ok: { bg: quest.xp, fg: quest.onGold, border: quest.xp },
    mana: { bg: quest.manaPanel, fg: quest.manaText, border: quest.manaBorder },
    gold: { bg: 'transparent', fg: quest.goldLight, border: quest.gold },
    muted: { bg: 'transparent', fg: quest.textSecondary, border: quest.border },
    hp: { bg: 'transparent', fg: quest.hpText, border: quest.bossBorder },
  }[tone];
  return (
    <View style={[styles.chip, { backgroundColor: palette.bg, borderColor: palette.border }]}>
      <HudText size={11} color={palette.fg}>
        {label}
      </HudText>
    </View>
  );
}

function Marker({ item }: { item: TimelineItem }) {
  if (item.kind === 'now') return <View style={[styles.diamond, { borderColor: quest.gold, backgroundColor: quest.bg, borderWidth: 2.5 }]} />;
  let color: string = quest.gold;
  let hollow = false;
  if (item.kind === 'water') {
    color = quest.mana;
    hollow = !item.reached;
  } else if (item.kind === 'workout') color = quest.hp;
  else if (item.kind === 'feeling') color = quest.xp;
  else if (item.kind === 'meal') hollow = !item.eaten;
  return (
    <View
      style={[
        styles.diamond,
        hollow ? { borderColor: item.kind === 'water' && item.past ? quest.textSecondary : color, borderWidth: 2, backgroundColor: quest.bg } : { backgroundColor: color, borderColor: color },
      ]}
    />
  );
}

interface RowProps {
  item: TimelineItem;
  g: Translate;
  t: (key: StringKey) => string;
  proteinTargetG: number;
  workoutXpFor: string | null;
  isToday: boolean;
  onOpen: (item: TimelineItem) => void;
}

function TimelineRow({ item, g, t, proteinTargetG, workoutXpFor, isToday, onOpen }: RowProps) {
  let body: React.ReactNode = null;
  let label = '';
  let onPress: (() => void) | undefined;

  if (item.kind === 'now') {
    body = (
      <View style={styles.nowLine}>
        <HudText size={12} color={quest.gold} style={styles.nowText}>
          {g('journal.now').toUpperCase()}
        </HudText>
      </View>
    );
    label = g('journal.now');
  } else if (item.kind === 'water') {
    label = g('journal.water', { ml: item.incrementMl });
    body = (
      <View style={styles.simple}>
        <QuestIcon name="drop" size={16} color={item.reached ? quest.mana : quest.textSecondary} />
        <HudText size={14} weight="medium" color={item.reached ? quest.text : quest.textSecondary} style={styles.flex}>
          {label}
        </HudText>
        <Chip tone={item.reached ? 'mana' : 'muted'} label={`${item.reached ? '' : '→ '}${(item.cumulativeMl / 1000).toFixed(1)} L`} />
      </View>
    );
  } else if (item.kind === 'meal') {
    const status = item.eaten ? 'journal.mealDone' : item.past ? 'journal.mealNotLogged' : 'journal.mealPending';
    label = `${item.label}. ${g(status)}`;
    if (isToday) onPress = () => router.push(`/meal/${item.slot}`);
    else if (item.eaten) onPress = () => onOpen(item);
    body = (
      <View style={[styles.card, item.eaten ? styles.cardMeal : styles.cardPending]}>
        <View style={styles.cardHead}>
          <HudText size={14} style={styles.flex}>
            {item.label}
          </HudText>
          {item.hasPhoto && <Chip tone="muted" label={g('journal.photo')} />}
          <Chip tone={item.eaten ? 'ok' : 'muted'} label={g(status)} />
        </View>
        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {g('journal.mealMeta', { kcal: item.kcal, protein: item.proteinG, n: item.itemCount })}
        </HudText>
        {item.proteinSoFarG != null && (
          <View style={styles.tagRow}>
            <Chip tone="ok" label={g('journal.proteinSoFar', { cur: Math.round(item.proteinSoFarG), target: Math.round(proteinTargetG) })} />
          </View>
        )}
      </View>
    );
  } else if (item.kind === 'extra') {
    const name = item.name || g('journal.extra');
    label = `${name}. ${item.kcal} kcal`;
    onPress = () => onOpen(item);
    body = (
      <View style={[styles.card, styles.cardMeal]}>
        <View style={styles.cardHead}>
          <HudText size={14} style={styles.flex}>
            {name}
          </HudText>
          {item.junk && <Chip tone="gold" label={g('journal.junk')} />}
          <FoodThumb uri={item.photoUri} name={name} size={36} />
        </View>
        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {item.kcal} kcal · {Math.round(item.proteinG)} g
        </HudText>
        <HudText size={11} weight="medium" color={quest.textSecondary}>
          {g('journal.extraNutrients', { purine: Math.round(item.purineMg), sugar: Math.round(item.sugarG * 10) / 10, salt: Math.round(item.saltG * 10) / 10 })}
        </HudText>
      </View>
    );
  } else if (item.kind === 'workout') {
    label = `${item.label}. ${g('journal.workoutMeta', { min: item.durationMin, kcal: item.kcal })}`;
    body = (
      <View style={[styles.card, styles.cardWorkout]}>
        <View style={styles.cardHead}>
          <QuestIcon name="dumbbell" size={16} color={quest.hpText} />
          <HudText size={14} style={styles.flex}>
            {item.label}
          </HudText>
          {workoutXpFor === item.id && <Chip tone="ok" label="+60 XP" />}
        </View>
        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {g('journal.workoutMeta', { min: item.durationMin, kcal: item.kcal })}
        </HudText>
      </View>
    );
  } else {
    const mood = t(MOOD_LABEL[item.mood]);
    label = `${g('journal.checkin')}. ${g('journal.checkinMeta', { mood, c: item.cravingLevel, h: item.hungerLevel })}`;
    body = (
      <View style={styles.simple}>
        <MoodFace mood={item.mood} size={22} color={quest.xp} />
        <View style={styles.flex}>
          <HudText size={13} weight="semibold">
            {g('journal.checkin')}
          </HudText>
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {g('journal.checkinMeta', { mood, c: item.cravingLevel, h: item.hungerLevel })}
          </HudText>
        </View>
      </View>
    );
  }

  const content = (
    <View style={styles.row}>
      <HudText size={12} weight="medium" color={item.kind === 'now' ? quest.gold : quest.textSecondary} style={styles.time}>
        {item.kind === 'now' ? '' : clock(item.minutes)}
      </HudText>
      <View style={styles.markerCol}>
        <View style={styles.rail} />
        <Marker item={item} />
      </View>
      <View style={styles.flex}>{body}</View>
    </View>
  );

  const dimmed = item.kind === 'water' && !item.reached && item.past;
  const wrapped = <View style={dimmed ? { opacity: 0.6 } : undefined}>{content}</View>;
  if (onPress) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={`${clock(item.minutes)} ${label}`} onPress={onPress}>
        {wrapped}
      </Pressable>
    );
  }
  return (
    <View accessible accessibilityLabel={item.kind === 'now' ? label : `${clock(item.minutes)} ${label}`}>
      {wrapped}
    </View>
  );
}

export function JournalView({ client }: { client?: ClientSnapshot }) {
  const g = useGameText();
  const { t, language } = useTranslation();
  const insets = useSafeAreaInsets();
  useLightStatusBar();
  const now = useNow();
  const ownEvaluate = useDayEvaluator(now);
  const todayKey = toDateKey(now);
  const locale = language === 'en' ? 'en-US' : 'vi-VN';

  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedKey, setSelectedKey] = useState(todayKey);

  // A coach looking at a client reads the client's records; otherwise the signed-in user's own.
  const ownLogs = useNutritionStore((s) => s.logs);
  const ownWorkouts = useWorkoutStore((s) => s.entries);
  const ownFeelings = useFeelingStore((s) => s.records);
  const ownPhotos = useProofStore((s) => s.photos);
  const ownMealTemplates = usePlanStore((s) => s.plan.mealTemplates);
  const ownWaterSchedule = usePlanStore((s) => s.plan.waterSchedule);
  const ownProteinTargetG = useSettingsStore((s) => s.proteinTargetG);
  const ownWaterTargetMl = useSettingsStore((s) => s.waterTargetMl);
  const logs = client?.logs ?? ownLogs;
  const workoutEntries = client?.workouts ?? ownWorkouts;
  const feelings = client?.feelings ?? ownFeelings;
  const photos = client?.photos ?? ownPhotos;
  const mealTemplates = client?.plan.mealTemplates ?? ownMealTemplates;
  const waterSchedule = client?.plan.waterSchedule ?? ownWaterSchedule;
  const proteinTargetG = client?.settings.proteinTargetG ?? ownProteinTargetG;
  const waterTargetMl = client?.settings.waterTargetMl ?? ownWaterTargetMl;
  const minuteStamp = Math.floor(now.getTime() / 60_000);
  const evaluate = useMemo(
    () =>
      client
        ? buildDayEvaluator({
            now: new Date(minuteStamp * 60_000),
            logs: client.logs,
            workouts: client.workouts,
            mealTemplatesByDayType: client.plan.mealTemplates,
            tdeeKcal: client.tdeeKcal,
            proteinTargetG: client.settings.proteinTargetG,
            limits: client.limits,
          })
        : ownEvaluate,
    [client, minuteStamp, ownEvaluate]
  );

  const monday = useMemo(() => dateOf(weekStartKey(addDays(now, weekOffset * 7))), [now, weekOffset]);
  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const date = addDays(monday, i);
        const key = toDateKey(date);
        const future = key > todayKey;
        const deficit = future ? null : evaluate(key).deficitKcal;
        return { key, date, future, deficit };
      }),
    [monday, todayKey, evaluate]
  );

  function shiftWeek(delta: number) {
    const nextOffset = Math.min(0, weekOffset + delta);
    if (nextOffset === weekOffset) return;
    const nextMonday = dateOf(weekStartKey(addDays(now, nextOffset * 7)));
    const sameWeekday = toDateKey(addDays(nextMonday, (dateOf(selectedKey).getDay() + 6) % 7));
    setWeekOffset(nextOffset);
    setSelectedKey(sameWeekday > todayKey ? todayKey : sameWeekday);
  }

  const selectedDate = useMemo(() => dateOf(selectedKey), [selectedKey]);
  const isToday = selectedKey === todayKey;
  const day = evaluate(selectedKey);
  const waterMl = logs[selectedKey]?.waterMl ?? 0;

  const timeline = useMemo(() => {
    const photoSlots = new Set(
      photos.filter((p) => p.taskType === 'meal' && toDateKey(new Date(p.dateISO)) === selectedKey).map((p) => p.taskRefId)
    );
    return buildTimeline({
      dateKey: selectedKey,
      now,
      log: logs[selectedKey],
      meals: mealTemplates[getDayType(selectedDate)],
      waterSchedule,
      workouts: workoutEntries.filter((w) => toDateKey(new Date(w.dateISO)) === selectedKey),
      feelings,
      photoSlots,
    });
  }, [selectedKey, now, logs, mealTemplates, waterSchedule, workoutEntries, feelings, photos, selectedDate]);

  // The "+60 XP" chip goes on the first workout of the day, and only when that mission was earned.
  const workoutMissionDone = day.missions.find((m) => m.id === 'workout')?.status === 'done';
  const firstWorkout = timeline.find((i) => i.kind === 'workout');
  const workoutXpFor = workoutMissionDone && firstWorkout ? firstWorkout.id : null;

  const [detail, setDetail] = useState<MealDetail | null>(null);
  function openDetail(item: TimelineItem) {
    if (item.kind === 'extra') {
      const rawId = item.id.replace(/^extra-/, '');
      const proof = photos.find((p) => p.taskRefId === extraProofRef(rawId));
      setDetail({
        title: item.name || g('journal.extra'),
        time: clock(item.minutes),
        kcal: item.kcal,
        proteinG: item.proteinG,
        purineMg: item.purineMg,
        sugarG: item.sugarG,
        saltG: item.saltG,
        parts: item.parts,
        photoUri: item.photoUri ?? proof?.photoUri ?? null,
      });
    } else if (item.kind === 'meal') {
      const proof = photos.find((p) => p.taskType === 'meal' && p.taskRefId === item.slot && toDateKey(new Date(p.dateISO)) === selectedKey);
      setDetail({ title: item.label, time: clock(item.minutes), kcal: item.kcal, proteinG: item.proteinG, purineMg: null, sugarG: null, saltG: null, photoUri: proof?.photoUri ?? null });
    }
  }

  const weekdayLabel = (d: Date) => g(`weekday.${d.getDay()}` as GameKey);
  const dateLabel = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  const eyebrow = g('journal.eyebrow', {
    date: selectedDate.toLocaleDateString(locale, { weekday: 'long', day: '2-digit', month: '2-digit' }),
    week: isoWeekNumber(selectedDate),
  });

  const stats = [
    { label: g('journal.eaten'), value: Math.round(day.eatenKcal).toLocaleString('en-US'), color: quest.text, accent: false },
    { label: g('journal.burned'), value: Math.round(day.burnedKcal).toLocaleString('en-US'), color: quest.hpText, accent: false },
    {
      label: g('journal.deficit'),
      value: day.deficitKcal == null ? '—' : Math.round(day.deficitKcal).toLocaleString('en-US'),
      color: quest.gold,
      accent: true,
    },
    { label: g('journal.xp'), value: `+${day.earnedXp}`, color: quest.xp, accent: false },
  ];

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, screenMaxWidthStyle, { paddingTop: insets.top + 16 }]}>
        <QuestHeader title={client ? `${g('journal.title')} · ${client.displayName}` : g('journal.title')} eyebrow={eyebrow} onBack={goBack} backLabel={g('common.back')} />

        <View style={styles.stripWrap}>
          <Pressable accessibilityRole="button" accessibilityLabel={g('journal.prevWeek')} onPress={() => shiftWeek(-1)} style={styles.arrow}>
            <QuestIcon name="back" size={18} color={quest.text} strokeWidth={2.4} />
          </Pressable>
          <View style={styles.strip}>
            {days.map((d) => {
              const selected = d.key === selectedKey;
              const wd = weekdayLabel(d.date);
              const dl = dateLabel(d.date);
              const a11y = d.future
                ? `${wd} ${dl}`
                : d.deficit == null
                  ? g('journal.dayNoData', { weekday: wd, date: dl })
                  : g('journal.day', { weekday: wd, date: dl, deficit: Math.round(d.deficit ?? 0) });
              return (
                <Pressable
                  key={d.key}
                  accessibilityRole="button"
                  accessibilityLabel={a11y}
                  accessibilityState={{ selected, disabled: d.future }}
                  disabled={d.future}
                  onPress={() => setSelectedKey(d.key)}
                  style={[
                    styles.dayCell,
                    selected ? { backgroundColor: quest.gold, borderColor: quest.gold } : { backgroundColor: quest.panel, borderColor: quest.border },
                    d.future && { borderStyle: 'dashed', opacity: 0.55 },
                  ]}
                >
                  <HudText size={11} weight="medium" color={selected ? quest.onGold : quest.textSecondary}>
                    {wd}
                  </HudText>
                  <HudText size={18} color={selected ? quest.onGold : quest.text}>
                    {d.date.getDate()}
                  </HudText>
                  <HudText size={10} weight="medium" color={selected ? quest.onGold : quest.hpText}>
                    {d.future ? '·' : d.deficit == null ? '–' : Math.round(d.deficit).toLocaleString('en-US')}
                  </HudText>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={g('journal.nextWeek')}
            accessibilityState={{ disabled: weekOffset === 0 }}
            disabled={weekOffset === 0}
            onPress={() => shiftWeek(1)}
            style={[styles.arrow, weekOffset === 0 && { opacity: 0.35 }]}
          >
            <View style={{ transform: [{ rotate: '180deg' }] }}>
              <QuestIcon name="back" size={18} color={quest.text} strokeWidth={2.4} />
            </View>
          </Pressable>
        </View>

        <View style={styles.stats}>
          {stats.map((s) => (
            <View key={s.label} accessible accessibilityLabel={`${s.label} ${s.value}`} style={[styles.stat, s.accent && { borderColor: quest.gold }]}>
              <HudText size={11} weight="medium" color={quest.textSecondary}>
                {s.label}
              </HudText>
              <HudText size={18} color={s.color}>
                {s.value}
              </HudText>
            </View>
          ))}
        </View>

        <View
          accessible
          accessibilityLabel={`${g('journal.waterTotal')} ${g('journal.waterTotalValue', { cur: (waterMl / 1000).toFixed(1), target: (waterTargetMl / 1000).toFixed(1) })}`}
          style={styles.waterBar}
        >
          <QuestIcon name="drop" size={16} color={quest.mana} />
          <HudText size={13} weight="medium" color={quest.textSecondary} style={styles.flex}>
            {g('journal.waterTotal')}
          </HudText>
          <Chip tone={waterMl >= waterTargetMl ? 'mana' : 'muted'} label={g('journal.waterTotalValue', { cur: (waterMl / 1000).toFixed(1), target: (waterTargetMl / 1000).toFixed(1) })} />
        </View>

        <View style={styles.sectionHead}>
          <HudText size={17} accessibilityRole="header">
            {g('journal.timeline')}
          </HudText>
          <HudText size={11} weight="medium" color={quest.textSecondary}>
            {g('journal.legend')}
          </HudText>
        </View>

        <View style={styles.timeline}>
          {timeline.map((item) => (
            <TimelineRow key={item.id} item={item} g={g} t={t} proteinTargetG={proteinTargetG} workoutXpFor={workoutXpFor} isToday={isToday && !client} onOpen={openDetail} />
          ))}
        </View>

        <HudText size={11} weight="medium" color={quest.textSecondary} style={styles.note}>
          {g('journal.waterNote')}
        </HudText>
      </ScrollView>
      <MealDetailDialog detail={detail} onClose={() => setDetail(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: quest.bg },
  content: { paddingHorizontal: 16, paddingBottom: 32 },
  flex: { flex: 1, minWidth: 0 },
  stripWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 },
  arrow: { width: 32, height: 64, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  strip: { flex: 1, flexDirection: 'row', gap: 4 },
  dayCell: { flex: 1, minHeight: 68, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', gap: 1, paddingVertical: 4 },
  stats: { flexDirection: 'row', gap: 8, marginTop: 12 },
  stat: { flex: 1, minWidth: 0, padding: 10, gap: 2, borderRadius: questRadius.row, backgroundColor: quest.panel, borderWidth: 1.5, borderColor: quest.border, alignItems: 'center' },
  waterBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, padding: 10, borderRadius: questRadius.row, backgroundColor: quest.panel, borderWidth: 1.5, borderColor: quest.border },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 20, marginBottom: 8 },
  timeline: { marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 5 },
  time: { width: 42, paddingTop: 2, textAlign: 'right' },
  markerCol: { width: 18, alignSelf: 'stretch', alignItems: 'center' },
  rail: { position: 'absolute', top: -6, bottom: -6, width: 2, backgroundColor: quest.border },
  diamond: { width: 12, height: 12, marginTop: 4, borderRadius: 3, borderWidth: 2, transform: [{ rotate: '45deg' }] },
  simple: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28 },
  card: { padding: 10, gap: 4, borderRadius: questRadius.row, borderWidth: 1.5 },
  cardMeal: { backgroundColor: quest.raised, borderColor: quest.border },
  cardPending: { backgroundColor: 'transparent', borderColor: quest.gold, borderStyle: 'dashed' },
  cardWorkout: { backgroundColor: quest.bossPanel, borderColor: quest.bossBorder },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  chip: { paddingHorizontal: 8, minHeight: 22, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  nowLine: { borderTopWidth: 1.5, borderTopColor: quest.gold, borderStyle: 'dashed', paddingTop: 4, marginTop: 4 },
  nowText: { letterSpacing: 1.6 },
  note: { marginTop: 16, textAlign: 'center' },
});
