import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { aiNumberText, useAiFields } from '../src/ai/useAiFields';
import { cleanAdvice } from '../src/ai/adviceText';
import { AiAdviceCard } from '../src/components/quest/AiAdviceCard';
import { defaultEaten, labelToFigures, type Eaten, type NutritionLabel } from '../src/ai/nutritionLabel';
import { useLabelReading } from '../src/ai/useLabelReading';
import { useAccuracyText, useAiErrorText, useCalibrationText, usePhotoAnalysis } from '../src/ai/usePhotoAnalysis';
import { MealTextPhotos } from '../src/components/quest/MealTextPhotos';
import { MAX_MEAL_PHOTOS } from '../src/utils/photoOrder';
import { DraftFeedback } from '../src/feedback/components/DraftFeedback';
import { FoodLookup, type LookupResult } from '../src/food/components/FoodLookup';
import { lookupDescribedFood } from '../src/food/describeLookup';
import { parsePrefill } from '../src/food/prefill';
import { findRememberedFood, portionOf } from '../src/food/remember';
import { baseName } from '../src/food/calc';
import { useFoodText } from '../src/food/strings';
import type { FoodEntry } from '../src/food/types';
import { HudText } from '../src/components/quest/HudText';
import { ImpactNote } from '../src/components/quest/ImpactNote';
import { NutrientTiles } from '../src/components/quest/NutrientTiles';
import { SwapSuggestions } from '../src/components/quest/SwapSuggestions';
import type { SwapContext, SwapItem, SwapOption } from '../src/food/swaps';
import { LIMITS } from '../src/game/constants';
import { QuestButton } from '../src/components/quest/QuestButton';
import { QuestChip } from '../src/components/quest/QuestChip';
import { QuestField } from '../src/components/quest/QuestField';
import { QuestHeader } from '../src/components/quest/QuestHeader';
import { logWithExtra, previewDayChange } from '../src/game/preview';
import { useGameText } from '../src/game/strings';
import { useNow, useTodayInput } from '../src/game/useGameState';
import { useLogDate } from '../src/game/useLogDate';
import { LogDateBanner } from '../src/components/quest/LogDateBanner';
import type { StringKey } from '../src/i18n/strings';
import { useTranslation } from '../src/i18n/useTranslation';
import { useAllFoods } from '../src/store/useFoodDbStore';
import { useAiCalibrationStore } from '../src/store/useAiCalibrationStore';
import { useNutritionStore } from '../src/store/useNutritionStore';
import { clockText, loggedAtFor, MEAL_CLOCK, parseClock, timeTextInvalid } from '../src/utils/mealClock';
import { partsFromComponents, partsMatchTotals } from '../src/food/mealParts';
import type { MealPart } from '../src/types';
import { quest, questRadius } from '../src/theme/quest';
import { screenMaxWidthStyle } from '../src/theme/responsive';
import { useLightStatusBar } from '../src/theme/useLightStatusBar';
import type { PhotoAnalysisResult } from '../src/sync/cloudSync';
import { deletePersistedPhoto, persistPickedPhoto } from '../src/utils/photoStorage';
import type { ExtraFoodItem, ExtraMealTime } from '../src/types';

const MEAL_TIMES: ExtraMealTime[] = [
  'breakfast',
  'morning_snack',
  'lunch',
  'afternoon_snack',
  'late_afternoon_snack',
  'dinner',
  'evening_snack',
];

/** Non-negative number from a text field; empty or invalid input counts as 0. */
function num(text: string): number {
  const value = parseFloat(text.replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

type AiField = 'name' | 'calories' | 'protein' | 'purine' | 'salt' | 'sugar';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)');
}

