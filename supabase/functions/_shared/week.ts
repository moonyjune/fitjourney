// Sanitising of the weekly-review input the client sends: only bounded numbers, ISO dates and known enums get into the
// prompt, at most 7 days, so a bad client can't put text there. Pure (no Deno use), unit-tested in jest.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MISSIONS = ['workout', 'deficit', 'protein', 'purine', 'salt', 'sugar', 'junk'];
const STATUSES = ['defeated', 'on_track', 'behind', 'far'];

const bounded = (v: unknown, min: number, max: number): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? Math.round(v * 10) / 10 : undefined;

const pickNumbers = (o: unknown, spec: Record<string, [number, number]>): Record<string, number> => {
  const src = (o ?? {}) as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const [key, [min, max]] of Object.entries(spec)) {
    const v = bounded(src[key], min, max);
    if (v !== undefined) out[key] = v;
  }
  return out;
};

export const isDate = (v: unknown): v is string => typeof v === 'string' && DATE_RE.test(v);

function day(raw: unknown): Record<string, unknown> | null {
  const d = (raw ?? {}) as Record<string, unknown>;
  if (!isDate(d.date)) return null;
  return {
    date: d.date,
    logged: d.logged === true,
    ...pickNumbers(d, {
      deficitKcal: [-20000, 20000],
      damage: [0, 5000],
      eatenKcal: [0, 20000],
      proteinG: [0, 1000],
      burnedKcal: [0, 10000],
      waterMl: [0, 20000],
      purineMg: [0, 20000],
      saltG: [0, 200],
      sugarG: [0, 1000],
      workouts: [0, 20],
      junkCount: [0, 50],
      lastMealHour: [0, 23],
    }),
    missed: (Array.isArray(d.missed) ? d.missed : []).filter((m): m is string => typeof m === 'string' && MISSIONS.includes(m)),
  };
}

/** The week input reduced to bounded numbers, dates and known enums, or null when it is unusable (no week or no days). */
export function cleanWeek(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const w = raw as Record<string, any>;
  if (!isDate(w.week?.start) || !isDate(w.week?.today)) return null;
  const days = (Array.isArray(w.days) ? w.days : []).map(day).filter((d): d is Record<string, unknown> => d !== null).slice(0, 7);
  if (days.length === 0) return null;
  const prev = w.previousWeek ? pickNumbers(w.previousWeek, { damage: [0, 20000], daysLogged: [0, 7], avgDeficitKcal: [-20000, 20000] }) : undefined;
  return {
    week: { start: w.week.start, today: w.week.today, ...pickNumbers(w.week, { daysElapsed: [1, 7], daysUntilReset: [0, 8] }) },
    boss: {
      ...pickNumbers(w.boss, { maxHp: [0, 100000], hpLeft: [0, 100000], damageSoFar: [0, 100000], neededPerRemainingDay: [0, 100000] }),
      defeated: w.boss?.defeated === true,
      status: STATUSES.includes(w.boss?.status) ? w.boss.status : undefined,
    },
    targets: pickNumbers(w.targets, { tdeeKcal: [0, 10000], dailyDeficitKcal: [0, 5000], proteinTargetG: [0, 1000], waterTargetMl: [0, 20000], purineLimitMg: [0, 20000], saltLimitG: [0, 200], sugarLimitG: [0, 1000] }),
    days,
    patterns: pickNumbers(w.patterns, {
      daysLogged: [0, 7], avgDeficitKcal: [-20000, 20000], avgProteinG: [0, 1000], workoutDays: [0, 7], proteinMissDays: [0, 7], saltOverDays: [0, 7],
      purineOverDays: [0, 7], sugarOverDays: [0, 7], junkDays: [0, 7], waterShortDays: [0, 7], lateMealDays: [0, 7],
    }),
    weight: pickNumbers(w.weight, { startKg: [20, 400], endKg: [20, 400], changeKg: [-50, 50], expectedChangeKg: [-50, 50], gapKg: [-100, 100] }),
    ...(prev && Object.keys(prev).length > 0 ? { previousWeek: prev } : {}),
  };
}

/** The week input as compact JSON text for the prompt, or null when it is unusable. */
export function describeWeek(raw: unknown): string | null {
  const clean = cleanWeek(raw);
  return clean ? JSON.stringify(clean) : null;
}
