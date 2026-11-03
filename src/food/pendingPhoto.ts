/** A photo taken from the quick-add sheet ("Chụp món ăn"), handed to the Add food screen in memory: on web the picker returns a
 *  data URL far too long for a route param. The screen takes it once when it opens. */
let pending: string | null = null;

export function setPendingMealPhoto(uri: string | null): void {
  pending = uri;
}

/** The photo waiting for the Add food screen, if any; it is cleared as it is taken. */
export function takePendingMealPhoto(): string | null {
  const uri = pending;
  pending = null;
  return uri;
}
