import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cleanAdvice } from '../src/ai/adviceText';
import { accuracyOf } from '../src/ai/accuracy';
import { defaultEaten, labelToFigures, type Eaten, type NutritionLabel } from '../src/ai/nutritionLabel';
import { MEAL_TIMES, resolveFromDb, rowsFromResult, validMealTime } from '../src/ai/textMeal';
import { useLabelReading } from '../src/ai/useLabelReading';
import { useMealTextAnalysis } from '../src/ai/useMealTextAnalysis';
import { useAiErrorText, useCalibrationText } from '../src/ai/usePhotoAnalysis';
import { AiAdviceCard } from '../src/components/quest/AiAdviceCard';
import { HudText } from '../src/components/quest/HudText';
import { ImpactNote } from '../src/components/quest/ImpactNote';
import { LogDateBanner } from '../src/components/quest/LogDateBanner';
import { MealTextPhotos } from '../src/components/quest/MealTextPhotos';
import { NutrientTiles } from '../src/components/quest/NutrientTiles';
import { QuestButton } from '../src/components/quest/QuestButton';
import { QuestChip } from '../src/components/quest/QuestChip';
import { QuestField } from '../src/components/quest/QuestField';
import { QuestHeader } from '../src/components/quest/QuestHeader';
import { SwapSuggestions } from '../src/components/quest/SwapSuggestions';
import { DraftFeedback } from '../src/feedback/components/DraftFeedback';
import { baseName } from '../src/food/calc';
import { FoodLookup, type LookupResult } from '../src/food/components/FoodLookup';
import { lookupDescribedFood } from '../src/food/describeLookup';
import { joinTitle, sumParts } from '../src/food/mealParts';
import { emptyRow, num, rowAmount, rowFromFigures, rowHasNoFigures, rowIsEmpty, rowIsSavable, rowPart, scaleRow, type MealRow } from '../src/food/mealRows';
import { parsePrefill } from '../src/food/prefill';
import { findRememberedFood, portionOf } from '../src/food/remember';
import { useFoodText } from '../src/food/strings';
import type { SwapContext, SwapItem, SwapOption } from '../src/food/swaps';
import { LIMITS } from '../src/game/constants';
import { logWithExtra, previewDayChange } from '../src/game/preview';
import { useGameText } from '../src/game/strings';
import { useNow, useTodayInput } from '../src/game/useGameState';
import { useLogDate } from '../src/game/useLogDate';
import type { StringKey } from '../src/i18n/strings';
import { useTranslation } from '../src/i18n/useTranslation';
import { SKIPPED_MEAL_NAME } from '../src/insights/missing';
import { useAiCalibrationStore } from '../src/store/useAiCalibrationStore';
import { useAllFoods } from '../src/store/useFoodDbStore';
import { useNutritionStore } from '../src/store/useNutritionStore';
import { quest, questRadius } from '../src/theme/quest';
import { screenMaxWidthStyle } from '../src/theme/responsive';
import { useLightStatusBar } from '../src/theme/useLightStatusBar';
import type { PhotoAdvice } from '../src/sync/cloudSync';
import type { ExtraFoodItem, ExtraMealTime } from '../src/types';
import { clockText, loggedAtFor, MEAL_CLOCK, parseClock, timeTextInvalid } from '../src/utils/mealClock';
import { MAX_MEAL_PHOTOS } from '../src/utils/photoOrder';
import { deletePersistedPhoto, persistPickedPhoto } from '../src/utils/photoStorage';

/** Main meals that can be logged as not eaten ("Không ăn"), so a skipped meal is not counted as one left out by mistake. */
const SKIPPABLE: ExtraMealTime[] = ['breakfast', 'lunch', 'dinner'];

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)');
}

/** Logs what was eaten, in one place: describe it in words, add up to 3 photos, or both, and the AI splits it into foods with
 *  figures (foods the user's database knows are taken from it without the AI); or look foods up in the database, read a nutrition
 *  label, or type a food by hand. Every food is a line whose amount can be changed (the figures follow in proportion) and whose
 *  figures can be typed over; nothing is saved until the add button. A main meal can also be logged as not eaten. */
