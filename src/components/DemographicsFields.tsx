import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTranslation } from '../i18n/useTranslation';
import type { StringKey } from '../i18n/strings';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { ACTIVITY_MULTIPLIER } from '../utils/tdee';
import type { ActivityLevel, Gender } from '../types';

const GENDERS: { value: Gender; labelKey: StringKey }[] = [
  { value: 'male', labelKey: 'gender.male' },
  { value: 'female', labelKey: 'gender.female' },
];

const ACTIVITY_LEVELS: { value: ActivityLevel; labelKey: StringKey; hintKey: StringKey }[] = [
  { value: 'sedentary', labelKey: 'activityLevel.sedentary', hintKey: 'activityLevel.sedentaryHint' },
  { value: 'light', labelKey: 'activityLevel.light', hintKey: 'activityLevel.lightHint' },
  { value: 'moderate', labelKey: 'activityLevel.moderate', hintKey: 'activityLevel.moderateHint' },
  { value: 'active', labelKey: 'activityLevel.active', hintKey: 'activityLevel.activeHint' },
  { value: 'very_active', labelKey: 'activityLevel.very_active', hintKey: 'activityLevel.very_activeHint' },
];

interface DemographicsFieldsProps {
  ageText: string;
  onAgeTextChange: (text: string) => void;
  ageLabelKey: StringKey;
  gender: Gender | null;
  onGenderChange: (g: Gender) => void;
  genderLabelKey: StringKey;
  activityLevel: ActivityLevel | null;
  onActivityLevelChange: (a: ActivityLevel) => void;
  activityLevelLabelKey: StringKey;
}

/** Age/gender/activity-level inputs shared by Onboarding (initial, optional) and Plan (editable
 *  later) — the three fields (plus height, handled separately per-screen since it's already
 *  collected elsewhere) needed to compute a real Mifflin-St Jeor TDEE instead of the cruder
 *  plan-target-derived fallback (see src/utils/tdee.ts). */
export function DemographicsFields({
  ageText,
  onAgeTextChange,
  ageLabelKey,
  gender,
  onGenderChange,
  genderLabelKey,
  activityLevel,
  onActivityLevelChange,
  activityLevelLabelKey,
}: DemographicsFieldsProps) {
  const { t } = useTranslation();

  return (
    <>
      <Text style={styles.label}>{t(ageLabelKey)}</Text>
      <TextInput style={styles.input} keyboardType="number-pad" value={ageText} onChangeText={onAgeTextChange} placeholder="30" />

      <Text style={styles.label}>{t(genderLabelKey)}</Text>
      <View style={styles.chipRow}>
        {GENDERS.map((g) => {
          const active = gender === g.value;
          return (
            <TouchableOpacity key={g.value} style={[styles.chip, active && styles.chipActive]} onPress={() => onGenderChange(g.value)}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{t(g.labelKey)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.label}>{t(activityLevelLabelKey)}</Text>
      <View style={styles.activityList}>
        {ACTIVITY_LEVELS.map((a) => {
          const active = activityLevel === a.value;
          return (
            <TouchableOpacity
              key={a.value}
              style={[styles.activityCard, active && styles.activityCardActive]}
              onPress={() => onActivityLevelChange(a.value)}
            >
              <Text style={[styles.activityLabel, active && styles.activityLabelActive]}>
                {t(a.labelKey)} · ×{ACTIVITY_MULTIPLIER[a.value]}
              </Text>
              <Text style={[styles.activityHint, active && styles.activityHintActive]}>{t(a.hintKey)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  label: { ...typography.label, marginBottom: spacing.sm, marginTop: spacing.md, color: '#333' },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    fontSize: 16,
  },
  chipRow: { flexDirection: 'row', gap: spacing.sm },
  chip: { flex: 1, backgroundColor: colors.neutralLight, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  chipActive: { backgroundColor: colors.primary },
  chipText: { fontSize: 14, fontWeight: '700', color: colors.textSecondary },
  chipTextActive: { color: colors.white },
  activityList: { gap: spacing.sm - 2 },
  activityCard: {
    backgroundColor: colors.neutralLight,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm + 2,
  },
  activityCardActive: { backgroundColor: colors.primaryLight },
  activityLabel: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  activityLabelActive: { color: colors.primary },
  activityHint: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  activityHintActive: { color: colors.primary, opacity: 0.8 },
});
