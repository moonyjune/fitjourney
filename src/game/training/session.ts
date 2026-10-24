import { EXERCISE_BY_ID, prescriptionFor, type ExerciseId, type Level, type Unit } from './exercises';

export interface SessionStep {
  id: ExerciseId;
  level: Level;
  sets: number;
  amount: number;
  unit: Unit;
  perSide: boolean;
  restSec: number;
}

export type SessionPhase = 'work' | 'rest' | 'done';

export interface SessionState {
  steps: SessionStep[];
  /** Position of the set being done (or just done, while resting the pointer already points at the next one). */
  step: number;
  set: number;
  phase: SessionPhase;
  /** Reps counted in the current set (rep-based exercises only). */
  count: number;
  /** Rest length of the rest phase in progress. */
  restSec: number;
  /** Sets finished per step. */
  setsDone: number[];
}

export function buildSteps(items: { id: ExerciseId; level: Level }[]): SessionStep[] {
  return items.map(({ id, level }) => {
    const p = prescriptionFor(id, level);
    return { id, level, sets: p.sets, amount: p.amount, unit: p.unit, perSide: !!p.perSide, restSec: EXERCISE_BY_ID[id].restSec };
  });
}

export function startSession(steps: SessionStep[]): SessionState {
  return { steps, step: 0, set: 0, phase: steps.length ? 'work' : 'done', count: 0, restSec: 0, setsDone: steps.map(() => 0) };
}

export type SessionAction =
  | { type: 'addRep' }
  | { type: 'removeRep' }
  /** Sets the rep counter to an exact value — used by the timed auto count, which owns the clock. */
  | { type: 'setCount'; count: number }
  | { type: 'finishSet' }
  | { type: 'skipRest' };

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'addRep':
      return state.phase === 'work' ? { ...state, count: state.count + 1 } : state;
    case 'removeRep':
      return state.phase === 'work' ? { ...state, count: Math.max(0, state.count - 1) } : state;
    case 'setCount':
      return state.phase === 'work' ? { ...state, count: Math.max(0, Math.round(action.count)) } : state;
    case 'finishSet': {
      if (state.phase !== 'work') return state;
      const current = state.steps[state.step];
      const setsDone = state.setsDone.map((n, i) => (i === state.step ? n + 1 : n));
      const lastSet = state.set + 1 >= current.sets;
      const lastStep = state.step + 1 >= state.steps.length;
      if (lastSet && lastStep) return { ...state, setsDone, phase: 'done', count: 0 };
      return {
        ...state,
        setsDone,
        phase: 'rest',
        restSec: current.restSec,
        step: lastSet ? state.step + 1 : state.step,
        set: lastSet ? 0 : state.set + 1,
        count: 0,
      };
    }
    case 'skipRest':
      return state.phase === 'rest' ? { ...state, phase: 'work', restSec: 0 } : state;
    default:
      return state;
  }
}

export function totalSets(steps: SessionStep[]): number {
  return steps.reduce((s, x) => s + x.sets, 0);
}

export function totalSetsDone(state: SessionState): number {
  return state.setsDone.reduce((s, n) => s + n, 0);
}

/** 0..1 across the whole session, for the segmented progress bar. */
export function sessionProgress(state: SessionState): number {
  const total = totalSets(state.steps);
  return total === 0 ? 1 : totalSetsDone(state) / total;
}
