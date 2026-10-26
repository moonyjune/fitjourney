import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cleanAdvice } from '../src/ai/adviceText';
import { MEAL_TIMES, rowsFromResult, rowsFromSaved, validMealTime, type TextMealRow } from '../src/ai/textMeal';
import { useMealTextAnalysis } from '../src/ai/useMealTextAnalysis';
import { accuracyOf } from '../src/ai/accuracy';
import { useAiErrorText, useCalibrationText } from '../src/ai/usePhotoAnalysis';
import { AiAdviceCard } from '../src/components/quest/AiAdviceCard';
import { HudText } from '../src/components/quest/HudText';
import { QuestButton } from '../src/components/quest/QuestButton';
import { QuestChip } from '../src/components/quest/QuestChip';
import { QuestField } from '../src/components/quest/QuestField';
import { QuestHeader } from '../src/components/quest/QuestHeader';
import { useGameText } from '../src/game/strings';
import { useNow, useTodayInput } from '../src/game/useGameState';
import type { StringKey } from '../src/i18n/strings';
import { useTranslation } from '../src/i18n/useTranslation';
import { useAllFoods } from '../src/store/useFoodDbStore';
import { useAiCalibrationStore } from '../src/store/useAiCalibrationStore';
import { useNutritionStore } from '../src/store/useNutritionStore';
import { quest, questRadius } from '../src/theme/quest';
import { screenMaxWidthStyle } from '../src/theme/responsive';
import { useLightStatusBar } from '../src/theme/useLightStatusBar';
import type { PhotoAdvice } from '../src/sync/cloudSync';
import type { ExtraMealTime } from '../src/types';

/** Non-negative number from a text field; empty or invalid input counts as 0. */
function num(text: string): number {
  const value = parseFloat(text.replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)');
}

/** Type or dictate what was eaten; the AI splits it into foods with figures and an accuracy %, the user reviews and edits
 *  every line, and only the confirm button saves anything. */
