import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from '../../i18n/useTranslation';
import type { StringKey } from '../../i18n/strings';
import { quest, questRadius } from '../../theme/quest';
import { ACTIVITY_MULTIPLIER } from '../../utils/tdee';
import type { ActivityLevel, Gender } from '../../types';
import { HudText } from './HudText';
import { QuestChip } from './QuestChip';
import { QuestField } from './QuestField';

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

interface QuestDemographicsProps {
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

/** FitQuest-styled twin of `DemographicsFields` (same props, same strings) for the dark screens. */
export function QuestDemographics(props: QuestDemographicsProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.wrap}>
      <QuestField label={t(props.ageLabelKey)} keyboardType="number-pad" value={props.ageText} onChangeText={props.onAgeTextChange} placeholder="30" />

      <View style={styles.group}>
        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {t(props.genderLabelKey)}
        </HudText>
        <View style={styles.chips}>
          {GENDERS.map((g) => (
            <QuestChip key={g.value} label={t(g.labelKey)} selected={props.gender === g.value} onPress={() => props.onGenderChange(g.value)} />
          ))}
        </View>
      </View>

      <View style={styles.group}>
        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {t(props.activityLevelLabelKey)}
        </HudText>
        {ACTIVITY_LEVELS.map((a) => {
          const on = props.activityLevel === a.value;
          return (
            <Pressable
              key={a.value}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${t(a.labelKey)} ×${ACTIVITY_MULTIPLIER[a.value]}`}
              onPress={() => props.onActivityLevelChange(a.value)}
              style={[styles.card, on && styles.cardOn]}
            >
              <HudText size={14} color={on ? quest.gold : quest.text}>
                {t(a.labelKey)} · ×{ACTIVITY_MULTIPLIER[a.value]}
              </HudText>
              <HudText size={12} weight="medium" color={quest.textSecondary}>
                {t(a.hintKey)}
              </HudText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  group: { gap: 8 },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  card: { gap: 2, padding: 12, minHeight: 56, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  cardOn: { borderColor: quest.gold, backgroundColor: quest.raised },
});
