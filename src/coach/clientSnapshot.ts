import { useEffect, useState } from 'react';
import { DEFAULT_CALORIE_TARGET, DEFAULT_PLAN, DEFAULT_PROTEIN_TARGET_G, DEFAULT_START_WEIGHT_KG, DEFAULT_WATER_TARGET_ML } from '../constants/plan';
import type { Limits } from '../game/constants';
import { supabase } from '../lib/supabase';
import { LIMIT_DEFAULTS, LIMIT_RANGE, type LimitKey } from '../store/useLimitsStore';
import { fetchFeelingRecords, pullPlan } from '../sync/cloudSync';
import { mergeNutrition, mergeWeights, mergeWorkouts } from '../sync/restore';
import { USER_DATA_KEYS } from '../sync/userDataKeys';
import type { ActivityLevel, DailyNutritionLog, FeelingRecord, Gender, PlanData, ProofPhoto, UserSettings, WeightEntry, WorkoutLogEntry } from '../types';
import { DEFAULT_TARGET_DAILY_DEFICIT_KCAL, resolveTdeeKcal } from '../utils/tdee';

type Row = Record<string, unknown>;
const PAGE = 1000;

/** What a coach sees of one client: the client's diary read from the cloud (the coach's read access is enforced by the server). */
export interface ClientSnapshot {
  clientId: string;
  displayName: string;
  logs: Record<string, DailyNutritionLog>;
  workouts: WorkoutLogEntry[];
  weights: WeightEntry[];
  feelings: FeelingRecord[];
  /** Only the day and the meal each photo belongs to (the pictures themselves are on the client detail screen). */
  photos: ProofPhoto[];
  plan: PlanData;
  settings: Pick<
    UserSettings,
    'startWeightKg' | 'goalWeightKg' | 'heightCm' | 'age' | 'gender' | 'activityLevel' | 'calorieTargetKcal' | 'targetDailyDeficitKcal' | 'proteinTargetG' | 'waterTargetMl' | 'startDateISO'
  >;
  limits: Pick<Limits, 'purineMg' | 'saltG' | 'sugarG'>;
  tdeeKcal: number;
}

const numOr = <T,>(v: unknown, fallback: T): number | T => {
  if (v == null || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

async function all(table: string, clientId: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select('*').eq('user_id', clientId).order('id', { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as Row[]));
    if (!data || data.length < PAGE) return rows;
  }
}

/** Reads the limits a client chose (when the coach may see them) over the defaults. */
export function limitsFrom(value: unknown): Pick<Limits, 'purineMg' | 'saltG' | 'sugarG'> {
  const out: Record<LimitKey, number> = { ...LIMIT_DEFAULTS };
  if (value && typeof value === 'object') {
    for (const key of Object.keys(LIMIT_RANGE) as LimitKey[]) {
      const v = (value as Record<string, unknown>)[key];
      if (typeof v === 'number' && v >= LIMIT_RANGE[key].min && v <= LIMIT_RANGE[key].max) out[key] = v;
    }
  }
  return out;
}

/** Loads one client's diary for the coach screens. Null when it cannot be read (not this coach's client, or no connection). */
export async function fetchClientSnapshot(clientId: string): Promise<ClientSnapshot | null> {
  try {
    const [profileRes, nutrition, weights, workouts, proofs, feelings, remotePlan, limitsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', clientId).maybeSingle(),
      all('nutrition_logs', clientId),
      all('weight_entries', clientId),
      all('workout_entries', clientId),
      all('proof_photos', clientId),
      fetchFeelingRecords(clientId, '1970-01-01T00:00:00.000Z'),
      pullPlan(clientId),
      supabase.from('user_data').select('value').eq('user_id', clientId).eq('key', USER_DATA_KEYS.limits).maybeSingle(),
    ]);
    const p = (profileRes.data ?? null) as Row | null;
    if (!p) return null;
    const weightList = mergeWeights([], weights).sort((a, b) => new Date(a.dateISO).getTime() - new Date(b.dateISO).getTime());
    const startWeightKg = numOr(p.start_weight_kg, DEFAULT_START_WEIGHT_KG) as number;
    const settings: ClientSnapshot['settings'] = {
      startWeightKg,
      goalWeightKg: numOr(p.goal_weight_kg, startWeightKg) as number,
      heightCm: numOr(p.height_cm, null),
      age: numOr(p.age, null),
      gender: (p.gender as Gender | null) ?? null,
      activityLevel: (p.activity_level as ActivityLevel | null) ?? null,
      calorieTargetKcal: numOr(p.calorie_target_kcal, DEFAULT_CALORIE_TARGET) as number,
      targetDailyDeficitKcal: numOr(p.target_daily_deficit_kcal, DEFAULT_TARGET_DAILY_DEFICIT_KCAL) as number,
      proteinTargetG: numOr(p.protein_target_g, DEFAULT_PROTEIN_TARGET_G) as number,
      waterTargetMl: numOr(p.water_target_ml, DEFAULT_WATER_TARGET_ML) as number,
      startDateISO: typeof p.start_date === 'string' ? new Date(`${p.start_date}T00:00:00`).toISOString() : new Date(String(p.created_at ?? Date.now())).toISOString(),
    };
    const latest = weightList[weightList.length - 1]?.weightKg ?? settings.startWeightKg;
    const { tdeeKcal } = resolveTdeeKcal({
      gender: settings.gender,
      age: settings.age,
      heightCm: settings.heightCm,
      activityLevel: settings.activityLevel,
      weightKg: latest,
      calorieTargetKcal: settings.calorieTargetKcal,
      targetDailyDeficitKcal: settings.targetDailyDeficitKcal,
    });
    const photos: ProofPhoto[] = proofs.map((r) => ({
      id: String(r.id),
      dateISO: String(r.entry_date ?? '').slice(0, 10) ? `${String(r.entry_date).slice(0, 10)}T12:00:00.000Z` : '',
      taskType: r.task_type === 'workout' ? 'workout' : 'meal',
      taskRefId: String(r.task_ref_id ?? ''),
      photoUri: '',
      note: String(r.note ?? ''),
      createdAtISO: String(r.created_at ?? ''),
    }));
    return {
      clientId,
      displayName: String(p.display_name ?? p.email ?? ''),
      logs: mergeNutrition({}, nutrition),
      workouts: mergeWorkouts([], workouts),
      weights: weightList,
      feelings,
      photos,
      plan: remotePlan?.plan ?? DEFAULT_PLAN,
      settings,
      limits: limitsFrom(limitsRes.data?.value),
      tdeeKcal,
    };
  } catch (error) {
    console.warn('[coach] fetchClientSnapshot failed:', error);
    return null;
  }
}

/** The client's snapshot for a coach screen: `loading` until the first answer, then the data or null when it could not be read. */
export function useClientSnapshot(clientId: string | undefined): { loading: boolean; snapshot: ClientSnapshot | null } {
  const [state, setState] = useState<{ loading: boolean; snapshot: ClientSnapshot | null }>({ loading: !!clientId, snapshot: null });
  useEffect(() => {
    if (!clientId) {
      setState({ loading: false, snapshot: null });
      return;
    }
    let alive = true;
    setState({ loading: true, snapshot: null });
    fetchClientSnapshot(clientId).then((snapshot) => {
      if (alive) setState({ loading: false, snapshot });
    });
    return () => {
      alive = false;
    };
  }, [clientId]);
  return state;
}
