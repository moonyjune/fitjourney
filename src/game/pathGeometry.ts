export interface Pt {
  x: number;
  y: number;
}
export type Cubic = [Pt, Pt, Pt, Pt];

/** The winding trail drawn on the map (viewBox 0 0 362 440), start at the bottom, gate at the top.
 *  Taken from the FitQuest map design: M60 400 C200 400 300 360 250 300 S80 240 120 190 C160 140 300 110 290 50
 *  with the smooth-curve (S) control point written out. */
export const MAP_TRAIL: Cubic[] = [
  [{ x: 60, y: 400 }, { x: 200, y: 400 }, { x: 300, y: 360 }, { x: 250, y: 300 }],
  [{ x: 250, y: 300 }, { x: 200, y: 240 }, { x: 80, y: 240 }, { x: 120, y: 190 }],
  [{ x: 120, y: 190 }, { x: 160, y: 140 }, { x: 300, y: 110 }, { x: 290, y: 50 }],
];

function cubicAt([p0, p1, p2, p3]: Cubic, t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

/** Samples a chain of cubic Béziers into a polyline (shared endpoints are not duplicated). */
export function sampleCubics(segments: Cubic[], perSegment = 48): Pt[] {
  const points: Pt[] = [];
  segments.forEach((seg, s) => {
    for (let i = s === 0 ? 0 : 1; i <= perSegment; i++) points.push(cubicAt(seg, i / perSegment));
  });
  return points;
}

function lengths(points: Pt[]): { cumulative: number[]; total: number } {
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    cumulative.push(cumulative[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  }
  return { cumulative, total: cumulative[cumulative.length - 1] };
}

/** Point at fraction `t` (0..1) of the polyline's *length*, so equal weight steps look equally far apart. */
export function pointAt(points: Pt[], t: number): Pt {
  if (points.length === 0) return { x: 0, y: 0 };
  const { cumulative, total } = lengths(points);
  const target = Math.max(0, Math.min(1, t)) * total;
  let i = 1;
  while (i < points.length - 1 && cumulative[i] < target) i++;
  const span = cumulative[i] - cumulative[i - 1];
  const f = span > 0 ? (target - cumulative[i - 1]) / span : 0;
  return { x: points[i - 1].x + (points[i].x - points[i - 1].x) * f, y: points[i - 1].y + (points[i].y - points[i - 1].y) * f };
}

/** The first `t` of the polyline by length, ending exactly at `pointAt(points, t)`. */
export function pointsUpTo(points: Pt[], t: number): Pt[] {
  if (points.length < 2 || t <= 0) return points.length ? [points[0]] : [];
  if (t >= 1) return points;
  const { cumulative, total } = lengths(points);
  const target = t * total;
  const out: Pt[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    if (cumulative[i] < target) out.push(points[i]);
    else break;
  }
  out.push(pointAt(points, t));
  return out;
}

export function toPolylinePoints(points: Pt[]): string {
  return points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}
