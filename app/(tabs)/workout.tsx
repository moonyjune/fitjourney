import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { stepsOrImplicit } from '../../src/components/PlanPreview';
import { BottomSheet } from '../../src/components/quest/BottomSheet';
import { ExerciseFigure } from '../../src/components/quest/ExerciseFigure';
import { HudText } from '../../src/components/quest/HudText';
import { OtherWorkoutSheet, type OtherWorkoutPreset } from '../../src/components/quest/OtherWorkoutSheet';
import { QuestButton } from '../../src/components/quest/QuestButton';
import { QuestIcon, type QuestIconName } from '../../src/components/quest/QuestIcon';
import { QuestWorkoutSteps } from '../../src/components/quest/QuestPlanPreview';
import { ScreenTemplate } from '../../src/components/quest/ScreenTemplate';
import { WorkoutDetailDialog } from '../../src/components/quest/WorkoutDetailDialog';
import { MISSION_XP } from '../../src/game/constants';
import { useGameText, type GameKey } from '../../src/game/strings';
import {
  ALWAYS_EXERCISE,
  estimateKcal,
  estimateMinutes,
  EXERCISE_BY_ID,
  EXERCISES,
  GROUP_EXERCISES,
  GROUP_ORDER,
  prescriptionFor,
  suggestedGroup,
  type ExerciseId,
  type GroupId,
} from '../../src/game/training/exercises';
import { exerciseName, formatAmount } from '../../src/game/training/format';
import { progressFor } from '../../src/game/training/progress';
import { buildSteps } from '../../src/game/training/session';
import { useNow } from '../../src/game/useGameState';
import { useTranslation } from '../../src/i18n/useTranslation';
import { usePlanStore } from '../../src/store/usePlanStore';
import { useSelectedDayStore, workingDayKey } from '../../src/store/useSelectedDayStore';
import { useSettingsStore } from '../../src/store/useSettingsStore';
import { showToast } from '../../src/store/useToastStore';
import { useTrainingStore } from '../../src/store/useTrainingStore';
import { useWeightStore } from '../../src/store/useWeightStore';
import { useWorkoutStore } from '../../src/store/useWorkoutStore';
import { quest, questRadius } from '../../src/theme/quest';
import { useLightStatusBar } from '../../src/theme/useLightStatusBar';
import type { WorkoutLogEntry } from '../../src/types';
import { formatDateVi, toDateKey } from '../../src/utils/date';
import { momentOnDay } from '../../src/utils/logDate';

const MIN_PICKS = 2;

/** The group chips, or the plan's own workouts (dialogs.md decision 12: they are still used). */
type Mode = GroupId | 'plan';

