import { useMemo } from 'react';
import type { ClientSnapshot } from '../../coach/clientSnapshot';
import { buildDayEvaluator } from '../../game/dayEvaluator';
import { deficitLevel, type DeficitLevel } from '../../game/deficitLevel';
import type { DayEvaluation } from '../../game/missions';
import { computeGameState, type GameState } from '../../game/state';
import { useDayEvaluator, useGameState, useTdeeKcal } from '../../game/useGameState';
import { useAuthStore } from '../../store/useAuthStore';
import { useCheatDayStore } from '../../store/useCheatDayStore';
import { useFeelingStore } from '../../store/useFeelingStore';
import { useNutritionStore } from '../../store/useNutritionStore';
import { usePlanStore } from '../../store/usePlanStore';
import { useProofStore } from '../../store/useProofStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useWeightStore } from '../../store/useWeightStore';
import { useWorkoutStore } from '../../store/useWorkoutStore';
import { toDateKey } from '../../utils/date';
import { computeCurrentStreak } from '../../utils/streak';

/** Whose journal is shown: the signed-in user's own records, or a coach's read-only view of a client's. The Week and Month tabs read
 *  everything from here so both look the same for either. */
export function useJournalSubject(client: ClientSnapshot | undefined, now: Date) {
  const ownLogs = useNutritionStore((s) => s.logs);
  const ownWorkouts = useWorkoutStore((s) => s.entries);
  const ownWeights = useWeightStore((s) => s.entries);
  const ownProofs = useProofStore((s) => s.photos);
  const ownFeelings = useFeelingStore((s) => s.records);
  const ownSettings = useSettingsStore();
  const ownMealTemplates = usePlanStore((s) => s.plan.mealTemplates);
  const ownCheatDays = useCheatDayStore((s) => s.days);
  const ownTdee = useTdeeKcal();
  const session = useAuthStore((s) => s.session);
  const ownEvaluate = useDayEvaluator(now);
  const ownGame = useGameState(now);

  const logs = client?.logs ?? ownLogs;
  const workouts = client?.workouts ?? ownWorkouts;
  const weights = client?.weights ?? ownWeights;
  const proofs = client?.photos ?? ownProofs;
  const feelings = client?.feelings ?? ownFeelings;
  const settings = client?.settings ?? ownSettings;
  const mealTemplates = client?.plan.mealTemplates ?? ownMealTemplates;
  // Cheat days are the user's own marks (a coach's view has none).
  const cheatDays = useMemo(() => (client ? [] : ownCheatDays), [client, ownCheatDays]);
  const tdeeKcal = client?.tdeeKcal ?? ownTdee;
  const subjectId = client?.clientId ?? session?.user.id;
  const deficitTarget = settings.targetDailyDeficitKcal;

  const minuteStamp = Math.floor(now.getTime() / 60_000);
  const evaluate = useMemo<(dateKey: string) => DayEvaluation>(
    () =>
      client
        ? buildDayEvaluator({
            now: new Date(minuteStamp * 60_000),
            logs: client.logs,
            workouts: client.workouts,
            mealTemplatesByDayType: client.plan.mealTemplates,
            tdeeKcal: client.tdeeKcal,
            proteinTargetG: client.settings.proteinTargetG,
            limits: client.limits,
          })
        : ownEvaluate,
    [client, minuteStamp, ownEvaluate]
  );

  // The weekly bosses (this week's and every week before) and the campfire streak, the client's worked out the same way.
  const game = useMemo<Pick<GameState, 'boss' | 'bossHistory'> & { streak: number }>(() => {
    if (!client) return ownGame;
    const at = new Date(minuteStamp * 60_000);
    const state = computeGameState({
      now: at,
      startDateISO: client.settings.startDateISO,
      logs: client.logs,
      workoutEntries: client.workouts,
      mealTemplatesByDayType: client.plan.mealTemplates,
      tdeeKcal: client.tdeeKcal,
      proteinTargetG: client.settings.proteinTargetG,
      limits: client.limits,
      targetDeficitKcal: client.settings.targetDailyDeficitKcal,
    });
    return { ...state, streak: computeCurrentStreak(client.logs, client.plan.mealTemplates, client.workouts, client.tdeeKcal, at, [], state.today.settled) };
  }, [client, minuteStamp, ownGame]);

  /** A day's deficit level: the exercise splits off the deficit from eating (warned about above 1500), the TDEE sets the whole-day warning. */
  const levelOf = (dateKey: string, deficit: number | null | undefined): DeficitLevel | null =>
    deficitLevel(deficit, deficitTarget, cheatDays.includes(dateKey), { burnedKcal: evaluate(dateKey).burnedKcal, tdeeKcal });

  return {
    client,
    readOnly: !!client,
    now,
    todayKey: toDateKey(now),
    logs,
    workouts,
    weights,
    proofs,
    feelings,
    settings,
    mealTemplates,
    cheatDays,
    tdeeKcal,
    subjectId,
    deficitTarget,
    evaluate,
    levelOf,
    boss: game.boss,
    bossHistory: game.bossHistory,
    streak: game.streak,
  };
}

export type JournalSubject = ReturnType<typeof useJournalSubject>;
