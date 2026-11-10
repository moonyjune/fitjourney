import { useSettingsStore } from '../store/useSettingsStore';
import { useTemptationStore } from '../store/useTemptationStore';
import { requestTemptation, requestTemptChat } from '../sync/cloudSync';
import { toDateKey } from '../utils/date';
import { TEMPT_CATALOG } from './catalog';
import type { TemptTalk, TemptTurn } from '../components/quest/TemptationDialog';
import { itemFromAi, pickEasy, type TemptItem } from './item';
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
  const outcome = await requestTemptChat({ action: 'open', now: temptNow(now, settings.city, weather, recentNames()), player: currentTemptPlayer(now) });
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

/** A Hard item: the AI (with the weather when it can be had), or, when the AI is unavailable, an Easy item marked as a fallback. */
export async function hardItem(now: Date, language: 'vi' | 'en'): Promise<TemptItem> {
  const { settings } = useTemptationStore.getState();
  const names = recentNames();
  const weather = await currentWeather(settings.city).catch(() => null);
  const outcome = await requestTemptation(temptNow(now, settings.city, weather, names));
  if (outcome.ok) {
    const item = itemFromAi(outcome.result, outcome.sample ? 'sample' : 'ai');
    if (item) return item;
  }
  return { ...pickEasy(now, language, recentIds(names)), note: 'fallback' };
}

/** Prepares a pop-up for the chosen level and opens it. `practice` (the Profile's "try now") changes no record. Returns false when one
 *  is already open or being prepared. */
export async function summonTemptation(now: Date = new Date(), practice = false): Promise<boolean> {
  const store = useTemptationStore.getState();
  if (store.open || store.busy) return false;
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
