import { useSettingsStore } from '../store/useSettingsStore';
import { getIfStatus } from '../utils/intermittentFasting';
import { colors } from './tokens';

/** Green (eating window) / red (fasting window) ambient screen background for the Fatty/Client
 *  role, applied across every client tab — not just Today — so the IF status is always visible
 *  at a glance. Always reflects the real current time, regardless of which day a screen might be
 *  showing/editing (e.g. a backdated log entry). Coach mode always gets the neutral background. */
export function useAmbientBackground(): string {
  const role = useSettingsStore((s) => s.role);
  if (role !== 'client') return colors.background;
  const { isEatingWindow } = getIfStatus(new Date());
  return isEatingWindow ? colors.ifEatingBackground : colors.ifFastingBackground;
}
