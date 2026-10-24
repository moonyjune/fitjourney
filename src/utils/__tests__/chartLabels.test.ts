import { describe, expect, it } from '@jest/globals';
import { thinLabels } from '../chartLabels';

function labelsOf(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `d${i}`);
}

describe('thinLabels', () => {
  it('returns all labels unchanged when there are fewer than maxVisible and no stepOverride', () => {
    expect(thinLabels(labelsOf(5), 7)).toEqual(labelsOf(5));
  });

  it('thins to every Nth label by default, always keeping the last', () => {
    const result = thinLabels(labelsOf(15), 7);
    expect(result[0]).toBe('d0');
    expect(result[14]).toBe('d14');
    expect(result.filter((l) => l !== '').length).toBeLessThan(15);
  });

  it('always keeps forced indices visible even off the regular step', () => {
    const result = thinLabels(labelsOf(31), 7, [0, 13, 30]);
    expect(result[13]).toBe('d13');
  });

  it("regression: a forced index does not silently vanish under a stepOverride either", () => {
    // This is the exact shape of the weight chart's 2-month range bug: ~21 grid points, a
    // calendar-week stepOverride of 2, and "today" forced at an arbitrary index.
    const result = thinLabels(labelsOf(21), 7, [0, 9, 20], 2);
    expect(result[9]).toBe('d9');
  });

  it('regression: drops a regular-step label that would land within half a step of a forced one, instead of rendering both and overlapping', () => {
    // step=2 here; a regular label at index 10 is only 1 away from the forced "today" at index 9 —
    // too close to coexist legibly, so the regular one must be suppressed in favor of the forced one.
    const result = thinLabels(labelsOf(21), 7, [0, 9, 20], 2);
    expect(result[9]).toBe('d9'); // forced "today" wins
    expect(result[10]).toBe(''); // the regular-step neighbor that would have collided is dropped
  });

  it('never drops two pinned indices even if they end up adjacent (start/today/end only, never thinned)', () => {
    // today == last index (plan's range already elapsed) is a legitimate case; both must show.
    const result = thinLabels(labelsOf(10), 7, [0, 9], 2);
    expect(result[0]).toBe('d0');
    expect(result[9]).toBe('d9');
  });

  it('keeps every visible label at least half a step away from every other visible label', () => {
    const result = thinLabels(labelsOf(40), 7, [0, 17, 39], 3);
    const visibleIndices = result.map((l, i) => (l !== '' ? i : -1)).filter((i) => i >= 0);
    for (let a = 0; a < visibleIndices.length; a++) {
      for (let b = a + 1; b < visibleIndices.length; b++) {
        const gap = Math.abs(visibleIndices[a] - visibleIndices[b]);
        // Pinned indices (0, 17, 39) are exempt from the spacing rule against each other.
        const bothPinned = [0, 17, 39].includes(visibleIndices[a]) && [0, 17, 39].includes(visibleIndices[b]);
        if (!bothPinned) expect(gap).toBeGreaterThanOrEqual(Math.ceil(3 / 2));
      }
    }
  });
});
