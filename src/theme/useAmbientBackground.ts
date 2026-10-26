import { useMealModeStore } from '../store/useMealModeStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { getIfStatus } from '../utils/intermittentFasting';
import { colors } from './tokens';

/** Green (eating window) / red (fasting window) ambient screen background for the Fatty/Client
 *  role, applied across every client tab — not just Today — so the IF status is always visible
 *  at a glance. Always reflects the real current time, regardless of which day a screen might be
 *  showing/editing (e.g. a backdated log entry). Coach mode always gets the neutral background. */
export function useAmbientBackground(): string {
  const role = useSettingsStore((s) => s.role);
  const fasting = useMealModeStore((s) => s.fasting);
  if (role !== 'client') return colors.background;
  // Without fasting there is no window to show: the day is always an eating day.
  if (!fasting) return colors.ifEatingBackground;
  const { isEatingWindow } = getIfStatus(new Date());
  return isEatingWindow ? colors.ifEatingBackground : colors.ifFastingBackground;
}