export default function AddFoodScreen() {
  const g = useGameText();
  const f = useFoodText();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  useLightStatusBar();
  const now = useNow();
  const day = useLogDate(now);
  const input = useTodayInput(now, day.dateKey);
  const addExtra = useNutritionStore((s) => s.addExtra);
  const foods = useAllFoods();
  const ai = useMealTextAnalysis();
  const aiErrorText = useAiErrorText();
  const calibrationText = useCalibrationText();
  const recordEstimate = useAiCalibrationStore((s) => s.record);

  // A food can arrive through the route (a meal idea from Camp) and fills the first line; `text` starts the description.
  const params = useLocalSearchParams();
  const pre = useRef(parsePrefill(params as Record<string, unknown>)).current;
  const textParam = typeof params.text === 'string' ? params.text : '';
  const nextKey = useRef(0);
  const newKey = (prefix: string) => `${prefix}${nextKey.current++}`;

  const [text, setText] = useState(textParam);
  const [photos, setPhotos] = useState<string[]>([]);
  const [rows, setRows] = useState<MealRow[]>(() => [
    pre.name || pre.calories || pre.protein
      ? rowFromFigures('pre', { name: pre.name, calories: num(pre.calories), proteinG: num(pre.protein), purineMg: num(pre.purine), saltG: num(pre.salt), sugarG: num(pre.sugar) }, pre.fromDb)
      : emptyRow('m'),
  ]);
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
  /** The outcome of looking a name-only entry up in the food database: what was added from it, or why nothing was. */
  const [dbOutcome, setDbOutcome] = useState<
    { kind: 'added'; name: string; food: string; kcal: number } | { kind: 'none' | 'multiple'; text: string } | null
  >(null);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const patch = (key: string, change: Partial<MealRow>) => setRows((all) => all.map((r) => (r.key === key ? { ...r, ...change } : r)));
  /** A figure or the name typed by hand: the amount is read from the name again and later scaling starts from these figures. */
  const typed = (key: string, change: Partial<MealRow>) => {
    patch(key, { ...change, qty: undefined, base: undefined });
    setHint(null);
    setDbOutcome(null);
  };

  // Reading the nutrition facts panel (OCR, not an estimate) of the main photo: the printed figures are scaled to what was eaten, here in code.
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

  function changePhotos(next: string[]) {
    if (next[0] !== photos[0]) lab.reset(); // the label was read from the main photo
    setPhotos(next);
    setSaveFailed(false);
  }

  /** Lines a new AI analysis replaces: its own earlier ones and lines with no figures yet. */
  const replaceable = (r: MealRow) => r.key.startsWith('ai') || rowHasNoFigures(r);

  async function analyze(override?: string) {
    if (ai.analyzing || saving) return;
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
    // Foods the database already has (saved meals, or any food with its amount typed) are used as they are; only the rest goes to the AI.
    // With photos the whole description goes to the AI with them: the photos may show more than the words say.
    const local = photos.length === 0 ? resolveFromDb(sentence, foods) : null;
    const known = (local?.rows ?? []).map((r, i) => ({ ...r, key: `${run}-d${i}` }));
    if (local && local.unknown.length === 0) {
      setRows([...kept, ...known]);
      setNote({ kind: 'saved', reasoning: g('text.fromSaved'), accuracy: null });
      return;
    }
    const result = await ai.analyze(local ? local.unknown.join(', ') : sentence, photos);
    if (!result || !alive.current) return;
    const found = rowsFromResult(result, foods).map((r, i) => ({ ...r, key: `${run}-${i}` }));
    const next = [...kept, ...known, ...found];
    setRows(next.length > 0 ? next : [emptyRow(newKey('m'))]);
    if (known.length + found.length === 0) setHint('foods');
    const time = validMealTime(result.mealTime);
    if (time) setMealTime(time);
    setNote({ kind: 'ai', reasoning: known.length > 0 ? `${g('text.partlyFromDb', { n: known.length })} ${result.reasoning}` : result.reasoning, accuracy: accuracyOf(result.accuracyPercent) });
    setAdvice(cleanAdvice(result.advice));
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
    if (!photo || lab.reading || ai.analyzing || saving) return;
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

  /** A food found in the database (with its amount) becomes a line: it fills an empty line, else it is added. */
  function applyLookup(r: LookupResult) {
    const row = rowFromFigures(newKey('db'), r, true);
    setRows((all) => {
      const empty = all.findIndex(rowIsEmpty);
      return empty >= 0 ? all.map((x, i) => (i === empty ? row : x)) : [...all, row];
    });
    setHint(null);
    setDbOutcome(null);
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
        if (!timeInvalid) await saveFromDb(asked);
        return;
      }
      setHint(rows.every(rowIsEmpty) && photos.length === 0 ? 'text' : 'value');
      return;
    }
    if (timeInvalid) return;
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

  /** Adds a name-only entry with the food database's figures when the name is ONE food it knows (an amount typed with it is
   *  scaled), and stays on the form to show where the figures came from. Several foods or an unknown name are never guessed. */
  async function saveFromDb(asked: string) {
    const found = lookupDescribedFood(asked, foods);
    if (found.kind !== 'match') {
      setDbOutcome({ kind: found.kind, text: asked });
      return;
    }
    const item = found.item;
    setSaving(true);
    setSaveFailed(false);
    let kept: { main?: string; more: string[] } = { more: [] };
    try {
      if (photos[0]) kept = await persistPhotos();
      addExtra(input.dateKey, item.name, item.calories, item.proteinG, mealTime, {
        purineMg: item.purineMg || undefined,
        saltG: item.saltG || undefined,
        sugarG: item.sugarG || undefined,
        junk: junk || undefined,
        photoUri: kept.main,
        morePhotoUris: kept.more,
        fromFoodDb: true,
        clock,
      });
      if (!alive.current) return;
      // Saved: the form is cleared so a second tap cannot add it twice; the note says what was added and from where.
      setText('');
      setRows([emptyRow(newKey('m'))]);
      setPhotos([]);
      ai.reset();
      lab.reset();
      setNote(null);
      setAdvice(null);
      setDbOutcome({ kind: 'added', name: item.name, food: baseName(item.food.name), kcal: item.calories });
    } catch {
      for (const uri of [kept.main, ...kept.more]) if (uri) deletePersistedPhoto(uri).catch(() => {});
      if (alive.current) setSaveFailed(true);
    } finally {
      if (alive.current) setSaving(false);
    }
  }

  /** Logs the chosen main meal as not eaten (0 kcal, the diary's "Không ăn" convention) and closes. */
  function skipMeal() {
    if (!mealTime || !SKIPPABLE.includes(mealTime) || saving) return;
    addExtra(input.dateKey, SKIPPED_MEAL_NAME, 0, 0, mealTime, { fromFoodDb: true, clock });
    AccessibilityInfo.announceForAccessibility(g('food.skipped', { meal: t(`extraMealTime.${mealTime}` as StringKey) }));
    goBack();
  }

  const exceeded = {
    purine: preview.newlyMissed.includes('purine'),
    salt: preview.newlyMissed.includes('salt'),
    sugar: preview.newlyMissed.includes('sugar'),
  };

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

  const many = rows.length > 1;
  /** Field labels: plain for a lone food ("Tên món"), numbered once there are several ("Tên món 2"). */
  const label = (one: Parameters<typeof g>[0], several: Parameters<typeof g>[0], i: number) => (many ? g(several, { n: i + 1 }) : g(one));
  const hintText = hint === 'text' ? g('food.empty') : hint === 'foods' ? g('text.noFoods') : hint === 'value' ? g('food.errorValue') : null;
  const busy = saving || ai.analyzing || lab.reading;

  return (
    <View style={styles.screen}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, screenMaxWidthStyle, { paddingTop: insets.top + 16 }]}>
        <QuestHeader title={g('food.title')} onBack={goBack} backLabel={g('common.back')} />
        <HudText size={13} weight="medium" color={quest.textSecondary} style={styles.subtitle}>
          {g('food.subtitle')}
        </HudText>
        {!day.isToday && <LogDateBanner label={day.label} />}

        <View style={styles.form}>
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
          <MealTextPhotos kind="meal" max={MAX_MEAL_PHOTOS} photos={photos} onChange={changePhotos} disabled={busy} />
          <View style={styles.pair}>
            <View style={styles.pairCell}>
              <QuestButton
                variant="mana"
                icon="chart"
                title={g('ai.analyzeShort')}
                accessibilityLabel={ai.analyzing ? g('text.analyzing') : g('text.analyze')}
                onPress={() => {
                  void analyze();
                }}
                loading={ai.analyzing}
                disabled={saving || lab.reading}
              />
            </View>
            {photos.length > 0 && (
              <View style={styles.pairCell}>
                <QuestButton
                  variant="ghost"
                  icon="list"
                  title={g('label.readShort')}
                  accessibilityLabel={lab.reading ? g('label.reading') : g('label.read')}
                  onPress={() => {
                    void readLabel();
                  }}
                  loading={lab.reading}
                  disabled={saving || ai.analyzing}
                />
              </View>
            )}
          </View>
          <HudText size={11} weight="medium" color={quest.textSecondary}>
            {g('food.aiHint')}
          </HudText>

          {ai.error && (
            <HudText size={12} weight="medium" color={quest.hpText} accessibilityRole="alert" accessibilityLiveRegion="polite">
              {aiErrorText(ai.error.kind, ai.error.message)}
            </HudText>
          )}
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

          {note && !ai.error && (
            <View style={styles.note} accessibilityLiveRegion="polite">
              <HudText size={12} color={quest.manaText}>
                {note.kind === 'saved' ? g('text.fromDb') : note.accuracy !== null ? g('ai.accuracy', { pct: note.accuracy }) : g('ai.suggested')}
              </HudText>
              {note.reasoning ? (
                <HudText size={12} weight="medium" color={quest.textSecondary}>
                  {note.reasoning}
                </HudText>
              ) : null}
              {note.kind === 'ai' && calibrationText ? (
                <HudText size={12} weight="medium" color={quest.textSecondary}>
                  {calibrationText}
                </HudText>
              ) : null}
              <HudText size={12} weight="medium" color={quest.textSecondary}>
                {g('food.reviewQty')}
              </HudText>
            </View>
          )}

          {lab.label && !lab.error && (
            <View style={styles.note} accessibilityLiveRegion="polite">
              <HudText size={12} color={quest.manaText}>
                {g('label.title')}
                {lab.label.productName ? ` · ${lab.label.productName}` : ''}
                {accuracyOf(lab.label.accuracyPercent) !== null ? ` · ${g('ai.accuracy', { pct: accuracyOf(lab.label.accuracyPercent)! })}` : ''}
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

          <FoodLookup onApply={applyLookup} onOpenDb={() => router.push('/food-db')} />

          <HudText size={11} color={quest.textSecondary} style={styles.eyebrow}>
            {g('food.rows').toUpperCase()}
          </HudText>
          {rows.map((r, i) => {
            const amount = rowAmount(r);
            return (
              <View key={r.key} style={styles.row}>
                {(many || r.fromDb || r.accuracy !== null) && (
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
                    {many && <QuestChip label="✕" accessibilityLabel={g('text.remove', { n: i + 1 })} onPress={() => setRows((all) => all.filter((x) => x.key !== r.key))} />}
                  </View>
                )}
                <QuestField label={label('food.name', 'text.rowName', i)} value={r.name} onChangeText={(v) => typed(r.key, { name: v })} placeholder={i === 0 ? g('food.namePlaceholder') : undefined} />
                <View style={styles.pair}>
                  <View style={styles.qtyCell}>
                    <QuestField
                      label={label('food.qty', 'text.rowQty', i)}
                      keyboardType="decimal-pad"
                      value={amount.qty}
                      unit={amount.unit || undefined}
                      onChangeText={(v) => setRows((all) => all.map((x) => (x.key === r.key ? scaleRow(x, v) : x)))}
                      selectTextOnFocus
                    />
                  </View>
                  <View style={styles.pairCell}>
                    <QuestField label={label('food.calories', 'text.rowKcal', i)} keyboardType="decimal-pad" value={r.calories} onChangeText={(v) => typed(r.key, { calories: v })} />
                  </View>
                  <View style={styles.pairCell}>
                    <QuestField label={label('food.protein', 'text.rowProtein', i)} keyboardType="decimal-pad" value={r.protein} onChangeText={(v) => typed(r.key, { protein: v })} />
                  </View>
                </View>
                <View style={styles.pair}>
                  <View style={styles.pairCell}>
                    <QuestField label={label('food.purine', 'text.rowPurine', i)} keyboardType="decimal-pad" value={r.purine} onChangeText={(v) => typed(r.key, { purine: v })} />
                  </View>
                  <View style={styles.pairCell}>
                    <QuestField label={label('food.salt', 'text.rowSalt', i)} keyboardType="decimal-pad" value={r.salt} onChangeText={(v) => typed(r.key, { salt: v })} />
                  </View>
                  <View style={styles.pairCell}>
                    <QuestField label={label('food.sugar', 'text.rowSugar', i)} keyboardType="decimal-pad" value={r.sugar} onChangeText={(v) => typed(r.key, { sugar: v })} />
                  </View>
                </View>
              </View>
            );
          })}
          <HudText size={11} weight="medium" color={quest.textSecondary}>
            {g('food.qtyHint')}
          </HudText>
          <QuestButton variant="ghost" icon="plus" title={g('food.addRow')} onPress={() => setRows((all) => [...all, emptyRow(newKey('m'))])} disabled={busy} />

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
          {savable.length === 0 && !dbOutcome && (
            <HudText size={11} weight="medium" color={quest.textSecondary}>
              {g('food.db.hint')}
            </HudText>
          )}
          {dbOutcome?.kind === 'added' && (
            <View style={styles.note} accessibilityLiveRegion="polite">
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
              <QuestButton variant="ghost" icon="chart" title={g('food.db.toText')} onPress={() => void analyze(dbOutcome.text)} loading={ai.analyzing} />
            </View>
          )}

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

          <View style={styles.group}>
            <HudText size={12} weight="medium" color={quest.textSecondary}>
              {g('food.mealTime')}
            </HudText>
            <View style={styles.chips}>
              {MEAL_TIMES.map((value) => (
                <QuestChip key={value} label={t(`extraMealTime.${value}` as StringKey)} selected={mealTime === value} onPress={() => setMealTime(mealTime === value ? null : value)} />
              ))}
            </View>
            {mealTime && SKIPPABLE.includes(mealTime) && (
              <QuestButton variant="ghost" icon="x" title={g('food.skip', { meal: t(`extraMealTime.${mealTime}` as StringKey) })} onPress={skipMeal} disabled={busy} />
            )}
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

          <View style={styles.junkRow}>
            <View style={styles.junkText}>
              <HudText size={14}>{g('food.junk')}</HudText>
              <HudText size={12} weight="medium" color={quest.textSecondary}>
                {g('food.junkHint')}
              </HudText>
            </View>
            <Switch accessibilityLabel={g('food.junk')} value={junk} onValueChange={setJunk} trackColor={{ false: quest.raised2, true: quest.gold }} thumbColor={quest.text} />
          </View>

          {saveFailed && (
            <HudText size={12} weight="medium" color={quest.hpText} accessibilityRole="alert" accessibilityLiveRegion="polite">
              {g('food.photo.saveFailed')}
            </HudText>
          )}

          <View style={styles.group}>
            <HudText size={11} color={quest.textSecondary} style={styles.eyebrow}>
              {g('food.impact').toUpperCase()}
            </HudText>
            <NutrientTiles nutrients={{ purineMg: totals.purineMg, saltG: totals.saltG, sugarG: totals.sugarG }} exceeded={exceeded} />
            <ImpactNote newlyDone={preview.newlyDone} newlyMissed={preview.newlyMissed} />
            {swapItem && swapContext.exceeded.length > 0 && swapItem.calories > 0 && (
              <SwapSuggestions item={swapItem} context={swapContext} limits={limits} mealTime={mealTime} disabled={saving} onUse={applySwap} />
            )}
          </View>

          {advice && !ai.error && <AiAdviceCard advice={advice} />}
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
  qtyCell: { flex: 1.1, minWidth: 0 },
  eyebrow: { letterSpacing: 1.6, marginTop: 4 },
  row: { gap: 8, padding: 12, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.raised },
  rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
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
  note: { gap: 4, padding: 12, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.manaBorder, backgroundColor: quest.manaPanel },
  footer: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: quest.bg, borderTopWidth: 1.5, borderTopColor: quest.border, alignItems: 'center' },
});
