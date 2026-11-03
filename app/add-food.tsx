import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Image, Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { cleanAdvice } from '../src/ai/adviceText';
import { accuracyOf } from '../src/ai/accuracy';
import { defaultEaten, labelToFigures, type Eaten, type NutritionLabel } from '../src/ai/nutritionLabel';
import { MEAL_TIMES, resolveFromDb, rowsFromResult, validMealTime } from '../src/ai/textMeal';
import { useLabelReading } from '../src/ai/useLabelReading';
import { useMealTextAnalysis } from '../src/ai/useMealTextAnalysis';
import { useAiErrorText, useCalibrationText, usePhotoAnalysis } from '../src/ai/usePhotoAnalysis';
import { AiAdviceCard } from '../src/components/quest/AiAdviceCard';
import { BottomSheet } from '../src/components/quest/BottomSheet';
import { DateChip } from '../src/components/quest/DateChip';
import { DishThumb } from '../src/components/quest/DishThumb';
import { HudText } from '../src/components/quest/HudText';
import { ImpactNote } from '../src/components/quest/ImpactNote';
import { MealItemSheet, useRowSourceText } from '../src/components/quest/MealItemSheet';
import { MealTextPhotos } from '../src/components/quest/MealTextPhotos';
import { NutrientTiles } from '../src/components/quest/NutrientTiles';
import { QuestButton } from '../src/components/quest/QuestButton';
import { QuestChip } from '../src/components/quest/QuestChip';
import { QuestField } from '../src/components/quest/QuestField';
import { QuestIcon } from '../src/components/quest/QuestIcon';
import { SavedFoodsSheet } from '../src/components/quest/SavedFoodsSheet';
import { ScreenTemplate } from '../src/components/quest/ScreenTemplate';
import { SwapSuggestions } from '../src/components/quest/SwapSuggestions';
import { DraftFeedback } from '../src/feedback/components/DraftFeedback';
import { baseName } from '../src/food/calc';
import type { LookupResult } from '../src/food/components/FoodLookup';
import { lookupDescribedFood } from '../src/food/describeLookup';
import { joinTitle, sumParts } from '../src/food/mealParts';
import { emptyRow, num, rowAmount, rowFromFigures, rowHasNoFigures, rowIsEmpty, rowIsSavable, rowPart, scaleRow, type MealRow } from '../src/food/mealRows';
import { formatQty } from '../src/food/partScale';
import { takePendingMealPhoto } from '../src/food/pendingPhoto';
import { photoResultToMealText } from '../src/food/photoResult';
import { parsePrefill } from '../src/food/prefill';
import { findRememberedFood, portionOf } from '../src/food/remember';
import { useFoodText } from '../src/food/strings';
import type { SwapContext, SwapItem, SwapOption } from '../src/food/swaps';
import { useSpeechInput } from '../src/food/useSpeechInput';
import { LIMITS } from '../src/game/constants';
import { logWithExtra, previewDayChange } from '../src/game/preview';
import { useGameText } from '../src/game/strings';
import { useNow, useTodayInput } from '../src/game/useGameState';
import { useLogDate } from '../src/game/useLogDate';
import type { StringKey } from '../src/i18n/strings';
import { useTranslation } from '../src/i18n/useTranslation';
import { SKIPPED_MEAL_NAME } from '../src/insights/missing';
import { useAiCalibrationStore } from '../src/store/useAiCalibrationStore';
import { useAiPhotoStore } from '../src/store/useAiPhotoStore';
import { useAllFoods } from '../src/store/useFoodDbStore';
import { useNutritionStore } from '../src/store/useNutritionStore';
import { useSettingsStore } from '../src/store/useSettingsStore';
import { showToast } from '../src/store/useToastStore';
import { quest, questRadius } from '../src/theme/quest';
import { useLightStatusBar } from '../src/theme/useLightStatusBar';
import type { PhotoAdvice } from '../src/sync/cloudSync';
import type { ExtraFoodItem, ExtraMealTime } from '../src/types';
import { clockText, loggedAtFor, MEAL_CLOCK, parseClock, timeTextInvalid } from '../src/utils/mealClock';
import { MAX_MEAL_PHOTOS } from '../src/utils/photoOrder';
import { deletePersistedPhoto, persistPickedPhoto } from '../src/utils/photoStorage';
import { pickPhotos } from '../src/utils/pickPhoto';

/** Main meals that can be logged as not eaten ("Không ăn"), so a skipped meal is not counted as one left out by mistake. */
const SKIPPABLE: ExtraMealTime[] = ['breakfast', 'lunch', 'dinner'];

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)');
}

/** One step amount for the − / + of a food line: half a portion for bowls and pieces, 10 for grams and millilitres. */
function portionStep(qty: number): number {
  return qty >= 20 ? 10 : 0.5;
}

type Step = 'input' | 'review';
type PhotoKind = 'food' | 'label';
type Run = 'text' | 'photo' | 'label';

/** "Ghi bữa" (Design/uiux-proposal README §3.3, html/03-addfood-after, dialogs 05–08): one meal-logging flow in two steps.
 *  1. Nhập: photos (camera or library), a sentence typed or dictated, or "Món đã lưu"; ONE "Phân tích" sends it to the right AI
 *     (a meal photo alone → the photo analysis; a nutrition label → the label reader; words, with or without photos → the text parser;
 *     foods the user's database knows are filled in without any AI). "Tự nhập" skips the AI.
 *  2. Kiểm tra món: one line per food (thumbnail, name, kcal · protein, − / + amount; ✎ opens every figure in a sheet, a removed food
 *     comes back with Hoàn tác), chips for the meal, the time and junk food, the impact on the day, "Chi tiết" (nutrients, the label,
 *     swaps, advice, the description), and the sticky "Lưu bữa · N kcal". Nothing is saved before that button. */
