import { useSettingsStore } from '../store/useSettingsStore';
import { colors, ROLE_ACCENTS } from './tokens';

/** The shared palette with `primary`/`primaryDark`/`primaryLight` swapped for the current role's accent. */
export function useAccentColors() {
  const role = useSettingsStore((s) => s.role);
  return { ...colors, ...ROLE_ACCENTS[role] };
}
