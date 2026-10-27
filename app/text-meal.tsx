import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cleanAdvice } from '../src/ai/adviceText';
import { MEAL_TIMES, resolveFromDb, rowsFromResult, validMealTime, type TextMealRow } from '../src/ai/textMeal';
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
import { clockText, MEAL_CLOCK, parseClock, timeTextInvalid } from '../src/utils/mealClock';
import { joinTitle, sumParts } from '../src/food/mealParts';
import { FoodPhotoPicker } from '../src/components/quest/FoodPhoto';
import { deletePersistedPhoto, persistPickedPhoto } from '../src/utils/photoStorage';
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
  const [timeText, setTimeText] = useState('');
  const timeInvalid = timeTextInvalid(timeText);
  const [note, setNote] = useState<{ kind: 'saved' | 'ai'; reasoning: string; accuracy: number | null } | null>(null);
  const [advice, setAdvice] = useState<PhotoAdvice | null>(null);
  const [emptyHint, setEmptyHint] = useState<'text' | 'foods' | 'save' | null>(null);
  // The meal is saved as ONE entry: a single description (by default the foods' names, each with its amount, joined) with the totals;
  // the lines below become its parts, shown as detail in Profile > Nutrition only.
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function analyze() {
    if (ai.analyzing) return;
    const sentence = text.trim();
    if (!sentence) {
      setEmptyHint('text');
      return;
    }
    setEmptyHint(null);
    setAdvice(null);
    // Foods the database already has (saved meals, or any food with its amount typed) are used as they are; only the rest goes to the AI.
    const local = resolveFromDb(sentence, foods);
    if (local && local.unknown.length === 0) {
      setRows(local.rows);
      setNote({ kind: 'saved', reasoning: g('text.fromSaved'), accuracy: null });
      return;
    }
    const known = local?.rows ?? [];
    const result = await ai.analyze(local ? local.unknown.join(', ') : sentence);
    if (!result) return;
    const next = [...known, ...rowsFromResult(result, foods).map((r, i) => ({ ...r, key: `ai-${known.length + i}` }))];
    setRows(next);
    if (next.length === 0) setEmptyHint('foods');
    setMealTime(validMealTime(result.mealTime));
    setNote({ kind: 'ai', reasoning: known.length > 0 ? `${g('text.partlyFromDb', { n: known.length })} ${result.reasoning}` : result.reasoning, accuracy: accuracyOf(result.accuracyPercent) });
    setAdvice(cleanAdvice(result.advice));
  }

  const patch = (key: string, change: Partial<TextMealRow>) => setRows((all) => all.map((r) => (r.key === key ? { ...r, ...change } : r)));
  const savable = useMemo(() => rows.filter((r) => r.name.trim() && (num(r.calories) > 0 || num(r.protein) > 0)), [rows]);

  const partsOf = useMemo(
    () => savable.map((r) => ({ name: r.name.trim(), calories: num(r.calories), proteinG: num(r.protein), purineMg: num(r.purine), saltG: num(r.salt), sugarG: num(r.sugar) })),
    [savable]
  );
  const totals = useMemo(() => sumParts(partsOf), [partsOf]);
  const derivedTitle = useMemo(() => joinTitle(partsOf.map((p) => p.name)), [partsOf]);
  const mealTitle = (titleTouched && title.trim() ? title.trim() : derivedTitle).slice(0, 300);

  async function save() {
    if (saving) return;
    if (savable.length === 0) {
      setEmptyHint('save');
      return;
    }
    if (timeInvalid) return;
    setSaving(true);
    const clock = parseClock(timeText);
    let persisted: string | undefined;
    try {
      if (photoUri) persisted = await persistPickedPhoto(photoUri, `extra-${Date.now()}`);
      for (const r of savable) if (!r.fromDb) recordEstimate(r.aiCalories, num(r.calories));
      const single = savable.length === 1 ? savable[0] : null;
      addExtra(input.dateKey, mealTitle, totals.calories, totals.proteinG, mealTime, {
        purineMg: totals.purineMg || undefined,
        saltG: totals.saltG || undefined,
        sugarG: totals.sugarG || undefined,
        // Nothing new to remember only when the entry is exactly one food taken unchanged from the user's own database.
        fromFoodDb: !!single && single.fromDb && single.baseline === `${single.name}|${single.calories}` && mealTitle === single.name.trim(),
        clock,
        photoUri: persisted,
        parts: savable.length >= 2 ? partsOf : undefined,
      });
      goBack();
    } catch {
      if (persisted) deletePersistedPhoto(persisted).catch(() => {});
      setSaving(false);
    }
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
              {aiErrorText(ai.error.kind, ai.error.message)}
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
          {rows.length > 0 && (
            <View style={styles.timeBox}>
              <QuestField
                label={g('food.time')}
                keyboardType="numbers-and-punctuation"
                placeholder={mealTime ? clockText(MEAL_CLOCK[mealTime]) : clockText([now.getHours(), now.getMinutes()])}
                value={timeText}
                onChangeText={setTimeText}
                maxLength={5}
              />
              <HudText size={11} weight="medium" color={timeInvalid ? quest.hpText : quest.textSecondary} accessibilityRole={timeInvalid ? 'alert' : undefined}>
                {timeInvalid ? g('food.timeError') : g('food.timeHint')}
              </HudText>
            </View>
          )}

          {rows.length > 0 && (
            <View style={styles.timeBox}>
              <QuestField
                label={g('text.mealTitle')}
                value={titleTouched ? title : derivedTitle}
                onChangeText={(v) => {
                  setTitle(v);
                  setTitleTouched(true);
                }}
                multiline
                maxLength={300}
              />
              <HudText size={12} weight="medium" color={quest.textSecondary}>
                {g('text.totals', { kcal: totals.calories, protein: totals.proteinG, purine: totals.purineMg, salt: totals.saltG, sugar: totals.sugarG })}
              </HudText>
              <FoodPhotoPicker uri={photoUri} onChange={setPhotoUri} disabled={saving} />
            </View>
          )}

          {advice && !ai.error && <AiAdviceCard advice={advice} />}
        </View>
      </ScrollView>

      {rows.length > 0 && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          <QuestButton icon="plus" title={g('text.saveMeal')} onPress={() => { void save(); }} loading={saving} />
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
  timeBox: { gap: 6 },
  footer: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: quest.border, backgroundColor: quest.bg },
});
