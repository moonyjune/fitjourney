/** Chart x-axis labels get unreadable with many points — only show every Nth label. */
export function thinLabels(labels: string[], maxVisible = 7): string[] {
  if (labels.length <= maxVisible) return labels;
  const step = Math.ceil(labels.length / maxVisible);
  return labels.map((label, i) => (i % step === 0 || i === labels.length - 1 ? label : ''));
}
