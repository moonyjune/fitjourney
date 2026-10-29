/** "HH:MM" of a moment, in local time; empty for a missing or invalid one. */
export function clockOf(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Which meal and when, for photo viewers and meal details: "Tối · 19:30", or whichever of the two is known. */
export function mealCaption(mealLabel: string | null | undefined, iso?: string): string {
  return [mealLabel?.trim(), clockOf(iso)].filter(Boolean).join(' · ');
}
