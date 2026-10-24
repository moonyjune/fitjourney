import { ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ExerciseFigure } from '../../src/components/quest/ExerciseFigure';
import { HudText } from '../../src/components/quest/HudText';
import { QuestButton } from '../../src/components/quest/QuestButton';
import { QuestHeader } from '../../src/components/quest/QuestHeader';
import { QuestIcon } from '../../src/components/quest/QuestIcon';
import { useGameText } from '../../src/game/strings';
import {
  EXERCISE_BY_ID,
  EXERCISES,
  estimateMinutes,
  prescriptionFor,
  type ExerciseId,
  type Level,
} from '../../src/game/training/exercises';
import { exerciseName, formatAmount, formatPerSet } from '../../src/game/training/format';
import { POSES } from '../../src/game/training/poses';
import { progressFor } from '../../src/game/training/progress';
import { useSettingsStore } from '../../src/store/useSettingsStore';
import { useTrainingStore } from '../../src/store/useTrainingStore';
import { quest, questRadius } from '../../src/theme/quest';
import { screenMaxWidthStyle } from '../../src/theme/responsive';
import { useLightStatusBar } from '../../src/theme/useLightStatusBar';

const LEVELS: Level[] = [1, 2, 3, 4];

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)/workout');
}

export default function ExerciseDetailScreen() {
  const g = useGameText();
  const language = useSettingsStore((s) => s.language);
  const insets = useSafeAreaInsets();
  useLightStatusBar();
  const { id } = useLocalSearchParams<{ id?: string; group?: string }>();
  const progress = useTrainingStore((s) => s.progress);

  const ex = id && id in EXERCISE_BY_ID ? EXERCISE_BY_ID[id as ExerciseId] : undefined;
  if (!ex) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 16, paddingHorizontal: 16 }]}>
        <QuestHeader title={g('train.title')} onBack={goBack} backLabel={g('train.detail.back')} />
      </View>
    );
  }

  const lang = language === 'en' ? 'en' : 'vi';
  const level = progressFor(progress, ex.id).level;
  const today = prescriptionFor(ex.id, level);
  const poses = POSES[ex.id];
  const index = EXERCISES.findIndex((e) => e.id === ex.id) + 1;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, screenMaxWidthStyle, { paddingTop: insets.top + 16 }]}>
        <QuestHeader
          title={exerciseName(ex, lang)}
          eyebrow={ex.group ? g('train.detail.eyebrow', { n: index, group: ex.group }) : g('train.detail.eyebrowFree')}
          onBack={goBack}
          backLabel={g('train.detail.back')}
        />

        <View style={styles.figureCard}>
          <View style={styles.chips}>
            {ex.areas.map((a) => (
              <View key={a.en} style={styles.areaChip}>
                <HudText size={12} color={quest.gold}>
                  {a[lang]}
                </HudText>
              </View>
            ))}
          </View>
          <View style={styles.poseRow}>
            <View style={styles.pose}>
              <ExerciseFigure id={ex.id} pose={0} width={120} />
              <HudText size={11} weight="medium" color={quest.textSecondary} style={styles.poseLabel}>
                {(lang === 'en' ? poses.labelEn : poses.labelVi)[0]}
              </HudText>
            </View>
            <QuestIcon name="chevron" size={18} color={quest.textSecondary} strokeWidth={2.4} />
            <View style={styles.pose}>
              <ExerciseFigure id={ex.id} pose={1} width={120} />
              <HudText size={11} weight="medium" color={quest.textSecondary} style={styles.poseLabel}>
                {(lang === 'en' ? poses.labelEn : poses.labelVi)[1]}
              </HudText>
            </View>
          </View>
        </View>

        <View style={styles.panel}>
          <View style={styles.panelHead}>
            <HudText size={16}>{g('train.detail.levels')}</HudText>
            <HudText size={12} color={quest.manaText} style={styles.flex} numberOfLines={2}>
              {g('train.detail.levelsHint')}
            </HudText>
          </View>
          <View style={styles.ladder}>
            {LEVELS.map((n) => {
              const current = n === level;
              const reached = n < level;
              return (
                <View key={n} style={styles.rung}>
                  <View style={[styles.diamond, (current || reached) && { borderColor: quest.gold }, current && { backgroundColor: quest.gold }]}>
                    <HudText size={14} color={current ? quest.onGold : reached ? quest.gold : quest.textSecondary} style={styles.unrotate}>
                      {n}
                    </HudText>
                  </View>
                  <HudText size={10} color={current ? quest.gold : quest.textSecondary}>
                    {current ? g('train.detail.here') : g('train.detail.levelShort', { n })}
                  </HudText>
                  <HudText size={12} color={quest.text} numberOfLines={2} style={styles.center}>
                    {formatAmount(prescriptionFor(ex.id, n), lang)}
                  </HudText>
                </View>
              );
            })}
          </View>
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {g('train.detail.today', {
              sets: today.sets,
              amount: formatPerSet(today, lang, false),
              rest: ex.restSec,
              m: estimateMinutes([{ id: ex.id, level }]),
            })}
          </HudText>
        </View>

        <View style={styles.panel}>
          <HudText size={16}>{g('train.detail.how')}</HudText>
          {ex.steps.map((step, i) => (
            <View key={i} style={styles.stepRow}>
              <View style={styles.stepNo}>
                <HudText size={13} color={quest.gold}>
                  {i + 1}
                </HudText>
              </View>
              <HudText size={15} weight="medium" color={quest.textTertiary} style={styles.flex}>
                {step[lang]}
              </HudText>
            </View>
          ))}
          <View style={styles.caution}>
            <QuestIcon name="alert" size={18} color={quest.manaText} />
            <HudText size={13} weight="medium" color={quest.manaText} style={styles.flex}>
              {ex.caution[lang]}
            </HudText>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.actions, screenMaxWidthStyle, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.actionSmall}>
          <QuestButton title={g('train.detail.back')} variant="ghost" icon="swap" onPress={goBack} />
        </View>
        <View style={styles.flex}>
          <QuestButton
            title={g('train.detail.startThis')}
            onPress={() => router.push({ pathname: '/train/session', params: { ids: ex.id, group: ex.group ?? '' } })}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: quest.bg },
  content: { paddingHorizontal: 16, paddingBottom: 24, gap: 14 },
  flex: { flex: 1, minWidth: 0 },
  center: { textAlign: 'center' },
  figureCard: { padding: 12, borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel, gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' },
  areaChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: quest.raised },
  poseRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  pose: { flex: 1, alignItems: 'center' },
  poseLabel: { marginTop: 2, textAlign: 'center' },
  panel: { padding: 14, borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel, gap: 12 },
  panelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  ladder: { flexDirection: 'row', justifyContent: 'space-between', gap: 4 },
  rung: { flex: 1, alignItems: 'center', gap: 4 },
  diamond: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: quest.border,
    backgroundColor: quest.raised,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '45deg' }],
    marginBottom: 6,
  },
  unrotate: { transform: [{ rotate: '-45deg' }] },
  stepRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  stepNo: { width: 26, height: 26, borderRadius: 8, borderWidth: 1.5, borderColor: quest.gold, alignItems: 'center', justifyContent: 'center' },
  caution: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.manaBorder, backgroundColor: quest.manaPanel },
  actions: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12, backgroundColor: quest.bg },
  actionSmall: { width: 130 },
});
