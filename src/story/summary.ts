import type { StoryBossInfo, StoryNameCount, StorySummary } from '../../supabase/functions/_shared/story';
import { evaluatorFor, type DaySource } from '../ai/coachContext';
import { getDayType } from '../constants/plan';
import { foodKey } from '../food/remember';
import { bossForWeek } from '../game/boss';
import { deficitLevel } from '../game/deficitLevel';
import { buildStageJourney, type BossArchetype, type StageBoss } from '../game/stageBosses';
import { trackedHabits } from '../habits/rates';
import type { Habit, HabitChecks } from '../habits/types';
import type { WeightEntry } from '../types';
import { toDateKey } from '../utils/date';
import { addDays } from '../utils/milestones';
import type { ChapterSpec } from './schedule';

/**
 * The data summary one story chapter is written from (see supabase/functions/_shared/story.ts). Only what was really logged goes in:
 * the deficit of each day by the game's own rules, weigh-ins, the weekly boss and the stage bosses, ticked habits, workouts and the
 * foods eaten (the most repeated, the biggest, the junk ones). Nothing is guessed: a figure with no data is left out. Pure: the
 * caller passes the data (see `storySourceFromStores` in source.ts), so it is unit-tested.
 */

const TOP_FOODS = 5;
const TOP_WORKOUTS = 3;
const TOP_JUNK = 3;
const MAX_HABITS = 6;

export interface StorySource extends DaySource {
  weights: WeightEntry[];
  dailyDeficitKcal: number;
  habits: Habit[];
  checks: HabitChecks;
  cheatDays: string[];
  startWeightKg: number;
  goalWeightKg: number;
  startDateISO: string | null;
}

export interface SummaryOptions {
  /** 1-based number of the chapter in the story. */
  number: number;
  /** Titles of the chapters just before, oldest first. */
  previousTitles: string[];
  /** The boss's display name (from the game's strings). */
  bossName: (archetype: BossArchetype) => string;
  now: Date;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const at = (key: string) => new Date(`${key}T12:00:00`);

/** Date keys from `from` to `to`, inclusive. */
export function daysIn(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = at(from); toDateKey(d) <= to; d = addDays(d, 1)) out.push(toDateKey(d));
  return out;
}

/** Name counts, most first (ties: the first seen), keeping the first spelling of each name. */
function topNames(names: string[], max: number): StoryNameCount[] {
  const byKey = new Map<string, StoryNameCount & { first: number }>();
  names.forEach((raw, i) => {
    const name = raw.trim();
    const key = foodKey(name) || name.toLowerCase();
    if (!name) return;
    const hit = byKey.get(key);
    if (hit) hit.count += 1;
    else byKey.set(key, { name, count: 1, first: i });
  });
  return [...byKey.values()]
    .sort((a, b) => b.count - a.count || a.first - b.first)
    .slice(0, max)
    .map(({ name, count }) => ({ name, count }));
}

function bossInfo(b: StageBoss, name: string): StoryBossInfo {
  return {
    name,
    tier: b.tier,
    zone: b.zone + 1,
    fromKg: b.fromKg,
    toKg: b.toKg,
    ...(b.isFinal ? { isFinal: true } : {}),
    ...(b.daysTaken != null ? { daysTaken: b.daysTaken } : {}),
  };
}

/** Whether anything was logged between two date keys (food, a weigh-in or a workout): a week with nothing has no chapter. */
export function hasDataBetween(source: Pick<StorySource, 'logs' | 'weights' | 'workoutEntries'>, from: string, to: string): boolean {
  const inRange = (key: string) => key >= from && key <= to;
  for (const [key, log] of Object.entries(source.logs)) {
    if (!inRange(key)) continue;
    if ((log.extraItems?.length ?? 0) > 0 || Object.values(log.mealsEaten ?? {}).some(Boolean)) return true;
  }
  return source.weights.some((w) => inRange(toDateKey(new Date(w.dateISO)))) || source.workoutEntries.some((e) => inRange(toDateKey(new Date(e.dateISO))));
}

