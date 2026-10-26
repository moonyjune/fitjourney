// Shared by the vision and text meal functions: the advice and accuracy schema, and the sanitising of what the client
// sends (body profile, coach snapshot) so a bad client can't inject text into a prompt.

export const ACCURACY_PROPERTY = {
  type: 'number',
  minimum: 0,
  maximum: 100,
  description:
    'Your honest estimate, as a percentage 0-100, of how accurate the numbers are. Clear nutrition label or exact weights: 85-95. A typical plate in a clear photo or a precise description: 60-80. Hidden ingredients, unknown portion, sauces or vague wording: 30-55.',
};

export const ADVICE_PROPERTY = {
    type: 'object',
    description: 'Assessment of the day and what to do next, using the coach snapshot. Omit only if no snapshot was given.',
    properties: {
      verdict: { type: 'string', enum: ['on_track', 'watch', 'over'], description: 'on_track: fits the plan; watch: drifting; over: a limit is broken or the deficit is at risk.' },
      summary: { type: 'string', description: '1-2 sentences (Vietnamese): how this meal/workout changes today against the deficit target and limits.' },
      nextSteps: { type: 'array', items: { type: 'string' }, maxItems: 4, description: 'Concrete actions for the rest of today (Vietnamese): what/how much to eat, whether to train, water, what to avoid.' },
      remainingKcalToEat: { type: 'number', description: 'Calories still available to eat today to keep the daily deficit target (0 if none).' },
      remainingProteinG: { type: 'number', description: 'Protein grams still needed today to reach the protein target (0 if reached).' },
      extraBurnKcal: { type: 'number', description: 'Extra kcal to burn today to still reach the daily deficit (0 if not needed).' },
      bossNote: { type: 'string', description: 'One sentence (Vietnamese): what today means for this week\'s boss (damage needed per remaining day).' },
    },
    required: ['verdict', 'summary', 'nextSteps'],
};

export interface BodyProfile {
  weightKg?: number;
  heightCm?: number;
  age?: number;
  gender?: 'male' | 'female';
  activityLevel?: string;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined);

/** Only the fields we expect, with sane bounds, so a bad client can't inject text into the prompt. */
export function sanitizeProfile(raw: unknown): BodyProfile {
  const p = (raw ?? {}) as Record<string, unknown>;
  const within = (v: unknown, min: number, max: number) => {
    const n = num(v);
    return n !== undefined && n >= min && n <= max ? n : undefined;
  };
  return {
    weightKg: within(p.weightKg, 20, 400),
    heightCm: within(p.heightCm, 80, 250),
    age: within(p.age, 5, 110),
    gender: p.gender === 'male' || p.gender === 'female' ? p.gender : undefined,
    activityLevel: ['sedentary', 'light', 'moderate', 'active', 'very_active'].includes(String(p.activityLevel))
      ? String(p.activityLevel)
      : undefined,
  };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const bounded = (v: unknown, min: number, max: number): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? Math.round(v * 10) / 10 : undefined;

interface Day {
  date: string;
  eatenKcal?: number;
  proteinG?: number;
  purineMg?: number;
  saltG?: number;
  sugarG?: number;
  waterMl?: number;
  burnedKcal?: number;
  workouts?: number;
  deficitKcal?: number;
}

function sanitizeDay(raw: unknown): Day | null {
  const d = (raw ?? {}) as Record<string, unknown>;
  if (typeof d.date !== 'string' || !DATE_RE.test(d.date)) return null;
  const day: Day = {
    date: d.date,
    eatenKcal: bounded(d.eatenKcal, 0, 20000),
    proteinG: bounded(d.proteinG, 0, 1000),
    purineMg: bounded(d.purineMg, 0, 20000),
    saltG: bounded(d.saltG, 0, 200),
    sugarG: bounded(d.sugarG, 0, 1000),
    waterMl: bounded(d.waterMl, 0, 20000),
    burnedKcal: bounded(d.burnedKcal, 0, 10000),
    workouts: bounded(d.workouts, 0, 20),
    deficitKcal: bounded(d.deficitKcal, -20000, 20000),
  };
  // A day whose every figure was out of bounds says nothing.
  return Object.entries(day).some(([k, v]) => k !== 'date' && v !== undefined) ? day : null;
}

/** The coach snapshot as a compact JSON text for the prompt. Only numbers and ISO dates survive, at most 7 recent days. */
export function describeCoach(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, any>;
  const pick = (o: unknown, keys: string[], min: number, max: number) =>
    Object.fromEntries(keys.map((k) => [k, bounded((o as Record<string, unknown>)?.[k], min, max)]).filter(([, v]) => v !== undefined));
  const today = sanitizeDay(c.today);
  const left = Array.isArray(c.today?.plannedMealsLeft) ? c.today.plannedMealsLeft.slice(0, 6) : [];
  const snapshot = {
    now: {
      date: typeof c.now?.date === 'string' && DATE_RE.test(c.now.date) ? c.now.date : undefined,
      time: typeof c.now?.time === 'string' && /^\d{2}:\d{2}$/.test(c.now.time) ? c.now.time : undefined,
      ...pick(c.now, ['eatingWindowEndsAtHour'], 0, 24),
      eatingClosed: c.now?.eatingClosed === true,
    },
    targets: pick(c.targets, ['tdeeKcal', 'dailyDeficitKcal', 'calorieTargetKcal', 'proteinTargetG', 'waterTargetMl', 'purineLimitMg', 'saltLimitG', 'sugarLimitG', 'goalWeightKg'], 0, 100000),
    todaySoFar: today,
    plannedMealsLeftToday: left.map((m: Record<string, unknown>) => ({
      time: typeof m.time === 'string' && /^\d{2}:\d{2}$/.test(m.time) ? m.time : undefined,
      kcal: bounded(m.kcal, 0, 5000),
      proteinG: bounded(m.proteinG, 0, 500),
    })),
    weekBoss: { ...pick(c.week, ['bossMaxHp', 'bossHpLeft', 'damageSoFar', 'daysUntilReset', 'neededDamagePerRemainingDay'], 0, 100000), defeated: c.week?.defeated === true },
    recentDays: (Array.isArray(c.recentDays) ? c.recentDays : []).map(sanitizeDay).filter(Boolean).slice(-7),
    recentWeights: (Array.isArray(c.recentWeights) ? c.recentWeights : [])
      .map((w: Record<string, unknown>) => (typeof w.date === 'string' && DATE_RE.test(w.date) && bounded(w.kg, 20, 400) !== undefined ? { date: w.date, kg: bounded(w.kg, 20, 400) } : null))
      .filter(Boolean)
      .slice(-7),
  };
  return JSON.stringify(snapshot);
}

export function describePerson(p: BodyProfile): string {
  const parts = [
    p.weightKg ? `cân nặng ${p.weightKg} kg` : null,
    p.heightCm ? `cao ${p.heightCm} cm` : null,
    p.age ? `${p.age} tuổi` : null,
    p.gender ? (p.gender === 'male' ? 'nam' : 'nữ') : null,
    p.activityLevel ? `mức vận động ${p.activityLevel}` : null,
  ].filter(Boolean);
  return parts.length ? `Người dùng: ${parts.join(', ')}.` : 'Không có thông tin thể trạng người dùng.';
}

