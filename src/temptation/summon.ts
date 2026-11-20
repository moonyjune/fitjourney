import { useSettingsStore } from '../store/useSettingsStore';
import { useTemptationStore } from '../store/useTemptationStore';
import { recordTemptInteraction, requestTemptation, requestTemptChat, updateTemptOutcome } from '../sync/cloudSync';
import { useNutritionStore } from '../store/useNutritionStore';
import { reconcileLogged } from './learn';
import { habitWhyLine } from '../../supabase/functions/_shared/eatingHabits';
import { interactionRow } from '../../supabase/functions/_shared/temptLearn';
import { tagsOf, nowOf } from '../../supabase/functions/_shared/temptPick';
import { toDateKey } from '../utils/date';
import { TEMPT_CATALOG } from './catalog';
import type { TemptTalk, TemptTurn } from '../components/quest/TemptationDialog';
import { areaFromSettings, diaryNow, liveExtrasNow, localLearned, pickExtrasNow } from './context';
import { itemFromAi, pickEasy, type TemptItem } from './item';
import { answerOfCompact, markShownLocal, pickFromCache, readPoolCache, refreshPool } from './offlinePool';
import { currentTemptPlayer } from './player';
import { currentWeather, type Weather } from './weather';

const pad = (n: number) => String(n).padStart(2, '0');

/** Names answered lately (the history keeps names), newest first. */
const recentNames = (): string[] => useTemptationStore.getState().history.slice(0, 6).map((h) => h.name);

/** Catalog ids of those names, so the Easy pick is something else. */
const recentIds = (names: string[]): string[] => TEMPT_CATALOG.filter((i) => names.includes(i.vi) || names.includes(i.en)).map((i) => i.id);

/** "Now" as the temptation functions read it: the local date and time, the city and the weather, the names shown lately. */
export function temptNow(now: Date, city: string, weather: Weather | null, avoid: string[]) {
  return { date: toDateKey(now), time: `${pad(now.getHours())}:${pad(now.getMinutes())}`, weekday: now.getDay(), city, weather, avoid };
}

/** "AI tương tác": the item the AI boss picked for the player now, with its own opening lines; null when the AI is unavailable. */
export async function aiChatItem(now: Date): Promise<TemptItem | null> {
  const { settings } = useTemptationStore.getState();
  const weather = await currentWeather(settings.city).catch(() => null);
  const outcome = await requestTemptChat({ action: 'open', now: temptNow(now, settings.city, weather, recentNames()), player: currentTemptPlayer(now), ...pickExtrasNow(now), ...liveExtrasNow(now) });
  return outcome.ok ? itemFromAi(outcome.result, outcome.sample ? 'sample' : 'ai', true) : null;
}

/** The AI boss's answer to the player's line in the chat ("AI tương tác"); null when it could not be had. */
export async function bossReply(talk: TemptTalk, now: Date = new Date()): Promise<TemptTurn | null> {
  const { settings } = useTemptationStore.getState();
  const weather = await currentWeather(settings.city).catch(() => null);
  const outcome = await requestTemptChat({
    action: 'reply',
    now: temptNow(now, settings.city, weather, []),
    player: currentTemptPlayer(now),
    ...pickExtrasNow(now),
    ...liveExtrasNow(now),
    ...(talk.item.interactionId ? { interactionId: talk.item.interactionId } : {}),
    item: { poolId: talk.item.chat?.poolId ?? '', name: talk.item.name, kcal: talk.item.kcal },
    offered: talk.offered,
    chat: talk.chat,
    turn: talk.turn,
  });
  if (!outcome.ok || !outcome.result || typeof outcome.result !== 'object') return null;
  const r = outcome.result as Record<string, unknown>;
  const move = (['insist', 'retry', 'switch', 'concede'] as const).find((m) => m === r.move) ?? 'insist';
  const lines = (Array.isArray(r.lines) ? r.lines : []).filter((l): l is string => typeof l === 'string' && l.trim().length > 0).map((l) => l.trim().slice(0, 220)).slice(0, 3);
  const item = move === 'switch' ? itemFromAi(r.item, outcome.sample ? 'sample' : 'ai', true) : null;
  return { move: item || move !== 'switch' ? move : 'retry', lines, ...(item ? { item } : {}) };
}

