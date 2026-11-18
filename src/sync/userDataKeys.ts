/** Keys of the `user_data` table: the user's own settings that live in device stores and are saved to the cloud so they survive signing out. */
export const USER_DATA_KEYS = {
  learnNotes: 'learnNotes',
  uricTarget: 'uricTarget',
  foodDb: 'foodDb',
  limits: 'limits',
  mealMode: 'mealMode',
  mealPrefs: 'mealPrefs',
  cookbook: 'cookbook',
  analysisMode: 'analysisMode',
  cheatDays: 'cheatDays',
  /** Meals the user marked as skipped on purpose, per day (no longer missing or still to come). */
  skippedMeals: 'skippedMeals',
  /** Cheat day place searches (history) and starred places. */
  cheatPlaces: 'cheatPlaces',
  temptation: 'temptation',
  waterWindow: 'waterWindow',
  bossTalk: 'bossTalk',
  /** Dish pictures the player reported wrong ("Ảnh sai?", 1.5): hidden for them on every device. */
  hiddenPhotos: 'hiddenPhotos',
} as const;
