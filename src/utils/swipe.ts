/** How many weeks a horizontal drag of the week strip moves: -1 (the week before) for a drag to the right, 1 (the next) for a drag to the left,
 *  0 when the drag was too short and slow to mean it. `dx` is the distance in px, `vx` the speed in px/ms at release. */
export function weekShiftFor(dx: number, vx: number): -1 | 0 | 1 {
  if (Math.abs(dx) <= 50 && Math.abs(vx) <= 0.6) return 0;
  if (dx === 0) return 0;
  return dx > 0 ? -1 : 1;
}

/** Whether a drag is clearly sideways enough to be a day/week swipe rather than a vertical scroll (or a tap that wobbled). */
export function isSidewaysDrag(dx: number, dy: number): boolean {
  return Math.abs(dx) > 16 && Math.abs(dx) > Math.abs(dy) * 2;
}

/** The day a horizontal swipe of the journal's day view goes to: a swipe to the right shows the day before, one to the left the next day,
 *  never past `todayKey` nor before `minKey` (both "YYYY-MM-DD"). Null when the drag was too short and slow, or there is no such day. */
export function swipedDayKey(currentKey: string, dx: number, vx: number, todayKey: string, minKey?: string): string | null {
  const step = weekShiftFor(dx, vx);
  if (step === 0) return null;
  const [y, m, d] = currentKey.split('-').map(Number);
  const date = new Date(y, m - 1, d + step, 12, 0);
  const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  if (key > todayKey) return null;
  if (minKey && key < minKey) return null;
  return key;
}
