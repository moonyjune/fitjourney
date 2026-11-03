import { useState } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { HudText } from '../src/components/quest/HudText';
import { DateChip } from '../src/components/quest/DateChip';
import { MoodFace } from '../src/components/quest/MoodFace';
import { QuestButton } from '../src/components/quest/QuestButton';
import { QuestChip } from '../src/components/quest/QuestChip';
import { QuestField } from '../src/components/quest/QuestField';
import { QuestIcon } from '../src/components/quest/QuestIcon';
import { QuestSheet } from '../src/components/quest/QuestSheet';
import { useGameText, type GameKey } from '../src/game/strings';
import { useNow } from '../src/game/useGameState';
import { logDayLabel } from '../src/game/useLogDate';
import type { StringKey } from '../src/i18n/strings';
import { useTranslation } from '../src/i18n/useTranslation';
import { useFeelingStore } from '../src/store/useFeelingStore';
import { useSelectedDayStore, workingDayKey } from '../src/store/useSelectedDayStore';
import { quest, questRadius } from '../src/theme/quest';
import { useLightStatusBar } from '../src/theme/useLightStatusBar';
import { ScaleRow } from '../src/components/quest/ScaleRow';
import type { FeelingRecord, Mood, WorkoutCondition } from '../src/types';
import { toDateKey } from '../src/utils/date';
import { dateOfKey, logDateParam, oldestLogDateKey } from '../src/utils/logDate';

const MOODS: { key: Mood; label: StringKey }[] = [
  { key: 'great', label: 'feeling.moodGreat' },
  { key: 'good', label: 'feeling.moodGood' },
  { key: 'neutral', label: 'feeling.moodNeutral' },
  { key: 'stressed', label: 'feeling.moodStressed' },
  { key: 'tired', label: 'feeling.moodTired' },
];

const CONDITIONS: WorkoutCondition[] = ['energetic', 'normal', 'tired', 'sore', 'skipped'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** The latest check-in made on a day (local time), if any. */
function checkinOn(records: FeelingRecord[], dateKey: string): FeelingRecord | undefined {
  let found: FeelingRecord | undefined;
  for (const r of records) if (toDateKey(new Date(r.loggedAtISO)) === dateKey && (!found || r.loggedAtISO >= found.loggedAtISO)) found = r;
  return found;
}

function closeSheet() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)');
}