/** Monday 00:00 of the week `now` is in. */
function weekStart(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

/** Train tab (Design/uiux-proposal/html/05-train-after.html): today's session already chosen (group, minutes, kcal, "Bắt đầu · giọng HLV"),
 *  the group chips A / B / C plus "Bài kế hoạch", today's exercises as rows (tap = how to do it, tick = in or out), "Thêm / bớt bài"
 *  (every exercise in a sheet), "Tập khác" (run, swim, watch photo, AI kcal: the old workout-classic screen as a sheet) and this week. */
export default function TrainScreen() {
  const g = useGameText();
  const { t } = useTranslation();
  const language = useSettingsStore((s) => s.language);
  const lang = language === 'en' ? 'en' : 'vi';
  useLightStatusBar();
  const now = useNow(60_000);
  const progress = useTrainingStore((s) => s.progress);
  const custom = useTrainingStore((s) => s.custom);
  const entries = useWorkoutStore((s) => s.entries);
  const addEntry = useWorkoutStore((s) => s.addEntry);
  const templates = usePlanStore((s) => s.plan.workoutTemplates);
  const startWeightKg = useSettingsStore((s) => s.startWeightKg);
  const latestKg = useWeightStore((s) => s.latest()?.weightKg);
  const params = useLocalSearchParams<{ other?: string }>();

  const suggested = suggestedGroup(now);
  const [mode, setMode] = useState<Mode>(suggested ?? 'A');
  const group: GroupId = mode === 'plan' ? (suggested ?? 'A') : mode;
  const [picked, setPicked] = useState<ExerciseId[]>(GROUP_EXERCISES[suggested ?? 'A']);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [other, setOther] = useState<{ open: boolean; preset: OtherWorkoutPreset }>({ open: false, preset: null });
  const [openWorkout, setOpenWorkout] = useState<WorkoutLogEntry | null>(null);

  // (+) › "Tập khác" opens this tab with the sheet up.
  useEffect(() => {
    if (params.other) setOther({ open: true, preset: null });
  }, [params.other]);

  const todayKey = toDateKey(now);
  const todayEntries = useMemo(() => entries.filter((e) => toDateKey(new Date(e.dateISO)) === todayKey), [entries, todayKey]);
  const monday = weekStart(now).getTime();
  const weekEntries = useMemo(
    () =>
      entries
        .filter((e) => {
          const time = new Date(e.dateISO).getTime();
          return time >= monday && time < monday + 7 * 86_400_000;
        })
        .sort((a, b) => (a.dateISO < b.dateISO ? 1 : -1)),
    [entries, monday]
  );

  function chooseGroup(next: GroupId) {
    setMode(next);
    setPicked(GROUP_EXERCISES[next]);
  }

  function toggle(id: ExerciseId) {
    setPicked(picked.includes(id) ? picked.filter((p) => p !== id) : [...picked, id]);
  }

  const levelOf = (id: ExerciseId) => progressFor(progress, id).level;
  /** The level's sets × amount, or the user's own numbers for that level. */
  const rxOf = (id: ExerciseId) => {
    const [mine] = buildSteps([{ id, level: levelOf(id) }], custom);
    return { ...prescriptionFor(id, mine.level), sets: mine.sets, amount: mine.amount };
  };
  const sessionIds = [...picked, ALWAYS_EXERCISE];
  const minutes = estimateMinutes(sessionIds.map((id) => ({ id, level: levelOf(id) })), custom);
  const kcal = estimateKcal(latestKg ?? startWeightKg, minutes);
  const canStart = picked.length >= MIN_PICKS;
  const libraryIds = EXERCISES.filter((e) => e.id !== ALWAYS_EXERCISE).map((e) => e.id);

  const dayName = g(`weekday.${now.getDay()}` as GameKey);
  const hint = suggested === null
    ? g('train.suggestedRest', { g: group })
    : suggested === group
      ? g('train.suggested', { g: suggested })
      : g('train.swapped', { s: suggested, g: group });

  function start() {
    router.push({ pathname: '/train/session', params: { ids: sessionIds.join(','), group } });
  }

  function openOther(preset: OtherWorkoutPreset) {
    setOther({ open: true, preset });
  }

  /** "+ Ghi nhận" on a plan workout: logged for the day chosen with the date chip, with "Hoàn tác". */
  function logTemplate(id: string, label: string, durationMin: number, caloriesBurned: number) {
    const dayKey = workingDayKey(useSelectedDayStore.getState().selectedKey, new Date());
    const created = addEntry({ templateId: id, label, durationMin, caloriesBurned }, momentOnDay(dayKey, new Date()).toISOString());
    showToast({ text: g('train.planLogged', { name: label }), undo: () => useWorkoutStore.getState().removeEntry(created.id) });
  }

  const heroId = picked[0] ?? GROUP_EXERCISES[group][0];
  const dayLabel = (e: WorkoutLogEntry) => {
    const d = new Date(e.dateISO);
    return `${g(`weekday.${d.getDay()}` as GameKey)} ${formatDateVi(toDateKey(d)).slice(0, 5)}`;
  };

  return (
    <ScreenTemplate
      title={g('train.tabTitle')}
      eyebrow={g('train.todayEyebrow', { day: dayName })}
      tabBar
      right={
        <Pressable accessibilityRole="button" accessibilityLabel={g('other.title')} onPress={() => openOther(null)} style={styles.headerChip}>
          <QuestIcon name="plus" size={16} color={quest.gold} strokeWidth={2.4} />
          <HudText size={13}>{g('train.otherTitle')}</HudText>
        </Pressable>
      }
      contentStyle={styles.content}
    >
      {/* Today's session, already chosen: one tap to start. */}
      <View style={styles.today}>
        <View style={styles.todayHero}>
          <View style={styles.flex}>
            <View style={styles.groupBadge}>
              <HudText size={12} color={quest.onGold}>
                {mode === 'plan' ? g('train.planChip') : g(`train.group.${group}` as GameKey)}
              </HudText>
            </View>
            {mode === 'plan' ? (
              <HudText size={13} weight="medium" color={quest.textSecondary} style={styles.heroMeta}>
                {g('train.planHint')}
              </HudText>
            ) : (
              <>
                <HudText size={28} style={styles.heroMinutes}>
                  {g('train.todayMinutes', { m: minutes })}
                </HudText>
                <HudText size={13} weight="medium" color={quest.textSecondary}>
                  {canStart ? g('train.todayMeta', { n: picked.length, kcal }) : g('train.pickMin')}
                </HudText>
              </>
            )}
          </View>
          {mode !== 'plan' && (
            <View style={styles.heroFigure} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <ExerciseFigure id={heroId} pose={0} width={100} />
            </View>
          )}
        </View>
        <View style={styles.todayBody}>
          {mode !== 'plan' && (
            <>
              <QuestButton title={g('train.startCoach')} icon="chevron" disabled={!canStart} onPress={start} />
              <View style={styles.hintRow}>
                <QuestIcon name="swap" size={14} color={quest.manaText} />
                <HudText size={12} weight="medium" color={quest.manaText} style={styles.flex}>
                  {hint}
                </HudText>
                <HudText size={12} color={quest.xp}>
                  {g('train.d.xp', { n: MISSION_XP.workout })}
                </HudText>
              </View>
            </>
          )}
          <View style={styles.groupRow} accessibilityLabel={g('train.groupsLabel')}>
            <HudText size={12} weight="medium" color={quest.textSecondary} style={styles.flex}>
              {g('train.changeGroup')}
            </HudText>
            {GROUP_ORDER.map((id) => {
              const on = mode === id;
              return (
                <Pressable
                  key={id}
                  accessibilityRole="button"
                  accessibilityLabel={g(`train.group.${id}` as GameKey)}
                  accessibilityState={{ selected: on }}
                  onPress={() => chooseGroup(id)}
                  style={[styles.groupChip, on && styles.groupChipOn]}
                >
                  <HudText size={15} color={on ? quest.onGold : quest.text}>
                    {id}
                  </HudText>
                </Pressable>
              );
            })}
            {templates.length > 0 && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={g('train.planChip')}
                accessibilityState={{ selected: mode === 'plan' }}
                onPress={() => setMode('plan')}
                style={[styles.groupChip, styles.planChip, mode === 'plan' && styles.groupChipOn]}
              >
                <HudText size={13} color={mode === 'plan' ? quest.onGold : quest.text}>
                  {g('train.planChip')}
                </HudText>
              </Pressable>
            )}
          </View>
        </View>
      </View>

      {todayEntries.length > 0 && (
        <View style={styles.doneCard}>
          <QuestIcon name="check" size={18} color={quest.xp} strokeWidth={2.6} />
          <HudText size={14} style={styles.flex}>
            {g('train.todayDone')}
          </HudText>
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {g('train.todayDoneMeta', {
              min: todayEntries.reduce((s, e) => s + e.durationMin, 0),
              kcal: Math.round(todayEntries.reduce((s, e) => s + e.caloriesBurned, 0)),
            })}
          </HudText>
        </View>
      )}

      {mode === 'plan' ? (
        <>
          <SectionHead title={g('train.planTitle')} />
          {templates.map((tpl) => (
            <View key={tpl.id} style={styles.planCard}>
              <View style={styles.planHead}>
                <HudText size={15} style={styles.flex}>
                  {tpl.label}
                </HudText>
                <HudText size={12} weight="medium" color={quest.textSecondary}>
                  {tpl.timeRange}
                </HudText>
              </View>
              <QuestWorkoutSteps steps={stepsOrImplicit(tpl)} />
              <View style={styles.planFoot}>
                <HudText size={13} color={quest.gold} style={styles.flex}>
                  {t('workout.templateMacro', { min: tpl.durationMin, kcal: tpl.caloriesBurned })}
                </HudText>
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={t('workout.editWithAiButton')}
                  onPress={() => router.push(`/plan?editWorkout=${encodeURIComponent(tpl.label)}`)}
                  style={styles.linkSmall}
                >
                  <HudText size={13} color={quest.manaText}>
                    {t('workout.editWithAiButton')}
                  </HudText>
                </Pressable>
              </View>
              <QuestButton
                title={t('workout.logTemplateButton')}
                accessibilityLabel={`${t('workout.logTemplateButton')}: ${tpl.label}`}
                icon="check"
                variant="ghost"
                onPress={() => logTemplate(tpl.id, tpl.label, tpl.durationMin, tpl.caloriesBurned)}
              />
            </View>
          ))}
        </>
      ) : (
        <>
          <SectionHead title={g('train.listTitle')} hint={g('train.listHint')} />
          <View style={styles.list}>
            {picked.map((id) => (
              <ExerciseRow
                key={id}
                id={id}
                name={exerciseName(EXERCISE_BY_ID[id], language)}
                meta={formatAmount(rxOf(id), language, false)}
                level={g('train.level', { n: levelOf(id) })}
                on
                onToggle={() => toggle(id)}
                onOpen={() => router.push({ pathname: '/train/detail', params: { id, group } })}
                g={g}
              />
            ))}
            <ExerciseRow
              id={ALWAYS_EXERCISE}
              name={exerciseName(EXERCISE_BY_ID[ALWAYS_EXERCISE], language)}
              meta={`${g('train.always')} · ${formatAmount(rxOf(ALWAYS_EXERCISE), language, false)}`}
              onOpen={() => router.push({ pathname: '/train/detail', params: { id: ALWAYS_EXERCISE, group } })}
              g={g}
            />
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={g('train.editList', { n: libraryIds.length })} onPress={() => setPickerOpen(true)} style={styles.editRow}>
            <QuestIcon name="edit" size={16} color={quest.textSecondary} />
            <HudText size={13} weight="medium" color={quest.textSecondary} style={styles.flex}>
              {g('train.editList', { n: libraryIds.length })}
            </HudText>
            <QuestIcon name="chevron" size={14} color={quest.textSecondary} />
          </Pressable>
        </>
      )}

      {/* Other workouts: what workout-classic did, now a sheet. */}
      <SectionHead title={g('train.otherTitle')} hint={g('train.otherHint')} />
      <View style={styles.otherRow}>
        <OtherTile icon="flame" color={quest.hpText} label={g('train.otherRun')} onPress={() => openOther('run')} />
        <OtherTile icon="drop" color={quest.manaText} label={g('train.otherSwim')} onPress={() => openOther('swim')} />
        <OtherTile icon="camera" color={quest.gold} label={g('train.otherPhoto')} onPress={() => openOther('photo')} />
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={g('train.otherAi')} onPress={() => openOther('ai')} style={styles.aiRow}>
        <QuestIcon name="chart" size={18} color={quest.manaText} />
        <HudText size={12} weight="medium" color={quest.text} style={styles.flex}>
          {g('train.otherAi')}
        </HudText>
      </Pressable>

      <View style={styles.sectionHead}>
        <HudText size={17} accessibilityRole="header" style={styles.flex}>
          {g('train.weekTitle')}
        </HudText>
        <View style={styles.countBadge}>
          <HudText size={12} color={quest.xp}>
            {g('train.weekCount', { n: weekEntries.length })}
          </HudText>
        </View>
      </View>
      <View style={styles.week}>
        {weekEntries.length === 0 ? (
          <HudText size={13} weight="medium" color={quest.textSecondary} style={styles.weekEmpty}>
            {g('train.weekEmpty')}
          </HudText>
        ) : (
          weekEntries.map((e, i) => (
            <Pressable
              key={e.id}
              accessibilityRole="button"
              accessibilityLabel={g('train.weekOpen', { name: e.label, day: dayLabel(e) })}
              onPress={() => setOpenWorkout(e)}
              style={[styles.weekRow, i < weekEntries.length - 1 && styles.weekRowBorder]}
            >
              <QuestIcon name="dumbbell" size={18} color={e.details ? quest.gold : quest.hpText} />
              <View style={styles.flex}>
                <HudText size={14} numberOfLines={1}>
                  {e.label}
                </HudText>
                <HudText size={12} weight="medium" color={quest.textSecondary}>
                  {g('train.weekMeta', { day: dayLabel(e), min: e.durationMin, kcal: Math.round(e.caloriesBurned) })}
                </HudText>
              </View>
              <QuestIcon name="chevron" size={14} color={quest.textSecondary} />
            </Pressable>
          ))
        )}
      </View>
      <View style={styles.links}>
        <Pressable accessibilityRole="link" accessibilityLabel={g('train.weekManage')} onPress={() => router.push('/workout-classic')} style={styles.link}>
          <HudText size={13} weight="medium" color={quest.textSecondary}>
            {g('train.weekManage')}
          </HudText>
          <QuestIcon name="chevron" size={14} color={quest.textSecondary} />
        </Pressable>
        <Pressable accessibilityRole="link" accessibilityLabel={g('train.weekJournal')} onPress={() => router.push('/journal')} style={styles.link}>
          <HudText size={13} weight="medium" color={quest.textSecondary}>
            {g('train.weekJournal')}
          </HudText>
          <QuestIcon name="chevron" size={14} color={quest.textSecondary} />
        </Pressable>
      </View>

      <BottomSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title={g('train.pickSheetTitle', { g: group })}
        subtitle={g('train.pickSheetCount', { n: picked.length, total: libraryIds.length })}
        footer={
          <View style={styles.sheetFoot}>
            <HudText size={12} weight="medium" color={canStart ? quest.textSecondary : quest.hpText} style={styles.center}>
              {canStart ? g('train.pickSheetFoot', { m: minutes }) : g('train.pickMin')}
            </HudText>
            <QuestButton title={g('train.pickDone', { n: picked.length })} icon="check" disabled={!canStart} onPress={() => setPickerOpen(false)} />
          </View>
        }
      >
        {libraryIds.map((id) => (
          <ExerciseRow
            key={id}
            id={id}
            name={exerciseName(EXERCISE_BY_ID[id], language)}
            meta={`${g('train.level', { n: levelOf(id) })} · ${formatAmount(rxOf(id), language, false)}`}
            on={picked.includes(id)}
            onToggle={() => toggle(id)}
            g={g}
          />
        ))}
        <ExerciseRow
          id={ALWAYS_EXERCISE}
          name={exerciseName(EXERCISE_BY_ID[ALWAYS_EXERCISE], language)}
          meta={`${g('train.always')} · ${formatAmount(rxOf(ALWAYS_EXERCISE), language, false)}`}
          locked
          g={g}
        />
      </BottomSheet>

      <OtherWorkoutSheet visible={other.open} preset={other.preset} onClose={() => setOther({ open: false, preset: null })} />
      <WorkoutDetailDialog entries={openWorkout ? [openWorkout] : null} lang={lang} onClose={() => setOpenWorkout(null)} />
    </ScreenTemplate>
  );
}

