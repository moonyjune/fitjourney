import { useMemo } from 'react';
import { useLimitsStore } from '../store/useLimitsStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { thresholdsFrom, type Thresholds } from './thresholds';

/** The numbers the analysis and the food comments judge against, from the user's own targets and daily limits. */
export function useThresholds(): Thresholds {
  const targetDailyDeficitKcal = useSettingsStore((s) => s.targetDailyDeficitKcal);
  const proteinTargetG = useSettingsStore((s) => s.proteinTargetG);
  const purineMg = useLimitsStore((s) => s.purineMg);
  const saltG = useLimitsStore((s) => s.saltG);
  const sugarG = useLimitsStore((s) => s.sugarG);
  return useMemo(
    () => thresholdsFrom({ targetDailyDeficitKcal, proteinTargetG, limits: { purineMg, saltG, sugarG } }),
    [targetDailyDeficitKcal, proteinTargetG, purineMg, saltG, sugarG]
  );
}
