/** How many weeks a horizontal drag of the week strip moves: -1 (the week before) for a drag to the right, 1 (the next) for a drag to the left,
 *  0 when the drag was too short and slow to mean it. `dx` is the distance in px, `vx` the speed in px/ms at release. */
export function weekShiftFor(dx: number, vx: number): -1 | 0 | 1 {
  if (Math.abs(dx) <= 50 && Math.abs(vx) <= 0.6) return 0;
  if (dx === 0) return 0;
  return dx > 0 ? -1 : 1;
}
