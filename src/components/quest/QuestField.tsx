import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { quest, questFonts, questRadius } from '../../theme/quest';
import { HudText } from './HudText';

interface QuestFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  /** Short unit shown inside the field, e.g. "kcal". */
  unit?: string;
}

/** Labelled dark text input. The label doubles as the accessible name. */
export function QuestField({ label, unit, ...input }: QuestFieldProps) {
  return (
    <View style={styles.wrap}>
      <HudText size={12} weight="medium" color={quest.textSecondary}>
        {label}
      </HudText>
      <View style={styles.box}>
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={quest.textSecondary}
          {...input}
          style={styles.input}
        />
        {unit ? (
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {unit}
          </HudText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: questRadius.row,
    borderWidth: 1.5,
    borderColor: quest.border,
    backgroundColor: quest.bg,
  },
  input: { flex: 1, minWidth: 0, color: quest.text, fontSize: 16, fontFamily: questFonts.semibold, paddingVertical: 8 },
});
