import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { DailyMealBreakdownTable } from '../components/DailyMealBreakdownTable';
import { InfoButton } from '../components/quest/InfoButton';
import { NutrientTable } from '../components/quest/NutrientTable';
import { FoodThumb } from '../components/quest/FoodPhoto';
import { HudText } from '../components/quest/HudText';
import { MealDetailDialog, type MealDetail } from '../components/quest/MealDetailDialog';
import { WorkoutDetailDialog } from '../components/quest/WorkoutDetailDialog';
import { MoodFace } from '../components/quest/MoodFace';
import { QuestIcon } from '../components/quest/QuestIcon';
import { getDayType } from '../constants/plan';
import { useGameText, type GameKey } from '../game/strings';
import { buildTimeline, type TimelineItem } from '../game/timeline';
import { buildDayEvaluator } from '../game/dayEvaluator';
import { editListedPartPatch, partsOrSelf } from '../food/singlePart';
import { useDayEvaluator, useLimits, useNow, useTdeeKcal } from '../game/useGameState';
import type { ClientSnapshot } from '../coach/clientSnapshot';
import type { StringKey } from '../i18n/strings';
import { useTranslation } from '../i18n/useTranslation';
import { useFeelingStore } from '../store/useFeelingStore';
import { useNutritionStore } from '../store/useNutritionStore';
import { usePlanStore } from '../store/usePlanStore';
import type { MealPart, MealSlot } from '../types';
import type { MissionId } from '../game/constants';
import { PLAN_SLOT_MEAL } from '../insights/days';
import { isSkippedMealItem, logSkippedMeal } from '../food/skipMeal';
import { deleteExtraWithUndo, logExtraAgain, unmarkPlanMealWithUndo } from '../food/mealActions';
import { mealTimeAt } from '../food/eatAgain';
import { mealCaption } from '../utils/mealCaption';
import { useProofStore } from '../store/useProofStore';
import { selectedDayKey, useSelectedDayStore } from '../store/useSelectedDayStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useCheatDayStore } from '../store/useCheatDayStore';
import { DEFICIT_LEVEL_COLOR, deficitColor, deficitLevel, type DeficitLevel } from '../game/deficitLevel';
import { LIMITS } from '../game/constants';
import { shownDeficit } from '../game/deficitView';
import { DayDeficitNotes } from '../components/quest/DayDeficitNotes';
import { useWorkoutStore } from '../store/useWorkoutStore';
import { quest, questRadius } from '../theme/quest';
import { toDateKey } from '../utils/date';
import { addExtraPhoto, addSlotPhoto, removeExtraPhoto } from '../utils/mealPhotos';
import { extraPhotoRefs, slotPhotoRefs, type MealPhotoRef } from '../utils/photoOrder';
import { DEFAULT_WATER_END_MIN, DEFAULT_WATER_START_MIN, dayWaterTargetMl } from '../water/schedule';
import { useWaterPlan, waterPlanFor } from '../water/useWaterPlan';

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
  /** Small photo of the logged meal, when it has one on this device. */
  /** The meal's photos, first one first (shown as one thumbnail with a "several photos" badge). */
  thumbs: string[];
  /** A plan meal with nothing logged can be marked "Không ăn" (offer), or already is (skipped, can be undone). Off for a coach. */
  skip?: { state: 'offer' | 'skipped'; onSkip: () => void; onUndo: () => void };
}

