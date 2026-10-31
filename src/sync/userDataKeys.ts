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
} as const;
