import { useMemo } from 'react';
import { getDayType } from '../constants/plan';
import { useMealModeStore } from '../store/useMealModeStore';
import { useNutritionStore } from '../store/useNutritionStore';
import { usePlanStore } from '../store/usePlanStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useWaterWindowStore } from '../store/useWaterWindowStore';
import type { PlanData, WaterCheckpoint } from '../types';
import { toDateKey } from '../utils/date';
import { eatingStartHour } from '../utils/mealMode';
import { buildWaterSchedule, dayWaterTargetMl, planAnchors } from './schedule';

export interface WaterPlan {
  /** The day's own target (stored on its log), else the current setting. */
  targetMl: number;
  schedule: WaterCheckpoint[];
}

interface WaterPlanInput {
  targetMl: number;
  date: Date;
  plan: Pick<PlanData, 'mealTemplates' | 'workoutTemplates'>;
  startMinutes: number;
  endMinutes: number;
  fasting: boolean;
  language: 'vi' | 'en';
}

/** The plan of one day: drinks from the target and the window, named after that day's meals and workouts. */
export function waterPlanFor({ targetMl, date, plan, startMinutes, endMinutes, fasting, language }: WaterPlanInput): WaterPlan {
  const dayType = getDayType(date);
  const anchors = planAnchors(plan.mealTemplates[dayType] ?? [], plan.workoutTemplates, dayType === 'training');
  return { targetMl, schedule: buildWaterSchedule(targetMl, { startMinutes, endMinutes, anchors, fasting, eatingStartHour: eatingStartHour(fasting), language }) };
}

/** Today's plan from the stores, outside React (reminders); `plan` names the drinks after its meals (default: the stored plan). */
export function currentWaterPlan(now: Date = new Date(), plan: WaterPlanInput['plan'] = usePlanStore.getState().plan): WaterPlan {
  const settings = useSettingsStore.getState();
  const window = useWaterWindowStore.getState();
  return waterPlanFor({
    targetMl: dayWaterTargetMl(useNutritionStore.getState().logs[toDateKey(now)], settings.waterTargetMl),
    date: now,
    plan,
    startMinutes: window.startMinutes,
    endMinutes: window.endMinutes,
    fasting: useMealModeStore.getState().fasting,
    language: settings.language,
  });
}

/** The water plan of the day `dateKey` (YYYY-MM-DD): a past day keeps the target it was lived under. */
export function useWaterPlan(dateKey: string): WaterPlan {
  const storedTarget = useNutritionStore((s) => s.logs[dateKey]?.waterTargetMl);
  const settingTarget = useSettingsStore((s) => s.waterTargetMl);
  const language = useSettingsStore((s) => s.language);
  const startMinutes = useWaterWindowStore((s) => s.startMinutes);
  const endMinutes = useWaterWindowStore((s) => s.endMinutes);
  const fasting = useMealModeStore((s) => s.fasting);
  const mealTemplates = usePlanStore((s) => s.plan.mealTemplates);
  const workoutTemplates = usePlanStore((s) => s.plan.workoutTemplates);
  const targetMl = dayWaterTargetMl({ waterTargetMl: storedTarget }, settingTarget);
  return useMemo(() => {
    const [y, m, d] = dateKey.split('-').map(Number);
    return waterPlanFor({ targetMl, date: new Date(y, m - 1, d, 12), plan: { mealTemplates, workoutTemplates }, startMinutes, endMinutes, fasting, language });
  }, [targetMl, dateKey, mealTemplates, workoutTemplates, startMinutes, endMinutes, fasting, language]);
}
