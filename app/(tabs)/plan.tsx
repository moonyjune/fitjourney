import { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { HudText } from '../../src/components/quest/HudText';
import { QuestButton } from '../../src/components/quest/QuestButton';
import { QuestDemographics } from '../../src/components/quest/QuestDemographics';
import { QuestField } from '../../src/components/quest/QuestField';
import { QuestHeader } from '../../src/components/quest/QuestHeader';
import { QuestPlanPreview } from '../../src/components/quest/QuestPlanPreview';
import { QuestSegment } from '../../src/components/quest/QuestSegment';
import { QuestShoppingList } from '../../src/components/quest/QuestShoppingList';
import { useGameText } from '../../src/game/strings';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLightStatusBar } from '../../src/theme/useLightStatusBar';
import { quest, questRadius } from '../../src/theme/quest';
import { DateOffsetPicker } from '../../src/components/DateOffsetPicker';
import { PlanChatAssistant } from '../../src/components/PlanChatAssistant';
import { useSettingsStore } from '../../src/store/useSettingsStore';
import { useAuthStore } from '../../src/store/useAuthStore';
import { usePlanStore } from '../../src/store/usePlanStore';
import { useWeightStore } from '../../src/store/useWeightStore';
import { formatDateVi, toDateKey } from '../../src/utils/date';
import { useSyncQueueStore } from '../../src/sync/syncQueue';
import { signOutAndReset } from '../../src/auth/signOut';
import { cancelAllReminders, requestNotificationPermissions, scheduleAllReminders } from '../../src/notifications/schedule';
import { CARB_SWAP_OPTIONS, PROTEIN_SWAP_OPTIONS } from '../../src/constants/plan';
import { useTranslation } from '../../src/i18n/useTranslation';
import { screenMaxWidthStyle } from '../../src/theme/responsive';
import { ACTIVITY_MULTIPLIER, resolveTdeeKcal } from '../../src/utils/tdee';
import type { ActivityLevel, Gender, PlanData } from '../../src/types';
import { useTabBarClearance } from '../../src/components/quest/QuestTabBar';