function SectionHead({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={styles.sectionHead}>
      <HudText size={17} accessibilityRole="header" style={styles.flex}>
        {title}
      </HudText>
      {hint ? (
        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {hint}
        </HudText>
      ) : null}
    </View>
  );
}

type Translate = ReturnType<typeof useGameText>;

/** One exercise as a row: figure in a raised box, name, numbers, level; the tick (32 pt in a 44 pt target) puts it in or out of
 *  today's session; the rest of the row opens how to do it. */
function ExerciseRow({
  id,
  name,
  meta,
  level,
  on,
  locked,
  onToggle,
  onOpen,
  g,
}: {
  id: ExerciseId;
  name: string;
  meta: string;
  level?: string;
  on?: boolean;
  locked?: boolean;
  onToggle?: () => void;
  onOpen?: () => void;
  g: Translate;
}) {
  const body = (
    <>
      <View style={styles.rowFigure} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <ExerciseFigure id={id} pose={0} width={46} />
      </View>
      <View style={styles.flex}>
        <HudText size={15} numberOfLines={1}>
          {name}
        </HudText>
        <HudText size={12} weight="medium" color={locked || !onToggle ? quest.manaText : quest.textSecondary} numberOfLines={1}>
          {meta}
        </HudText>
      </View>
      {level ? (
        <View style={styles.levelBadge}>
          <HudText size={11} color={quest.xp}>
            {level}
          </HudText>
        </View>
      ) : null}
    </>
  );
  return (
    <View style={styles.row}>
      {onOpen ? (
        <Pressable accessibilityRole="button" accessibilityLabel={g('train.openDetail', { name })} onPress={onOpen} style={styles.rowMain}>
          {body}
        </Pressable>
      ) : (
        <View style={styles.rowMain}>{body}</View>
      )}
      {onToggle ? (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityLabel={g('train.select', { name })}
          accessibilityState={{ selected: !!on, checked: !!on }}
          onPress={onToggle}
          style={styles.tickHit}
        >
          <View style={[styles.tick, on && styles.tickOn]}>{on && <QuestIcon name="check" size={18} color={quest.onGold} strokeWidth={3} />}</View>
        </Pressable>
      ) : locked ? (
        <View style={styles.tickHit}>
          <QuestIcon name="lock" size={16} color={quest.textSecondary} />
        </View>
      ) : null}
    </View>
  );
}