export default function TextMealScreen() {
  const g = useGameText();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  useLightStatusBar();
  const now = useNow();
  const input = useTodayInput(now);
  const addExtra = useNutritionStore((s) => s.addExtra);
  const foods = useAllFoods();
  const ai = useMealTextAnalysis();
  const aiErrorText = useAiErrorText();
  const calibrationText = useCalibrationText();
  const recordEstimate = useAiCalibrationStore((s) => s.record);

  const [text, setText] = useState('');
  const [rows, setRows] = useState<TextMealRow[]>([]);
  const [mealTime, setMealTime] = useState<ExtraMealTime | null>(null);
  const [note, setNote] = useState<{ kind: 'saved' | 'ai'; reasoning: string; accuracy: number | null } | null>(null);
  const [advice, setAdvice] = useState<PhotoAdvice | null>(null);
  const [emptyHint, setEmptyHint] = useState<'text' | 'foods' | 'save' | null>(null);

  async function analyze() {
    if (ai.analyzing) return;
    const sentence = text.trim();
    if (!sentence) {
      setEmptyHint('text');
      return;
    }
    setEmptyHint(null);
    setAdvice(null);
    // Foods saved before need no AI at all.
    const fromSaved = rowsFromSaved(sentence, foods);
    if (fromSaved) {
      setRows(fromSaved);
      setNote({ kind: 'saved', reasoning: g('text.fromSaved'), accuracy: null });
      return;
    }
    const result = await ai.analyze(sentence);
    if (!result) return;
    const next = rowsFromResult(result, foods);
    setRows(next);
    if (next.length === 0) setEmptyHint('foods');
    setMealTime(validMealTime(result.mealTime));
    setNote({ kind: 'ai', reasoning: result.reasoning, accuracy: accuracyOf(result.accuracyPercent) });
    setAdvice(cleanAdvice(result.advice));
  }

  const patch = (key: string, change: Partial<TextMealRow>) => setRows((all) => all.map((r) => (r.key === key ? { ...r, ...change } : r)));
  const savable = useMemo(() => rows.filter((r) => r.name.trim() && (num(r.calories) > 0 || num(r.protein) > 0)), [rows]);

  function save() {
    if (savable.length === 0) {
      setEmptyHint('save');
      return;
    }
    for (const r of savable) {
      if (!r.fromDb) recordEstimate(r.aiCalories, num(r.calories));
      addExtra(input.dateKey, r.name.trim(), num(r.calories), num(r.protein), mealTime, {
        purineMg: num(r.purine) || undefined,
        saltG: num(r.salt) || undefined,
        sugarG: num(r.sugar) || undefined,
        fromFoodDb: r.fromDb && r.baseline === `${r.name}|${r.calories}`,
      });
    }
    goBack();
  }

  const hint = emptyHint === 'text' ? g('text.empty') : emptyHint === 'foods' ? g('text.noFoods') : emptyHint === 'save' ? g('text.nothingToSave') : null;

  return (
    <View style={styles.screen}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, screenMaxWidthStyle, { paddingTop: insets.top + 16 }]}>
        <QuestHeader title={g('text.title')} onBack={goBack} backLabel={g('common.back')} />
        <HudText size={13} weight="medium" color={quest.textSecondary} style={styles.subtitle}>
          {g('text.subtitle')}
        </HudText>

        <View style={styles.form}>
          <QuestField
            label={g('text.label')}
            value={text}
            onChangeText={(v) => {
              setText(v);
              setEmptyHint(null);
            }}
            placeholder={g('text.placeholder')}
            multiline
            maxLength={400}
          />
          <QuestButton
            variant="ghost"
            icon="chart"
            title={ai.analyzing ? g('text.analyzing') : g('text.analyze')}
            onPress={() => {
              void analyze();
            }}
            loading={ai.analyzing}
          />
          {ai.error && (
            <HudText size={12} weight="medium" color={quest.hpText} accessibilityRole="alert" accessibilityLiveRegion="polite">
              {aiErrorText(ai.error.kind)}
            </HudText>
          )}
          {hint && (
            <HudText size={12} weight="medium" color={quest.goldLight} accessibilityLiveRegion="polite">
              {hint}
            </HudText>
          )}

          {note && !ai.error && (
            <View style={styles.note} accessibilityLiveRegion="polite">
              <HudText size={12} color={quest.manaText}>
                {note.accuracy !== null ? `${g('ai.accuracy', { pct: note.accuracy })}` : g('ai.suggested')}
              </HudText>
              <HudText size={12} weight="medium" color={quest.textSecondary}>
                {note.reasoning}
              </HudText>
              {rows.length > 0 && note.kind === 'ai' && calibrationText && (
                <HudText size={12} weight="medium" color={quest.textSecondary}>
                  {calibrationText}
                </HudText>
              )}
              {rows.length > 0 && (
                <HudText size={12} weight="medium" color={quest.textSecondary}>
                  {g('text.review')}
                </HudText>
              )}
            </View>
          )}

          {rows.map((r, i) => (
            <View key={r.key} style={styles.row}>
              <View style={styles.rowHead}>
                {r.fromDb ? (
                  <HudText size={11} color={quest.manaText}>
                    {g('text.fromDb')}
                  </HudText>
                ) : r.accuracy !== null ? (
                  <HudText size={11} color={r.accuracy >= 70 ? quest.xp : r.accuracy >= 50 ? quest.goldLight : quest.hpText}>
                    {g('text.rowAccuracy', { pct: r.accuracy })}
                  </HudText>
                ) : (
                  <View />
                )}
                <QuestButton variant="ghost" title="✕" accessibilityLabel={g('text.remove', { n: i + 1 })} onPress={() => setRows((all) => all.filter((x) => x.key !== r.key))} />
              </View>
              <QuestField label={g('text.rowName', { n: i + 1 })} value={r.name} onChangeText={(v) => patch(r.key, { name: v })} />
              <View style={styles.pair}>
                <View style={styles.pairCell}>
                  <QuestField label={g('text.rowKcal', { n: i + 1 })} keyboardType="decimal-pad" value={r.calories} onChangeText={(v) => patch(r.key, { calories: v })} />
                </View>
                <View style={styles.pairCell}>
                  <QuestField label={g('text.rowProtein', { n: i + 1 })} keyboardType="decimal-pad" value={r.protein} onChangeText={(v) => patch(r.key, { protein: v })} />
                </View>
              </View>
              <HudText size={11} weight="medium" color={quest.textSecondary}>
                {`${g('food.purine')} ${r.purine || 0} · ${g('food.salt')} ${r.salt || 0} · ${g('food.sugar')} ${r.sugar || 0}`}
              </HudText>
            </View>
          ))}

          {rows.length > 0 && (
            <View style={styles.chips}>
              {MEAL_TIMES.map((value) => (
                <QuestChip
                  key={value}
                  label={t(`extraMealTime.${value}` as StringKey)}
                  selected={mealTime === value}
                  onPress={() => setMealTime(mealTime === value ? null : value)}
                />
              ))}
            </View>
          )}

          {advice && !ai.error && <AiAdviceCard advice={advice} />}
        </View>
      </ScrollView>

      {rows.length > 0 && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          <QuestButton icon="plus" title={g('text.saveN', { n: savable.length })} onPress={save} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: quest.bg },
  content: { paddingHorizontal: 16, paddingBottom: 120 },
  subtitle: { marginTop: 10 },
  form: { marginTop: 16, gap: 14 },
  note: { gap: 4, padding: 12, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.manaBorder, backgroundColor: quest.manaPanel },
  row: { gap: 8, padding: 12, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.raised },
  rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pair: { flexDirection: 'row', gap: 10 },
  pairCell: { flex: 1, minWidth: 0 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  footer: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: quest.border, backgroundColor: quest.bg },
});