export default function PlanScreen() {
  const { t } = useTranslation();
  const g = useGameText();
  const insets = useSafeAreaInsets();
  const tabClearance = useTabBarClearance();
  useLightStatusBar();
  const settings = useSettingsStore();
  const session = useAuthStore((s) => s.session);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const plan = usePlanStore((s) => s.plan);
  const applyPlan = usePlanStore((s) => s.applyPlan);
  const pendingSyncCount = useSyncQueueStore((s) => s.pending.length);
  const { editWorkout } = useLocalSearchParams<{ editWorkout?: string }>();
  const editWorkoutDraft = editWorkout ? t('workout.editDraftTemplate', { label: decodeURIComponent(editWorkout) }) : undefined;

  const [calorieTarget, setCalorieTarget] = useState(String(settings.calorieTargetKcal));
  const [targetDeficit, setTargetDeficit] = useState(String(settings.targetDailyDeficitKcal));
  const [proteinTarget, setProteinTarget] = useState(String(settings.proteinTargetG));
  const [waterTarget, setWaterTarget] = useState(String(settings.waterTargetMl));
  const [goalWeight, setGoalWeight] = useState(String(settings.goalWeightKg));
  const [startDateDraft, setStartDateDraft] = useState(() => new Date(settings.startDateISO));
  const [startWeightText, setStartWeightText] = useState(String(settings.startWeightKg));
  const [heightText, setHeightText] = useState(settings.heightCm != null ? String(settings.heightCm) : '');
  const [ageText, setAgeText] = useState(settings.age != null ? String(settings.age) : '');
  const [genderDraft, setGenderDraft] = useState<Gender | null>(settings.gender);
  const [activityLevelDraft, setActivityLevelDraft] = useState<ActivityLevel | null>(settings.activityLevel);
  const latestWeight = useWeightStore((s) => s.latest());

  // Plan's BMR/TDEE preview uses the plan's STARTING weight (the draft field right above it, so it
  // updates live as the user edits it) — a fixed reference point for the plan itself. Today/
  // Nutrition's TdeeCard is the one that tracks day-to-day progress via the current logged weight.
  const startWeightForPreview = useMemo(() => {
    const parsed = parseFloat(startWeightText.replace(',', '.'));
    return parsed > 0 ? parsed : settings.startWeightKg;
  }, [startWeightText, settings.startWeightKg]);
  const tdeePreview = useMemo(
    () =>
      resolveTdeeKcal({
        gender: genderDraft,
        age: ageText ? parseInt(ageText, 10) : null,
        heightCm: heightText ? parseFloat(heightText.replace(',', '.')) : null,
        activityLevel: activityLevelDraft,
        weightKg: startWeightForPreview,
        calorieTargetKcal: settings.calorieTargetKcal,
        targetDailyDeficitKcal: settings.targetDailyDeficitKcal,
      }),
    [genderDraft, ageText, heightText, activityLevelDraft, startWeightForPreview, settings.calorieTargetKcal, settings.targetDailyDeficitKcal]
  );

  function handleSaveStartDate() {
    updateSettings({ startDateISO: startDateDraft.toISOString() });
    Alert.alert(t('plan.savedTitle'), t('plan.startDateSavedMessage'));
  }

  function handleStartNewPlan() {
    const currentWeight = latestWeight?.weightKg ?? settings.startWeightKg;
    const today = new Date();
    updateSettings({ startDateISO: today.toISOString(), startWeightKg: currentWeight });
    setStartDateDraft(today);
    Alert.alert(t('plan.newPlanStartedTitle'), t('plan.newPlanStartedMessage', { kg: currentWeight.toFixed(1) }));
  }

  const submitCoachCode = useSettingsStore((s) => s.submitCoachCode);
  const switchToCoachMode = useSettingsStore((s) => s.switchToCoachMode);
  const [coachCodeInput, setCoachCodeInput] = useState('');
  const [linkingCoach, setLinkingCoach] = useState(false);
  const [switchingMode, setSwitchingMode] = useState(false);

  async function handleSwitchToCoach() {
    setSwitchingMode(true);
    await switchToCoachMode();
    setSwitchingMode(false);
    router.replace('/(tabs)/clients');
  }

  async function handleLinkCoach() {
    if (!coachCodeInput.trim()) return;
    setLinkingCoach(true);
    const result = await submitCoachCode(coachCodeInput);
    setLinkingCoach(false);
    if (result.ok) {
      setCoachCodeInput('');
      Alert.alert(t('plan.linkedTitle'), t('plan.linkedMessage'));
    } else {
      Alert.alert(t('plan.linkFailedTitle'), result.message);
    }
  }

  function saveTargets() {
    const cal = parseFloat(calorieTarget);
    const protein = parseFloat(proteinTarget);
    const water = parseFloat(waterTarget);
    const goal = parseFloat(goalWeight);
    const deficit = parseFloat(targetDeficit);
    if (!cal || !protein || !water || !goal || !deficit) {
      Alert.alert(t('common.error'), t('plan.invalidValuesMessage'));
      return;
    }
    updateSettings({
      calorieTargetKcal: cal,
      targetDailyDeficitKcal: deficit,
      proteinTargetG: protein,
      waterTargetMl: water,
      goalWeightKg: goal,
    });
    Alert.alert(t('plan.savedTitle'), t('plan.savedMessage'));
  }

  function saveDemographics() {
    const heightCm = heightText ? parseFloat(heightText.replace(',', '.')) : null;
    const age = ageText ? parseInt(ageText, 10) : null;
    const startWeightKg = parseFloat(startWeightText.replace(',', '.'));
    if (!startWeightKg || startWeightKg <= 0) {
      Alert.alert(t('common.error'), t('plan.invalidValuesMessage'));
      return;
    }
    updateSettings({ startWeightKg, heightCm, age, gender: genderDraft, activityLevel: activityLevelDraft });
    Alert.alert(t('plan.savedTitle'), t('plan.demographicsSavedMessage'));
  }

  async function handleToggleReminders(value: boolean) {
    try {
      if (value) {
        const granted = await requestNotificationPermissions();
        if (!granted) {
          Alert.alert(t('plan.permissionTitle'), t('plan.permissionMessage'));
          return;
        }
        await scheduleAllReminders(plan);
      } else {
        await cancelAllReminders();
      }
    } catch (error) {
      // expo-notifications isn't available in Expo Go (SDK 53+); still let the preference save.
      console.warn('[notifications] unavailable in this runtime:', error);
    }
    updateSettings({ remindersEnabled: value });
  }

  async function handleApplyPlan(newPlan: PlanData) {
    applyPlan(newPlan);
    if (settings.remindersEnabled) {
      await scheduleAllReminders(newPlan);
    }
  }

  const sectionTitle = (text: string) => (
    <HudText size={16} style={styles.sectionTitle} accessibilityRole="header">
      {text}
    </HudText>
  );
  const hint = (text: string) => (
    <HudText size={12} weight="medium" color={quest.textSecondary} style={styles.hint}>
      {text}
    </HudText>
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, screenMaxWidthStyle, { paddingTop: insets.top + 16, paddingBottom: tabClearance }]}
      keyboardShouldPersistTaps="handled"
    >
      <QuestHeader
        title={g('planScreen.title')}
        eyebrow={g('planScreen.eyebrow')}
        backLabel={g('planScreen.back')}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profile'))}
      />

      {sectionTitle(t('mode.title'))}
      <View style={styles.card}>
        <HudText size={13} weight="medium" color={quest.textSecondary}>
          {settings.coachEnabled ? t('plan.coachFieldEnabled') : t('plan.coachFieldDisabled')}
        </HudText>
        <QuestButton
          title={settings.coachEnabled ? t('plan.switchToCoach') : t('plan.activateCoach')}
          onPress={handleSwitchToCoach}
          loading={switchingMode}
          variant="mana"
        />
      </View>

      {sectionTitle(t('mode.language'))}
      <QuestSegment
        accessibilityLabel={t('mode.language')}
        value={settings.language}
        onChange={(language) => updateSettings({ language })}
        options={[
          { value: 'vi', label: 'Tiếng Việt' },
          { value: 'en', label: 'English' },
        ]}
      />

      {sectionTitle(t('plan.aiTitle'))}
      {hint(t('plan.aiHint'))}
      <PlanChatAssistant livePlan={plan} onApply={handleApplyPlan} initialDraft={editWorkoutDraft} dark />

      {sectionTitle(t('plan.remindersTitle'))}
      <View style={[styles.card, styles.switchRow]}>
        <View style={styles.flex}>
          <HudText size={14}>{t('plan.remindersLabel')}</HudText>
          {hint(t('plan.remindersHint'))}
        </View>
        <Switch
          accessibilityLabel={t('plan.remindersLabel')}
          value={settings.remindersEnabled}
          onValueChange={handleToggleReminders}
          trackColor={{ true: quest.gold, false: quest.border }}
          thumbColor={quest.text}
        />
      </View>

      {sectionTitle(t('plan.startDateTitle'))}
      <View style={styles.card}>
        <HudText size={14}>
          {t('plan.startDateCurrentLabel', { date: formatDateVi(toDateKey(new Date(settings.startDateISO))) })}
        </HudText>
        {hint(t('plan.startDateHint'))}
        <DateOffsetPicker selectedDate={startDateDraft} onChange={setStartDateDraft} dark />
        <QuestButton title={t('common.save')} onPress={handleSaveStartDate} />
        <QuestButton title={t('plan.startNewPlanButton')} variant="ghost" onPress={handleStartNewPlan} />
      </View>

      {sectionTitle(t('plan.goalsTitle'))}
      <View style={styles.card}>
        <QuestField label={t('plan.goalWeightLabel')} keyboardType="decimal-pad" value={goalWeight} onChangeText={setGoalWeight} />
        <QuestField label={t('plan.calorieTargetLabel')} keyboardType="decimal-pad" value={calorieTarget} onChangeText={setCalorieTarget} />
        <QuestField label={t('plan.targetDeficitLabel')} keyboardType="decimal-pad" value={targetDeficit} onChangeText={setTargetDeficit} />
        {hint(t('plan.targetDeficitHint'))}
        <QuestField label={t('plan.proteinTargetLabel')} keyboardType="decimal-pad" value={proteinTarget} onChangeText={setProteinTarget} />
        <QuestField label={t('plan.waterTargetLabel')} keyboardType="decimal-pad" value={waterTarget} onChangeText={setWaterTarget} />
        <QuestButton title={t('plan.saveGoalsButton')} onPress={saveTargets} />
      </View>

      {sectionTitle(t('plan.demographicsTitle'))}
      <View style={styles.card}>
        {hint(t('plan.demographicsHint'))}
        <QuestField label={t('plan.startWeightLabel')} keyboardType="decimal-pad" value={startWeightText} onChangeText={setStartWeightText} />
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
          <HudText size={11} color={quest.manaText}>
            {t('plan.tdeePreviewLabel')}
          </HudText>
          <HudText size={22} color={quest.mana}>
            {Math.round(tdeePreview.tdeeKcal)} kcal
          </HudText>
          {tdeePreview.bmrKcal != null && activityLevelDraft && (
            <HudText size={12} weight="medium" color={quest.manaText}>
              {t('plan.bmrPreviewLabel', {
                kcal: Math.round(tdeePreview.bmrKcal),
                multiplier: ACTIVITY_MULTIPLIER[activityLevelDraft],
              })}
            </HudText>
          )}
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {t(tdeePreview.source === 'profile' ? 'tdee.sourceProfile' : 'plan.tdeePreviewIncompleteHint')}
          </HudText>
        </View>
        <QuestButton title={t('plan.saveDemographicsButton')} onPress={saveDemographics} />
      </View>

      {sectionTitle(t('plan.currentPlanTitle'))}
      <QuestPlanPreview plan={plan} hideShoppingList />
      <QuestShoppingList plan={plan} />

      {sectionTitle(t('plan.swapTitle'))}
      <View style={styles.card}>
        <HudText size={14}>{t('plan.swapCarbGroup')}</HudText>
        {CARB_SWAP_OPTIONS.map((item) => (
          <HudText key={item} size={13} weight="medium" color={quest.textTertiary}>
            • {item}
          </HudText>
        ))}
        <HudText size={14} style={{ marginTop: 8 }}>
          {t('plan.swapProteinGroup')}
        </HudText>
        {PROTEIN_SWAP_OPTIONS.map((item) => (
          <HudText key={item} size={13} weight="medium" color={quest.textTertiary}>
            • {item}
          </HudText>
        ))}
      </View>

      {sectionTitle(t('plan.coachSectionTitle'))}
      <View style={styles.card}>
        {settings.coachId ? (
          <>
            <HudText size={14}>{t('plan.linkedToCoach')}</HudText>
            <View style={styles.coachInfo}>
              <HudText size={12} weight="medium" color={quest.textSecondary}>
                {t('plan.coachEmailLabel')}
              </HudText>
              <HudText size={14} selectable>
                {settings.linkedCoachEmail ?? t('plan.coachUnknown')}
              </HudText>
              <HudText size={12} weight="medium" color={quest.textSecondary}>
                {t('plan.coachCodeLabel')}
              </HudText>
              <HudText size={14} selectable>
                {settings.linkedCoachCode ?? t('plan.coachUnknown')}
              </HudText>
              {settings.linkedCoachSinceISO && (
                <>
                  <HudText size={12} weight="medium" color={quest.textSecondary}>
                    {t('plan.coachSinceLabel')}
                  </HudText>
                  <HudText size={14}>{formatDateVi(settings.linkedCoachSinceISO.slice(0, 10))}</HudText>
                </>
              )}
            </View>
            <HudText size={12} weight="medium" color={quest.textSecondary}>
              {t('plan.coachOneOnly')}
            </HudText>
          </>
        ) : (
          <>
            <QuestField
              label={t('plan.enterCoachCode')}
              autoCapitalize="characters"
              placeholder={t('plan.coachCodePlaceholder')}
              value={coachCodeInput}
              onChangeText={setCoachCodeInput}
            />
            <QuestButton title={t('plan.linkButton')} onPress={handleLinkCoach} loading={linkingCoach} />
          </>
        )}
      </View>

      {sectionTitle(t('tab.account'))}
      <View style={styles.card}>
        <HudText size={14}>{session?.user.email ?? t('common.notSignedIn')}</HudText>
        {pendingSyncCount > 0 && (
          <HudText size={12} color={quest.gold}>
            {t('sync.pendingCount', { n: pendingSyncCount })}
          </HudText>
        )}
        <QuestButton title={t('common.signOut')} onPress={() => signOutAndReset()} variant="ghost" />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: quest.bg },
  coachInfo: { gap: 2 },
  content: { paddingHorizontal: 16, paddingBottom: 48, gap: 12 },
  flex: { flex: 1 },
  sectionTitle: { marginTop: 8 },
  hint: { lineHeight: 17 },
  card: { gap: 12, padding: 14, borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  switchRow: { flexDirection: 'row', alignItems: 'center' },
  tdeeBox: { gap: 2, padding: 12, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.manaBorder, backgroundColor: quest.manaPanel },
});
