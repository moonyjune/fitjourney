import { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTranslation } from '../i18n/useTranslation';
import { colors, radius, spacing } from '../theme/tokens';
import { quest, questFonts } from '../theme/quest';

interface DateOffsetPickerProps {
  selectedDate: Date;
  onChange: (date: Date) => void;
  /** FitQuest dark styling. */
  dark?: boolean;
}

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

const QUICK_OFFSETS_DAYS = [0, 1, 2, 3];

/** Lets a log entry be backdated — quick "today/yesterday/N days ago" chips plus a free-form
 *  DD/MM/YYYY field for anything further back. Preserves the current time-of-day on the chosen date. */
export function DateOffsetPicker({ selectedDate, onChange, dark }: DateOffsetPickerProps) {
  const { t } = useTranslation();
  const [customText, setCustomText] = useState('');
  const [customError, setCustomError] = useState(false);

  const todayStart = startOfDay(new Date());
  const selectedStart = startOfDay(selectedDate);
  const diffDays = Math.round((todayStart.getTime() - selectedStart.getTime()) / 86400000);

  function applyOffset(days: number) {
    const d = new Date(todayStart);
    d.setDate(d.getDate() - days);
    d.setHours(selectedDate.getHours(), selectedDate.getMinutes(), selectedDate.getSeconds());
    setCustomText('');
    setCustomError(false);
    onChange(d);
  }

  function applyCustom(text: string) {
    setCustomText(text);
    const match = text.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) {
      setCustomError(text.trim().length > 0);
      return;
    }
    const [, dd, mm, yyyy] = match;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd), selectedDate.getHours(), selectedDate.getMinutes());
    if (Number.isNaN(d.getTime()) || d.getTime() > Date.now()) {
      setCustomError(true);
      return;
    }
    setCustomError(false);
    onChange(d);
  }

  return (
    <View>
      <View style={styles.row}>
        {QUICK_OFFSETS_DAYS.map((days) => {
          const active = diffDays === days && !customText;
          return (
            <TouchableOpacity key={days} style={[styles.chip, active && styles.chipActive, dark && styles.chipDark, dark && active && styles.chipActiveDark]} onPress={() => applyOffset(days)}>
              <Text style={[styles.chipText, active && styles.chipTextActive, dark && styles.chipTextDark, dark && active && styles.chipTextActiveDark]}>
                {days === 0 ? t('dateOffset.today') : days === 1 ? t('dateOffset.yesterday') : t('dateOffset.daysAgo', { n: days })}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <TextInput
        style={[styles.customInput, dark && styles.customInputDark, customError && styles.customInputError]}
        placeholderTextColor={dark ? quest.textSecondary : undefined}
        placeholder={t('dateOffset.customPlaceholder')}
        value={customText}
        onChangeText={applyCustom}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm - 2, marginBottom: spacing.sm },
  chip: { backgroundColor: colors.neutralLight, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm - 2 },
  chipActive: { backgroundColor: colors.primary },
  chipText: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  chipTextActive: { color: colors.white },
  customInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
    fontSize: 12,
    marginBottom: spacing.sm,
  },
  chipDark: { backgroundColor: quest.panel, borderWidth: 1.5, borderColor: quest.border, minHeight: 40, justifyContent: 'center', borderRadius: 999, paddingHorizontal: 14 },
  chipActiveDark: { backgroundColor: quest.gold, borderColor: quest.gold },
  chipTextDark: { color: quest.text, fontFamily: questFonts.bold, fontSize: 13 },
  chipTextActiveDark: { color: quest.onGold },
  customInputDark: { backgroundColor: quest.bg, borderColor: quest.border, borderWidth: 1.5, borderRadius: 12, color: quest.text, fontFamily: questFonts.semibold, fontSize: 14, minHeight: 44 },
  customInputError: { borderColor: colors.danger },
});
