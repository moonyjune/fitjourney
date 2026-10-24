/** Chart x-axis labels get unreadable with many points — only show every Nth label.
 *  `forceIndices` are always kept visible regardless of the step (e.g. a "today" marker that
 *  doesn't happen to land on a step multiple would otherwise silently lose its label), and so is
 *  the last index. A regular step-based label this close to one of those is dropped instead of
 *  rendered — otherwise two labels can land within a few pixels of each other and overlap into
 *  unreadable mush (e.g. "today" sitting right next to the next weekly-step label). */
export function thinLabels(labels: string[], maxVisible = 7, forceIndices: number[] = [], stepOverride?: number): string[] {
  if (!stepOverride && labels.length <= maxVisible) return labels;
  const step = stepOverride ?? Math.ceil(labels.length / maxVisible);
  const lastIndex = labels.length - 1;
  const pinned = new Set([...forceIndices.filter((i) => i >= 0 && i < labels.length), lastIndex]);
  const minGap = Math.max(1, step);

  const visible = new Set(pinned);
  for (let i = 0; i < labels.length; i += step) {
    if (visible.has(i)) continue;
    const tooClose = [...pinned].some((p) => Math.abs(p - i) < minGap);
    if (!tooClose) visible.add(i);
  }

  return labels.map((label, i) => (visible.has(i) ? label : ''));
}
