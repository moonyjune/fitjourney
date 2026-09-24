import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { router } from 'expo-router';
import { useSettingsStore } from '../src/store/useSettingsStore';
import { DEFAULT_START_WEIGHT_KG } from '../src/constants/plan';
import { Button } from '../src/components/Button';
import { DemographicsFields } from '../src/components/DemographicsFields';
import { useTranslation } from '../src/i18n/useTranslation';
import { colors, radius, spacing, typography } from '../src/theme/tokens';
import { screenMaxWidthStyle } from '../src/theme/responsive';
import type { ActivityLevel, Gender } from '../src/types';

export default function OnboardingScreen() {
  const { t } = useTranslation();
  const completeOnboarding = useSettingsStore((s) => s.completeOnboarding);
  const submitCoachCode = useSettingsStore((s) => s.submitCoachCode);
  const [startWeight, setStartWeight] = useState(String(DEFAULT_START_WEIGHT_KG));
  const [goalWeight, setGoalWeight] = useState(String(DEFAULT_START_WEIGHT_KG - 15));
  const [height, setHeight] = useState('');
  const [ageText, setAgeText] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [activityLevel, setActivityLevel] = useState<ActivityLevel | null>(null);
  const [coachCode, setCoachCode] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    const startWeightKg = parseFloat(startWeight.replace(',', '.'));
    const goalWeightKg = parseFloat(goalWeight.replace(',', '.'));
    const heightCm = height ? parseFloat(height.replace(',', '.')) : null;
    const age = ageText ? parseInt(ageText, 10) : null;

    if (!startWeightKg || startWeightKg <= 0) {
      Alert.alert('Lỗi', 'Vui lòng nhập cân nặng hiện tại hợp lệ.');
      return;
    }
    if (!goalWeightKg || goalWeightKg <= 0 || goalWeightKg >= startWeightKg) {
      Alert.alert('Lỗi', 'Cân nặng mục tiêu phải nhỏ hơn cân nặng hiện tại.');
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

  return (
    <ScrollView contentContainerStyle={[styles.container, screenMaxWidthStyle]}>
      <Text style={styles.title}>{t('onboarding.title')}</Text>
      <Text style={styles.subtitle}>{t('onboarding.subtitle')}</Text>

      <Text style={styles.label}>{t('onboarding.startWeight')}</Text>
      <TextInput style={styles.input} keyboardType="decimal-pad" value={startWeight} onChangeText={setStartWeight} placeholder="110" />

      <Text style={styles.label}>{t('onboarding.goalWeight')}</Text>
      <TextInput style={styles.input} keyboardType="decimal-pad" value={goalWeight} onChangeText={setGoalWeight} placeholder="95" />

      <Text style={styles.label}>{t('onboarding.height')}</Text>
      <TextInput style={styles.input} keyboardType="decimal-pad" value={height} onChangeText={setHeight} placeholder="170" />

      <DemographicsFields
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
      <Text style={styles.demographicsHint}>{t('onboarding.demographicsHint')}</Text>

      <Text style={styles.label}>{t('onboarding.coachCode')}</Text>
      <TextInput style={styles.input} autoCapitalize="characters" value={coachCode} onChangeText={setCoachCode} placeholder="VD: AB12CD" />

      <Button
        title={busy ? t('common.loading') : t('onboarding.start')}
        onPress={handleSubmit}
        loading={busy}
        style={{ marginTop: spacing.xxl }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.xl, paddingTop: 60, backgroundColor: colors.surface, flexGrow: 1 },
  title: { ...typography.h1, marginBottom: spacing.sm, color: colors.textPrimary },
  subtitle: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.xl, lineHeight: 20 },
  label: { ...typography.label, marginBottom: spacing.sm, marginTop: spacing.md, color: '#333' },
  demographicsHint: { ...typography.small, fontWeight: '400', color: colors.textMuted, marginTop: spacing.sm, lineHeight: 15 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    fontSize: 16,
  },
});