function TimelineRow({ item, g, t, proteinTargetG, workoutXpFor, isToday, onOpen, thumbs, skip }: RowProps) {
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
    const status = item.eaten ? 'journal.mealDone' : skip?.state === 'skipped' ? 'journal.mealSkipped' : item.past ? 'journal.mealNotLogged' : 'journal.mealPending';
    label = `${item.label}. ${g(status)}`;
    if (isToday) onPress = () => router.push(`/meal/${item.slot}`);
    else if (item.eaten) onPress = () => onOpen(item);
    body = (
      <View style={[styles.card, item.eaten ? styles.cardMeal : styles.cardPending]}>
        <View style={styles.cardHead}>
          <HudText size={14} style={styles.flex}>
            {item.label}
          </HudText>
          {thumbs.length > 0 ? <FoodThumb uris={thumbs} name={item.label} size={36} caption={`${t(`extraMealTime.${PLAN_SLOT_MEAL[item.slot]}` as StringKey)} · ${clock(item.minutes)}`} /> : item.hasPhoto && <Chip tone="muted" label={g('journal.photo')} />}
          <Chip tone={item.eaten ? 'ok' : skip?.state === 'skipped' ? 'hp' : 'muted'} label={g(status)} />
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
          <FoodThumb uris={thumbs} name={name} size={36} caption={mealCaption(item.mealTime ? t(`extraMealTime.${item.mealTime}` as StringKey) : null, item.loggedAtISO)} />
        </View>
        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {g('journal.kcalProtein', { kcal: item.kcal, protein: Math.round(item.proteinG) })}
        </HudText>
        <HudText size={11} weight="medium" color={quest.textSecondary}>
          {g('journal.extraNutrients', { purine: Math.round(item.purineMg), sugar: Math.round(item.sugarG * 10) / 10, salt: Math.round(item.saltG * 10) / 10 })}
        </HudText>
      </View>
    );
  } else if (item.kind === 'workout') {
    label = `${clock(item.minutes)}–${clock(item.endMinutes)} ${item.label}. ${g('journal.workoutMeta', { min: item.durationMin, kcal: item.kcal })}. ${g('journal.wo.open')}`;
    onPress = () => onOpen(item);
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
          {`${clock(item.minutes)}–${clock(item.endMinutes)} · ${g('journal.workoutMeta', { min: item.durationMin, kcal: item.kcal })}${
            item.entryIds.length > 1 ? ` · ${g('journal.wo.count', { n: item.entryIds.length })}` : ''
          }`}
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
  // The "Không ăn" chip sits under the card, outside it: a button inside the tappable card would be a button in a button.
  const skipChip =
    skip && item.kind === 'meal' ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={g(skip.state === 'offer' ? 'journal.skipLabel' : 'journal.skipUndoLabel', { meal: item.label })}
        onPress={skip.state === 'offer' ? skip.onSkip : skip.onUndo}
        style={({ pressed }) => [styles.skipTarget, pressed && { opacity: 0.8 }]}
      >
        {/* 28 pt to look at, 44 pt to tap (the pressable around it). */}
        <View style={[styles.skipChip, skip.state === 'skipped' && styles.skipUndo]}>
          <QuestIcon name={skip.state === 'offer' ? 'x' : 'back'} size={12} color={skip.state === 'offer' ? quest.hpText : quest.textSecondary} strokeWidth={2.4} />
          <HudText size={11} color={skip.state === 'offer' ? quest.hpText : quest.textSecondary}>
            {g(skip.state === 'offer' ? 'journal.skip' : 'journal.skipUndo')}
          </HudText>
        </View>
      </Pressable>
    ) : null;
  if (onPress) {
    return (
      <View>
        <Pressable accessibilityRole="button" accessibilityLabel={`${clock(item.minutes)} ${label}`} onPress={onPress}>
          {wrapped}
        </Pressable>
        {skipChip}
      </View>
    );
  }
  if (skipChip) {
    return (
      <View>
        <View accessible accessibilityLabel={`${clock(item.minutes)} ${label}`}>
          {wrapped}
        </View>
        {skipChip}
      </View>
    );
  }
  return (
    <View accessible accessibilityLabel={item.kind === 'now' ? label : `${clock(item.minutes)} ${label}`}>
      {wrapped}
    </View>
  );
}

