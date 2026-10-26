import { fold } from '../food/search';
import { LEARN_TOPICS } from './topicsData';
import type { LearnSection, LearnTopic, SnackSwap } from './types';

/** Topics whose title or text contain every word of the query (accent-insensitive), optionally within one section. */
export function searchTopics(query: string, section: LearnSection | null = null, topics: LearnTopic[] = LEARN_TOPICS): LearnTopic[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const pool = section ? topics.filter((t) => t.section === section) : topics;
  if (words.length === 0) return pool;
  return pool.filter((t) => {
    const hay = fold(`${t.title} ${t.points.join(' ')}`);
    return words.every((w) => hay.includes(w));
  });
}

/** Swaps whose craving, replacement or note contain every word of the query. */
export function searchSnacks(swaps: SnackSwap[], query: string): SnackSwap[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return swaps;
  return swaps.filter((s) => {
    const hay = fold(`${s.craving} ${s.swap} ${s.note ?? ''}`);
    return words.every((w) => hay.includes(w));
  });
}

export type KcalBand = 'free' | 'once' | 'meal';

/** Up to 100 kcal is a free nibble, up to 200 kcal once a day, above that it replaces a snack meal. */
export const kcalBand = (kcal: number): KcalBand => (kcal <= 100 ? 'free' : kcal <= 200 ? 'once' : 'meal');
