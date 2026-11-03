import { WORKOUT_MIN_MINUTES, type MissionId } from './constants';
import type { DayEvaluation, MissionResult } from './missions';
import type { GameKey } from './strings';
import type { QuickId } from '../cookbook/browse';

type Translate = (key: GameKey, params?: Record<string, string | number>) => string;

export interface MissionCopy {
  title: string;
  subtitle: string;
  statusLabel: string;
  progress?: number;
}

/** A mission's title, status line and progress, as the missions list (Camp › Nhiệm vụ sheet) shows it. */
export function describeMission(m: MissionResult, day: DayEvaluation, g: Translate): MissionCopy {
  const exceeded = m.status === 'missed' && m.value > m.target && m.id !== 'workout';
  const statusKey: GameKey = exceeded ? 'status.exceeded' : (`status.${m.status}` as GameKey);
  let title: string;
  let sub: string;
  let progress: number | undefined;

  switch (m.id) {
    case 'workout':
      title = g('mission.workout');
      sub =
        m.value >= m.target
          ? g('sub.workoutDone', { min: Math.round(m.value), kcal: Math.round(day.burnedKcal) })
          : g('sub.workoutOpen', { n: WORKOUT_MIN_MINUTES });
      progress = m.target > 0 ? m.value / m.target : 0;
      break;
    case 'deficit':
      title = g('mission.deficit', { n: m.target });
      sub = day.cheat
        ? g('sub.deficitCheat')
        : day.deficitKcal == null
          ? g('sub.deficitNone')
          : day.projectedDeficitKcal != null
            ? g('sub.deficitPending', { kcal: Math.round(day.projectedDeficitKcal).toLocaleString('en-US') })
            : g('sub.deficit', { kcal: Math.round(day.deficitKcal).toLocaleString('en-US') });
      progress = m.target > 0 ? Math.max(0, m.value) / m.target : 0;
      break;
    case 'protein':
      title = g('mission.protein', { n: Math.round(m.target) });
      sub = g('sub.protein', { cur: Math.round(m.value), target: Math.round(m.target) });
      progress = m.target > 0 ? m.value / m.target : 0;
      break;
    case 'purine':
      title = g('mission.purine', { n: m.target });
      sub = g('sub.purine', { n: Math.round(m.value) });
      break;
    case 'salt':
      title = g('mission.salt', { n: m.target });
      sub = g('sub.salt', { n: m.value.toFixed(1) });
      break;
    case 'sugar':
      title = g('mission.sugar', { n: m.target });
      sub = g('sub.sugar', { n: Math.round(m.value) });
      break;
    case 'junk':
      title = g('mission.junk');
      sub = g('sub.junk', { n: m.value });
      break;
  }

  const suffix = m.status === 'holding' ? g('status.holding') : m.status === 'missed' ? g(statusKey) : '';
  return { title, subtitle: suffix ? `${sub} · ${suffix}` : sub, statusLabel: g(statusKey), progress };
}

/** The short figure inside a mission's ring on Camp: "~960", "60%", "460", "2.9"; null for a tick or an icon. */
export function missionRingValue(m: MissionResult, day: DayEvaluation): string | null {
  if (m.status === 'done') return null;
  switch (m.id) {
    case 'workout':
      return null;
    case 'deficit': {
      if (day.cheat || day.deficitKcal == null) return '—';
      const kcal = day.projectedDeficitKcal ?? day.deficitKcal;
      return `${day.projectedDeficitKcal != null ? '~' : ''}${Math.round(kcal)}`;
    }
    case 'protein':
      return m.target > 0 ? `${Math.min(999, Math.round((m.value / m.target) * 100))}%` : '—';
    case 'purine':
      return String(Math.round(m.value));
    case 'salt':
      return m.value.toFixed(1);
    case 'sugar':
      return String(Math.round(m.value));
    case 'junk':
      return String(m.value);
  }
}

/** How full a mission's ring is: progress towards a goal, or how much of a limit is used (0..1). */
export function missionRingRatio(m: MissionResult): number {
  if (m.status === 'done') return 1;
  if (m.target <= 0) return m.value > 0 ? 1 : 0;
  return Math.max(0, Math.min(1, m.value / m.target));
}

/** Missions about what was eaten: tapping one opens the day's journal; the link under it opens the cook book with this filter. */
export const MISSION_COOKBOOK: Partial<Record<MissionId, { quick: QuickId; label: GameKey }>> = {
  protein: { quick: 'fits', label: 'camp.missionCook.protein' },
  purine: { quick: 'lowPurine', label: 'camp.missionCook.purine' },
  salt: { quick: 'fits', label: 'camp.missionCook.fits' },
  sugar: { quick: 'fits', label: 'camp.missionCook.fits' },
  junk: { quick: 'fits', label: 'camp.missionCook.fits' },
};

/** The ring's short name under it on Camp. */
export const MISSION_SHORT: Record<MissionId, GameKey> = {
  workout: 'camp.mission.workout',
  deficit: 'camp.mission.deficit',
  protein: 'camp.mission.protein',
  purine: 'camp.mission.purine',
  salt: 'camp.mission.salt',
  sugar: 'camp.mission.sugar',
  junk: 'camp.mission.junk',
};
