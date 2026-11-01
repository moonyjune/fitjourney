import type { BanterDaySummary, BanterText } from '../../supabase/functions/_shared/banter';
import type { DamageDay } from '../game/bossDamage';
import { deficitLevel } from '../game/deficitLevel';
import type { DayEvaluation } from '../game/missions';
import type { StageBoss } from '../game/stageBosses';
import type { DailyNutritionLog, WorkoutLogEntry } from '../types';
import { toDateKey } from '../utils/date';
import { addDays } from '../utils/milestones';
import { templateBanter } from './templates';
import type { BossTalk } from './talks';

/**
 * Which days have a battle exchange and what it says (Map > Hội thoại chiến đấu). A day has one when food was logged on it, it is
 * not a cheat day (its kcal are not counted, so there is no fight), a stage boss was being fought, and it is one of the last
 * BANTER_DAYS days (today included, as a live "so far" exchange). The exchange is the AI's when one was saved for that day, else
 * the template built from the same summary, so every such day always talks.
 * Pure: the caller passes the damage log, the game's day evaluations and the logs, so it is unit-tested.
 */

export const BANTER_DAYS = 14;
/** An AI exchange whose day's deficit moved more than this since it was written is marked as out of date. */
export const STALE_KCAL = 50;

export interface BanterDayInput {
  day: DamageDay;
  boss: StageBoss;
  evaluation: DayEvaluation | undefined;
  log: DailyNutritionLog | undefined;
  workouts: WorkoutLogEntry[];
  targetKcal: number;
  proteinTargetG: number;
  cheat: boolean;
  todayKey: string;
  /** The boss's name and its skills' names, as the exchange is written (Vietnamese). */
  bossName: string;
  skillNames: string[];
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** The summary one day's exchange is written from, or null when the day has no food logged or is a cheat day (no deficit,
 *  nothing to say). */
export function buildBanterSummary(input: BanterDayInput): BanterDaySummary | null {
  const { day, boss, evaluation, log, workouts, targetKcal, cheat } = input;
  if (cheat || day.cheat || day.deficitKcal == null || day.estKg == null) return null;
  const deficitKcal = Math.round(day.deficitKcal);
  // The exchange keeps its five levels: a too-steep deficit still hits hard, a maintenance day is the boss's day.
  const shown = deficitLevel(deficitKcal, targetKcal, false, { burnedKcal: evaluation?.burnedKcal }) ?? (deficitKcal > 0 ? 'ok' : 'over');
  const level = shown === 'excess' || shown === 'underEat' ? 'met' : shown === 'flat' ? 'over' : shown;

  // Foods: the biggest items logged off-plan, then any junk not among them.
  const items = (log?.extraItems ?? []).filter((x) => x.name.trim());
  const biggest = [...items].sort((a, b) => b.calories - a.calories).slice(0, 4);
  const junk = items.filter((x) => x.junk && !biggest.includes(x));
  const foods = [...biggest, ...junk].slice(0, 5).map((x) => ({ name: x.name.trim(), kcal: Math.round(x.calories), ...(x.junk ? { junk: true } : {}) }));

  const summary: BanterDaySummary = {
    date: day.dateKey,
    live: day.dateKey >= input.todayKey,
    boss: {
      name: input.bossName,
      skills: input.skillNames.slice(0, 3),
      tier: boss.tier,
      hpLeftKg: r1(boss.hpLeftKg),
      hpKg: r1(boss.hpKg),
      fell: day.felled.includes(boss.index),
    },
    deficitKcal,
    targetKcal: Math.round(targetKcal),
    level,
    estG: Math.round(day.estKg * 1000),
    cheatDay: cheat,
    eatenKcal: Math.round(evaluation?.eatenKcal ?? 0),
    proteinG: Math.round(evaluation?.proteinG ?? 0),
    proteinTargetG: Math.round(input.proteinTargetG),
    workouts: [...workouts]
      .filter((w) => w.label.trim())
      .sort((a, b) => b.durationMin - a.durationMin)
      .slice(0, 3)
      .map((w) => ({ name: w.label.trim(), minutes: Math.round(w.durationMin || 0), kcal: Math.round(w.caloriesBurned || 0) })),
    foods,
  };
  if (day.weightKg != null && day.realKg != null) summary.weighIn = { kg: r1(day.weightKg), lostKg: r2(day.realKg) };
  return summary;
}

