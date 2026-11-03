import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { BottomSheet } from '../src/components/quest/BottomSheet';
import { HudText } from '../src/components/quest/HudText';
import { QuestButton } from '../src/components/quest/QuestButton';
import { QuestDemographics } from '../src/components/quest/QuestDemographics';
import { QuestField } from '../src/components/quest/QuestField';
import { ScreenTemplate } from '../src/components/quest/ScreenTemplate';
import { SettingsGroup, SettingsGroupTitle, SettingsLinkRow } from '../src/components/quest/SettingsRows';
import { DateOffsetPicker } from '../src/components/DateOffsetPicker';
import { PlanChatAssistant } from '../src/components/PlanChatAssistant';
import { useGameText } from '../src/game/strings';
import { useTranslation } from '../src/i18n/useTranslation';
import { scheduleAllReminders } from '../src/notifications/schedule';
import { usePlanStore } from '../src/store/usePlanStore';
import { useSettingsStore } from '../src/store/useSettingsStore';
import { showToast } from '../src/store/useToastStore';
import { useWeightStore } from '../src/store/useWeightStore';
import { quest, questRadius } from '../src/theme/quest';
import { useLightStatusBar } from '../src/theme/useLightStatusBar';
import type { ActivityLevel, Gender, PlanData, UserSettings } from '../src/types';
import { backToProfile } from '../src/utils/backToProfile';
import { formatDateVi, toDateKey } from '../src/utils/date';
import { ACTIVITY_MULTIPLIER, resolveTdeeKcal } from '../src/utils/tdee';

type GoalField = 'goal' | 'cal' | 'deficit' | 'protein';
const num = (text: string) => parseFloat(text.replace(',', '.'));

/** Hồ sơ › Mục tiêu & kế hoạch (dialogs 33): goals, body (with the TDEE preview), the start date (a sheet) and a new plan, the way to
 *  the menu / workouts / shopping list (/plan-menu) and the AI assistant that edits the plan. Language, reminders, coach and sign-out
 *  live once, in Hồ sơ › Coach & tài khoản / Nhắc nhở. Saving shows a toast with "Hoàn tác"; a bad number is a red line under its field. */