/** A Hard item from the pool copy on this device (1.5, offline): the same scoring as the server, recorded as shown; null without a copy. */
export async function offlineItem(now: Date, weather: Weather | null, names: string[]): Promise<TemptItem | null> {
  const { settings } = useTemptationStore.getState();
  const cache = await readPoolCache().catch(() => null);
  const history = useTemptationStore.getState().history;
  const ctx = { ...temptNow(now, settings.city, weather, names), ...pickExtrasNow(now), learned: localLearned(history, now) };
  const pick = pickFromCache(cache, ctx, now);
  if (!pick) return null;
  void markShownLocal(pick.item.id, now);
  const item = itemFromAi(answerOfCompact(pick.item, pick.repeat), 'ai');
  if (!item) return null;
  // 1.7: the "why" line from the diary (no shops offline), and the showing recorded for the boss to learn from when online.
  const tags = tagsOf(pick.item);
  const diary = diaryNow(now);
  const why = habitWhyLine(diary, { cat: tags.cat, nowMinutes: now.getHours() * 60 + now.getMinutes() });
  const area = areaFromSettings(settings);
  const now0 = nowOf(ctx);
  const row = interactionRow('', {
    shownAt: now.toISOString(),
    poolId: pick.item.id,
    name: pick.item.name,
    cat: tags.cat,
    kind: tags.course === 'drink' ? 'drink' : 'food',
    context: {
      slot: now0.slot,
      weekday: now.getDay(),
      weather: now0.weather,
      tempC: weather?.tempC ?? null,
      kcalLeft: diary?.today.leftKcal ?? null,
      sinceMealMin: ctx.meal.sinceMealMin,
      area: area ? [area.district, area.city].filter(Boolean).join(', ') : '',
      shop: '',
    },
    model: '',
    angle: '',
  });
  let interactionId: string | null = null;
  try {
    interactionId = await recordTemptInteraction(row);
  } catch {
    interactionId = null;
  }
  return { ...item, ...(why ? { why } : {}), ...(interactionId ? { interactionId } : {}) };
}

/** A Hard item: the server's pick from the pool (with the weather, what was eaten today and the player's habits), else (offline, the
 *  server unavailable) the pick from the pool copy on this device, else an Easy item marked as a fallback. The copy is refreshed
 *  afterwards when it is old. */
export async function hardItem(now: Date, language: 'vi' | 'en'): Promise<TemptItem> {
  const { settings } = useTemptationStore.getState();
  const names = recentNames();
  const weather = await currentWeather(settings.city).catch(() => null);
  const outcome = await requestTemptation({ ...temptNow(now, settings.city, weather, names), ...pickExtrasNow(now), ...liveExtrasNow(now) });
  void refreshPool().catch(() => undefined);
  if (outcome.ok) {
    const item = itemFromAi(outcome.result, outcome.sample ? 'sample' : 'ai');
    if (item) return item;
  }
  // The pool pick is no AI call, so it also stands in when the AI is off. (The dev account never downloads the pool: no copy.)
  const local = await offlineItem(now, weather, names).catch(() => null);
  if (local) return local;
  return { ...pickEasy(now, language, recentIds(names)), note: 'fallback' };
}

/** 1.7: temptations said no to whose food was logged within ~2 h after all are marked "gave in (logged)" for the boss's learning. */
export function reconcilePending(now: Date = new Date()): void {
  try {
    const store = useTemptationStore.getState();
    if (store.pending.length === 0) return;
    const { eaten, keep } = reconcileLogged(store.pending, useNutritionStore.getState().logs, now);
    for (const id of eaten) void updateTemptOutcome(id, 'gave_in_logged');
    store.setPending(keep);
  } catch {
    // learning only
  }
}

/** Prepares a pop-up for the chosen level and opens it. `practice` (the Profile's "try now") changes no record. Returns false when one
 *  is already open or being prepared. */
export async function summonTemptation(now: Date = new Date(), practice = false): Promise<boolean> {
  const store = useTemptationStore.getState();
  if (store.open || store.busy) return false;
  reconcilePending(now);
  const language = useSettingsStore.getState().language;
  if (store.settings.aiChat) {
    store.setBusy(true);
    try {
      // The AI boss unavailable (offline, quota): the chosen level's pop-up as usual.
      const item = (await aiChatItem(now).catch(() => null)) ?? (store.settings.level === 'easy' ? pickEasy(now, language, recentIds(recentNames())) : await hardItem(now, language));
      useTemptationStore.getState().show(item, practice);
    } finally {
      useTemptationStore.getState().setBusy(false);
    }
    return true;
  }
  if (store.settings.level === 'easy') {
    store.show(pickEasy(now, language, recentIds(recentNames())), practice);
    return true;
  }
  store.setBusy(true);
  try {
    useTemptationStore.getState().show(await hardItem(now, language), practice);
  } finally {
    useTemptationStore.getState().setBusy(false);
  }
  return true;
}
