import { useSettingsStore } from '../store/useSettingsStore';
import { useTemptationStore } from '../store/useTemptationStore';
import { requestTemptation } from '../sync/cloudSync';
import { toDateKey } from '../utils/date';
import { TEMPT_CATALOG } from './catalog';
import { itemFromAi, pickEasy, type TemptItem } from './item';
import { currentWeather } from './weather';

const pad = (n: number) => String(n).padStart(2, '0');

/** Names answered lately (the history keeps names), newest first. */
const recentNames = (): string[] => useTemptationStore.getState().history.slice(0, 6).map((h) => h.name);

/** Catalog ids of those names, so the Easy pick is something else. */
const recentIds = (names: string[]): string[] => TEMPT_CATALOG.filter((i) => names.includes(i.vi) || names.includes(i.en)).map((i) => i.id);

/** A Hard item: the AI (with the weather when it can be had), or, when the AI is unavailable, an Easy item marked as a fallback. */
export async function hardItem(now: Date, language: 'vi' | 'en'): Promise<TemptItem> {
  const { settings } = useTemptationStore.getState();
  const names = recentNames();
  const weather = await currentWeather(settings.city).catch(() => null);
  const outcome = await requestTemptation({
    date: toDateKey(now),
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    weekday: now.getDay(),
    city: settings.city,
    weather,
    avoid: names,
  });
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
