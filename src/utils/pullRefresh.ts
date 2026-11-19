/* Pull-to-refresh maths (1.7): pure, so the web gesture in RefreshableScrollView can be tested. React Native's RefreshControl does
 * nothing on the web (the app runs mostly as a Home Screen web app), so the web pulls are tracked by hand from touch events. */

/** How far the content follows the finger: half the drag, so it feels heavy. */
export const PULL_RESISTANCE = 0.5;
/** Pulled this far (after resistance), letting go refreshes. */
export const PULL_TRIGGER = 64;
/** The furthest the indicator goes. */
export const PULL_MAX = 110;
/** A drag only becomes a pull when it is clearly downward (not a sideways day swipe). */
export const PULL_START_SLOP = 8;

export type PullPhase = 'idle' | 'pulling' | 'armed' | 'refreshing';

/** The indicator distance for a finger moved `dy` px down (dx sideways) from where it touched, when the list was at the top. */
export function pullDistance(dy: number, dx: number = 0): number {
  if (dy <= PULL_START_SLOP || Math.abs(dx) * 1.5 > dy) return 0;
  return Math.min(PULL_MAX, (dy - PULL_START_SLOP) * PULL_RESISTANCE);
}

/** The phase shown for a pull distance (refreshing wins). */
export function pullPhase(distance: number, refreshing: boolean): PullPhase {
  if (refreshing) return 'refreshing';
  if (distance <= 0) return 'idle';
  return distance >= PULL_TRIGGER ? 'armed' : 'pulling';
}

/** Whether letting go at this distance should refresh. */
export const releaseRefreshes = (distance: number): boolean => distance >= PULL_TRIGGER;