export default function CheckinScreen() {
  const g = useGameText();
  const { t, language } = useTranslation();
  useLightStatusBar();
  const now = useNow();
  const records = useFeelingStore((s) => s.records);
  const addRecord = useFeelingStore((s) => s.addRecord);
  const updateRecord = useFeelingStore((s) => s.updateRecord);
  const { date: dateParam } = useLocalSearchParams<{ date?: string }>();
  const todayKey = toDateKey(now);

  // The day the check-in is for: a `date` route param, else the shared selected day (the date chip of Camp and quick add), else
  // today; changeable with the date chip (up to MAX_LOG_DAYS_BACK days back, never the future), which also moves the shared day.
  const [picked, setPicked] = useState<string | null>(() => {
    const start = dateParam ? logDateParam(dateParam, now) : workingDayKey(useSelectedDayStore.getState().selectedKey, now);
    return start === todayKey ? null : start;
  });
  const dateKey = picked && picked < todayKey && picked >= oldestLogDateKey(now) ? picked : todayKey;
  const isToday = dateKey === todayKey;
  // Today a check-in is added each time (as before); a past day has one, opened for editing when it is already there.
  const existing = isToday ? undefined : checkinOn(records, dateKey);

  const [mood, setMood] = useState<Mood | null>(existing?.mood ?? null);
  const [craving, setCraving] = useState<number | null>(existing?.cravingLevel ?? null);
  const [hunger, setHunger] = useState<number | null>(existing?.hungerLevel ?? null);
  const [condition, setCondition] = useState<WorkoutCondition | null>(existing?.workoutCondition ?? null);
  const [note, setNote] = useState(existing?.note ?? '');

  function pickDay(next: string | null) {
    const key = next && next < todayKey ? next : todayKey;
    const found = key === todayKey ? undefined : checkinOn(records, key);
    setPicked(key === todayKey ? null : key);
    setMood(found?.mood ?? null);
    setCraving(found?.cravingLevel ?? null);
    setHunger(found?.hungerLevel ?? null);
    setCondition(found?.workoutCondition ?? null);
    setNote(found?.note ?? '');
    AccessibilityInfo.announceForAccessibility(g('quick.dateChanged', { day: logDayLabel(key, now, g) }));
  }

  const complete = mood != null && craving != null && hunger != null;
  const shownDate = isToday ? now : dateOfKey(dateKey);
  const date = shownDate.toLocaleDateString(language === 'en' ? 'en-US' : 'vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' });

  function save() {
    if (!complete) return;
    const answers = { mood, cravingLevel: craving, hungerLevel: hunger, workoutCondition: condition, note: note.trim() };
    if (existing) updateRecord(existing.id, answers);
    else if (isToday) addRecord(answers);
    else {
      // A past day's check-in is dated that day, at the time it is written.
      const at = dateOfKey(dateKey);
      at.setHours(now.getHours(), now.getMinutes(), 0, 0);
      addRecord({ ...answers, loggedAtISO: at.toISOString() });
    }
    AccessibilityInfo.announceForAccessibility(g('checkin.saved'));
    closeSheet();
  }

  return (
    <QuestSheet onClose={closeSheet} closeLabel={g('common.close')}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.titleRow}>
          <View style={styles.titleText}>
            <HudText size={11} color={quest.textSecondary} style={styles.eyebrow}>
              {(isToday ? g('checkin.eyebrow', { time: `${pad(now.getHours())}:${pad(now.getMinutes())}`, date }) : date).toUpperCase()}
            </HudText>
            <HudText size={24} accessibilityRole="header">
              {g('checkin.title')}
            </HudText>
          </View>
          <DateChip
            size="small"
            value={dateKey}
            now={now}
            hint={g('quick.dateHintAll')}
            onChange={(key) => {
              useSelectedDayStore.getState().select(key, now);
              pickDay(key);
            }}
          />
          <Pressable accessibilityRole="button" accessibilityLabel={g('common.close')} onPress={closeSheet} style={styles.close}>
            <QuestIcon name="x" size={20} color={quest.text} strokeWidth={2.2} />
          </Pressable>
        </View>
        {existing && (
          <HudText size={12} weight="medium" color={quest.goldLight} style={styles.editing}>
            {g('checkin.editing')}
          </HudText>
        )}

        <View style={styles.block}>
          <HudText size={15}>{g('checkin.mood')}</HudText>
          <View style={styles.moods}>
            {MOODS.map((m) => {
              const selected = mood === m.key;
              return (
                <Pressable
                  key={m.key}
                  accessibilityRole="button"
                  accessibilityLabel={t(m.label)}
                  accessibilityState={{ selected }}
                  onPress={() => setMood(m.key)}
                  style={({ pressed }) => [
                    styles.mood,
                    selected ? { backgroundColor: quest.gold, borderColor: quest.gold } : { backgroundColor: quest.panel, borderColor: quest.border },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <MoodFace mood={m.key} color={selected ? quest.onGold : quest.text} />
                  <HudText size={10} weight="medium" color={selected ? quest.onGold : quest.textSecondary} numberOfLines={1}>
                    {t(m.label)}
                  </HudText>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.block}>
          <View style={styles.blockHead}>
            <HudText size={15}>{g('checkin.craving')}</HudText>
            <HudText size={11} weight="medium" color={quest.textSecondary}>
              {g('checkin.cravingHint')}
            </HudText>
          </View>
          <ScaleRow label={g('checkin.craving')} value={craving} onChange={setCraving} />
        </View>

        <View style={styles.block}>
          <View style={styles.blockHead}>
            <HudText size={15}>{g('checkin.hunger')}</HudText>
            <HudText size={11} weight="medium" color={quest.textSecondary}>
              {g('checkin.hungerHint')}
            </HudText>
          </View>
          <ScaleRow label={g('checkin.hunger')} value={hunger} onChange={setHunger} />
        </View>

        <View style={styles.block}>
          <View style={styles.blockHead}>
            <HudText size={15}>{g('checkin.condition')}</HudText>
            <HudText size={11} weight="medium" color={quest.textSecondary}>
              {g('checkin.optional')}
            </HudText>
          </View>
          <View style={styles.chips}>
            {CONDITIONS.map((c) => (
              <QuestChip
                key={c}
                label={g(`cond.${c}` as GameKey)}
                selected={condition === c}
                onPress={() => setCondition(condition === c ? null : c)}
              />
            ))}
          </View>
        </View>

        <View style={styles.block}>
          <QuestField label={g('checkin.note')} value={note} onChangeText={setNote} placeholder={g('checkin.notePlaceholder')} />
        </View>

        <View style={styles.cta}>
          <QuestButton title={g('checkin.save')} onPress={save} disabled={!complete} />
          {!complete && (
            <HudText size={11} weight="medium" color={quest.textSecondary} style={styles.hint}>
              {g('checkin.incomplete')}
            </HudText>
          )}
        </View>
      </ScrollView>
    </QuestSheet>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titleText: { flex: 1 },
  eyebrow: { letterSpacing: 1.6 },
  close: { width: 44, height: 44, borderRadius: 99, backgroundColor: quest.panel, alignItems: 'center', justifyContent: 'center' },
  block: { marginTop: 18, gap: 8 },
  blockHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  moods: { flexDirection: 'row', gap: 8 },
  mood: { flex: 1, minHeight: 68, borderRadius: questRadius.row, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cta: { marginTop: 20 },
  editing: { marginTop: 8 },
  hint: { marginTop: 8, textAlign: 'center' },
});