export default function PlanScreen() {
  const { t } = useTranslation();
  const g = useGameText();
  useLightStatusBar();
  const settings = useSettingsStore();
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const plan = usePlanStore((s) => s.plan);
  const applyPlan = usePlanStore((s) => s.applyPlan);
  const latestWeight = useWeightStore((s) => s.latest());
  const { editWorkout } = useLocalSearchParams<{ editWorkout?: string }>();
  const editWorkoutDraft = editWorkout ? t('workout.editDraftTemplate', { label: decodeURIComponent(editWorkout) }) : undefined;

  const [calorieTarget, setCalorieTarget] = useState(String(settings.calorieTargetKcal));
  const [targetDeficit, setTargetDeficit] = useState(String(settings.targetDailyDeficitKcal));
  const [proteinTarget, setProteinTarget] = useState(String(settings.proteinTargetG));
  const [goalWeight, setGoalWeight] = useState(String(settings.goalWeightKg));
  const [goalErrors, setGoalErrors] = useState<Partial<Record<GoalField, boolean>>>({});
  const [startDateDraft, setStartDateDraft] = useState(() => new Date(settings.startDateISO));
  const [startSheet, setStartSheet] = useState(false);
  const [startWeightText, setStartWeightText] = useState(String(settings.startWeightKg));
  const [startWeightError, setStartWeightError] = useState(false);
  const [heightText, setHeightText] = useState(settings.heightCm != null ? String(settings.heightCm) : '');
  const [ageText, setAgeText] = useState(settings.age != null ? String(settings.age) : '');
  const [genderDraft, setGenderDraft] = useState<Gender | null>(settings.gender);
  const [activityLevelDraft, setActivityLevelDraft] = useState<ActivityLevel | null>(settings.activityLevel);

  // The BMR/TDEE preview uses the plan's STARTING weight (the draft field above it, so it updates as it is edited): a fixed reference
  // for the plan. Camp / the Journal track day-to-day progress with the latest logged weight.
  const startWeightForPreview = useMemo(() => {
    const parsed = num(startWeightText);
    return parsed > 0 ? parsed : settings.startWeightKg;
  }, [startWeightText, settings.startWeightKg]);
  const tdeePreview = useMemo(
    () =>
      resolveTdeeKcal({
        gender: genderDraft,
        age: ageText ? parseInt(ageText, 10) : null,
        heightCm: heightText ? num(heightText) : null,
        activityLevel: activityLevelDraft,
        weightKg: startWeightForPreview,
        calorieTargetKcal: settings.calorieTargetKcal,
        targetDailyDeficitKcal: settings.targetDailyDeficitKcal,
      }),
    [genderDraft, ageText, heightText, activityLevelDraft, startWeightForPreview, settings.calorieTargetKcal, settings.targetDailyDeficitKcal]
  );

  /** Saves a change and offers to undo it: the toast puts the previous values back (and the drafts with them). */
  function saveWithUndo(patch: Partial<UserSettings>, text: string, restoreDrafts?: (prev: UserSettings) => void) {
    const prev = useSettingsStore.getState();
    const before = Object.fromEntries(Object.keys(patch).map((k) => [k, prev[k as keyof UserSettings]])) as Partial<UserSettings>;
    updateSettings(patch);
    showToast({
      text,
      undo: () => {
        updateSettings(before);
        restoreDrafts?.({ ...prev, ...before } as UserSettings);
      },
    });
  }

  function handleSaveStartDate() {
    setStartSheet(false);
    saveWithUndo({ startDateISO: startDateDraft.toISOString() }, g('rd6.plan.savedStart', { date: formatDateVi(toDateKey(startDateDraft)) }), (p) =>
      setStartDateDraft(new Date(p.startDateISO))
    );
  }

  function handleStartNewPlan() {
    const currentWeight = latestWeight?.weightKg ?? settings.startWeightKg;
    const today = new Date();
    setStartDateDraft(today);
    setStartWeightText(String(currentWeight));
    saveWithUndo({ startDateISO: today.toISOString(), startWeightKg: currentWeight }, g('rd6.plan.newPlan', { kg: currentWeight.toFixed(1) }), (p) => {
      setStartDateDraft(new Date(p.startDateISO));
      setStartWeightText(String(p.startWeightKg));
    });
  }

  function saveTargets() {
    const values = { goal: num(goalWeight), cal: num(calorieTarget), deficit: num(targetDeficit), protein: num(proteinTarget) };
    const errors = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, !(v > 0)])) as Record<GoalField, boolean>;
    setGoalErrors(errors);
    if (Object.values(errors).some(Boolean)) return;
    saveWithUndo(
      { calorieTargetKcal: values.cal, targetDailyDeficitKcal: values.deficit, proteinTargetG: values.protein, goalWeightKg: values.goal },
      g('rd6.plan.savedGoals'),
      (p) => {
        setGoalWeight(String(p.goalWeightKg));
        setCalorieTarget(String(p.calorieTargetKcal));
        setTargetDeficit(String(p.targetDailyDeficitKcal));
        setProteinTarget(String(p.proteinTargetG));
      }
    );
  }

  function saveDemographics() {
    const heightCm = heightText ? num(heightText) : null;
    const age = ageText ? parseInt(ageText, 10) : null;
    const startWeightKg = num(startWeightText);
    if (!(startWeightKg > 0)) {
      setStartWeightError(true);
      return;
    }
    setStartWeightError(false);
    saveWithUndo({ startWeightKg, heightCm, age, gender: genderDraft, activityLevel: activityLevelDraft }, g('rd6.plan.savedBody'), (p) => {
      setStartWeightText(String(p.startWeightKg));
      setHeightText(p.heightCm != null ? String(p.heightCm) : '');
      setAgeText(p.age != null ? String(p.age) : '');
      setGenderDraft(p.gender);
      setActivityLevelDraft(p.activityLevel);
    });
  }

  async function handleApplyPlan(newPlan: PlanData) {
    applyPlan(newPlan);
    if (useSettingsStore.getState().remindersEnabled) await scheduleAllReminders(newPlan);
  }

  const error = (on?: boolean) =>
    on ? (
      <HudText size={12} weight="medium" color={quest.hpText} accessibilityRole="alert">
        {g('rd6.plan.invalid')}
      </HudText>
    ) : null;

  const hint = (text: string) => (
    <HudText size={12} weight="medium" color={quest.textSecondary} style={styles.hint}>
      {text}
    </HudText>
  );

  const assistant = (
    <>
      <SettingsGroupTitle>{t('plan.aiTitle')}</SettingsGroupTitle>
      {hint(t('plan.aiHint'))}
      <PlanChatAssistant livePlan={plan} onApply={handleApplyPlan} initialDraft={editWorkoutDraft} dark />
    </>
  );

  const workouts = plan.workoutTemplates.length;
  const meals = Math.max(plan.mealTemplates.training?.length ?? 0, plan.mealTemplates.rest?.length ?? 0);

  return (
    <ScreenTemplate title={g('rd6.set.goals')} eyebrow={g('profile.title')} onBack={backToProfile} backLabel={g('planScreen.back')}>
      {/* Opened from "Sửa bằng AI" on a workout: the assistant comes first, with the request already written. */}
      {editWorkoutDraft ? assistant : null}

      <SettingsGroupTitle>{g('rd6.plan.goals')}</SettingsGroupTitle>
      <View style={styles.card}>
        <QuestField label={t('plan.goalWeightLabel')} keyboardType="decimal-pad" value={goalWeight} onChangeText={setGoalWeight} />
        {error(goalErrors.goal)}
        <QuestField label={t('plan.calorieTargetLabel')} keyboardType="decimal-pad" value={calorieTarget} onChangeText={setCalorieTarget} />
        {error(goalErrors.cal)}
        <QuestField label={t('plan.targetDeficitLabel')} keyboardType="decimal-pad" value={targetDeficit} onChangeText={setTargetDeficit} />
        {error(goalErrors.deficit)}
        {hint(t('plan.targetDeficitHint'))}
        <QuestField label={t('plan.proteinTargetLabel')} keyboardType="decimal-pad" value={proteinTarget} onChangeText={setProteinTarget} />
        {error(goalErrors.protein)}
        {/* The water target has its own page (Hồ sơ › Nước uống) that the day's water plan is built from. */}
        <QuestButton title={t('plan.saveGoalsButton')} onPress={saveTargets} />
      </View>

      <SettingsGroupTitle>{g('rd6.plan.body')}</SettingsGroupTitle>
      <View style={styles.card}>
        {hint(t('plan.demographicsHint'))}
        <QuestField label={t('plan.startWeightLabel')} keyboardType="decimal-pad" value={startWeightText} onChangeText={setStartWeightText} />
        {error(startWeightError)}
        {hint(t('plan.startWeightHint'))}
        <QuestField label={t('plan.heightLabel')} keyboardType="decimal-pad" value={heightText} onChangeText={setHeightText} placeholder="170" />
        <QuestDemographics
          ageText={ageText}
          onAgeTextChange={setAgeText}
          ageLabelKey="plan.ageLabel"
          gender={genderDraft}
          onGenderChange={setGenderDraft}
          genderLabelKey="plan.genderLabel"
          activityLevel={activityLevelDraft}
          onActivityLevelChange={setActivityLevelDraft}
          activityLevelLabelKey="plan.activityLevelLabel"
        />
        <View style={styles.tdeeBox}>
          <HudText size={12} color={quest.manaText}>
            {t('plan.tdeePreviewLabel')}
          </HudText>
          <HudText size={22} color={quest.mana}>
            {Math.round(tdeePreview.tdeeKcal)} kcal
          </HudText>
          {tdeePreview.bmrKcal != null && activityLevelDraft && (
            <HudText size={12} weight="medium" color={quest.manaText}>
              {t('plan.bmrPreviewLabel', { kcal: Math.round(tdeePreview.bmrKcal), multiplier: ACTIVITY_MULTIPLIER[activityLevelDraft] })}
            </HudText>
          )}
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {t(tdeePreview.source === 'profile' ? 'tdee.sourceProfile' : 'plan.tdeePreviewIncompleteHint')}
          </HudText>
        </View>
        <QuestButton title={t('plan.saveDemographicsButton')} onPress={saveDemographics} />
      </View>

      <SettingsGroupTitle>{g('rd6.plan.section')}</SettingsGroupTitle>
      <SettingsGroup>
        <SettingsLinkRow
          first
          icon="calendar"
          color={quest.gold}
          label={g('rd6.plan.startDate')}
          value={formatDateVi(toDateKey(new Date(settings.startDateISO)))}
          onPress={() => {
            setStartDateDraft(new Date(useSettingsStore.getState().startDateISO));
            setStartSheet(true);
          }}
        />
        <SettingsLinkRow
          icon="plan"
          color={quest.mana}
          label={g('rd6.plan.menu')}
          value={g('rd6.plan.menuValue', { m: meals, w: workouts })}
          onPress={() => router.push('/plan-menu')}
        />
        <SettingsLinkRow icon="list" color={quest.xp} label={g('rd6.plan.shopping')} value={String(plan.shoppingList.length)} onPress={() => router.push('/plan-menu')} />
      </SettingsGroup>
      <View style={styles.newPlan}>
        <QuestButton title={t('plan.startNewPlanButton')} variant="ghost" onPress={handleStartNewPlan} />
        {hint(g('rd6.plan.newPlanHint', { kg: (latestWeight?.weightKg ?? settings.startWeightKg).toFixed(1) }))}
      </View>

      {editWorkoutDraft ? null : assistant}

      <BottomSheet
        visible={startSheet}
        onClose={() => setStartSheet(false)}
        title={g('rd6.plan.startDate')}
        subtitle={g('rd6.plan.startDateHint')}
        footer={<QuestButton title={t('common.save')} onPress={handleSaveStartDate} />}
      >
        <View style={styles.sheetBody}>
          <HudText size={14}>{t('plan.startDateCurrentLabel', { date: formatDateVi(toDateKey(new Date(settings.startDateISO))) })}</HudText>
          {hint(t('plan.startDateHint'))}
          <DateOffsetPicker selectedDate={startDateDraft} onChange={setStartDateDraft} dark />
        </View>
      </BottomSheet>
    </ScreenTemplate>
  );
}

const styles = StyleSheet.create({
  hint: { lineHeight: 17 },
  card: { gap: 12, padding: 14, borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  tdeeBox: { gap: 2, padding: 12, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.manaBorder, backgroundColor: quest.manaPanel },
  newPlan: { gap: 6, marginTop: 12 },
  sheetBody: { gap: 10 },
});
