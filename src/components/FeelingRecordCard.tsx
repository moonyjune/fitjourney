import { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Card } from './Card';
import { Button } from './Button';
import { useFeelingStore } from '../store/useFeelingStore';
import { useTranslation } from '../i18n/useTranslation';
import { toDateKey } from '../utils/date';
import { colors, radius, spacing, typography } from '../theme/tokens';
import type { Mood, WorkoutCondition } from '../types';

const MOOD_OPTIONS: { key: Mood; emoji: string }[] = [
  { key: 'great', emoji: '😄' },
  { key: 'good', emoji: '🙂' },
  { key: 'neutral', emoji: '😐' },
  { key: 'stressed', emoji: '😣' },
  { key: 'tired', emoji: '😴' },
];

const WORKOUT_CONDITION_OPTIONS: { key: WorkoutCondition; emoji: string }[] = [
  { key: 'energetic', emoji: '⚡' },
  { key: 'normal', emoji: '🙂' },
  { key: 'tired', emoji: '😩' },
  { key: 'sore', emoji: '🤕' },
  { key: 'skipped', emoji: '❌' },
];

/** Quick point-in-time log of craving/hunger/mood/workout-condition, shown on the Today tab. */
export function FeelingRecordCard() {
  const { t } = useTranslation();
  const records = useFeelingStore((s) => s.records);
  const addRecord = useFeelingStore((s) => s.addRecord);
  const removeRecord = useFeelingStore((s) => s.removeRecord);

  const [mood, setMood] = useState<Mood | null>(null);
  const [cravingLevel, setCravingLevel] = useState<number | null>(null);
  const [hungerLevel, setHungerLevel] = useState<number | null>(null);
  const [workoutCondition, setWorkoutCondition] = useState<WorkoutCondition | null>(null);
  const [note, setNote] = useState('');

  const todayKey = toDateKey(new Date());
  const todayRecords = [...records].filter((r) => toDateKey(new Date(r.loggedAtISO)) === todayKey).reverse();

  function handleSubmit() {
    if (!mood || !cravingLevel || !hungerLevel) return;
    addRecord({ cravingLevel, hungerLevel, mood, workoutCondition, note: note.trim() });
    setMood(null);
    setCravingLevel(null);
    setHungerLevel(null);
    setWorkoutCondition(null);
    setNote('');
  }

  return (
    <Card>
      <Text style={styles.title}>{t('feeling.title')}</Text>

      <Text style={styles.label}>{t('feeling.moodLabel')}</Text>
      <View style={styles.row}>
        {MOOD_OPTIONS.map((opt) => (
          <TouchableOpacity key={opt.key} style={[styles.chip, mood === opt.key && styles.chipActive]} onPress={() => setMood(opt.key)}>
            <Text style={styles.chipEmoji}>{opt.emoji}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>{t('feeling.cravingLabel')}</Text>
      <View style={styles.row}>
        {[1, 2, 3, 4, 5].map((n) => (
          <TouchableOpacity key={n} style={[styles.numChip, cravingLevel === n && styles.chipActive]} onPress={() => setCravingLevel(n)}>
            <Text style={[styles.numChipText, cravingLevel === n && styles.chipTextActive]}>{n}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>{t('feeling.hungerLabel')}</Text>
      <View style={styles.row}>
        {[1, 2, 3, 4, 5].map((n) => (
          <TouchableOpacity key={n} style={[styles.numChip, hungerLevel === n && styles.chipActive]} onPress={() => setHungerLevel(n)}>
            <Text style={[styles.numChipText, hungerLevel === n && styles.chipTextActive]}>{n}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>{t('feeling.workoutConditionLabel')}</Text>
      <View style={styles.row}>
        {WORKOUT_CONDITION_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.key}
            style={[styles.chip, workoutCondition === opt.key && styles.chipActive]}
            onPress={() => setWorkoutCondition(workoutCondition === opt.key ? null : opt.key)}
          >
            <Text style={styles.chipEmoji}>{opt.emoji}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TextInput style={styles.input} placeholder={t('feeling.notePlaceholder')} value={note} onChangeText={setNote} />
      <Button title={t('feeling.saveButton')} onPress={handleSubmit} disabled={!mood || !cravingLevel || !hungerLevel} />

      {todayRecords.length > 0 && (
        <View style={styles.historyList}>
          {todayRecords.map((r) => {
            const moodEmoji = MOOD_OPTIONS.find((m) => m.key === r.mood)?.emoji;
            const conditionEmoji = WORKOUT_CONDITION_OPTIONS.find((w) => w.key === r.workoutCondition)?.emoji;
            return (
              <View key={r.id} style={styles.historyRow}>
                <Text style={styles.historyText}>
                  {new Date(r.loggedAtISO).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} {moodEmoji} ·{' '}
                  {t('feeling.cravingShort', { n: r.cravingLevel })} · {t('feeling.hungerShort', { n: r.hungerLevel })}
                  {conditionEmoji ? ` · ${conditionEmoji}` : ''}
                  {r.note ? ` · ${r.note}` : ''}
                </Text>
                <TouchableOpacity onPress={() => removeRecord(r.id)}>
                  <Text style={styles.deleteText}>{t('common.delete')}</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.title, marginBottom: spacing.md, color: colors.textPrimary },
  label: { ...typography.label, color: colors.textSecondary, marginTop: spacing.sm, marginBottom: spacing.xs },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.neutralLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  chipEmoji: { fontSize: 18 },
  numChip: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.neutralLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  numChipText: { fontSize: 14, fontWeight: '700', color: colors.textSecondary },
  chipTextActive: { color: colors.primary },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    fontSize: 14,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  historyList: { marginTop: spacing.md, gap: spacing.xs },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.xs },
  historyText: { flex: 1, fontSize: 12, color: colors.textSecondary, paddingRight: spacing.sm },
  deleteText: { color: colors.danger, fontSize: 12 },
});
