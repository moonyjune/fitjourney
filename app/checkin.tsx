import { useState } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { HudText } from '../src/components/quest/HudText';
import { MoodFace } from '../src/components/quest/MoodFace';
import { QuestButton } from '../src/components/quest/QuestButton';
import { QuestChip } from '../src/components/quest/QuestChip';
import { QuestField } from '../src/components/quest/QuestField';
import { QuestIcon } from '../src/components/quest/QuestIcon';
import { QuestSheet } from '../src/components/quest/QuestSheet';
import { MISSION_ORDER } from '../src/game/constants';
import { useGameText, type GameKey } from '../src/game/strings';
import { useGameState, useNow } from '../src/game/useGameState';
import type { StringKey } from '../src/i18n/strings';
import { useTranslation } from '../src/i18n/useTranslation';
import { useFeelingStore } from '../src/store/useFeelingStore';
import { quest, questRadius } from '../src/theme/quest';
import { useLightStatusBar } from '../src/theme/useLightStatusBar';
import { ScaleRow } from '../src/components/quest/ScaleRow';
import type { Mood, WorkoutCondition } from '../src/types';

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

function closeSheet() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)');
}

export default function CheckinScreen() {
  const g = useGameText();
  const { t, language } = useTranslation();
  useLightStatusBar();
  const now = useNow();
  const game = useGameState(now);
  const addRecord = useFeelingStore((s) => s.addRecord);

  const [mood, setMood] = useState<Mood | null>(null);
  const [craving, setCraving] = useState<number | null>(null);
  const [hunger, setHunger] = useState<number | null>(null);
  const [condition, setCondition] = useState<WorkoutCondition | null>(null);
  const [note, setNote] = useState('');

  const complete = mood != null && craving != null && hunger != null;
  const doneCount = game.today.missions.filter((m) => m.status === 'done').length;
  const todayDamage = game.boss.days.length > 0 ? game.boss.days[game.boss.days.length - 1].damage : 0;
  const date = now.toLocaleDateString(language === 'en' ? 'en-US' : 'vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' });

  function save() {
    if (!complete) return;
    addRecord({ mood, cravingLevel: craving, hungerLevel: hunger, workoutCondition: condition, note: note.trim() });
    AccessibilityInfo.announceForAccessibility(g('checkin.saved'));
    closeSheet();
  }

  return (
    <QuestSheet onClose={closeSheet} closeLabel={g('common.close')}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.titleRow}>
          <View style={styles.titleText}>
            <HudText size={11} color={quest.textSecondary} style={styles.eyebrow}>
              {g('checkin.eyebrow', { time: `${pad(now.getHours())}:${pad(now.getMinutes())}`, date }).toUpperCase()}
            </HudText>
            <HudText size={24} accessibilityRole="header">
              {g('checkin.title')}
            </HudText>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={g('common.close')} onPress={closeSheet} style={styles.close}>
            <QuestIcon name="x" size={20} color={quest.text} strokeWidth={2.2} />
          </Pressable>
        </View>

        <View style={styles.summary}>
          <View accessible accessibilityLabel={`${g('checkin.missions')} ${doneCount}/${MISSION_ORDER.length}`} style={[styles.sumTile, { borderColor: quest.border }]}>
            <HudText size={11} color={quest.textSecondary} style={styles.eyebrow}>
              {g('checkin.missions').toUpperCase()}
            </HudText>
            <HudText size={22} color={quest.gold}>
              {`${doneCount}/${MISSION_ORDER.length}`}
            </HudText>
            <View style={styles.pips}>
              {game.today.missions.map((m) => (
                <View key={m.id} style={[styles.pip, { backgroundColor: m.status === 'done' ? quest.gold : quest.raised2 }]} />
              ))}
            </View>
          </View>
          <View
            accessible
            accessibilityLabel={`${g('checkin.boss')} −${todayDamage}, ${g('checkin.bossLeft', { n: game.boss.hpLeft })}`}
            style={[styles.sumTile, { borderColor: quest.bossBorder, backgroundColor: quest.bossPanel }]}
          >
            <HudText size={11} color={quest.hpText} style={styles.eyebrow}>
              {g('checkin.boss').toUpperCase()}
            </HudText>
            <HudText size={22} color={quest.text}>
              {`−${todayDamage.toLocaleString('en-US')}`}
            </HudText>
            <HudText size={11} weight="medium" color={quest.textSecondary}>
              {g('checkin.bossLeft', { n: game.boss.hpLeft.toLocaleString('en-US') })}
            </HudText>
          </View>
        </View>

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
  summary: { flexDirection: 'row', gap: 10, marginTop: 14 },
  sumTile: { flex: 1, padding: 12, gap: 2, borderRadius: questRadius.panel, borderWidth: 1.5, backgroundColor: quest.panel },
  pips: { flexDirection: 'row', gap: 3, marginTop: 4 },
  pip: { flex: 1, height: 5, borderRadius: 2 },
  block: { marginTop: 18, gap: 8 },
  blockHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  moods: { flexDirection: 'row', gap: 8 },
  mood: { flex: 1, minHeight: 68, borderRadius: questRadius.row, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cta: { marginTop: 20 },
  hint: { marginTop: 8, textAlign: 'center' },
});
