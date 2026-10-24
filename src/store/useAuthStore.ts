import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthState {
  session: Session | null;
  initialized: boolean;
  /** Development-only offline session (see src/dev/devLogin.ts). While set, Supabase auth events are ignored and
   *  cloudSync treats the user as signed out, so nothing is read from or written to the backend. */
  devMode: boolean;
  init: () => void;
  enterDevMode: (session: Session) => void;
  leaveDevMode: () => void;
}

let listenerStarted = false;

export const useAuthStore = create<AuthState>()((set, get) => ({
  session: null,
  initialized: false,
  devMode: false,
  enterDevMode: (session) => set({ session, initialized: true, devMode: true }),
  leaveDevMode: () => set({ session: null, devMode: false }),
  init: () => {
    if (listenerStarted) return;
    listenerStarted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (get().devMode) return;
      set({ session: data.session, initialized: true });
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      if (get().devMode) return;
      set({ session, initialized: true });
    });
  },
}));
