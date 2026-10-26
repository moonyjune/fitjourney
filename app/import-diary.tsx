import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HudText } from '../src/components/quest/HudText';
import { QuestButton } from '../src/components/quest/QuestButton';
import { QuestHeader } from '../src/components/quest/QuestHeader';
import { useGameText, type GameKey } from '../src/game/strings';
import { applyDiaryImport, parseDiaryImport, type DiaryImportSummary } from '../src/import/diaryImport';
import { readPickedText } from '../src/import/readPickedFile';
import { flushSyncQueue, whenPushesSettled } from '../src/sync/cloudSync';
import { purgeBefore, type PurgeResult } from '../src/sync/purgeBefore';
import { useAuthStore } from '../src/store/useAuthStore';
import { useSyncQueueStore } from '../src/sync/syncQueue';
import { quest, questRadius } from '../src/theme/quest';
import { screenMaxWidthStyle } from '../src/theme/responsive';
import { useLightStatusBar } from '../src/theme/useLightStatusBar';

const ERROR_KEY = { notJson: 'import.errNotJson', format: 'import.errFormat', invalid: 'import.errInvalid' } as const satisfies Record<string, GameKey>;

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)/profile');
}

/** Profile > Import diary: pick a diary file, check it, save it on the device and sync it to the cloud. */
export default function ImportDiaryScreen() {
  const g = useGameText();
  const insets = useSafeAreaInsets();
  useLightStatusBar();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<GameKey | null>(null);
  const [summary, setSummary] = useState<DiaryImportSummary | null>(null);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const signedIn = useAuthStore((s) => !!s.session && !s.devMode);
  const [cutoff, setCutoff] = useState('2026-09-21');
  const [armed, setArmed] = useState(false);
  const [purging, setPurging] = useState(false);
  const [purge, setPurge] = useState<PurgeResult | 'bad' | 'failed' | null>(null);

  async function clearOld() {
    if (purging) return;
    const key = cutoff.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || Number.isNaN(Date.parse(key))) {
      setPurge('bad');
      setArmed(false);
      return;
    }
    if (!armed) {
      setPurge(null);
      setArmed(true);
      return;
    }
    setArmed(false);
    setPurging(true);
    const result = await purgeBefore(key);
    setPurging(false);
    setPurge(result.ok ? result : 'failed');
  }

  async function pick() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setSummary(null);
    setPendingCount(null);
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true });
      if (picked.canceled || !picked.assets?.[0]) return;
      const parsed = parseDiaryImport(await readPickedText(picked.assets[0]));
      if (!parsed.ok) {
        setError(ERROR_KEY[parsed.reason]);
        return;
      }
      setSummary(applyDiaryImport(parsed.data));
      // Wait for the cloud writes so the screen can say whether everything arrived or some are waiting for a connection.
      await whenPushesSettled();
      await flushSyncQueue();
      await whenPushesSettled();
      setPendingCount(useSyncQueueStore.getState().pending.length);
    } catch {
      setError('import.errRead');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, screenMaxWidthStyle, { paddingTop: insets.top + 16 }]}>
        <QuestHeader title={g('import.title')} onBack={goBack} backLabel={g('common.back')} />
        <HudText size={13} weight="medium" color={quest.textSecondary} style={styles.intro}>
          {g('import.intro')}
        </HudText>

        <View style={styles.button}>
          <QuestButton title={busy ? g('import.working') : g('import.pick')} onPress={pick} loading={busy} />
        </View>

        {error && (
          <View style={styles.panel} accessibilityLiveRegion="polite">
            <HudText size={13} weight="medium" color={quest.goldLight}>
              {g(error)}
            </HudText>
          </View>
        )}

        {summary && (
          <View style={styles.panel} accessibilityLiveRegion="polite">
            <HudText size={15}>{g('import.done')}</HudText>
            <HudText size={13} weight="medium" color={quest.textSecondary}>
              {g('import.doneFood', { days: summary.days, items: summary.foodItems })}
            </HudText>
            <HudText size={13} weight="medium" color={quest.textSecondary}>
              {g('import.doneOther', { w: summary.weightsAdded, t: summary.workoutsAdded })}
            </HudText>
            {summary.habitsAdded > 0 && (
              <HudText size={13} weight="medium" color={quest.textSecondary}>
                {g('import.doneHabits', { n: summary.habitsAdded })}
              </HudText>
            )}
            {summary.uricAdded > 0 && (
              <HudText size={13} weight="medium" color={quest.textSecondary}>
                {g('import.doneUric', { n: summary.uricAdded })}
              </HudText>
            )}
            {summary.waterDays > 0 && (
              <HudText size={13} weight="medium" color={quest.textSecondary}>
                {g('import.doneWater', { n: summary.waterDays })}
              </HudText>
            )}
            {summary.notesLoaded > 0 && (
              <HudText size={13} weight="medium" color={quest.textSecondary}>
                {g('import.doneNotes', { n: summary.notesLoaded })}
              </HudText>
            )}
            {summary.profileUpdated && (
              <HudText size={13} weight="medium" color={quest.textSecondary}>
                {g('import.doneProfile')}
              </HudText>
            )}
            <HudText size={12} weight="medium" color={quest.textSecondary}>
              {!signedIn ? g('import.syncLocal') : pendingCount === null ? g('import.syncing') : pendingCount === 0 ? g('import.syncDone') : g('import.syncPending', { n: pendingCount })}
            </HudText>
          </View>
        )}

        <View style={styles.panel}>
          <HudText size={15}>{g('purge.title')}</HudText>
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {g('purge.intro')}
          </HudText>
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {g('purge.date')}
          </HudText>
          <TextInput
            accessibilityLabel={g('purge.date')}
            value={cutoff}
            onChangeText={(text) => {
              setCutoff(text);
              setArmed(false);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="numbers-and-punctuation"
            maxLength={10}
            placeholderTextColor={quest.textSecondary}
            style={styles.input}
          />
          {armed && (
            <HudText size={12} weight="medium" color={quest.goldLight} accessibilityRole="alert">
              {g('purge.confirm', { date: cutoff.trim() })}
            </HudText>
          )}
          <QuestButton
            variant={armed ? 'gold' : 'ghost'}
            title={purging ? g('purge.working') : armed ? g('purge.confirm', { date: cutoff.trim() }) : g('purge.button')}
            accessibilityLabel={g('purge.button')}
            onPress={() => {
              void clearOld();
            }}
            loading={purging}
          />
          {purge === 'bad' && (
            <HudText size={12} weight="medium" color={quest.goldLight} accessibilityRole="alert">
              {g('purge.badDate')}
            </HudText>
          )}
          {purge === 'failed' && (
            <HudText size={12} weight="medium" color={quest.hpText} accessibilityRole="alert">
              {g('purge.failed')}
            </HudText>
          )}
          {purge && purge !== 'bad' && purge !== 'failed' && (
            <HudText size={12} weight="medium" color={quest.textSecondary} accessibilityLiveRegion="polite">
              {g('purge.done', { days: purge.days, w: purge.weights, t: purge.workouts, f: purge.feelings, p: purge.photos })}
            </HudText>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: quest.bg },
  content: { paddingHorizontal: 16, paddingBottom: 24 },
  intro: { marginTop: 10 },
  button: { marginTop: 18 },
  input: { color: quest.text, borderWidth: 1.5, borderColor: quest.border, borderRadius: questRadius.row, paddingHorizontal: 12, paddingVertical: 10, minHeight: 44, fontSize: 15 },
  panel: { marginTop: 16, gap: 6, padding: 14, borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
});