export function buildChapterSummary(spec: ChapterSpec, source: StorySource, opts: SummaryOptions): StorySummary {
  const { from, to } = spec;
  const keys = daysIn(from, to);
  const inRange = (key: string) => key >= from && key <= to;
  const { evaluate, byDay } = evaluatorFor(source, opts.now);
  const evals = keys.map((k) => evaluate(k));
  const logged = evals.filter((e) => e.deficitKcal !== null);
  const cheat = new Set(source.cheatDays);

  // Deficit: the game's own figure per logged day, its level against the target, the best and the worst day.
  const deficit: StorySummary['deficit'] = { daysLogged: logged.length, targetKcal: Math.round(source.dailyDeficitKcal), met: 0, ok: 0, low: 0, over: 0, cheatDays: 0 };
  for (const e of logged) {
    const level = deficitLevel(e.deficitKcal, source.dailyDeficitKcal, cheat.has(e.dateKey));
    if (level === 'cheat') deficit.cheatDays += 1;
    else if (level) deficit[level] += 1;
  }
  if (logged.length > 0) {
    const total = logged.reduce((s, e) => s + (e.deficitKcal ?? 0), 0);
    deficit.totalKcal = Math.round(total);
    deficit.avgKcal = Math.round(total / logged.length);
    const sorted = [...logged].sort((a, b) => (b.deficitKcal ?? 0) - (a.deficitKcal ?? 0));
    deficit.best = { date: sorted[0].dateKey, kcal: Math.round(sorted[0].deficitKcal ?? 0) };
    if (sorted.length > 1) deficit.worst = { date: sorted[sorted.length - 1].dateKey, kcal: Math.round(sorted[sorted.length - 1].deficitKcal ?? 0) };
  }

  // Weight: from the last weigh-in before the chapter (else its first) to its last, and the lowest inside it.
  const points = source.weights
    .map((w) => ({ date: toDateKey(new Date(w.dateISO)), t: new Date(w.dateISO).getTime(), kg: w.weightKg }))
    .filter((p) => Number.isFinite(p.t) && p.date <= to)
    .sort((a, b) => a.t - b.t);
  const inside = points.filter((p) => p.date >= from);
  const before = points.filter((p) => p.date < from);
  const start = before.length > 0 ? before[before.length - 1] : inside[0];
  const end = inside[inside.length - 1];
  const weight: StorySummary['weight'] = { weighIns: inside.length };
  if (end) {
    weight.endKg = r1(end.kg);
    weight.lowestKg = r1(Math.min(...inside.map((p) => p.kg)));
    if (start && start !== end) {
      weight.startKg = r1(start.kg);
      weight.changeKg = r1(end.kg - start.kg);
    }
  }

  // Workouts: sessions, minutes and kcal, and the ones done most.
  const sessions = keys.flatMap((k) => byDay.get(k) ?? []);
  const workouts: StorySummary['workouts'] = {
    sessions: sessions.length,
    minutes: Math.round(sessions.reduce((s, w) => s + (w.durationMin || 0), 0)),
    kcal: Math.round(sessions.reduce((s, w) => s + (w.caloriesBurned || 0), 0)),
    top: topNames(sessions.map((w) => w.label), TOP_WORKOUTS),
  };

  // Habits: tracked habits with ticks in the chapter.
  const habits = trackedHabits(source.habits)
    .map((h) => {
      let done = 0;
      let missed = 0;
      for (const k of keys) {
        const v = source.checks[k]?.[h.id];
        if (v === 'done') done += 1;
        else if (v === 'missed') missed += 1;
      }
      return { name: h.name, done, missed };
    })
    .filter((h) => h.done + h.missed > 0)
    .slice(0, MAX_HABITS);

  // Foods: what was logged off-plan (the most repeated, the biggest single item, the junk), and plan meals ticked.
  const items = keys.flatMap((k) => (source.logs[k]?.extraItems ?? []).map((x) => ({ ...x, date: k })));
  const biggest = items.reduce<(typeof items)[number] | null>((m, x) => (x.calories > (m?.calories ?? 0) ? x : m), null);
  const planMeals = keys.reduce((s, k) => {
    const log = source.logs[k];
    if (!log) return s;
    return s + source.mealTemplates[getDayType(at(k))].filter((m) => log.mealsEaten[m.slot]).length;
  }, 0);
  const foods: StorySummary['foods'] = {
    top: topNames(items.map((x) => x.name), TOP_FOODS),
    junk: topNames(items.filter((x) => x.junk).map((x) => x.name), TOP_JUNK),
    planMeals,
  };
  if (biggest && biggest.calories > 0) foods.biggest = { name: biggest.name.trim(), kcal: Math.round(biggest.calories), date: biggest.date };

  const loggedOver = (pred: (e: (typeof logged)[number]) => boolean) => logged.filter(pred).length;
  const limits: StorySummary['limits'] = {
    proteinMissDays: loggedOver((e) => e.missions.some((m) => m.id === 'protein' && m.status === 'missed')),
    saltOverDays: loggedOver((e) => e.nutrients.saltG > source.limits.saltG),
    purineOverDays: loggedOver((e) => e.nutrients.purineMg > source.limits.purineMg),
    sugarOverDays: loggedOver((e) => e.nutrients.sugarG > source.limits.sugarG),
  };

  const summary: StorySummary = {
    chapter: { kind: spec.kind, number: opts.number, from, to, days: keys.length },
    previousTitles: opts.previousTitles.slice(-3),
    weight,
    deficit,
    workouts,
    habits,
    foods,
    limits,
  };

  // The stage bosses as they stood at the end of the chapter: weigh-ins after it are not known yet in the story.
  const entriesUntil = source.weights.filter((w) => toDateKey(new Date(w.dateISO)) <= to);
  const journey = buildStageJourney({
    startKg: source.startWeightKg,
    goalKg: source.goalWeightKg,
    currentKg: end?.kg ?? start?.kg ?? source.startWeightKg,
    entries: entriesUntil,
    startDateISO: source.startDateISO,
  });

  if (spec.kind === 'boss') {
    const b = journey.bosses.find((x) => x.index === spec.bossIndex) ?? journey.bosses.find((x) => x.defeatedDateKey === to);
    if (b) summary.boss = bossInfo(b, opts.bossName(b.archetype));
  } else {
    const weekBoss = bossForWeek(at(to), (k) => evaluate(k).deficitKcal);
    summary.weekBoss = { maxHp: Math.round(weekBoss.maxHp), damage: Math.round(Math.min(weekBoss.totalDamage, weekBoss.maxHp)), defeated: weekBoss.defeated };
    summary.days = logged.map((e) => ({ date: e.dateKey, deficitKcal: Math.round(e.deficitKcal ?? 0) }));
    if (journey.current) summary.stage = { ...bossInfo(journey.current, opts.bossName(journey.current.archetype)), hpLeftKg: journey.current.hpLeftKg };
    const beaten = journey.bosses.filter((b) => b.defeatedDateKey && inRange(b.defeatedDateKey));
    if (beaten.length > 0) summary.bossesBeaten = beaten.map((b) => ({ name: opts.bossName(b.archetype), toKg: b.toKg, date: b.defeatedDateKey! }));
  }
  return summary;
}