/** The selected day's deficit level ("Đạt", "Quá lố"…) in its colour, the colour key, and the cheat-day mark. */
function DeficitLevelRow({ level, target, cheat, onToggleCheat }: { level: DeficitLevel | null; target: number; cheat: boolean; onToggleCheat?: () => void }) {
  const g = useGameText();
  return (
    <View style={styles.levelRow}>
      <View style={styles.levelHead}>
        {level && (
          <View style={[styles.levelChip, { borderColor: DEFICIT_LEVEL_COLOR[level] }]}>
            <View style={[styles.levelDot, { backgroundColor: DEFICIT_LEVEL_COLOR[level] }]} />
            <HudText size={12} color={DEFICIT_LEVEL_COLOR[level]}>
              {g(`deficit.level.${level}` as GameKey)}
            </HudText>
          </View>
        )}
        <View style={styles.flex} />
        {onToggleCheat && (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityLabel={g('deficit.cheatMarkHint')}
            accessibilityState={{ checked: cheat }}
            onPress={() => {
              onToggleCheat();
            }}
            style={[styles.levelChip, { borderColor: cheat ? DEFICIT_LEVEL_COLOR.cheat : quest.border }]}
          >
            <HudText size={12} color={cheat ? DEFICIT_LEVEL_COLOR.cheat : quest.textSecondary}>
              {cheat ? '☑' : '☐'} {g('deficit.cheatMark')}
            </HudText>
          </Pressable>
        )}
      </View>
      <View style={styles.legendRow}>
        <HudText size={12} weight="medium" color={quest.textSecondary} style={styles.flex}>
          {g('deficit.legend', { target })}
        </HudText>
        {/* The full rules (⚠ warnings, the "not met" and "maintenance" bands, cheat day) cut in 0.28.0, behind ⓘ. */}
        <InfoButton label={g('journal2.legendInfo')} title={g('journal2.legendTitle')} text={g('journal2.legendFull', { target })} />
      </View>
    </View>
  );
}

export interface JournalViewProps {
  client?: ClientSnapshot;
  /** Camp's "Dòng thời gian" section: only the selected day's timeline (no figures, colour key, nutrient table or water rows: Camp's
   *  hero card and tiles show those, the full day is a tap away). */
  embedded?: boolean;
  /** The day shown (Journal › Ngày passes the day its date chip picked). Leave out for the app-wide selected day. */
  dayKey?: string;
  /** A mission opened from Camp (Đạm, Purine, Muối, Đường, Ăn vặt): its row of the nutrient table is lit, with a cook-book link. */
  focus?: MissionId;
  /** Where the nutrient table sits in this view (y in px), so the screen can scroll to it. */
  onTableLayout?: (y: number) => void;
}

/** One day of the Journal (Journal › Ngày): the four numbers, the deficit with its rules (estimate, meal missing ⚠, skip, cheat day),
 *  the day's water, the timeline (meals with photos, water, workouts, check-in), the nutrient table against the limits and the
 *  editable meal table. `embedded`: Camp's timeline only. Not a screen of its own: `JournalScreen` frames and scrolls it. */
