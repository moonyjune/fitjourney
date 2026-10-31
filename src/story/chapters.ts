import { cleanChapterAnswer, type ChapterKind } from '../../supabase/functions/_shared/story';

/** A written chapter as kept on the device and in the cloud (user_data key `story`). */
export interface StoryChapter {
  /** The schedule's id (`week:<Monday>` / `boss:<kg>`): one chapter per id. */
  id: string;
  kind: ChapterKind;
  from: string;
  to: string;
  /** 1-based place in the story when it was written. */
  number: number;
  title: string;
  paragraphs: string[];
  writtenAtISO: string;
  /** Written by the offline dev account: a labelled sample, not the AI. */
  sample?: boolean;
}

export interface StoryData {
  chapters: StoryChapter[];
}

/** Chapters kept: about four years of weeks plus their bosses. */
export const STORY_KEEP = 240;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Oldest first (by last day, then number). */
export const storyOrder = (a: StoryChapter, b: StoryChapter) => a.to.localeCompare(b.to) || a.number - b.number;

function cleanChapter(raw: unknown): StoryChapter | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  const text = cleanChapterAnswer(c);
  if (!text || typeof c.id !== 'string' || !/^(week|boss):/.test(c.id)) return null;
  if ((c.kind !== 'week' && c.kind !== 'boss') || typeof c.from !== 'string' || !DATE_RE.test(c.from) || typeof c.to !== 'string' || !DATE_RE.test(c.to)) return null;
  const number = typeof c.number === 'number' && Number.isInteger(c.number) && c.number > 0 ? c.number : 1;
  const writtenAtISO = typeof c.writtenAtISO === 'string' && !Number.isNaN(Date.parse(c.writtenAtISO)) ? c.writtenAtISO : new Date(0).toISOString();
  return { id: c.id, kind: c.kind, from: c.from, to: c.to, number, ...text, writtenAtISO, ...(c.sample === true ? { sample: true } : {}) };
}

/** The saved story reduced to valid chapters: one per id (the first one kept), oldest first, at most STORY_KEEP (the newest). */
export function cleanStoryData(raw: unknown): StoryData {
  const list = raw && typeof raw === 'object' && Array.isArray((raw as { chapters?: unknown }).chapters) ? (raw as { chapters: unknown[] }).chapters : [];
  const seen = new Set<string>();
  const chapters: StoryChapter[] = [];
  for (const c of list.map(cleanChapter)) {
    if (!c || seen.has(c.id)) continue;
    seen.add(c.id);
    chapters.push(c);
  }
  return { chapters: chapters.sort(storyOrder).slice(-STORY_KEEP) };
}

/** This device's story joined with the cloud's: every chapter of either side, the device's copy when both have one. */
export function mergeStory(local: StoryData, remote: StoryData): StoryData {
  return cleanStoryData({ chapters: [...local.chapters, ...remote.chapters] });
}
