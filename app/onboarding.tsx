import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSettingsStore } from '../src/store/useSettingsStore';
import { DEFAULT_START_WEIGHT_KG } from '../src/constants/plan';
import { HudText } from '../src/components/quest/HudText';
import { QuestButton } from '../src/components/quest/QuestButton';
import { QuestDemographics } from '../src/components/quest/QuestDemographics';
import { QuestField } from '../src/components/quest/QuestField';
import { useGameText } from '../src/game/strings';
import { useTranslation } from '../src/i18n/useTranslation';
import type { StringKey } from '../src/i18n/strings';
import { quest } from '../src/theme/quest';
import { useLightStatusBar } from '../src/theme/useLightStatusBar';
import { screenMaxWidthStyle } from '../src/theme/responsive';
import type { ActivityLevel, Gender } from '../src/types';

const TOTAL_STEPS = 4;
type Step = 1 | 2 | 3 | 4;

export default function OnboardingScreen() {
  const { t } = useTranslation();
  const g = useGameText();
  useLightStatusBar();
  const completeOnboarding = useSettingsStore((s) => s.completeOnboarding);
  const submitCoachCode = useSettingsStore((s) => s.submitCoachCode);
  const [step, setStep] = useState<Step>(1);
  const [startWeight, setStartWeight] = useState(String(DEFAULT_START_WEIGHT_KG));
  const [goalWeight, setGoalWeight] = useState(String(DEFAULT_START_WEIGHT_KG - 15));
  const [height, setHeight] = useState('');
  const [ageText, setAgeText] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [activityLevel, setActivityLevel] = useState<ActivityLevel | null>(null);
  const [coachCode, setCoachCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ start?: string; goal?: string }>({});

  const parsedStart = parseFloat(startWeight.replace(',', '.'));
  const parsedGoal = parseFloat(goalWeight.replace(',', '.'));

  /** The same rules the single-screen version enforced on submit, now checked as soon as the step is left. */
  function validateWeights(): boolean {
    const next: { start?: string; goal?: string } = {};
    if (!parsedStart || parsedStart <= 0) next.start = g('onboarding.errStartWeight');
    else if (!parsedGoal || parsedGoal <= 0 || parsedGoal >= parsedStart) next.goal = g('onboarding.errGoalWeight');
    setErrors(next);
    return !next.start && !next.goal;
  }

  function goNext() {
    if (step === 1 && !validateWeights()) return;
    setStep((s) => Math.min(TOTAL_STEPS, s + 1) as Step);
  }

  function goBack() {
    setErrors({});
    setStep((s) => Math.max(1, s - 1) as Step);
  }

  async function handleSubmit() {
    const startWeightKg = parsedStart;
    const goalWeightKg = parsedGoal;
    const heightCm = height ? parseFloat(height.replace(',', '.')) : null;
    const age = ageText ? parseInt(ageText, 10) : null;

    // Steps already block bad weights; keep the check so no path can save an invalid plan.
    if (!startWeightKg || startWeightKg <= 0) {
      setStep(1);
      setErrors({ start: g('onboarding.errStartWeight') });
      return;
    }
    if (!goalWeightKg || goalWeightKg <= 0 || goalWeightKg >= startWeightKg) {
      setStep(1);
      setErrors({ goal: g('onboarding.errGoalWeight') });
      return;
    }

    setBusy(true);
    completeOnboarding(startWeightKg, goalWeightKg, heightCm, { age, gender, activityLevel });
    if (coachCode.trim()) {
      const result = await submitCoachCode(coachCode);
      if (!result.ok) {
        Alert.alert('Không liên kết được với Coach', result.message + '\nBạn vẫn có thể thử lại sau ở tab Kế hoạch.');
      }
    }
    setBusy(false);
    router.replace('/(tabs)');
  }

  const titles: Record<Step, string> = {
    1: g('onboarding.stepWeightTitle'),
    2: g('onboarding.stepBodyTitle'),
    3: g('onboarding.stepCoachTitle'),
    4: g('onboarding.stepReviewTitle'),
  };
  const notSet = g('onboarding.reviewNotSet');
  const review: { label: string; value: string }[] = [
    { label: t('onboarding.startWeight'), value: `${startWeight} kg` },
    { label: t('onboarding.goalWeight'), value: `${goalWeight} kg` },
    { label: t('onboarding.height'), value: height ? `${height} cm` : notSet },
    { label: t('onboarding.age'), value: ageText || notSet },
    { label: t('onboarding.genderLabel'), value: gender ? t(`gender.${gender}` as StringKey) : notSet },
    { label: t('onboarding.activityLevelLabel'), value: activityLevel ? t(`activityLevel.${activityLevel}` as StringKey) : notSet },
    { label: t('onboarding.coachCode'), value: coachCode.trim() ? coachCode.trim().toUpperCase() : notSet },
  ];

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.content, screenMaxWidthStyle]} keyboardShouldPersistTaps="handled">
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={g('onboarding.progressA11y', { n: step, total: TOTAL_STEPS, title: titles[step] })}
          accessibilityValue={{ min: 1, max: TOTAL_STEPS, now: step }}
          style={styles.progress}
        >
          <View style={styles.bars}>
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <View key={i} style={[styles.bar, i < step && styles.barOn]} />
            ))}
          </View>
          <HudText size={12} color={quest.textSecondary} style={styles.eyebrow}>
            {g('onboarding.step', { n: step, total: TOTAL_STEPS }).toUpperCase()}
          </HudText>
        </View>

        <HudText size={28} accessibilityRole="header">
          {step === 1 ? t('onboarding.title') : titles[step]}
        </HudText>
        {(step === 1 || step === 4) && (
          <HudText size={14} weight="medium" color={quest.textSecondary}>
            {step === 1 ? t('onboarding.subtitle') : g('onboarding.reviewIntro')}
          </HudText>
        )}

        {step === 1 && (
          <View style={styles.stack}>
            <QuestField label={t('onboarding.startWeight')} keyboardType="decimal-pad" value={startWeight} onChangeText={setStartWeight} placeholder="110" unit="kg" />
            {errors.start ? <FieldError text={errors.start} /> : null}
            <QuestField label={t('onboarding.goalWeight')} keyboardType="decimal-pad" value={goalWeight} onChangeText={setGoalWeight} placeholder="95" unit="kg" />
            {errors.goal ? <FieldError text={errors.goal} /> : null}
          </View>
        )}

        {step === 2 && (
          <View style={styles.stack}>
            <QuestField label={t('onboarding.height')} keyboardType="decimal-pad" value={height} onChangeText={setHeight} placeholder="170" unit="cm" />
            <QuestDemographics
              ageText={ageText}
              onAgeTextChange={setAgeText}
              ageLabelKey="onboarding.age"
              gender={gender}
              onGenderChange={setGender}
              genderLabelKey="onboarding.genderLabel"
              activityLevel={activityLevel}
              onActivityLevelChange={setActivityLevel}
              activityLevelLabelKey="onboarding.activityLevelLabel"
            />
            <HudText size={12} weight="medium" color={quest.textSecondary}>
              {t('onboarding.demographicsHint')}
            </HudText>
          </View>
        )}

        {step === 3 && (
          <View style={styles.stack}>
            <QuestField label={t('onboarding.coachCode')} autoCapitalize="characters" value={coachCode} onChangeText={setCoachCode} placeholder="VD: AB12CD" />
          </View>
        )}

        {step === 4 && (
          <View style={styles.review}>
            {review.map((row) => (
              <View key={row.label} style={styles.reviewRow}>
                <HudText size={12} weight="medium" color={quest.textSecondary}>
                  {row.label}
                </HudText>
                <HudText size={14} color={row.value === notSet ? quest.textSecondary : quest.text}>
                  {row.value}
                </HudText>
              </View>
            ))}
          </View>
        )}

        <View style={styles.actions}>
          {step < TOTAL_STEPS ? (
            <QuestButton title={g('onboarding.next')} onPress={goNext} icon="chevron" />
          ) : (
            <QuestButton title={t('onboarding.start')} onPress={handleSubmit} loading={busy} icon="chevron" />
          )}
          {step > 1 && <QuestButton title={g('onboarding.back')} onPress={goBack} variant="ghost" disabled={busy} />}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function FieldError({ text }: { text: string }) {
  return (
    <HudText size={13} weight="medium" color={quest.hpText} accessibilityRole="alert" accessibilityLiveRegion="polite">
      {text}
    </HudText>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: quest.bg },
  content: { padding: 24, paddingTop: 64, paddingBottom: 48, gap: 16 },
  progress: { gap: 8 },
  bars: { flexDirection: 'row', gap: 6 },
  bar: { flex: 1, height: 6, borderRadius: 3, backgroundColor: quest.border },
  barOn: { backgroundColor: quest.gold },
  eyebrow: { letterSpacing: 1.6 },
  stack: { gap: 16 },
  review: { backgroundColor: quest.panel, borderColor: quest.border, borderWidth: 1.5, borderRadius: 16, padding: 14, gap: 12 },
  reviewRow: { gap: 2 },
  actions: { gap: 12, marginTop: 8 },
});