/** One day's exchange as shown. */
export interface BanterShown {
  date: string;
  /** Today: the exchange is "so far" (tạm tính). */
  live: boolean;
  boss: StageBoss;
  summary: BanterDaySummary;
  text: BanterText;
  /** Who wrote it: the AI, the offline dev sample, or the template on the device. */
  source: 'ai' | 'sample' | 'template';
  /** An AI exchange written before the day's deficit changed. */
  stale: boolean;
}

export interface BanterBuildInput {
  days: DamageDay[];
  bosses: StageBoss[];
  evaluations: ReadonlyMap<string, DayEvaluation>;
  logs: Record<string, DailyNutritionLog>;
  workoutEntries: WorkoutLogEntry[];
  targetKcal: number;
  proteinTargetG: number;
  cheatDays: readonly string[];
  talks: readonly BossTalk[];
  todayKey: string;
  bossName: (b: StageBoss) => string;
  skillName: (skill: StageBoss['skills'][number]) => string;
}

/** The first date key that still has an exchange (BANTER_DAYS days, today included). */
export function banterFromKey(todayKey: string): string {
  return toDateKey(addDays(new Date(`${todayKey}T12:00:00`), -(BANTER_DAYS - 1)));
}

/** Every exchange of the last BANTER_DAYS days, newest first. */
export function buildBanterShown(input: BanterBuildInput): BanterShown[] {
  const from = banterFromKey(input.todayKey);
  const talks = new Map(input.talks.map((t) => [t.date, t]));
  const cheat = new Set(input.cheatDays);
  const workoutsByDay = new Map<string, WorkoutLogEntry[]>();
  for (const w of input.workoutEntries) {
    const key = toDateKey(new Date(w.dateISO));
    if (key < from) continue;
    workoutsByDay.set(key, [...(workoutsByDay.get(key) ?? []), w]);
  }
  const out: BanterShown[] = [];
  for (let i = input.days.length - 1; i >= 0; i--) {
    const day = input.days[i];
    if (day.dateKey < from) break;
    if (day.dateKey > input.todayKey || day.bossIndex == null) continue;
    const boss = input.bosses[day.bossIndex];
    if (!boss) continue;
    const summary = buildBanterSummary({
      day,
      boss,
      evaluation: input.evaluations.get(day.dateKey),
      log: input.logs[day.dateKey],
      workouts: workoutsByDay.get(day.dateKey) ?? [],
      targetKcal: input.targetKcal,
      proteinTargetG: input.proteinTargetG,
      cheat: cheat.has(day.dateKey),
      todayKey: input.todayKey,
      bossName: input.bossName(boss),
      skillNames: boss.skills.map(input.skillName),
    });
    if (!summary) continue;
    const talk = talks.get(day.dateKey);
    out.push({
      date: day.dateKey,
      live: summary.live,
      boss,
      summary,
      text: talk ? { moveName: talk.moveName, mood: talk.mood, lines: talk.lines } : templateBanter(summary),
      source: talk ? talk.source : 'template',
      stale: !!talk && Math.abs(talk.deficitKcal - summary.deficitKcal) > STALE_KCAL,
    });
  }
  return out;
}

/** Yesterday's key, when its exchange should be asked of the AI on its own: it has food logged, no AI exchange yet, and it was not
 *  tried before (one try per day, whatever the outcome, so a failure never loops). */
export function autoBanterDay(shown: readonly BanterShown[], todayKey: string, autoTried: string | null): string | null {
  const yesterday = toDateKey(addDays(new Date(`${todayKey}T12:00:00`), -1));
  if (autoTried != null && autoTried >= yesterday) return null;
  const day = shown.find((d) => d.date === yesterday);
  return day && day.source === 'template' ? yesterday : null;
}