export default function AddFoodScreen() {
  const g = useGameText();
  const f = useFoodText();
  const { t } = useTranslation();
  useLightStatusBar();
  const now = useNow();
  const day = useLogDate(now);
  const input = useTodayInput(now, day.dateKey);
  const addExtra = useNutritionStore((s) => s.addExtra);
  const foods = useAllFoods();
  const language = useSettingsStore((s) => s.language);
  const ai = useMealTextAnalysis();
  const photoAi = usePhotoAnalysis('meal');
  const lab = useLabelReading();
  const aiErrorText = useAiErrorText();
  const calibrationText = useCalibrationText();
  const recordEstimate = useAiCalibrationStore((s) => s.record);
  const aiEnabled = useAiPhotoStore((s) => s.aiEnabled);
  const sourceText = useRowSourceText();

  // A food can arrive through the route (Ăn lại, a meal idea, Món đã lưu, a cook book dish): it is the first line and the
  // screen opens on the check step. `text` starts the description.
  const params = useLocalSearchParams();
  const pre = useRef(parsePrefill(params as Record<string, unknown>)).current;
  const textParam = typeof params.text === 'string' ? params.text : '';
  const prefilled = !!(pre.name || pre.calories || pre.protein);
  const nextKey = useRef(0);
  const newKey = (prefix: string) => `${prefix}${nextKey.current++}`;

  // "Chụp món" (quick add, Camp): the photo just taken comes in memory (`photo=1`) and is analysed at once when AI is on.
  const handedPhoto = useRef<string | null | undefined>(undefined);
  if (handedPhoto.current === undefined) handedPhoto.current = params.photo === '1' ? takePendingMealPhoto() : null;

  const [step, setStep] = useState<Step>(prefilled ? 'review' : 'input');
  const [text, setText] = useState(textParam);
  const [photos, setPhotos] = useState<string[]>(() => (handedPhoto.current ? [handedPhoto.current] : []));
  const [kind, setKind] = useState<PhotoKind>('food');
  const [rows, setRows] = useState<MealRow[]>(() =>
    prefilled
      ? [rowFromFigures('pre', { name: pre.name, calories: num(pre.calories), proteinG: num(pre.protein), purineMg: num(pre.purine), saltG: num(pre.salt), sugarG: num(pre.sugar) }, pre.fromDb)]
      : []
  );
  const [mealTime, setMealTime] = useState<ExtraMealTime | null>(pre.mealTime);
  const [timeText, setTimeText] = useState('');
  const clock = parseClock(timeText);
  const timeInvalid = timeTextInvalid(timeText);
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [junk, setJunk] = useState(false);
  const [note, setNote] = useState<{ kind: 'saved' | 'ai'; reasoning: string; accuracy: number | null } | null>(null);
  const [advice, setAdvice] = useState<PhotoAdvice | null>(null);
  const [hint, setHint] = useState<'text' | 'foods' | 'value' | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [lastRun, setLastRun] = useState<Run | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'slot' | 'saved' | 'info' | null>(null);
  const [detailsOpen, setDetailsOpen] = useState<boolean | null>(null);
  /** The outcome of looking a name-only entry up in the food database: what was added from it, or why nothing was. */
  const [dbOutcome, setDbOutcome] = useState<
    { kind: 'filled'; name: string; food: string; kcal: number } | { kind: 'none' | 'multiple'; text: string } | null
  >(null);

  const speech = useSpeechInput(language === 'en' ? 'en' : 'vi', (v) => {
    setText(v.slice(0, 400));
    setHint(null);
  });

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const autoAnalysed = useRef(false);
  useEffect(() => {
    if (autoAnalysed.current || !handedPhoto.current || !aiEnabled) return;
    autoAnalysed.current = true;
    void analyze();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const patchRows = (key: string, next: MealRow) => setRows((all) => all.map((r) => (r.key === key ? next : r)));

  // Reading the nutrition facts panel (OCR, not an estimate) of the main photo: the printed figures are scaled to what was eaten, here in code.
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

  function changePhotos(next: string[]) {
    if (next[0] !== photos[0]) lab.reset(); // the label was read from the main photo
    setPhotos(next);
    setSaveFailed(false);
    setHint(null);
  }

  async function addPhotos() {
    const room = MAX_MEAL_PHOTOS - photos.length;
    if (room <= 0) return;
    const picked = await pickPhotos(room);
    if (!picked || 'error' in picked || !alive.current) return;
    changePhotos([...photos, ...picked.uris].slice(0, MAX_MEAL_PHOTOS));
  }

  /** Lines a new AI analysis replaces: its own earlier ones and lines with no figures yet. */
  const replaceable = (r: MealRow) => r.key.startsWith('ai') || rowHasNoFigures(r);

  /** The one "Phân tích": a label photo → the label reader; photos without words → the photo analysis; words (with or without
   *  photos) → the text parser, after the user's own database has answered what it can. */
  async function analyze(override?: string) {
    if (busy) return;
    if (photos.length > 0 && kind === 'label' && override === undefined) {
      await readLabel();
      return;
    }
    const loneName = rows.length === 1 && rowHasNoFigures(rows[0]) ? rows[0].name.trim() : '';
    const sentence = (override ?? text).trim() || loneName;
    if (!sentence && photos.length === 0) {
      setHint('text');
      return;
    }
    if (override !== undefined) setText(override);
    setHint(null);
    setDbOutcome(null);
    setAdvice(null);
    const run = newKey('ai');
    const kept = rows.filter((r) => !replaceable(r));

    if (!sentence) {
      setLastRun('photo');
      const result = await photoAi.analyze(photos[0], photos.slice(1, MAX_MEAL_PHOTOS));
      if (!result || !alive.current) return;
      const parsed = photoResultToMealText(result, g('meal.photoFood'));
      finish(kept, [], rowsFromResult(parsed, foods).map((r, i) => ({ ...r, key: `${run}-${i}` })), parsed.reasoning, parsed.accuracyPercent, parsed.advice);
      return;
    }

    setLastRun('text');
    // Foods the database already has (saved meals, or any food with its amount typed) are used as they are; only the rest goes to the AI.
    // With photos the whole description goes to the AI with them: the photos may show more than the words say.
    const local = photos.length === 0 ? resolveFromDb(sentence, foods) : null;
    const known = (local?.rows ?? []).map((r, i) => ({ ...r, key: `${run}-d${i}` }));
    if (local && local.unknown.length === 0) {
      setRows([...kept, ...known]);
      setNote({ kind: 'saved', reasoning: g('text.fromSaved'), accuracy: null });
      setStep('review');
      return;
    }
    const result = await ai.analyze(local ? local.unknown.join(', ') : sentence, photos);
    if (!result || !alive.current) return;
    const found = rowsFromResult(result, foods).map((r, i) => ({ ...r, key: `${run}-${i}` }));
    const time = validMealTime(result.mealTime);
    if (time) setMealTime(time);
    finish(kept, known, found, result.reasoning, result.accuracyPercent, result.advice);
  }

  /** The lines of an answer go in (after what is kept); nothing found keeps the user on the input step with a message. */
  function finish(kept: MealRow[], known: MealRow[], found: MealRow[], reasoning: string, accuracy: number | undefined, adv: PhotoAdvice | undefined) {
    if (known.length + found.length === 0) {
      setHint('foods');
      if (kept.length > 0) setRows(kept);
      return;
    }
    setRows([...kept, ...known, ...found]);
    setNote({ kind: 'ai', reasoning: known.length > 0 ? `${g('text.partlyFromDb', { n: known.length })} ${reasoning}` : reasoning, accuracy: accuracyOf(accuracy) });
    setAdvice(cleanAdvice(adv));
    setStep('review');
  }

  /** "Tự nhập": straight to the check step. Words already typed become lines (from the database where it knows them, else a
   *  name to fill in); with nothing at all, an empty line opens in the edit sheet. */
  function manual() {
    const sentence = text.trim();
    const base = rows.filter((r) => !rowIsEmpty(r));
    const add: MealRow[] = [];
    if (sentence && base.length === 0) {
      const local = resolveFromDb(sentence, foods);
      if (local) {
        for (const r of local.rows) add.push({ ...r, key: newKey('db') });
        for (const name of local.unknown) add.push(emptyRow(newKey('m'), name.slice(0, 100)));
      }
    }
    const next = [...base, ...add];
    setHint(null);
    setStep('review');
    if (next.length === 0) {
      const r = emptyRow(newKey('m'));
      setRows([r]);
      setEditingKey(r.key);
      return;
    }
    setRows(next);
  }

  /** What the user had typed in the lone line before the label was read: kept as typed, the label fills the rest. */
  const labelKeep = useRef<Partial<MealRow>>({});

  /** The label's figures go into the lone line (or a line of their own when there are several); what was typed there stays. */
  function applyLabel(label: NutritionLabel, eaten: Eaten) {
    const figures = labelToFigures(label, eaten);
    if (!figures) return;
    setRows((all) => {
      const at = all.findIndex((r) => r.key === 'label');
      const target = at >= 0 ? all[at] : all.length === 1 ? all[0] : null;
      const row = { ...rowFromFigures('label', { name: label.productName ?? '', calories: figures.calories, proteinG: figures.proteinG, saltG: figures.saltG, sugarG: figures.sugarG }, false), ...labelKeep.current };
      if (!target) return [...all, row];
      return all.map((r) => (r === target ? row : r));
    });
    setHint(null);
  }

  async function readLabel() {
    const photo = photos[0];
    if (!photo || busy) return;
    setLastRun('label');
    const label = await lab.read(photo);
    if (!label || !alive.current) return;
    const lone = rows.length === 1 && rows[0].key !== 'label' ? rows[0] : null;
    const keep: Partial<MealRow> = {};
    if (lone) for (const k of ['name', 'calories', 'protein', 'purine', 'salt', 'sugar'] as const) if (lone[k].trim()) keep[k] = lone[k];
    if (rows.some((r) => r.key === 'label')) Object.assign(keep, labelKeep.current);
    labelKeep.current = keep;
    const eaten = defaultEaten(label);
    setEatenMode('servings' in eaten ? 'servings' : 'amount');
    setEatenText(String('servings' in eaten ? eaten.servings : eaten.amount));
    applyLabel(label, eaten);
    setStep('review');
  }

  function changeEaten(value: string) {
    setEatenText(value);
    const n = parseFloat(value.replace(',', '.'));
    if (lab.label && n > 0) applyLabel(lab.label, eatenMode === 'servings' ? { servings: n } : { amount: n });
  }

  function switchEatenMode(mode: 'servings' | 'amount') {
    if (!lab.label || mode === eatenMode) return;
    const start = mode === 'servings' ? '1' : String(lab.label.servingSize?.amount ?? 100);
    setEatenMode(mode);
    setEatenText(start);
    applyLabel(lab.label, mode === 'servings' ? { servings: 1 } : { amount: Number(start) });
  }

  /** Foods picked in "Món đã lưu" (with their amounts) become one line: it fills an empty line, else it is added. */
  function applyLookup(r: LookupResult) {
    const row = rowFromFigures(newKey('db'), r, true);
    setRows((all) => {
      const empty = all.findIndex(rowIsEmpty);
      return empty >= 0 ? all.map((x, i) => (i === empty ? row : x)) : [...all, row];
    });
    setHint(null);
    setDbOutcome(null);
    setSheet(null);
    setStep('review');
  }

  const savable = useMemo(() => rows.filter(rowIsSavable), [rows]);
  const partsOf = useMemo(() => savable.map(rowPart), [savable]);
  const totals = useMemo(() => sumParts(partsOf), [partsOf]);
  const derivedTitle = useMemo(() => joinTitle(partsOf.map((p) => p.name)), [partsOf]);
  const single = savable.length === 1 ? savable[0] : null;
  const mealTitle = (savable.length >= 2 ? (titleTouched && title.trim() ? title.trim() : derivedTitle) : single ? single.name.trim() : '').slice(0, 300);

  // The food the user saved before under the name typed in a lone line: its figures can come back without the AI.
  const lone = rows.length === 1 ? rows[0] : null;
  const loneName = lone?.name ?? '';
  const saved = useMemo(() => (loneName.trim() ? findRememberedFood(foods, loneName) : undefined), [foods, loneName]);

  function applySaved() {
    if (!saved || !lone) return;
    const p = portionOf(saved);
    setRows([rowFromFigures(lone.key, { name: lone.name.trim() || saved.name, calories: p.calories, proteinG: p.proteinG, purineMg: p.purineMg, saltG: p.saltG, sugarG: p.sugarG }, true)]);
    setNote({ kind: 'saved', reasoning: f('food.savedUsed', { name: saved.name }), accuracy: null });
  }

  // What the user's database already answers in the sentence being typed (no photos): said before "Phân tích" is pressed.
  const dbPreview = useMemo(() => {
    const sentence = text.trim();
    if (!sentence || photos.length > 0) return null;
    const local = resolveFromDb(sentence, foods);
    if (!local || local.rows.length === 0) return null;
    return { names: local.rows.map((r) => r.name).join(', '), all: local.unknown.length === 0 };
  }, [text, photos.length, foods]);

  const draft: ExtraFoodItem = useMemo(
    () => ({
      id: 'draft',
      name: mealTitle,
      calories: totals.calories,
      proteinG: totals.proteinG,
      mealTime,
      loggedAtISO: loggedAtFor(input.dateKey, mealTime, now, clock),
      purineMg: totals.purineMg || undefined,
      saltG: totals.saltG || undefined,
      sugarG: totals.sugarG || undefined,
      junk: junk || undefined,
    }),
    [mealTitle, totals, mealTime, junk, now, input.dateKey, clock]
  );
  // How the day's missions would change if this meal were saved right now.
  const preview = useMemo(() => previewDayChange(input, logWithExtra(input.log, input.dateKey, draft)), [input, draft]);

  /** The photos of the meal, kept on the device (the picker hands back temporary files the OS may clear). */
  async function persistPhotos(): Promise<{ main?: string; more: string[] }> {
    if (!photos[0]) return { more: [] };
    const stamp = Date.now();
    const main = await persistPickedPhoto(photos[0], `extra-${stamp}`);
    const more: string[] = [];
    try {
      for (const [i, uri] of photos.slice(1, MAX_MEAL_PHOTOS).entries()) more.push(await persistPickedPhoto(uri, `extra-${stamp}-${i + 1}`));
    } catch (e) {
      for (const uri of [main, ...more]) deletePersistedPhoto(uri).catch(() => {});
      throw e;
    }
    return { main, more };
  }

  async function save() {
    if (saving) return;
    setDbOutcome(null);
    if (savable.length === 0) {
      // Only a name or a description typed (no figures): the food database may know it, if it is one food.
      const nameOnly = rows.length === 1 && rowHasNoFigures(rows[0]) ? rows[0].name.trim() : '';
      const asked = nameOnly || (rows.every(rowIsEmpty) ? text.trim() : '');
      if (asked) {
        if (!timeInvalid) fillFromDb(asked);
        return;
      }
      setHint(rows.every(rowIsEmpty) && photos.length === 0 ? 'text' : 'value');
      return;
    }
    if (timeInvalid) {
      setSheet('slot');
      return;
    }
    setSaving(true);
    setSaveFailed(false);
    let kept: { main?: string; more: string[] } = { more: [] };
    try {
      if (photos[0]) kept = await persistPhotos(); // without photos the save runs at once
      for (const r of savable) if (!r.fromDb && r.aiCalories > 0) recordEstimate(r.aiCalories, num(r.calories));
      addExtra(input.dateKey, mealTitle, totals.calories, totals.proteinG, mealTime, {
        purineMg: totals.purineMg || undefined,
        saltG: totals.saltG || undefined,
        sugarG: totals.sugarG || undefined,
        junk: junk || undefined,
        photoUri: kept.main,
        morePhotoUris: kept.more,
        // Nothing new to remember only when the entry is exactly one food taken unchanged from the user's own database.
        fromFoodDb: !!single && single.fromDb && single.baseline === `${single.name}|${single.calories}`,
        clock,
        parts: savable.length >= 2 ? partsOf : undefined,
      });
      goBack();
    } catch {
      // Nothing was added: the form stays exactly as typed so the user can retry, or drop the photos.
      for (const uri of [kept.main, ...kept.more]) if (uri) deletePersistedPhoto(uri).catch(() => {});
      if (alive.current) {
        setSaveFailed(true);
        setSaving(false);
      }
    }
  }

  /** A name-only entry that is ONE food the database knows (an amount typed with it is scaled): its figures are filled into the
   *  list and nothing is saved yet; the user checks them and saves. Several foods or an unknown name are never guessed. */
  function fillFromDb(asked: string) {
    const found = lookupDescribedFood(asked, foods);
    setStep('review');
    if (found.kind !== 'match') {
      setDbOutcome({ kind: found.kind, text: asked });
      return;
    }
    const item = found.item;
    setRows([
      rowFromFigures(
        newKey('db'),
        { name: item.name, calories: item.calories, proteinG: item.proteinG, purineMg: item.purineMg, saltG: item.saltG, sugarG: item.sugarG },
        true
      ),
    ]);
    setHint(null);
    setDbOutcome({ kind: 'filled', name: item.name, food: baseName(item.food.name), kcal: item.calories });
  }

  /** Logs the chosen main meal as not eaten (0 kcal, the diary's "Không ăn" convention) and closes. */
  function skipMeal() {
    if (!mealTime || !SKIPPABLE.includes(mealTime) || saving) return;
    addExtra(input.dateKey, SKIPPED_MEAL_NAME, 0, 0, mealTime, { fromFoodDb: true, clock });
    AccessibilityInfo.announceForAccessibility(g('food.skipped', { meal: t(`extraMealTime.${mealTime}` as StringKey) }));
    setSheet(null);
    goBack();
  }

  const exceeded = {
    purine: preview.newlyMissed.includes('purine'),
    salt: preview.newlyMissed.includes('salt'),
    sugar: preview.newlyMissed.includes('sugar'),
  };
  const anyExceeded = exceeded.purine || exceeded.salt || exceeded.sugar;

  // When the meal breaks a limit, offer swaps for a lone food: how much room each limit has left before it, and the food as it stands.
  const limits = { purine: input.limits?.purineMg ?? LIMITS.purineMg, salt: input.limits?.saltG ?? LIMITS.saltG, sugar: input.limits?.sugarG ?? LIMITS.sugarG };
  const swapContext = useMemo<SwapContext>(() => {
    const before = preview.before.nutrients;
    return {
      exceeded: (['purine', 'salt', 'sugar'] as const).filter((n) => preview.newlyMissed.includes(n)),
      headroom: { purine: limits.purine - before.purineMg, salt: limits.salt - before.saltG, sugar: limits.sugar - before.sugarG },
    };
  }, [preview, limits.purine, limits.salt, limits.sugar]); // eslint-disable-line react-hooks/exhaustive-deps
  const swapItem = useMemo<SwapItem | null>(() => {
    if (!single) return null;
    const p = rowPart(single);
    return { name: p.name, calories: p.calories, proteinG: p.proteinG, purineMg: p.purineMg ?? 0, saltG: p.saltG ?? 0, sugarG: p.sugarG ?? 0 };
  }, [single]);

  /** The user picked a swap: it replaces the lone food (nothing is saved). */
  function applySwap(option: SwapOption) {
    if (!single) return;
    const row = rowFromFigures(newKey('swap'), option, option.source === 'db');
    setRows((all) => all.map((r) => (r.key === single.key ? row : r)));
    setNote(null);
    setHint(null);
  }

  /** Takes a food out of the list; the toast's Hoàn tác puts it back where it was. */
  function removeRow(key: string) {
    const at = rows.findIndex((r) => r.key === key);
    if (at < 0) return;
    const row = rows[at];
    setRows((all) => all.filter((r) => r.key !== key));
    setEditingKey(null);
    const name = row.name.trim();
    showToast({
      text: name ? g('meal.removed', { name }) : g('meal.removedNoName'),
      undo: () => {
        if (!alive.current) return;
        setRows((all) => (all.some((r) => r.key === key) ? all : [...all.slice(0, at), row, ...all.slice(at)]));
      },
    });
  }

  /** − / + on a line: the amount moves by half a portion (or 10 g / ml) and the figures follow in proportion. */
  function stepRow(row: MealRow, dir: -1 | 1) {
    const q = parseFloat(rowAmount(row).qty.replace(',', '.')) || 1;
    const s = portionStep(q);
    const next = Math.round((q + dir * s) * 10) / 10;
    if (next < s) return;
    patchRows(row.key, scaleRow(row, formatQty(next)));
  }

  function addRow() {
    const r = emptyRow(newKey('m'));
    setRows((all) => [...all, r]);
    setEditingKey(r.key);
  }

  const editing = useMemo(() => rows.find((r) => r.key === editingKey) ?? null, [rows, editingKey]);
  function closeEditor() {
    // A new line closed without anything typed in it is not kept.
    if (editing && rowIsEmpty(editing)) setRows((all) => all.filter((r) => r.key !== editing.key));
    setEditingKey(null);
  }

  const hintText = hint === 'text' ? g('food.empty') : hint === 'foods' ? g('text.noFoods') : hint === 'value' ? g('food.errorValue') : null;
  const busy = saving || ai.analyzing || photoAi.analyzing || lab.reading;
  const analyzing = ai.analyzing || photoAi.analyzing || lab.reading;
  const runError = lastRun === 'label' ? lab.error : lastRun === 'photo' ? photoAi.error : lastRun === 'text' ? ai.error : null;
  const mealLabel = mealTime ? t(`extraMealTime.${mealTime}` as StringKey) : g('meal.slotNone');
  const shownClock = clock ? clockText(clock) : mealTime ? clockText(MEAL_CLOCK[mealTime]) : clockText([now.getHours(), now.getMinutes()]);
  const showDetails = detailsOpen ?? (anyExceeded || !!lab.label);
  const aiFound = note?.kind === 'ai' ? rows.filter((r) => r.key.startsWith('ai')).length : 0;

  const dateChip = (
    <DateChip
      size="small"
      value={input.dateKey}
      now={now}
      onChange={(key) => {
        if (key !== input.dateKey) router.setParams({ date: key });
      }}
    />
  );

  const errorCard = runError ? (
    <View style={styles.errorCard} accessibilityLiveRegion="polite">
      <HudText size={13} weight="medium" color={quest.hpText} accessibilityRole="alert">
        {aiErrorText(runError.kind, runError.message)}
      </HudText>
      <View style={styles.pair}>
        <View style={styles.flex}>
          <QuestButton variant="ghost" title={g('meal.retry')} onPress={() => void analyze()} disabled={busy} />
        </View>
        <View style={styles.flex}>
          <QuestButton title={g('meal.manualShort')} onPress={manual} disabled={busy} />
        </View>
      </View>
    </View>
  ) : null;

  // ───────────────────────────── Step 1: Nhập ─────────────────────────────
  if (step === 'input') {
    const analyzingText = photoAi.analyzing || (ai.analyzing && photos.length > 0) ? g('meal.analyzingPhotos', { n: photos.length }) : lab.reading ? g('label.reading') : g('text.analyzing');
    return (
      <ScreenTemplate
        title={g('meal.title')}
        eyebrow={g('meal.step1')}
        onBack={goBack}
        backLabel={g('common.back')}
        right={dateChip}
        primary={
          aiEnabled
            ? { label: g('meal.analyze'), accessibilityLabel: analyzing ? g('text.analyzing') : g('text.analyze'), onPress: () => void analyze(), loading: analyzing, disabled: saving }
            : { label: g('meal.manualShort'), onPress: manual }
        }
      >
        <View style={styles.form}>
          <View style={styles.hintRow}>
            <HudText size={13} weight="medium" color={quest.textSecondary} style={styles.flex}>
              {g('meal.inputHint')}
            </HudText>
            <Pressable accessibilityRole="button" accessibilityLabel={g('meal.infoA11y')} onPress={() => setSheet('info')} hitSlop={6} style={styles.info}>
              <HudText size={15} color={quest.manaText}>
                ⓘ
              </HudText>
            </Pressable>
          </View>

          <MealTextPhotos kind="meal" max={MAX_MEAL_PHOTOS} photos={photos} onChange={changePhotos} disabled={busy} />
          {photos.length > 0 && aiEnabled && (
            <View style={styles.chips} accessibilityRole="radiogroup">
              <QuestChip label={g('meal.kindFood')} selected={kind === 'food'} onPress={() => setKind('food')} tone="mana" />
              <QuestChip label={g('meal.kindLabel')} selected={kind === 'label'} onPress={() => setKind('label')} tone="mana" />
            </View>
          )}

          <QuestField
            label={g('text.label')}
            value={text}
            onChangeText={(v) => {
              setText(v);
              setHint(null);
            }}
            placeholder={g('text.placeholder')}
            multiline
            maxLength={400}
          />
          <View style={styles.pair}>
            {speech.available && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={speech.listening ? g('meal.listening') : g('meal.speak')}
                accessibilityState={{ selected: speech.listening }}
                onPress={() => (speech.listening ? speech.stop() : speech.start(text))}
                style={({ pressed }) => [styles.ghost, speech.listening && styles.ghostOn, pressed && styles.pressed]}
              >
                <QuestIcon name="mic" size={18} color={speech.listening ? quest.onGold : quest.gold} strokeWidth={2.2} />
                <HudText size={14} color={speech.listening ? quest.onGold : quest.text} numberOfLines={1}>
                  {speech.listening ? g('meal.listening') : g('meal.speak')}
                </HudText>
              </Pressable>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={g('quick.savedFoods')}
              onPress={() => setSheet('saved')}
              style={({ pressed }) => [styles.ghost, pressed && styles.pressed]}
            >
              <QuestIcon name="search" size={18} color={quest.gold} strokeWidth={2.2} />
              <HudText size={14}>{g('quick.savedFoods')}</HudText>
            </Pressable>
          </View>

          {dbPreview && aiEnabled && (
            <View style={styles.note} accessibilityLiveRegion="polite">
              <HudText size={12} weight="medium" color={quest.manaText}>
                {g(dbPreview.all ? 'meal.dbAllKnown' : 'meal.dbKnown', { names: dbPreview.names })}
              </HudText>
            </View>
          )}

          {!aiEnabled && (
            <View style={styles.offCard}>
              <QuestIcon name="lock" size={16} color={quest.textSecondary} />
              <HudText size={12} weight="medium" color={quest.textSecondary} style={styles.flex}>
                {g('meal.aiOff')}
              </HudText>
            </View>
          )}

          {analyzing && (
            <HudText size={13} color={quest.manaText} accessibilityLiveRegion="polite">
              {analyzingText}
            </HudText>
          )}
          {errorCard}
          {lab.unreadable && !lab.error && lastRun === 'label' && (
            <HudText size={12} weight="medium" color={quest.goldLight} accessibilityRole="alert" accessibilityLiveRegion="polite">
              {g('label.unreadable')}
            </HudText>
          )}
          {hintText && (
            <HudText size={12} weight="medium" color={quest.goldLight} accessibilityLiveRegion="polite">
              {hintText}
            </HudText>
          )}

          {aiEnabled && <QuestButton variant="ghost" icon="edit" title={g('meal.manual')} onPress={manual} disabled={busy} />}
        </View>

        <SavedFoodsSheet
          visible={sheet === 'saved'}
          onClose={() => setSheet(null)}
          onUse={applyLookup}
          onOpenDb={() => {
            setSheet(null);
            router.push('/food-db');
          }}
          onOpenCookbook={() => {
            setSheet(null);
            router.push('/cookbook');
          }}
        />
        <BottomSheet visible={sheet === 'info'} onClose={() => setSheet(null)} title={g('meal.infoTitle')}>
          <HudText size={14} weight="medium" color={quest.textSecondary} style={styles.infoBody}>
            {g('meal.infoBody', { max: MAX_MEAL_PHOTOS })}
          </HudText>
        </BottomSheet>
      </ScreenTemplate>
    );
  }

  // ───────────────────────────── Step 2: Kiểm tra món ─────────────────────────────
  const saveLabel = totals.calories > 0 || savable.length > 0
    ? day.isToday
      ? g('meal.save', { kcal: totals.calories })
      : g('meal.saveOn', { day: day.label, kcal: totals.calories })
    : g('meal.saveEmpty');
  const badges = (
    <View style={styles.badges}>
      {aiFound > 0 && <Badge text={g('meal.found', { n: aiFound })} tone="mana" />}
      {note?.kind === 'saved' && <Badge text={g('meal.fromDb')} tone="mana" />}
      {note?.kind === 'ai' && note.accuracy !== null && <Badge text={g('meal.accuracyBadge', { pct: note.accuracy })} tone="xp" />}
    </View>
  );

  return (
    <ScreenTemplate
      title={g('meal.reviewTitle')}
      eyebrow={g('meal.step2')}
      onBack={() => setStep('input')}
      backLabel={g('common.back')}
      right={dateChip}
      primary={{ label: saveLabel, onPress: () => void save(), loading: saving }}
    >
      <View style={styles.form}>
        {photos[0] ? (
          <View style={styles.hero}>
            <Image source={{ uri: photos[0] }} style={styles.heroImg} resizeMode="cover" accessibilityLabel={g('meal.photos.alt', { n: 1 })} />
            <View style={styles.heroTop}>
              <AddPhotoChip n={photos.length} onPress={() => void addPhotos()} disabled={busy} />
            </View>
            <View style={styles.heroBottom}>{badges}</View>
          </View>
        ) : (
          <View style={styles.badgeRow}>
            <View style={styles.flex}>{badges}</View>
            <AddPhotoChip n={0} onPress={() => void addPhotos()} disabled={busy} />
          </View>
        )}
        {photos.length > 1 && (
          <View style={styles.thumbs}>
            {photos.slice(1).map((uri, i) => (
              <Image key={`${i}-${uri}`} source={{ uri }} style={styles.thumb} accessibilityLabel={g('meal.photos.alt', { n: i + 2 })} />
            ))}
          </View>
        )}

        <View style={styles.chips}>
          <Pill icon="bowl" text={mealLabel} on={!!mealTime} label={g('meal.slotA11y', { meal: mealTime ? mealLabel : g('meal.slotUnset') })} onPress={() => setSheet('slot')} />
          <Pill icon="clock" text={shownClock} on={!!clock} danger={timeInvalid} label={g('meal.timeA11y', { time: shownClock })} onPress={() => setSheet('slot')} />
          <Pill icon="flame" text={g('meal.snack')} on={junk} label={g('food.junk')} selected={junk} onPress={() => setJunk((v) => !v)} />
        </View>

        <View>
          {rows.map((r, i) => {
            const amount = rowAmount(r);
            const figures = !rowHasNoFigures(r);
            const name = r.name.trim();
            return (
              <View key={r.key} style={styles.item}>
                <DishThumb name={name || '?'} photoUri={rows.length === 1 ? photos[0] : undefined} size={52} />
                <Pressable accessibilityRole="button" accessibilityLabel={`${g('meal.editA11y', { n: i + 1 })}: ${name}`} onPress={() => setEditingKey(r.key)} style={styles.itemText}>
                  <HudText size={15} numberOfLines={2}>
                    {name || g('meal.item.newTitle')}
                  </HudText>
                  <HudText size={12} weight="medium" color={figures ? quest.textSecondary : quest.goldLight} numberOfLines={1}>
                    {figures ? g('meal.itemLine', { kcal: Math.round(num(r.calories)), p: Math.round(num(r.protein) * 10) / 10 }) : g('meal.itemNoFigures')}
                  </HudText>
                  {r.fromDb || r.accuracy !== null ? (
                    <HudText size={11} weight="medium" color={r.fromDb ? quest.manaText : (r.accuracy ?? 0) >= 70 ? quest.xp : (r.accuracy ?? 0) >= 50 ? quest.goldLight : quest.hpText} numberOfLines={1}>
                      {r.fromDb ? g('text.fromDb') : g('text.rowAccuracy', { pct: r.accuracy ?? 0 })}
                    </HudText>
                  ) : null}
                </Pressable>
                {figures && name ? (
                  <View style={styles.portion}>
                    <Pressable accessibilityRole="button" accessibilityLabel={g('meal.lessA11y', { n: i + 1 })} onPress={() => stepRow(r, -1)} hitSlop={4} style={styles.portionBtn}>
                      <QuestIcon name="minus" size={16} color={quest.text} strokeWidth={2.6} />
                    </Pressable>
                    <HudText size={13} numberOfLines={1} style={styles.portionText} accessibilityLabel={`${g('food.qty')} ${amount.qty} ${amount.unit}`}>
                      {amount.unit ? `${amount.qty} ${amount.unit}` : `×${amount.qty}`}
                    </HudText>
                    <Pressable accessibilityRole="button" accessibilityLabel={g('meal.moreA11y', { n: i + 1 })} onPress={() => stepRow(r, 1)} hitSlop={4} style={styles.portionBtn}>
                      <QuestIcon name="plus" size={16} color={quest.text} strokeWidth={2.6} />
                    </Pressable>
                  </View>
                ) : null}
                <Pressable accessibilityRole="button" accessibilityLabel={g('meal.editA11y', { n: i + 1 })} onPress={() => setEditingKey(r.key)} style={styles.editBtn}>
                  <QuestIcon name="edit" size={18} color={quest.gold} strokeWidth={2.2} />
                </Pressable>
              </View>
            );
          })}
        </View>

        <View style={styles.linkRow}>
          <Pressable accessibilityRole="button" accessibilityLabel={g('meal.addItem')} onPress={addRow} disabled={busy} style={styles.link}>
            <QuestIcon name="plus" size={18} color={quest.gold} strokeWidth={2.4} />
            <HudText size={14} color={quest.gold}>
              {g('meal.addItem')}
            </HudText>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={g('quick.savedFoods')} onPress={() => setSheet('saved')} style={styles.link}>
            <QuestIcon name="search" size={16} color={quest.manaText} strokeWidth={2.2} />
            <HudText size={13} color={quest.manaText}>
              {g('quick.savedFoods')}
            </HudText>
          </Pressable>
        </View>

        {saved && lone && String(portionOf(saved).calories) !== lone.calories.trim() && (
          <View style={styles.note} accessibilityLiveRegion="polite">
            <HudText size={12} color={quest.manaText}>
              {f('food.savedTitle')}
            </HudText>
            <HudText size={12} weight="medium" color={quest.textSecondary}>
              {f('food.savedHint', { kcal: portionOf(saved).calories, p: portionOf(saved).proteinG })}
            </HudText>
            <QuestButton title={f('food.savedUse')} variant="mana" onPress={applySaved} />
          </View>
        )}

        {hintText && (
          <HudText size={12} weight="medium" color={quest.goldLight} accessibilityLiveRegion="polite">
            {hintText}
          </HudText>
        )}
        {dbOutcome?.kind === 'filled' && (
          <View style={styles.note} accessibilityLiveRegion="polite">
            <HudText size={12} color={quest.manaText}>
              {g('food.db.filled', { name: dbOutcome.name })}
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
            {aiEnabled && <QuestButton variant="ghost" icon="chart" title={g('food.db.toText')} onPress={() => void analyze(dbOutcome.text)} loading={ai.analyzing} />}
          </View>
        )}
        {errorCard}

        {savable.length > 0 && <ImpactNote newlyDone={preview.newlyDone} newlyMissed={preview.newlyMissed} />}

        <DraftFeedback
          name={mealTitle || joinTitle(rows.map((r) => r.name.trim()).filter(Boolean))}
          calories={totals.calories}
          proteinG={totals.proteinG}
          purineMg={totals.purineMg}
          saltG={totals.saltG}
          sugarG={totals.sugarG}
          mealTime={mealTime}
          dateKey={input.dateKey}
        />

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showDetails }}
          accessibilityLabel={`${g('meal.details')}: ${g('meal.detailsHint')}`}
          onPress={() => setDetailsOpen(!showDetails)}
          style={styles.detailsHead}
        >
          <HudText size={16} style={styles.flex}>
            {g('meal.details')}
          </HudText>
          <HudText size={13} weight="medium" color={quest.textSecondary}>
            {g('meal.detailsHint')} {showDetails ? '▴' : '▸'}
          </HudText>
        </Pressable>

        {showDetails && (
          <View style={styles.details}>
            {savable.length >= 2 && (
              <View style={styles.group}>
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
              </View>
            )}

            <NutrientTiles nutrients={{ purineMg: totals.purineMg, saltG: totals.saltG, sugarG: totals.sugarG }} exceeded={exceeded} />

            {lab.label && !lab.error && (
              <View style={styles.note} accessibilityLiveRegion="polite">
                <HudText size={12} color={quest.manaText}>
                  {g('label.title')}
                  {lab.label.productName ? ` · ${lab.label.productName}` : ''}
                  {accuracyOf(lab.label.accuracyPercent) !== null ? ` · ${g('ai.accuracy', { pct: accuracyOf(lab.label.accuracyPercent)! })}` : ''}
                </HudText>
                {modes.servings && modes.amount && (
                  <View style={styles.chips}>
                    <QuestChip label={g('label.modeServings')} selected={eatenMode === 'servings'} onPress={() => switchEatenMode('servings')} />
                    <QuestChip label={g('label.modeAmount')} selected={eatenMode === 'amount'} onPress={() => switchEatenMode('amount')} />
                  </View>
                )}
                <QuestField label={eatenMode === 'servings' ? g('label.servings') : g('label.amount')} keyboardType="decimal-pad" value={eatenText} onChangeText={changeEaten} />
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

            {swapItem && swapContext.exceeded.length > 0 && swapItem.calories > 0 && (
              <SwapSuggestions item={swapItem} context={swapContext} limits={limits} mealTime={mealTime} disabled={saving} onUse={applySwap} />
            )}

            {(note || savable.length > 0) && (
              <View style={styles.sourceBox}>
                <View style={styles.sourceHead}>
                  <HudText size={13} style={styles.flex}>
                    {g('meal.source')}
                  </HudText>
                  <HudText size={12} weight="medium" color={quest.textSecondary} numberOfLines={2} style={styles.sourceRight}>
                    {note?.kind === 'saved'
                      ? g('text.fromDb')
                      : note?.kind === 'ai'
                        ? note.accuracy !== null
                          ? g('ai.accuracy', { pct: note.accuracy })
                          : g('ai.suggested')
                        : savable.map(sourceText).filter((v, i, a) => a.indexOf(v) === i).join(' · ')}
                  </HudText>
                </View>
                {note?.reasoning ? (
                  <HudText size={12} weight="medium" color={quest.textSecondary}>
                    {note.reasoning}
                  </HudText>
                ) : null}
                {note?.kind === 'ai' && calibrationText ? (
                  <HudText size={12} weight="medium" color={quest.textSecondary}>
                    {calibrationText}
                  </HudText>
                ) : null}
              </View>
            )}

            {advice && !runError && <AiAdviceCard advice={advice} />}
          </View>
        )}

        {saveFailed && (
          <HudText size={12} weight="medium" color={quest.hpText} accessibilityRole="alert" accessibilityLiveRegion="polite">
            {g('food.photo.saveFailed')}
          </HudText>
        )}
      </View>

      <MealItemSheet
        row={editing}
        photoUri={rows.length === 1 ? photos[0] : undefined}
        onClose={closeEditor}
        onSave={(next) => {
          if (editing) patchRows(editing.key, next);
          setEditingKey(null);
          setHint(null);
          setDbOutcome(null);
        }}
        onRemove={() => editing && removeRow(editing.key)}
      />

      <BottomSheet
        visible={sheet === 'slot'}
        onClose={() => setSheet(null)}
        title={g('meal.slotSheet.title')}
        footer={<QuestButton title={g('meal.slotSheet.done')} onPress={() => setSheet(null)} disabled={timeInvalid} />}
      >
        <View style={styles.form}>
          <View style={styles.chips}>
            {MEAL_TIMES.map((value) => (
              <QuestChip key={value} label={t(`extraMealTime.${value}` as StringKey)} selected={mealTime === value} onPress={() => setMealTime(mealTime === value ? null : value)} />
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
          {mealTime && SKIPPABLE.includes(mealTime) && (
            <QuestButton variant="ghost" icon="x" title={g('food.skip', { meal: t(`extraMealTime.${mealTime}` as StringKey) })} onPress={skipMeal} disabled={busy} />
          )}
        </View>
      </BottomSheet>

      <SavedFoodsSheet
        visible={sheet === 'saved'}
        onClose={() => setSheet(null)}
        onUse={applyLookup}
        onOpenDb={() => {
          setSheet(null);
          router.push('/food-db');
        }}
        onOpenCookbook={() => {
          setSheet(null);
          router.push('/cookbook');
        }}
      />
    </ScreenTemplate>
  );
}

function Badge({ text, tone }: { text: string; tone: 'mana' | 'xp' }) {
  return (
    <View style={[styles.badge, tone === 'mana' ? styles.badgeMana : styles.badgeXp]}>
      <HudText size={12} color={tone === 'mana' ? quest.manaText : quest.xp} numberOfLines={1}>
        {text}
      </HudText>
    </View>
  );
}

function AddPhotoChip({ n, onPress, disabled }: { n: number; onPress: () => void; disabled?: boolean }) {
  const g = useGameText();
  const full = n >= MAX_MEAL_PHOTOS;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={g('meal.addPhotoA11y', { n, max: MAX_MEAL_PHOTOS })}
      accessibilityState={{ disabled: disabled || full }}
      disabled={disabled || full}
      onPress={onPress}
      style={({ pressed }) => [styles.photoChip, (disabled || full) && styles.off, pressed && styles.pressed]}
    >
      <QuestIcon name="camera" size={16} color={quest.text} strokeWidth={2.2} />
      <HudText size={13}>{g('meal.addPhoto', { n, max: MAX_MEAL_PHOTOS })}</HudText>
    </Pressable>
  );
}

interface PillProps {
  icon: 'bowl' | 'clock' | 'flame';
  text: string;
  label: string;
  on: boolean;
  selected?: boolean;
  danger?: boolean;
  onPress: () => void;
}

/** A chip at the top of the check step (Bữa / Giờ / Ăn vặt): gold when set. */
function Pill({ icon, text, label, on, selected, danger, onPress }: PillProps) {
  const color = on ? quest.onGold : danger ? quest.hpText : quest.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={selected === undefined ? undefined : { selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.pill, on && styles.pillOn, danger && styles.pillDanger, pressed && styles.pressed]}
    >
      <QuestIcon name={icon} size={16} color={color} strokeWidth={2.2} />
      <HudText size={14} color={color} numberOfLines={1}>
        {text}
      </HudText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  form: { gap: 12 },
  flex: { flex: 1, minWidth: 0 },
  group: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pair: { flexDirection: 'row', gap: 10 },
  pressed: { opacity: 0.85 },
  off: { opacity: 0.5 },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  info: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  infoBody: { lineHeight: 21, paddingBottom: 8 },
  ghost: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 10,
    borderRadius: questRadius.row,
    borderWidth: 1.5,
    borderColor: quest.border,
    backgroundColor: quest.panel,
  },
  ghostOn: { backgroundColor: quest.gold, borderColor: quest.gold },
  offCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  errorCard: { gap: 10, padding: 12, borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.bossBorder, backgroundColor: quest.bossPanel },
  note: { gap: 6, padding: 12, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.manaBorder, backgroundColor: quest.manaPanel },
  hero: { height: 190, borderRadius: questRadius.panel, overflow: 'hidden', backgroundColor: quest.raised },
  heroImg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  heroTop: { position: 'absolute', top: 10, right: 10 },
  heroBottom: { position: 'absolute', left: 10, right: 10, bottom: 10 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  badgeMana: { backgroundColor: quest.manaPanel, borderColor: quest.manaBorder },
  badgeXp: { backgroundColor: quest.panel, borderColor: quest.xp },
  photoChip: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: quest.border,
    backgroundColor: quest.panel,
  },
  thumbs: { flexDirection: 'row', gap: 8 },
  thumb: { width: 56, height: 56, borderRadius: questRadius.row, backgroundColor: quest.raised },
  pill: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: quest.border,
    backgroundColor: quest.panel,
  },
  pillOn: { backgroundColor: quest.gold, borderColor: quest.gold },
  pillDanger: { borderColor: quest.hp },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: quest.border },
  itemText: { flex: 1, minWidth: 0, minHeight: 44, justifyContent: 'center', gap: 2 },
  portion: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: quest.border, borderRadius: questRadius.row, height: 44 },
  portionBtn: { width: 34, height: 44, alignItems: 'center', justifyContent: 'center' },
  portionText: { minWidth: 46, maxWidth: 70, textAlign: 'center' },
  editBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  linkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  link: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 },
  detailsHead: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  details: { gap: 12, padding: 12, borderRadius: questRadius.panel, borderWidth: 1.5, borderStyle: 'dashed', borderColor: quest.border, backgroundColor: quest.panel },
  sourceBox: { gap: 6 },
  sourceHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sourceRight: { flexShrink: 1, textAlign: 'right' },
});
