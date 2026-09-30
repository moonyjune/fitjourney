/** Chart x-axis labels get unreadable with many points — only show every Nth label.
 *  `forceIndices` are always kept visible regardless of the step (e.g. a "today" marker that
 *  doesn't happen to land on a step multiple would otherwise silently lose its label). */
export function thinLabels(labels: string[], maxVisible = 7, forceIndices: number[] = []): string[] {
  if (labels.length <= maxVisible) return labels;
  const step = Math.ceil(labels.length / maxVisible);
  const forced = new Set(forceIndices);
  return labels.map((label, i) => (i % step === 0 || i === labels.length - 1 || forced.has(i) ? label : ''));
}