function OtherTile({ icon, color, label, onPress }: { icon: QuestIconName; color: string; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.otherTile, pressed && styles.pressed]}>
      <QuestIcon name={icon} size={22} color={color} />
      <HudText size={13} style={styles.center}>
        {label}
      </HudText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12 },
  flex: { flex: 1, minWidth: 0 },
  center: { textAlign: 'center' },
  pressed: { opacity: 0.85 },
  headerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: quest.border,
    backgroundColor: quest.panel,
  },
  today: { borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.gold, backgroundColor: quest.panel, overflow: 'hidden' },
  todayHero: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 120, padding: 14, backgroundColor: '#241C45' },
  groupBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: quest.gold },
  heroMinutes: { marginTop: 8 },
  heroMeta: { marginTop: 8 },
  heroFigure: { width: 104, alignItems: 'center', justifyContent: 'center' },
  todayBody: { padding: 14, gap: 10 },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  groupChip: { minWidth: 44, minHeight: 44, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.raised, alignItems: 'center', justifyContent: 'center' },
  planChip: { paddingHorizontal: 14 },
  groupChipOn: { backgroundColor: quest.gold, borderColor: quest.gold },
  doneCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 8 },
  list: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 64, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel, marginBottom: 0 },
  rowMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8 },
  rowFigure: { width: 52, height: 52, borderRadius: 10, backgroundColor: quest.raised2, alignItems: 'center', justifyContent: 'center' },
  levelBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1, borderColor: quest.xp },
  tickHit: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  tick: { width: 32, height: 32, borderRadius: 9, borderWidth: 1.5, borderColor: quest.border, alignItems: 'center', justifyContent: 'center' },
  tickOn: { backgroundColor: quest.gold, borderColor: quest.gold },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  otherRow: { flexDirection: 'row', gap: 8 },
  otherTile: { flex: 1, minHeight: 84, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 8, borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  aiRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.manaBorder, backgroundColor: quest.manaPanel },
  countBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, borderWidth: 1, borderColor: quest.xp },
  week: { borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  weekEmpty: { padding: 14 },
  weekRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingHorizontal: 12 },
  weekRowBorder: { borderBottomWidth: 1, borderBottomColor: quest.border },
  links: { gap: 0 },
  link: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44 },
  linkSmall: { minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' },
  planCard: { gap: 10, padding: 14, borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  planHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  planFoot: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sheetFoot: { gap: 8 },
});
