/** The AI's accuracy as a clamped whole percent, or null when it gave none (or nonsense). */
export function accuracyOf(accuracyPercent: unknown): number | null {
  return typeof accuracyPercent === 'number' && Number.isFinite(accuracyPercent) ? Math.max(0, Math.min(100, Math.round(accuracyPercent))) : null;
}
