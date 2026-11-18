// The "chính xác ~XX%" tooltip: why an estimate is as accurate as it is, what is still missing, and how to photograph or describe the
// food so the next analysis scores higher. Pure (no React, no store) so it can be tested; the words are game-text keys, except the
// AI's own lines (`accuracyWhy` from analyze-proof-photo, parse-meal-text and read-nutrition-label), which come in Vietnamese as is.

import type { GameKey } from '../game/strings';

/** The AI's reasons for its accuracy % (all optional; older servers send none). */
export interface AccuracyWhy {
  up: string[];
  down: string[];
  missing: string[];
}

/** Where the figures came from. */
export type AccuracySource = 'db' | 'label' | 'photo' | 'text' | 'idea' | 'swap';

/** What is kept with a logged food (ExtraFoodItem.accuracy) so its detail sheet shows the same tooltip. Stored in the extra_items
 *  jsonb, so no schema change; every field but `source` is optional. */
export interface FoodAccuracy {
  /** 0-100, or null (food database: standard figures, no AI %). */
  pct: number | null;
  source: AccuracySource;
  why?: AccuracyWhy;
  /** Photos the AI saw. */
  photos?: number;
  /** A description was typed. */
  hasText?: boolean;
  /** The description gave weights or volumes (g, ml, kg…). */
  gramsGiven?: boolean;
  /** "Ghi chú cho AI" was filled in. */
  notesGiven?: boolean;
}

export type AccuracyLevel = 'high' | 'good' | 'fair' | 'low';

/** A line of the tooltip: a game-text key (with params) or the AI's own words. */
export type AccuracyLine = { key: GameKey; params?: Record<string, string | number> } | { text: string };

/** What a "Còn thiếu" line lets the user do at once: add it to the notes, change an amount. */
export type AccuracyAction = 'notes' | 'amount';

export interface MissingLine {
  line: AccuracyLine;
  action?: AccuracyAction;
  /** For `notes`: the words to add to "Ghi chú cho AI" (the AI's phrase). */
  prefill?: string;
}

export interface AccuracyExplanation {
  pct: number | null;
  level: AccuracyLevel | null;
  up: AccuracyLine[];
  down: AccuracyLine[];
  missing: MissingLine[];
  tips: GameKey[];
}

export const WHY_MAX_LINES = 3;
export const WHY_MAX_CHARS = 60;
export const MAX_TIPS = 4;

function cleanList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== 'string') continue;
    let s = v.replace(/\s+/g, ' ').trim();
    if (!s) continue;
    if (s.length > WHY_MAX_CHARS) s = `${s.slice(0, WHY_MAX_CHARS - 1).trimEnd()}…`;
    if (!out.includes(s)) out.push(s);
    if (out.length >= WHY_MAX_LINES) break;
  }
  return out;
}

/** The AI's `accuracyWhy`, cleaned: strings only, at most 3 per list and 60 characters each; undefined when it says nothing. */
export function cleanAccuracyWhy(raw: unknown): AccuracyWhy | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const why = { up: cleanList(r.up), down: cleanList(r.down), missing: cleanList(r.missing) };
  return why.up.length + why.down.length + why.missing.length > 0 ? why : undefined;
}

/** Cao ≥85, Khá 70–84, Trung bình 50–69, Thấp <50. */
export function accuracyLevel(pct: number | null | undefined): AccuracyLevel | null {
  if (typeof pct !== 'number' || !Number.isFinite(pct)) return null;
  return pct >= 85 ? 'high' : pct >= 70 ? 'good' : pct >= 50 ? 'fair' : 'low';
}

/** Whether a description gives a weight or volume ("150g cơm", "250 ml", "0,5 kg"). */
export function mentionsAmount(text: string | undefined | null): boolean {
  return !!text && /\d\s*(g|gr|gram|grams|kg|ml|l|lít|lit)\b/i.test(text);
}

const key = (k: GameKey, params?: Record<string, string | number>): AccuracyLine => (params ? { key: k, params } : { key: k });

/** The lines and tips of the tooltip for one figure. The AI's own reasons come first; what the app knows (where the figures came from,
 *  whether grams or notes were given, how many photos) fills in when the AI said nothing. Tips: at most MAX_TIPS, most useful first. */