export function JournalView({ client, embedded, dayKey, focus, onTableLayout }: JournalViewProps) {
  const g = useGameText();
  const { t, language } = useTranslation();
  const now = useNow();
  const ownEvaluate = useDayEvaluator(now);
  const todayKey = toDateKey(now);

  // The user's own selected day is shared (the quick-add sheet and the check-in start on it); a coach's view of a client keeps its own.
  const [clientSelectedKey] = useState(todayKey);
  const storedSelectedKey = useSelectedDayStore((s) => s.selectedKey);
  const shownKey = dayKey ?? (client ? clientSelectedKey : selectedDayKey(storedSelectedKey, now));
  const selectedKey = shownKey > todayKey ? todayKey : shownKey;

  // A coach looking at a client reads the client's records; otherwise the signed-in user's own.
  const ownLogs = useNutritionStore((s) => s.logs);
  const ownWorkouts = useWorkoutStore((s) => s.entries);
  const ownFeelings = useFeelingStore((s) => s.records);
  const ownPhotos = useProofStore((s) => s.photos);
  const ownMealTemplates = usePlanStore((s) => s.plan.mealTemplates);
  const ownProteinTargetG = useSettingsStore((s) => s.proteinTargetG);
  const logs = client?.logs ?? ownLogs;
  const workoutEntries = client?.workouts ?? ownWorkouts;
  const feelings = client?.feelings ?? ownFeelings;
  const photos = client?.photos ?? ownPhotos;
  const mealTemplates = client?.plan.mealTemplates ?? ownMealTemplates;
  const proteinTargetG = client?.settings.proteinTargetG ?? ownProteinTargetG;
  const ownDeficitTarget = useSettingsStore((s) => s.targetDailyDeficitKcal);
  const deficitTarget = client?.settings.targetDailyDeficitKcal ?? ownDeficitTarget;
  // Cheat days are the user's own marks (a coach's view has none).
  const ownCheatDays = useCheatDayStore((s) => s.days);
  const toggleCheat = useCheatDayStore((s) => s.toggle);
  const cheatDays = useMemo(() => (client ? [] : ownCheatDays), [client, ownCheatDays]);
  const ownTdeeKcal = useTdeeKcal();
  const tdeeKcal = client?.tdeeKcal ?? ownTdeeKcal;
  // The day's exercise splits off the deficit from eating (warned about above 1500 kcal); the TDEE sets the whole-day warning.
  const levelOf = (key: string, deficit: number | null | undefined) =>
    deficitLevel(deficit, deficitTarget, cheatDays.includes(key), { burnedKcal: evaluate(key).burnedKcal, tdeeKcal });
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

  const selectedDate = useMemo(() => dateOf(selectedKey), [selectedKey]);
  const isToday = selectedKey === todayKey;
  const day = evaluate(selectedKey);
  const waterMl = logs[selectedKey]?.waterMl ?? 0;
  // The water plan of the selected day, from that day's own target (a past day keeps the one it was lived under). A client's
  // drinking window is not shared, so a coach sees the client's target spread over the default window.
  const ownWater = useWaterPlan(selectedKey);
  const clientWater = useMemo(
    () =>
      client
        ? waterPlanFor({
            targetMl: dayWaterTargetMl(client.logs[selectedKey], client.settings.waterTargetMl),
            date: selectedDate,
            plan: client.plan,
            startMinutes: DEFAULT_WATER_START_MIN,
            endMinutes: DEFAULT_WATER_END_MIN,
            fasting: false,
            language,
          })
        : null,
    [client, selectedKey, selectedDate, language]
  );
  const { targetMl: waterTargetMl, schedule: waterSchedule } = clientWater ?? ownWater;

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

  // A plan meal with nothing logged for its main meal can be marked "Không ăn" right on the timeline (own diary, not a future day). The
  // "Không ăn" item then shows as the plan meal's status instead of a row of its own.
  const dayExtras = logs[selectedKey]?.extraItems ?? [];
  const removeExtraItem = useNutritionStore((s) => s.removeExtraItem);
  const planMeals = new Set(timeline.flatMap((i) => (i.kind === 'meal' ? [PLAN_SLOT_MEAL[i.slot]] : [])));
  const skippedIds = new Set(dayExtras.filter((i) => isSkippedMealItem(i) && i.mealTime && planMeals.has(i.mealTime as never)).map((i) => i.id));
  const visibleTimeline = timeline.filter((i) => !(i.kind === 'extra' && skippedIds.has(i.id.slice('extra-'.length))));
  function skipFor(slot: MealSlot, eaten: boolean): RowProps['skip'] {
    if (client || eaten || selectedKey > todayKey) return undefined;
    const meal = PLAN_SLOT_MEAL[slot];
    const skipped = dayExtras.find((i) => i.mealTime === meal && isSkippedMealItem(i));
    if (skipped) return { state: 'skipped', onSkip: () => {}, onUndo: () => removeExtraItem(selectedKey, skipped.id) };
    if (dayExtras.some((i) => i.mealTime === meal)) return undefined; // something was eaten at that meal
    return { state: 'offer', onSkip: () => logSkippedMeal(selectedKey, meal), onUndo: () => {} };
  }

  // The "+60 XP" chip goes on the first workout of the day, and only when that mission was earned.
  const workoutMissionDone = day.missions.find((m) => m.id === 'workout')?.status === 'done';
  const firstWorkout = timeline.find((i) => i.kind === 'workout');
  const workoutXpFor = workoutMissionDone && firstWorkout ? firstWorkout.id : null;

  // The open meal is looked up again on every render, so an edit (an amount, the photo) shows in the dialog at once.
  const [openId, setOpenId] = useState<string | null>(null);
  const updateExtra = useNutritionStore((s) => s.updateExtra);
  const removeProof = useProofStore((s) => s.removeProof);
  const openItem = openId ? timeline.find((i) => i.id === openId) : undefined;
  const dayPhotos = useMemo(() => photos.filter((p) => p.taskType === 'meal' && toDateKey(new Date(p.dateISO)) === selectedKey), [photos, selectedKey]);
  const rawExtraId = (item: { id: string }) => item.id.replace(/^extra-/, '');
  function photosOf(item: TimelineItem): MealPhotoRef[] {
    if (item.kind === 'meal') return slotPhotoRefs(dayPhotos, selectedKey, item.slot);
    if (item.kind === 'extra') return extraPhotoRefs(photos, { id: rawExtraId(item), photoUri: item.photoUri });
    return [];
  }
  function openDetail(item: TimelineItem) {
    if (item.kind === 'extra' || item.kind === 'meal') setOpenId(item.id);
    if (item.kind === 'workout') setOpenWorkout(item.entryIds);
  }
  const [openWorkout, setOpenWorkout] = useState<string[] | null>(null);
  const openWorkoutEntries = openWorkout
    ? workoutEntries.filter((w) => openWorkout.includes(w.id)).sort((a, b) => Date.parse(a.dateISO) - Date.parse(b.dateISO))
    : null;
  let detail: MealDetail | null = null;
  if (openItem?.kind === 'extra') {
    // A meal saved as one food lists itself as its one part, so it reads (and its amount changes) like a meal of several.
    const stored = logs[selectedKey]?.extraItems?.find((i) => i.id === rawExtraId(openItem));
    detail = {
      title: openItem.name || g('journal.extra'),
      time: clock(openItem.minutes),
      meal: openItem.mealTime ? t(`extraMealTime.${openItem.mealTime}` as StringKey) : undefined,
      kcal: openItem.kcal,
      proteinG: openItem.proteinG,
      purineMg: openItem.purineMg,
      sugarG: openItem.sugarG,
      saltG: openItem.saltG,
      parts: stored ? partsOrSelf(stored) : openItem.parts,
      photos: photosOf(openItem),
    };
  } else if (openItem?.kind === 'meal') {
    detail = { title: openItem.label, time: clock(openItem.minutes), meal: t(`extraMealTime.${PLAN_SLOT_MEAL[openItem.slot]}` as StringKey), kcal: openItem.kcal, proteinG: openItem.proteinG, purineMg: null, sugarG: null, saltG: null, photos: photosOf(openItem) };
  }
  function editPart(index: number, part: MealPart) {
    if (client || openItem?.kind !== 'extra') return;
    const id = rawExtraId(openItem);
    const stored = logs[selectedKey]?.extraItems?.find((i) => i.id === id);
    const patch = stored ? editListedPartPatch(stored, index, part) : null;
    if (patch) updateExtra(selectedKey, id, patch);
  }
  async function addPhoto(uri: string): Promise<boolean> {
    if (client || !openItem) return false;
    if (openItem.kind === 'extra') return addExtraPhoto(selectedKey, rawExtraId(openItem), uri);
    if (openItem.kind === 'meal') return addSlotPhoto(selectedKey, openItem.slot, uri);
    return false;
  }
  // "Xoá bữa" in the sheet: a logged food is deleted, a ticked plan meal un-ticked; both with "Hoàn tác" instead of a confirm.
  const openStored = openItem?.kind === 'extra' ? logs[selectedKey]?.extraItems?.find((i) => i.id === rawExtraId(openItem)) : undefined;
  const canDeleteOpen = !client && (openItem?.kind === 'extra' ? !!openStored : openItem?.kind === 'meal' && openItem.eaten);
  function deleteOpen() {
    if (client || !openItem) return;
    if (openItem.kind === 'extra') deleteExtraWithUndo(selectedKey, rawExtraId(openItem), g('journal.mealDeleted', { name: openItem.name || g('journal.extra') }));
    else if (openItem.kind === 'meal') unmarkPlanMealWithUndo(selectedKey, openItem.slot, g('journal.planUnmarked', { name: openItem.label }));
  }
  /** "Ăn lại món này": the same food logged again for today, at the meal of the moment, with "Hoàn tác". */
  function eatOpenAgain() {
    if (client || !openStored || !(openStored.calories > 0)) return;
    const mealTime = mealTimeAt(now);
    logExtraAgain(todayKey, openStored, mealTime, g('quick.againLoggedMeal', { name: openStored.name, kcal: Math.round(openStored.calories).toLocaleString('en-US'), meal: t(`extraMealTime.${mealTime}` as StringKey) }));
  }
  async function removePhoto(photo: MealPhotoRef): Promise<boolean> {
    if (client || !openItem) return false;
    if (openItem.kind === 'extra') return removeExtraPhoto(selectedKey, rawExtraId(openItem), photo);
    if (openItem.kind === 'meal' && photo.proofId) {
      removeProof(photo.proofId);
      return true;
    }
    return false;
  }

  const weekdayLabel = (d: Date) => g(`weekday.${d.getDay()}` as GameKey);
  const dateLabel = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;

  // Today with meals still to come: the end-of-day estimate (no boss damage yet). A settled day with a meal not logged: no level colour.
  const shown = shownDeficit(day);
  const dayLabelText = `${weekdayLabel(selectedDate)} ${dateLabel(selectedDate)}`;
  const dayLevel = shown.incomplete ? null : levelOf(selectedKey, shown.kcal);
  const stats = [
    { label: g('journal.eaten'), value: Math.round(day.eatenKcal).toLocaleString('en-US'), color: quest.text, accent: false },
    { label: g('journal.burned'), value: Math.round(day.burnedKcal).toLocaleString('en-US'), color: quest.hpText, accent: false },
    {
      label: g(shown.projected ? 'journal.deficitProjected' : 'journal.deficit'),
      value: cheatDays.includes(selectedKey)
        ? g('deficit.cheatShort')
        : shown.kcal == null
          ? '—'
          : `${shown.projected ? '~' : ''}${Math.round(shown.kcal).toLocaleString('en-US')}`,
      color: shown.incomplete ? quest.textSecondary : deficitColor(dayLevel, quest.gold),
      accent: true,
    },
    { label: g('journal.xp'), value: `+${day.earnedXp}`, color: quest.xp, accent: false },
  ];

  // The nutrient table (dialogs.md decision 6): the day's energy, protein, purine, salt, sugar and junk food against the goals and limits.
  const ownLimits = useLimits();
  const limits = client?.limits ?? ownLimits;
  const saveDayLog = useNutritionStore((s) => s.saveDayLog);
  const [mealTableOpen, setMealTableOpen] = useState(false);
  const dayLog = logs[selectedKey];

  const timelineRows = (embedded ? visibleTimeline.filter((i) => i.kind !== 'water') : visibleTimeline).map((item) => (
    <TimelineRow
      key={item.id}
      item={item}
      g={g}
      t={t}
      proteinTargetG={proteinTargetG}
      workoutXpFor={workoutXpFor}
      isToday={isToday && !client}
      onOpen={openDetail}
      thumbs={photosOf(item).map((p) => p.uri)}
      skip={item.kind === 'meal' ? skipFor(item.slot, item.eaten) : undefined}
    />
  ));

  const body = embedded ? (
    <View>
      <View style={styles.embeddedHead}>
        <HudText size={17} accessibilityRole="header" style={styles.flex}>
          {g('journal.timeline')}
        </HudText>
        <Pressable accessibilityRole="link" accessibilityLabel={g('camp.journalLink')} onPress={() => router.push('/journal')} hitSlop={8} style={styles.headLink}>
          <HudText size={13} weight="medium" color={quest.textSecondary}>
            {g('camp.journalLink')}
          </HudText>
          <QuestIcon name="chevron" size={14} color={quest.textSecondary} />
        </Pressable>
      </View>
      <View style={styles.timeline}>{timelineRows}</View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={g('camp.journalFullDay')}
        onPress={() => router.push('/journal')}
        style={({ pressed }) => [styles.fullDay, pressed && { opacity: 0.85 }]}
      >
        <QuestIcon name="list" size={18} color={quest.text} />
        <HudText size={14}>{g('camp.journalFullDay')}</HudText>
      </Pressable>
    </View>
  ) : (
    <View>
      <View style={styles.stats}>
        {stats.map((s) => (
          <View key={s.label} accessible accessibilityLabel={`${s.label} ${s.value}`} style={[styles.stat, s.accent && { borderColor: quest.gold }]}>
            <HudText size={12} weight="medium" color={quest.textSecondary}>
              {s.label}
            </HudText>
            <HudText size={18} color={s.color}>
              {s.value}
            </HudText>
          </View>
        ))}
      </View>

      <DeficitLevelRow
        level={dayLevel}
        target={deficitTarget}
        cheat={cheatDays.includes(selectedKey)}
        onToggleCheat={client || selectedKey > todayKey ? undefined : () => toggleCheat(selectedKey)}
      />
      <DayDeficitNotes day={day} dateKey={selectedKey} dayLabel={dayLabelText} readOnly={!!client} />

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
        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {g('journal.legend')}
        </HudText>
      </View>
      <View style={styles.timeline}>{timelineRows}</View>
      <HudText size={12} weight="medium" color={quest.textSecondary} style={styles.note}>
        {g('journal.waterNote')}
      </HudText>

      <View onLayout={(e) => onTableLayout?.(e.nativeEvent.layout.y)}>
        <NutrientTable
          day={day}
          budgetKcal={Math.max(0, tdeeKcal + day.burnedKcal - deficitTarget)}
          limits={{ ...LIMITS, ...limits }}
          focus={focus}
          cookbookLinks={!client}
        />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={g('journal2.mealTableA11y')}
        accessibilityState={{ expanded: mealTableOpen }}
        onPress={() => setMealTableOpen((o) => !o)}
        style={styles.tableToggle}
      >
        <HudText size={14} color={quest.gold}>
          {mealTableOpen ? '▾' : '▸'} {g('journal2.mealTable')}
        </HudText>
      </Pressable>
      {mealTableOpen && (
        <DailyMealBreakdownTable
          dark
          meals={mealTemplates[getDayType(selectedDate)]}
          mealsEaten={dayLog?.mealsEaten ?? {}}
          extraItems={dayLog?.extraItems ?? []}
          legacyTotals={{ kcal: dayLog?.extraCalories ?? 0, proteinG: dayLog?.extraProteinG ?? 0 }}
          dateKey={selectedKey}
          removedMealSlots={dayLog?.removedMealSlots ?? []}
          editable={!client}
          onSave={(draft) => saveDayLog(selectedKey, draft)}
        />
      )}
    </View>
  );

  return (
    <View>
      {body}
      <WorkoutDetailDialog entries={openWorkoutEntries} lang={language === 'en' ? 'en' : 'vi'} onClose={() => setOpenWorkout(null)} editable={!client} />
      <MealDetailDialog
        detail={detail}
        onClose={() => setOpenId(null)}
        canEditParts={!client}
        onEditPart={editPart}
        onAddPhoto={client ? undefined : addPhoto}
        onRemovePhoto={client ? undefined : removePhoto}
        onEatAgain={!client && openStored && openStored.calories > 0 ? eatOpenAgain : undefined}
        onDelete={canDeleteOpen ? deleteOpen : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  embeddedHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20, marginBottom: 4 },
  headLink: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 44 },
  fullDay: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, marginTop: 12, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  flex: { flex: 1, minWidth: 0 },
  stats: { flexDirection: 'row', gap: 8, marginTop: 4 },
  stat: { flex: 1, minWidth: 0, padding: 10, gap: 2, borderRadius: questRadius.row, backgroundColor: quest.panel, borderWidth: 1.5, borderColor: quest.border, alignItems: 'center' },
  levelRow: { marginTop: 10, gap: 2 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tableToggle: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', marginTop: 8 },
  levelHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  levelChip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32, paddingHorizontal: 10, borderRadius: 16, borderWidth: 1.5 },
  levelDot: { width: 8, height: 8, borderRadius: 4 },
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
  skipTarget: { alignSelf: 'flex-start', justifyContent: 'center', minHeight: 44, marginLeft: 76, marginTop: -10, marginBottom: -4 },
  skipChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, minHeight: 28, borderRadius: 6, borderWidth: 1.5, borderColor: quest.bossBorder },
  skipUndo: { borderColor: quest.border },
  chip: { paddingHorizontal: 8, minHeight: 22, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  nowLine: { borderTopWidth: 1.5, borderTopColor: quest.gold, borderStyle: 'dashed', paddingTop: 4, marginTop: 4 },
  nowText: { letterSpacing: 1.6 },
  note: { marginTop: 16, textAlign: 'center' },
});
