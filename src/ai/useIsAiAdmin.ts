import { useEffect, useState } from 'react';
import { fetchIsAiAdmin } from '../sync/cloudSync';
import { useAuthStore } from '../store/useAuthStore';

/** Answers already fetched, per account, so the check runs once per sign-in rather than every time a screen opens. */
const known = new Map<string, boolean>();

/** Test helper: forget what was fetched. */
export function resetIsAiAdminCache(): void {
  known.clear();
}

/** Is the signed-in account on the server's list allowed to see the "AI & cost" screen? False until the server says yes
 *  (and always false for the offline dev account), so the entry stays hidden if anything goes wrong. */
export function useIsAiAdmin(): boolean {
  const userId = useAuthStore((s) => s.session?.user.id ?? null);
  const devMode = useAuthStore((s) => s.devMode);
  const [admin, setAdmin] = useState<boolean>(() => (userId ? known.get(userId) ?? false : false));

  useEffect(() => {
    if (!userId || devMode) {
      setAdmin(false);
      return;
    }
    const cached = known.get(userId);
    if (cached !== undefined) {
      setAdmin(cached);
      return;
    }
    let cancelled = false;
    fetchIsAiAdmin().then((yes) => {
      known.set(userId, yes);
      if (!cancelled) setAdmin(yes);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, devMode]);

  return admin && !!userId && !devMode;
}