export function explainAccuracy(acc: FoodAccuracy): AccuracyExplanation {
  const { source, why } = acc;
  const pct = typeof acc.pct === 'number' && Number.isFinite(acc.pct) ? Math.max(0, Math.min(100, Math.round(acc.pct))) : null;
  const photos = Math.max(0, acc.photos ?? 0);
  const hasText = !!acc.hasText;
  const grams = !!acc.gramsGiven;
  const notes = !!acc.notesGiven;
  const ai = source === 'photo' || source === 'text';

  // Vì sao: what helped.
  let up: AccuracyLine[] = (why?.up ?? []).map((text) => ({ text }));
  if (up.length === 0) {
    if (source === 'db') up.push(key('accWhy.up.db'));
    if (source === 'label') up.push(key('accWhy.up.label'));
    if (photos > 0 && (source === 'photo' || source === 'text')) up.push(key('accWhy.up.photo'));
    if (photos > 1 && ai) up.push(key('accWhy.up.morePhotos', { n: photos }));
    if (grams && ai) up.push(key('accWhy.up.grams'));
    if (notes && ai) up.push(key('accWhy.up.notes'));
  }
  up = up.slice(0, WHY_MAX_LINES);

  // Vì sao: what lowered it.
  let down: AccuracyLine[] = (why?.down ?? []).map((text) => ({ text }));
  if (down.length === 0) {
    if (source === 'label' && pct !== null && pct < 70) down.push(key('accWhy.down.labelBlur'));
    if (source === 'photo' && !hasText && !notes) down.push(key('accWhy.down.photoOnly'));
    if (source === 'text' && photos === 0) down.push(key('accWhy.down.noPhoto'));
    if (ai && hasText && !grams) down.push(key('accWhy.down.noGrams'));
    if (source === 'idea' || source === 'swap') down.push(key('accWhy.down.idea'));
  }
  down = down.slice(0, WHY_MAX_LINES);

  // Còn thiếu: what would raise it, with a one-tap action where there is one.
  // The AI's phrases go into "Ghi chú cho AI" (a label is read again from a better photo, not from notes).
  let missing: MissingLine[] = (why?.missing ?? []).map((text) => (ai ? { line: { text }, action: 'notes' as const, prefill: text } : { line: { text } }));
  if (missing.length === 0) {
    if (ai && !grams) missing.push({ line: key('accWhy.miss.grams'), action: 'amount' });
    if (ai && !notes) missing.push({ line: key('accWhy.miss.cooking'), action: 'notes' });
    if (source === 'label') missing.push({ line: key('accWhy.miss.labelEaten'), action: 'amount' });
  }
  missing = missing.slice(0, WHY_MAX_LINES);

  return { pct, level: accuracyLevel(pct), up, down, missing, tips: pickTips(source, { photos, grams, notes, hasText, pct }) };
}

/** "Mẹo chụp để chính xác hơn": tailored to how the figures came, most useful first, at most MAX_TIPS. */
export function pickTips(source: AccuracySource, s: { photos: number; grams: boolean; notes: boolean; hasText: boolean; pct: number | null }): GameKey[] {
  const tips: GameKey[] = [];
  switch (source) {
    case 'photo':
    case 'text': {
      if (source === 'photo' || s.photos > 0) {
        tips.push('accTip.photo.scale', 'accTip.photo.angle', 'accTip.photo.frame');
        if (!s.notes) tips.push('accTip.notes');
        tips.push('accTip.photo.before');
        if (s.photos < 2) tips.push('accTip.photo.extra');
      } else {
        if (!s.grams) tips.push('accTip.text.grams');
        tips.push('accTip.text.cook', 'accTip.text.fat', 'accTip.text.photo');
      }
      // A photo without grams: weights typed with it help the most.
      if (source === 'photo' && !s.grams) tips.splice(1, 0, 'accTip.text.grams');
      break;
    }
    case 'label':
      tips.push('accTip.label.straight', 'accTip.label.table', 'accTip.label.serving', 'accTip.label.eaten');
      break;
    case 'db':
      tips.push('accTip.db.amount', 'accTip.db.cook');
      break;
    case 'idea':
    case 'swap':
      tips.push('accTip.idea.log', 'accTip.photo.scale', 'accTip.text.grams');
      break;
  }
  return tips.filter((t, i) => tips.indexOf(t) === i).slice(0, MAX_TIPS);
}

/** What to keep with a logged food: drops empty fields so old readers and the jsonb stay small. Null when there is nothing to say. */
export function foodAccuracyOf(acc: FoodAccuracy | null | undefined): FoodAccuracy | undefined {
  if (!acc) return undefined;
  const out: FoodAccuracy = { pct: typeof acc.pct === 'number' && Number.isFinite(acc.pct) ? Math.round(acc.pct) : null, source: acc.source };
  if (out.pct === null && acc.source !== 'db') return undefined;
  const why = cleanAccuracyWhy(acc.why);
  if (why) out.why = why;
  if (acc.photos && acc.photos > 0) out.photos = acc.photos;
  if (acc.hasText) out.hasText = true;
  if (acc.gramsGiven) out.gramsGiven = true;
  if (acc.notesGiven) out.notesGiven = true;
  return out;
}

/** A stored FoodAccuracy read back (from the jsonb): undefined when it is not one. */
export function readFoodAccuracy(raw: unknown): FoodAccuracy | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const sources: AccuracySource[] = ['db', 'label', 'photo', 'text', 'idea', 'swap'];
  if (!sources.includes(r.source as AccuracySource)) return undefined;
  return foodAccuracyOf({
    pct: typeof r.pct === 'number' ? r.pct : null,
    source: r.source as AccuracySource,
    why: cleanAccuracyWhy(r.why),
    photos: typeof r.photos === 'number' ? r.photos : undefined,
    hasText: r.hasText === true,
    gramsGiven: r.gramsGiven === true,
    notesGiven: r.notesGiven === true,
  });
}