export default function AddFoodScreen() {
  const g = useGameText();
  const f = useFoodText();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  useLightStatusBar();
  const now = useNow();
  const day = useLogDate(now);
  const input = useTodayInput(now, day.dateKey);
  /** Keeps the picked day when moving on to the text entry. */
  const dateParams: Record<string, string> = day.isToday ? {} : { date: day.dateKey };
  const addExtra = useNutritionStore((s) => s.addExtra);

  // A food can arrive through the route (a dinner idea from Camp): it only fills the form, nothing is saved.
  const params = useLocalSearchParams();
  const pre = useRef(parsePrefill(params as Record<string, unknown>)).current;

  const [name, setName] = useState(pre.name);
  const [mealTime, setMealTime] = useState<ExtraMealTime | null>(pre.mealTime);
  const [timeText, setTimeText] = useState('');
  /** The meal's breakdown when the AI found 2 or more foods in the photo (kept only while it still adds up to the calories). */
  const [parts, setParts] = useState<MealPart[]>([]);
  const clock = parseClock(timeText);
  const timeInvalid = timeTextInvalid(timeText);
  const [calories, setCalories] = useState(pre.calories);
  const [protein, setProtein] = useState(pre.protein);
  const [purine, setPurine] = useState(pre.purine);
  const [salt, setSalt] = useState(pre.salt);
  const [sugar, setSugar] = useState(pre.sugar);
  const [junk, setJunk] = useState(false);
  const [error, setError] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  /** Extra photos of the same meal that only go to the AI with the main one (the main photo is the one kept with the food). */
  const [morePhotos, setMorePhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  /** The outcome of looking a name-only entry up in the food database: what was added from it, or why nothing was. */
  const [dbOutcome, setDbOutcome] = useState<
    { kind: 'added'; name: string; food: string; kcal: number } | { kind: 'none' | 'multiple'; text: string } | null
  >(null);

  // AI suggestions fill the inputs but never replace what the user typed: `aiFilled` remembers which fields still hold
  // an AI value (typing in a field forgets it), and only those, or empty ones, are overwritten by a later analysis.
  const ai = usePhotoAnalysis('meal', { label: name.trim() || undefined });
  const aiErrorText = useAiErrorText();
  const accuracyText = useAccuracyText();
  const calibrationText = useCalibrationText();
  const recordEstimate = useAiCalibrationStore((s) => s.record);
  /** Calories the AI put into the form, to compare with what the user finally saves. */
  const aiCalories = useRef<number | null>(null);
  const aiFields = useAiFields<AiField>();
  const latest = useRef({ name, calories, protein, purine, salt, sugar });
  latest.current = { name, calories, protein, purine, salt, sugar };
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const [aiNote, setAiNote] = useState<{ confidence: string | null; reasoning: string; kept: boolean; saved?: boolean } | null>(null);

  // A meal logged before is remembered in the food database: its figures come back without typing and without the AI.
  const foods = useAllFoods();
  const saved = useMemo(() => (name.trim() ? findRememberedFood(foods, name) : undefined), [foods, name]);
  /** The name and calories the form held right after figures from the database were put in; unchanged means nothing new to remember. */
  const fromDb = useRef<{ name: string; calories: string } | null>(pre.fromDb && pre.name ? { name: pre.name, calories: pre.calories } : null);

  function applyAi(result: PhotoAnalysisResult) {
    const cur = latest.current;
    const known = result.foodName ? findRememberedFood(foods, result.foodName) : undefined;
    if (known) {
      // The AI recognised something already saved: the user's own earlier figures win over a fresh estimate.
      applySaved(known, cur.name.trim() ? undefined : known.name);
      return;
    }
    setParts(partsFromComponents(result.components));
    const outcomes = [
      aiFields.fill('name', cur.name, result.foodName?.trim() || undefined, setName),
      aiFields.fill('calories', cur.calories, aiNumberText(result.estimatedCaloriesKcal), setCalories),
      aiFields.fill('protein', cur.protein, aiNumberText(result.estimatedProteinG, 1), setProtein),
      aiFields.fill('purine', cur.purine, aiNumberText(result.estimatedPurineMg), setPurine),
      aiFields.fill('salt', cur.salt, aiNumberText(result.estimatedSaltG, 1), setSalt),
      aiFields.fill('sugar', cur.sugar, aiNumberText(result.estimatedSugarG, 1), setSugar),
    ];
    aiCalories.current = result.estimatedCaloriesKcal && result.estimatedCaloriesKcal > 0 ? Math.round(result.estimatedCaloriesKcal) : null;
    setError(false);
    setAiNote({ confidence: accuracyText(result), reasoning: result.reasoning, kept: outcomes.includes('kept') });
  }

  /** Puts a remembered food's figures into the form. They count as typed, so a later AI analysis keeps them. */
  function applySaved(food: FoodEntry, nameToSet?: string) {
    setParts([]);
    const p = portionOf(food);
    if (nameToSet) typed('name', setName)(nameToSet);
    typed('calories', setCalories)(String(p.calories));
    typed('protein', setProtein)(String(p.proteinG));
    setPurine(p.purineMg > 0 ? String(p.purineMg) : '');
    setSalt(p.saltG > 0 ? String(p.saltG) : '');
    setSugar(p.sugarG > 0 ? String(p.sugarG) : '');
    aiCalories.current = null;
    aiCalories.current = null;
    fromDb.current = { name: nameToSet ?? latest.current.name.trim(), calories: String(p.calories) };
    setError(false);
    setAiNote({ confidence: null, reasoning: f('food.savedUsed', { name: food.name }), kept: false, saved: true });
  }

  async function analyzePhoto() {
    if (!photoUri || ai.analyzing || saving) return;
    if (saved && morePhotos.length === 0) {
      applySaved(saved);
      return;
    }
    const result = await ai.analyze(photoUri, morePhotos);
    if (result && alive.current) applyAi(result);
  }

  const typed = aiFields.typed;

  /** One list holds every photo of the food; the first is the main one (kept as the food's photo). A new main photo
   *  starts the photo analysis and label reading over; other changes only drop the AI's answer. */
  function changePhotos(photos: string[]) {
    const main = photos[0] ?? null;
    if (main !== photoUri) {
      lab.reset();
      setParts([]);
      aiCalories.current = null;
    }
    setPhotoUri(main);
    setMorePhotos(photos.slice(1));
    setSaveFailed(false);
    ai.reset();
    setAiNote(null);
  }

  /** The extra photos of the meal, kept on the device like the first one (they are saved with it). */
  async function persistMore(uris: string[]): Promise<string[]> {
    const kept: string[] = [];
    for (const [i, uri] of uris.entries()) kept.push(await persistPickedPhoto(uri, `extra-${Date.now()}-${i + 1}`));
    return kept;
  }

  // Reading the nutrition facts panel (OCR, not an estimate): the printed figures are scaled to what was eaten, here in code.
  const lab = useLabelReading();
  const [eatenMode, setEatenMode] = useState<'servings' | 'amount'>('servings');
  const [eatenText, setEatenText] = useState('1');
  const modes = useMemo(() => {
    const l = lab.label;
    if (!l) return { servings: false, amount: false };
    return {
      servings: !!(l.perServing || (l.per100 && l.servingSize)),
      amount: !!(l.per100 || (l.perServing && l.servingSize)),
    };
  }, [lab.label]);

  function applyLabel(label: NutritionLabel, eaten: Eaten) {
    const figures = labelToFigures(label, eaten);
    if (!figures) return;
    const cur = latest.current;
    aiFields.fill('calories', cur.calories, aiNumberText(figures.calories), setCalories);
    aiFields.fill('protein', cur.protein, aiNumberText(figures.proteinG, 1), setProtein);
    aiFields.fill('salt', cur.salt, aiNumberText(figures.saltG, 1), setSalt);
    aiFields.fill('sugar', cur.sugar, aiNumberText(figures.sugarG, 1), setSugar);
    aiCalories.current = null; // read from the label, not estimated: nothing to calibrate
    fromDb.current = null;
    setError(false);
  }

  async function readLabel() {
    if (!photoUri || lab.reading || ai.analyzing || saving) return;
    const label = await lab.read(photoUri);
    if (!label || !alive.current) return;
    const eaten = defaultEaten(label);
    setEatenMode('servings' in eaten ? 'servings' : 'amount');
    setEatenText(String('servings' in eaten ? eaten.servings : eaten.amount));
    if (label.productName) aiFields.fill('name', latest.current.name, label.productName, setName);
    setAiNote(null);
    applyLabel(label, eaten);
  }

  function changeEaten(text: string) {
    setEatenText(text);
    const n = parseFloat(text.replace(',', '.'));
    if (lab.label && n > 0) applyLabel(lab.label, eatenMode === 'servings' ? { servings: n } : { amount: n });
  }

  function switchEatenMode(mode: 'servings' | 'amount') {
    if (!lab.label || mode === eatenMode) return;
    const start = mode === 'servings' ? '1' : String(lab.label.servingSize?.amount ?? 100);
    setEatenMode(mode);
    setEatenText(start);
    applyLabel(lab.label, mode === 'servings' ? { servings: 1 } : { amount: Number(start) });
  }
  const advice = useMemo(() => cleanAdvice(ai.result?.advice), [ai.result]);

  /** Totals from the food lookup replace the nutrition fields; they count as typed, so a later AI analysis keeps them. */
  function applyLookup(r: LookupResult) {
    setParts([]);
    typed('name', setName)(r.name);
    typed('calories', setCalories)(String(r.calories));
    typed('protein', setProtein)(String(r.proteinG));
    setPurine(r.purineMg > 0 ? String(r.purineMg) : '');
    setSalt(r.saltG > 0 ? String(r.saltG) : '');
    setSugar(r.sugarG > 0 ? String(r.sugarG) : '');
    aiCalories.current = null;
    aiCalories.current = null;
    fromDb.current = { name: r.name.trim(), calories: String(r.calories) };
    setError(false);
  }

  const draft: ExtraFoodItem = useMemo(
    () => ({
      id: 'draft',
      name: name.trim(),
      calories: num(calories),
      proteinG: num(protein),
      mealTime,
      loggedAtISO: loggedAtFor(input.dateKey, mealTime, now, clock),
      purineMg: num(purine) || undefined,
      saltG: num(salt) || undefined,
      sugarG: num(sugar) || undefined,
      junk: junk || undefined,
    }),
    [name, mealTime, calories, protein, purine, salt, sugar, junk, now, input.dateKey, clock]
  );

  // How the day's missions would change if this exact item were saved right now.
  const preview = useMemo(
    () => previewDayChange(input, logWithExtra(input.log, input.dateKey, draft)),
    [input, draft]
  );
  const hasValue = draft.calories > 0 || draft.proteinG > 0;

  async function save() {
    if (saving) return;
    setDbOutcome(null);
    if (!hasValue) {
      // Only a name typed (no calories, no protein): the food database may know it.
      if (draft.name && !calories.trim() && !protein.trim()) {
        if (!timeInvalid) await saveFromDb();
        return;
      }
      setError(true);
      return;
    }
    if (timeInvalid) return;
    setSaving(true);
    setSaveFailed(false);
    let persisted: string | undefined;
    let more: string[] = [];
    try {
      // The picker hands back a temporary file the OS may clear; keep our own copy with the item.
      if (photoUri) persisted = await persistPickedPhoto(photoUri, `extra-${Date.now()}`);
      if (photoUri) more = await persistMore(morePhotos);
      if (aiCalories.current !== null) recordEstimate(aiCalories.current, draft.calories);
      addExtra(input.dateKey, draft.name, draft.calories, draft.proteinG, mealTime, {
        purineMg: draft.purineMg,
        saltG: draft.saltG,
        sugarG: draft.sugarG,
        junk: draft.junk,
        photoUri: persisted,
        morePhotoUris: more,
        fromFoodDb: fromDb.current?.name === draft.name && fromDb.current.calories === calories.trim(),
        clock,
        parts: partsMatchTotals({ calories: draft.calories, parts }) ? parts : undefined,
      });
      goBack();
    } catch {
      // Nothing was added: the form stays exactly as typed so the user can retry, or drop the photo.
      for (const uri of [persisted, ...more]) if (uri) deletePersistedPhoto(uri).catch(() => {});
      setSaveFailed(true);
      setSaving(false);
    }
  }

  /** Adds a name-only entry with the food database's figures when the name is ONE food it knows (an amount typed with it is
   *  scaled), and stays on the form to show where the figures came from. Several foods or an unknown name are never guessed. */
  async function saveFromDb() {
    const text = draft.name;
    const found = lookupDescribedFood(text, foods);
    if (found.kind !== 'match') {
      setDbOutcome({ kind: found.kind, text });
      return;
    }
    const item = found.item;
    setSaving(true);
    setSaveFailed(false);
    let persisted: string | undefined;
    let more: string[] = [];
    try {
      if (photoUri) persisted = await persistPickedPhoto(photoUri, `extra-${Date.now()}`);
      if (photoUri) more = await persistMore(morePhotos);
      addExtra(input.dateKey, item.name, item.calories, item.proteinG, mealTime, {
        purineMg: item.purineMg || undefined,
        saltG: item.saltG || undefined,
        sugarG: item.sugarG || undefined,
        junk: draft.junk,
        photoUri: persisted,
        morePhotoUris: more,
        fromFoodDb: true,
        clock,
      });
      if (!alive.current) return;
      // Saved: the form is cleared so a second tap cannot add it twice; the note says what was added and from where.
      setName('');
      setPurine('');
      setSalt('');
      setSugar('');
      setPhotoUri(null);
      setMorePhotos([]);
      setParts([]);
      ai.reset();
      lab.reset();
      setAiNote(null);
      aiCalories.current = null;
      fromDb.current = null;
      setDbOutcome({ kind: 'added', name: item.name, food: baseName(item.food.name), kcal: item.calories });
    } catch {
      for (const uri of [persisted, ...more]) if (uri) deletePersistedPhoto(uri).catch(() => {});
      if (alive.current) setSaveFailed(true);
    } finally {
      if (alive.current) setSaving(false);
    }
  }

  const exceeded = {
    purine: preview.newlyMissed.includes('purine'),
    salt: preview.newlyMissed.includes('salt'),
    sugar: preview.newlyMissed.includes('sugar'),
  };

  // When this item breaks a limit, offer swaps: how much room each limit has left before it, and the item as it stands.
  const limits = { purine: input.limits?.purineMg ?? LIMITS.purineMg, salt: input.limits?.saltG ?? LIMITS.saltG, sugar: input.limits?.sugarG ?? LIMITS.sugarG };
  const swapContext = useMemo<SwapContext>(() => {
    const before = preview.before.nutrients;
    return {
      exceeded: (['purine', 'salt', 'sugar'] as const).filter((n) => preview.newlyMissed.includes(n)),
      headroom: { purine: limits.purine - before.purineMg, salt: limits.salt - before.saltG, sugar: limits.sugar - before.sugarG },
    };
  }, [preview, limits.purine, limits.salt, limits.sugar]); // eslint-disable-line react-hooks/exhaustive-deps
  const swapItem = useMemo<SwapItem>(
    () => ({ name: draft.name, calories: draft.calories, proteinG: draft.proteinG, purineMg: draft.purineMg ?? 0, saltG: draft.saltG ?? 0, sugarG: draft.sugarG ?? 0 }),
    [draft]
  );

  /** The user picked a swap: its name and figures go into the form as typed values (nothing is saved). */
  function applySwap(option: SwapOption) {
    setParts([]);
    typed('name', setName)(option.name);
    typed('calories', setCalories)(String(option.calories));
    typed('protein', setProtein)(String(option.proteinG));
    typed('purine', setPurine)(option.purineMg > 0 ? String(option.purineMg) : '');
    typed('salt', setSalt)(option.saltG > 0 ? String(option.saltG) : '');
    typed('sugar', setSugar)(option.sugarG > 0 ? String(option.sugarG) : '');
    aiCalories.current = null;
    fromDb.current = option.source === 'db' ? { name: option.name, calories: String(option.calories) } : null;
    setAiNote(null);
    setError(false);
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, screenMaxWidthStyle, { paddingTop: insets.top + 16 }]}
      >
        <QuestHeader title={g('food.title')} onBack={goBack} backLabel={g('common.back')} />
        <HudText size={13} weight="medium" color={quest.textSecondary} style={styles.subtitle}>
          {g('food.subtitle')}
        </HudText>
        {!day.isToday && <LogDateBanner label={day.label} />}

        <View style={styles.form}>
          <QuestButton variant="ghost" icon="chart" title={g('text.link')} onPress={() => router.push({ pathname: '/text-meal', params: dateParams })} />
          <FoodLookup onApply={applyLookup} onOpenDb={() => router.push('/food-db')} />
          <QuestField label={g('food.name')} value={name} onChangeText={(v) => { typed('name', setName)(v); setDbOutcome(null); }} placeholder={g('food.namePlaceholder')} />
          {saved && String(portionOf(saved).calories) !== calories.trim() && (
            <View style={styles.aiNote} accessibilityLiveRegion="polite">
              <HudText size={12} color={quest.manaText}>
                {f('food.savedTitle')}
              </HudText>
              <HudText size={12} weight="medium" color={quest.textSecondary}>
                {f('food.savedHint', { kcal: portionOf(saved).calories, p: portionOf(saved).proteinG })}
              </HudText>
              <QuestButton title={f('food.savedUse')} variant="mana" onPress={() => applySaved(saved)} />
            </View>
          )}
          <DraftFeedback
            name={name}
            calories={num(calories)}
            proteinG={num(protein)}
            purineMg={num(purine)}
            saltG={num(salt)}
            sugarG={num(sugar)}
            mealTime={mealTime}
            dateKey={input.dateKey}
          />

          <View style={styles.group}>
            <HudText size={12} weight="medium" color={quest.textSecondary}>
              {g('food.mealTime')}
            </HudText>
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

          <View style={styles.pair}>
            <View style={styles.pairCell}>
              <QuestField label={g('food.calories')} keyboardType="decimal-pad" value={calories} onChangeText={(v) => { typed('calories', setCalories)(v); setError(false); }} />
            </View>
            <View style={styles.pairCell}>
              <QuestField label={g('food.protein')} keyboardType="decimal-pad" value={protein} onChangeText={(v) => { typed('protein', setProtein)(v); setError(false); }} />
            </View>
          </View>
          {error && (
            <HudText size={12} weight="medium" color={quest.goldLight} accessibilityLiveRegion="polite">
              {g('food.errorValue')}
            </HudText>
          )}
          {!calories.trim() && !protein.trim() && !dbOutcome && (
            <HudText size={11} weight="medium" color={quest.textSecondary}>
              {g('food.db.hint')}
            </HudText>
          )}
          {dbOutcome?.kind === 'added' && (
            <View style={styles.aiNote} accessibilityLiveRegion="polite">
              <HudText size={12} color={quest.manaText}>
                {day.isToday ? g('food.db.added', { name: dbOutcome.name }) : g('food.db.addedOn', { name: dbOutcome.name, day: day.label })}
              </HudText>
              <HudText size={12} weight="medium" color={quest.textSecondary}>
                {g('food.db.source', { food: dbOutcome.food, kcal: dbOutcome.kcal })}
              </HudText>
            </View>
          )}
          {(dbOutcome?.kind === 'none' || dbOutcome?.kind === 'multiple') && (
            <View style={styles.group} accessibilityLiveRegion="polite">
              <HudText size={12} weight="medium" color={quest.goldLight} accessibilityRole="alert">
                {g(dbOutcome.kind === 'none' ? 'food.db.notFound' : 'food.db.multiple', { text: dbOutcome.text })}
              </HudText>
              <QuestButton
                variant="ghost"
                icon="chart"
                title={g('food.db.toText')}
                onPress={() => router.push({ pathname: '/text-meal', params: { text: dbOutcome.text, ...dateParams } })}
              />
            </View>
          )}

          <HudText size={11} color={quest.textSecondary} style={styles.eyebrow}>
            {g('food.optional').toUpperCase()}
          </HudText>
          <View style={styles.pair}>
            <View style={styles.pairCell}>
              <QuestField label={g('food.purine')} keyboardType="decimal-pad" value={purine} onChangeText={typed('purine', setPurine)} />
            </View>
            <View style={styles.pairCell}>
              <QuestField label={g('food.salt')} keyboardType="decimal-pad" value={salt} onChangeText={typed('salt', setSalt)} />
            </View>
            <View style={styles.pairCell}>
              <QuestField label={g('food.sugar')} keyboardType="decimal-pad" value={sugar} onChangeText={typed('sugar', setSugar)} />
            </View>
          </View>

          <View style={styles.junkRow}>
            <View style={styles.junkText}>
              <HudText size={14}>{g('food.junk')}</HudText>
              <HudText size={12} weight="medium" color={quest.textSecondary}>
                {g('food.junkHint')}
              </HudText>
            </View>
            <Switch
              accessibilityLabel={g('food.junk')}
              value={junk}
              onValueChange={setJunk}
              trackColor={{ false: quest.raised2, true: quest.gold }}
              thumbColor={quest.text}
            />
          </View>

          <MealTextPhotos
            kind="meal"
            max={MAX_MEAL_PHOTOS}
            photos={photoUri ? [photoUri, ...morePhotos] : []}
            onChange={changePhotos}
            disabled={saving || ai.analyzing || lab.reading}
          />
          {photoUri && (
            <View style={styles.group}>
              <View style={styles.pair}>
                <View style={styles.pairCell}>
                  <QuestButton
                    variant="ghost"
                    icon="chart"
                    title={g('ai.analyzeShort')}
                    accessibilityLabel={ai.analyzing ? g('ai.analyzing') : g('ai.analyze')}
                    onPress={() => { void analyzePhoto(); }}
                    loading={ai.analyzing}
                    disabled={saving || lab.reading}
                  />
                </View>
                <View style={styles.pairCell}>
                  <QuestButton
                    variant="ghost"
                    icon="list"
                    title={g('label.readShort')}
                    accessibilityLabel={lab.reading ? g('label.reading') : g('label.read')}
                    onPress={() => { void readLabel(); }}
                    loading={lab.reading}
                    disabled={saving || ai.analyzing}
                  />
                </View>
              </View>
              {ai.error && (
                <HudText size={12} weight="medium" color={quest.hpText} accessibilityRole="alert" accessibilityLiveRegion="polite">
                  {aiErrorText(ai.error.kind, ai.error.message)}
                </HudText>
              )}
              {aiNote && !ai.error && (
                <View style={styles.aiNote} accessibilityLiveRegion="polite">
                  <HudText size={12} color={quest.manaText}>
                    {aiNote.saved ? f('food.savedTitle') : g('ai.suggested')}
                    {aiNote.confidence ? ` · ${aiNote.confidence}` : ''}
                  </HudText>
                  {aiNote.reasoning ? (
                    <HudText size={12} weight="medium" color={quest.textSecondary}>
                      {aiNote.reasoning}
                    </HudText>
                  ) : null}
                  {!aiNote.saved && calibrationText ? (
                    <HudText size={12} weight="medium" color={quest.textSecondary}>
                      {calibrationText}
                    </HudText>
                  ) : null}
                  {aiNote.kept ? (
                    <HudText size={12} weight="medium" color={quest.textSecondary}>
                      {g('ai.keptYours')}
                    </HudText>
                  ) : null}
                </View>
              )}
              {partsMatchTotals({ calories: draft.calories, parts }) && (
                <View style={styles.aiNote}>
                  <HudText size={12} color={quest.manaText}>
                    {g('food.partsTitle')}
                  </HudText>
                  {parts.map((p, i) => (
                    <HudText key={i} size={12} weight="medium" color={quest.textSecondary}>
                      {`• ${p.name}: ${p.calories} kcal · ${p.proteinG} g`}
                    </HudText>
                  ))}
                  <HudText size={11} weight="medium" color={quest.textSecondary}>
                    {g('food.partsNote')}
                  </HudText>
                </View>
              )}
              {advice && !ai.error && <AiAdviceCard advice={advice} />}
              {lab.error && (
                <HudText size={12} weight="medium" color={quest.hpText} accessibilityRole="alert" accessibilityLiveRegion="polite">
                  {aiErrorText(lab.error.kind, lab.error.message)}
                </HudText>
              )}
              {lab.unreadable && !lab.error && (
                <HudText size={12} weight="medium" color={quest.goldLight} accessibilityRole="alert" accessibilityLiveRegion="polite">
                  {g('label.unreadable')}
                </HudText>
              )}
              {lab.label && !lab.error && (
                <View style={styles.aiNote} accessibilityLiveRegion="polite">
                  <HudText size={12} color={quest.manaText}>
                    {g('label.title')}
                    {lab.label.productName ? ` · ${lab.label.productName}` : ''}
                    {accuracyText(lab.label) ? ` · ${accuracyText(lab.label)}` : ''}
                  </HudText>
                  <HudText size={12} weight="medium" color={quest.textSecondary}>
                    {g('label.check')}
                  </HudText>
                  {modes.servings && modes.amount && (
                    <View style={styles.chips}>
                      <QuestChip label={g('label.modeServings')} selected={eatenMode === 'servings'} onPress={() => switchEatenMode('servings')} />
                      <QuestChip label={g('label.modeAmount')} selected={eatenMode === 'amount'} onPress={() => switchEatenMode('amount')} />
                    </View>
                  )}
                  <QuestField
                    label={eatenMode === 'servings' ? g('label.servings') : g('label.amount')}
                    keyboardType="decimal-pad"
                    value={eatenText}
                    onChangeText={changeEaten}
                  />
                  {lab.label.servingSize && (
                    <HudText size={11} weight="medium" color={quest.textSecondary}>
                      {g('label.serving', { amount: lab.label.servingSize.amount, unit: lab.label.servingSize.unit })}
                      {lab.label.servingsPerPack ? ` · ${g('label.perPack', { n: lab.label.servingsPerPack })}` : ''}
                    </HudText>
                  )}
                  <HudText size={11} weight="medium" color={quest.textSecondary}>
                    {g('label.noPurine')}
                  </HudText>
                </View>
              )}
            </View>
          )}
          {saveFailed && (
            <HudText size={12} weight="medium" color={quest.hpText} accessibilityRole="alert" accessibilityLiveRegion="polite">
              {g('food.photo.saveFailed')}
            </HudText>
          )}

          <View style={styles.group}>
            <HudText size={11} color={quest.textSecondary} style={styles.eyebrow}>
              {g('food.impact').toUpperCase()}
            </HudText>
            <NutrientTiles
              nutrients={{ purineMg: draft.purineMg ?? 0, saltG: draft.saltG ?? 0, sugarG: draft.sugarG ?? 0 }}
              exceeded={exceeded}
            />
            <ImpactNote newlyDone={preview.newlyDone} newlyMissed={preview.newlyMissed} />
            {swapContext.exceeded.length > 0 && draft.calories > 0 && (
              <SwapSuggestions item={swapItem} context={swapContext} limits={limits} mealTime={mealTime} disabled={saving} onUse={applySwap} />
            )}
          </View>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <View style={screenMaxWidthStyle}>
          <QuestButton icon="plus" title={day.isToday ? g('food.save') : g('food.saveOn', { day: day.label })} onPress={() => { void save(); }} loading={saving} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: quest.bg },
  content: { paddingHorizontal: 16, paddingBottom: 24 },
  subtitle: { marginTop: 10 },
  form: { marginTop: 16, gap: 14 },
  group: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pair: { flexDirection: 'row', gap: 10 },
  pairCell: { flex: 1, minWidth: 0 },
  eyebrow: { letterSpacing: 1.6, marginTop: 4 },
  junkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 60,
    padding: 12,
    borderRadius: questRadius.panel,
    backgroundColor: quest.panel,
    borderWidth: 1.5,
    borderColor: quest.border,
  },
  junkText: { flex: 1 },
  aiNote: { gap: 4, padding: 12, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.manaBorder, backgroundColor: quest.manaPanel },
  footer: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: quest.bg, borderTopWidth: 1.5, borderTopColor: quest.border, alignItems: 'center' },
});
