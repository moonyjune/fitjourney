export type RegionStatus = 'done' | 'current' | 'locked';

export interface Region {
  index: number;
  /** Key suffix for the region name: 1..6, or `summit` for the last region (the goal itself). */
  nameKey: string;
  /** Weight at the start of the region (the higher one). */
  fromKg: number;
  /** Weight at the gate out of the region (the lower one). */
  toKg: number;
  isSummit: boolean;
  status: RegionStatus;
  /** 0..1 progress from `fromKg` toward `toKg` (1 when done, 0 when locked). */
  progress: number;
}

/**
 * Region boundaries use the same rule as the Weight tab's milestones (buildWeightLossMilestones):
 * clean multiples of 5 kg below the start weight, ending exactly at the goal — so the map and the
 * chart can never disagree about where a checkpoint is.
 */
export function regionBoundaries(startKg: number, goalKg: number): number[] {
  if (goalKg >= startKg) return [startKg, goalKg];
  const bounds = [startKg];
  let target = Math.floor(startKg / 5) * 5;
  if (target >= startKg) target -= 5;
  while (target > goalKg) {
    bounds.push(target);
    target -= 5;
  }
  bounds.push(goalKg);
  return bounds;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Splits the journey into regions and says which one the player is in at `currentKg`. */
export function buildRegions(startKg: number, goalKg: number, currentKg: number): Region[] {
  const bounds = regionBoundaries(startKg, goalKg);
  const regions: Region[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const fromKg = bounds[i];
    const toKg = bounds[i + 1];
    const isSummit = i === bounds.length - 2;
    let status: RegionStatus;
    if (currentKg <= toKg) status = 'done';
    else if (i === 0 || currentKg <= fromKg) status = 'current';
    else status = 'locked';
    const span = fromKg - toKg;
    const progress = status === 'done' ? 1 : status === 'locked' ? 0 : span > 0 ? clamp01((fromKg - currentKg) / span) : 1;
    regions.push({ index: i, nameKey: isSummit ? 'summit' : String(Math.min(i + 1, 6)), fromKg, toKg, isSummit, status, progress });
  }
  return regions;
}

/** The region the player is in now (the first one that is not finished), or the last when all are. */
export function currentRegion(regions: Region[]): Region | undefined {
  return regions.find((r) => r.status === 'current') ?? regions[regions.length - 1];
}
