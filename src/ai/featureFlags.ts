/** Switches for parts of the AI that can be turned off without removing them. Change a value here and rebuild to flip it. */
export const aiFlags = {
  /** AI for coaches: the weekly digest of clients (clients tab) and the AI assistant that edits a client's plan (client page).
   *  Off for now. The Edge Functions have their own matching switch (`AI_COACH_ENABLED=1`), so turning it on needs both. */
  aiForCoach: false,
};
