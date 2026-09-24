import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Card } from '../../src/components/Card';
import { Badge } from '../../src/components/Badge';
import { Button } from '../../src/components/Button';
import { DateOffsetPicker } from '../../src/components/DateOffsetPicker';
import { PlanPreview } from '../../src/components/PlanPreview';
import { ShoppingListEditor } from '../../src/components/ShoppingListEditor';
import { PlanChatAssistant } from '../../src/components/PlanChatAssistant';
import { DemographicsFields } from '../../src/components/DemographicsFields';
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
import { useAccentColors } from '../../src/theme/useAccentColors';
import { colors, radius, spacing, typography } from '../../src/theme/tokens';
import { screenMaxWidthStyle } from '../../src/theme/responsive';
import { useAmbientBackground } from '../../src/theme/useAmbientBackground';
import type { ActivityLevel, Gender, PlanData } from '../../src/types';

export default function PlanScreen() {
  const { t } = useTranslation();
  const ambientBg = useAmbientBackground();
  const accent = useAccentColors();
  const settings = useSettingsStore();
  const session = useAuthStore((s) => s.session);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const plan = usePlanStore((s) => s.plan);
  const applyPlan = usePlanStore((s) => s.applyPlan);
  const pendingSyncCount = useSyncQueueStore((s) => s.pending.length);
  const { editWorkout } = useLocalSearchParams<{ editWorkout?: string }>();
  const editWorkoutDraft = editWorkout ? t('workout.editDraftTemplate', { label: decodeURIComponent(editWorkout) }) : undefined;

  const [calorieTarget, setCalorieTarget] = useState(String(settings.calorieTargetKcal));
  const [proteinTarget, setProteinTarget] = useState(String(settings.proteinTargetG));
  const [waterTarget, setWaterTarget] = useState(String(settings.waterTargetMl));
  const [goalWeight, setGoalWeight] = useState(String(settings.goalWeightKg));
  const [startDateDraft, setStartDateDraft] = useState(() => new Date(settings.startDateISO));
  const [heightText, setHeightText] = useState(settings.heightCm != null ? String(settings.heightCm) : '');
  const [ageText, setAgeText] = useState(settings.age != null ? String(settings.age) : '');
  const [genderDraft, setGenderDraft] = useState<Gender | null>(settings.gender);
  const [activityLevelDraft, setActivityLevelDraft] = useState<ActivityLevel | null>(settings.activityLevel);
  const latestWeight = useWeightStore((s) => s.latest());

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
    if (!cal || !protein || !water || !goal) {
      Alert.alert(t('common.error'), t('plan.invalidValuesMessage'));
      return;
    }
    updateSettings({ calorieTargetKcal: cal, proteinTargetG: protein, waterTargetMl: water, goalWeightKg: goal });
    Alert.alert(t('plan.savedTitle'), t('plan.savedMessage'));
  }

  function saveDemographics() {
    const heightCm = heightText ? parseFloat(heightText.replace(',', '.')) : null;
    const age = ageText ? parseInt(ageText, 10) : null;
    updateSettings({ heightCm, age, gender: genderDraft, activityLevel: activityLevelDraft });
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

  return (
    <ScrollView style={[styles.container, { backgroundColor: ambientBg }]} contentContainerStyle={[styles.content, screenMaxWidthStyle]}>
      <Text style={styles.sectionTitle}>{t('mode.title')}</Text>
      <Card>
        <Text style={styles.fieldLabel}>{settings.coachEnabled ? t('plan.coachFieldEnabled') : t('plan.coachFieldDisabled')}</Text>
        <Button
          title={settings.coachEnabled ? t('plan.switchToCoach') : t('plan.activateCoach')}
          onPress={handleSwitchToCoach}
          loading={switchingMode}
        />
      </Card>

      <Text style={styles.sectionTitle}>{t('mode.language')}</Text>
      <Card>
        <View style={styles.languageRow}>
          <TouchableOpacity
            style={[styles.languageButton, settings.language === 'vi' && { backgroundColor: accent.primary }]}
            onPress={() => updateSettings({ language: 'vi' })}
          >
            <Text style={[styles.languageButtonText, settings.language === 'vi' && styles.languageButtonTextActive]}>Tiếng Việt</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.languageButton, settings.language === 'en' && { backgroundColor: accent.primary }]}
            onPress={() => updateSettings({ language: 'en' })}
          >
            <Text style={[styles.languageButtonText, settings.language === 'en' && styles.languageButtonTextActive]}>English</Text>
          </TouchableOpacity>
        </View>
      </Card>

      <Text style={styles.sectionTitle}>{t('plan.aiTitle')}</Text>
      <Text style={styles.aiHint}>{t('plan.aiHint')}</Text>
      <PlanChatAssistant livePlan={plan} onApply={handleApplyPlan} initialDraft={editWorkoutDraft} />

      <Text style={styles.sectionTitle}>{t('plan.remindersTitle')}</Text>
      <Card>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>{t('plan.remindersLabel')}</Text>
            <Text style={styles.switchHint}>{t('plan.remindersHint')}</Text>
          </View>
          <Switch value={settings.remindersEnabled} onValueChange={handleToggleReminders} />
        </View>
      </Card>

      <Text style={styles.sectionTitle}>{t('plan.startDateTitle')}</Text>
      <Card>
        <Text style={styles.fieldLabel}>
          {t('plan.startDateCurrentLabel', { date: formatDateVi(toDateKey(new Date(settings.startDateISO))) })}
        </Text>
        <Text style={styles.switchHint}>{t('plan.startDateHint')}</Text>
        <DateOffsetPicker selectedDate={startDateDraft} onChange={setStartDateDraft} />
        <View style={styles.planStartActions}>
          <Button title={t('common.save')} size="sm" onPress={handleSaveStartDate} flex />
          <Button title={t('plan.startNewPlanButton')} size="sm" variant="outline" onPress={handleStartNewPlan} flex />
        </View>
      </Card>

      <Text style={styles.sectionTitle}>{t('plan.goalsTitle')}</Text>
      <Card>
        <Text style={styles.fieldLabel}>{t('plan.goalWeightLabel')}</Text>
        <TextInput style={styles.input} keyboardType="decimal-pad" value={goalWeight} onChangeText={setGoalWeight} />
        <Text style={styles.fieldLabel}>{t('plan.calorieTargetLabel')}</Text>
        <TextInput style={styles.input} keyboardType="decimal-pad" value={calorieTarget} onChangeText={setCalorieTarget} />
        <Text style={styles.fieldLabel}>{t('plan.proteinTargetLabel')}</Text>
        <TextInput style={styles.input} keyboardType="decimal-pad" value={proteinTarget} onChangeText={setProteinTarget} />
        <Text style={styles.fieldLabel}>{t('plan.waterTargetLabel')}</Text>
        <TextInput style={styles.input} keyboardType="decimal-pad" value={waterTarget} onChangeText={setWaterTarget} />
        <Button title={t('plan.saveGoalsButton')} onPress={saveTargets} />
      </Card>

      <Text style={styles.sectionTitle}>{t('plan.demographicsTitle')}</Text>
      <Card>
        <Text style={styles.demographicsHint}>{t('plan.demographicsHint')}</Text>
        <Text style={styles.fieldLabel}>{t('plan.heightLabel')}</Text>
        <TextInput style={styles.input} keyboardType="decimal-pad" value={heightText} onChangeText={setHeightText} placeholder="170" />
        <DemographicsFields
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
        <Button title={t('plan.saveDemographicsButton')} onPress={saveDemographics} style={{ marginTop: spacing.md }} />
      </Card>

      <Text style={styles.sectionTitle}>{t('plan.currentPlanTitle')}</Text>
      <PlanPreview plan={plan} hideShoppingList />
      <ShoppingListEditor plan={plan} />

      <Text style={styles.sectionTitle}>{t('plan.swapTitle')}</Text>
      <Card>
        <Text style={styles.swapGroupTitle}>{t('plan.swapCarbGroup')}</Text>
        {CARB_SWAP_OPTIONS.map((item) => (
          <Text key={item} style={styles.swapItem}>
            • {item}
          </Text>
        ))}
        <Text style={[styles.swapGroupTitle, { marginTop: spacing.md }]}>{t('plan.swapProteinGroup')}</Text>
        {PROTEIN_SWAP_OPTIONS.map((item) => (
          <Text key={item} style={styles.swapItem}>
            • {item}
          </Text>
        ))}
      </Card>

      <Text style={styles.sectionTitle}>{t('plan.coachSectionTitle')}</Text>
      <Card>
        {settings.coachId ? (
          <Text style={styles.fieldLabel}>{t('plan.linkedToCoach')}</Text>
        ) : (
          <>
            <Text style={styles.fieldLabel}>{t('plan.enterCoachCode')}</Text>
            <TextInput
              style={styles.input}
              autoCapitalize="characters"
              placeholder={t('plan.coachCodePlaceholder')}
              value={coachCodeInput}
              onChangeText={setCoachCodeInput}
            />
            <Button title={t('plan.linkButton')} onPress={handleLinkCoach} loading={linkingCoach} />
          </>
        )}
      </Card>

      <Text style={styles.sectionTitle}>{t('tab.account')}</Text>
      <Card>
        <Text style={styles.fieldLabel}>{session?.user.email ?? t('common.notSignedIn')}</Text>
        {pendingSyncCount > 0 && (
          <Badge tone="warning" label={t('sync.pendingCount', { n: pendingSyncCount })} />
        )}
        <Button title={t('common.signOut')} onPress={() => signOutAndReset()} variant="danger" style={{ marginTop: spacing.sm }} />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.base, paddingBottom: spacing.xxl },
  sectionTitle: { ...typography.title, marginTop: spacing.sm, marginBottom: spacing.sm, color: colors.textPrimary },
  fieldLabel: { ...typography.label, color: '#444', marginBottom: spacing.xs },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  switchHint: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  aiHint: { fontSize: 12, color: colors.textSecondary, marginBottom: spacing.sm, lineHeight: 17 },
  demographicsHint: { fontSize: 11, color: colors.textMuted, marginBottom: spacing.md, lineHeight: 15 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    fontSize: 15,
    marginBottom: spacing.sm,
  },
  swapGroupTitle: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  swapItem: { fontSize: 13, color: '#444', marginTop: 4, lineHeight: 18 },
  languageRow: { flexDirection: 'row', gap: spacing.sm },
  planStartActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  languageButton: { flex: 1, backgroundColor: colors.neutralLight, borderRadius: radius.sm, paddingVertical: spacing.md, alignItems: 'center' },
  languageButtonText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  languageButtonTextActive: { color: colors.white },
});
