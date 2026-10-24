import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

type Result = { data?: unknown; error?: { code?: string; message?: string } | null };
// What the fake `profiles` table does on each call; tests queue results.
const reads: Result[] = [];
const updates: Result[] = [];
const updatePayloads: Record<string, unknown>[] = [];
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) };

jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockRouter.push(...a), replace: (...a: unknown[]) => mockRouter.replace(...a) },
  useFocusEffect: () => undefined,
}));
jest.mock('expo-status-bar', () => ({ setStatusBarStyle: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: async () => ({ isConnected: true, isInternetReachable: true }), addEventListener: () => () => undefined },
}));
jest.mock('../../auth/signOut', () => ({ signOutAndReset: jest.fn() }));
jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: { signOut: jest.fn() },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => reads.shift() ?? { data: null, error: null } }) }),
      update: (payload: Record<string, unknown>) => {
        updatePayloads.push(payload);
        const chain: Record<string, unknown> = {};
        chain.eq = () => chain;
        chain.is = () => chain;
        chain.select = async () => updates.shift() ?? { data: [], error: null };
        return chain;
      },
    }),
  },
}));

import CoachAccountScreen from '../../../app/(tabs)/coach-account';
import { useAuthStore } from '../../store/useAuthStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { ensureCoachCode } from '../../sync/cloudSync';

const signIn = () => useAuthStore.setState({ session: { user: { id: 'u1', email: 'c@x.vn' } } as never, devMode: false });

describe('coach code belongs to the account', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    reads.length = 0;
    updates.length = 0;
    updatePayloads.length = 0;
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    signIn();
    useSettingsStore.setState({ language: 'vi', role: 'coach', coachCode: null, coachEnabled: false, clientSetupDone: false });
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns the code already stored on the account and never writes a new one', async () => {
    reads.push({ data: { coach_code: 'KEEP22' } });
    expect(await ensureCoachCode()).toBe('KEEP22');
    expect(updatePayloads).toHaveLength(0);
  });

  it('creates a 6-character code the first time, and marks the profile as coach', async () => {
    reads.push({ data: { coach_code: null } });
    updates.push({ data: [{ coach_code: 'x' }], error: null });
    const code = await ensureCoachCode();
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
    expect(updatePayloads[0]).toMatchObject({ role: 'coach', coach_code: code });
  });

  it('retries with a fresh code when another account already has that one (unique violation)', async () => {
    reads.push({ data: { coach_code: null } });
    updates.push({ error: { code: '23505' } }, { error: { code: '23505' } }, { data: [{ coach_code: 'x' }], error: null });
    const code = await ensureCoachCode();
    expect(updatePayloads).toHaveLength(3);
    expect(code).toBe(updatePayloads[2].coach_code);
    expect(new Set(updatePayloads.map((p) => p.coach_code)).size).toBeGreaterThan(1);
  });

  it('does not show a code that was not saved (update matched no row)', async () => {
    reads.push({ data: { coach_code: null } }, { data: null });
    updates.push({ data: [], error: null });
    expect(await ensureCoachCode()).toBeNull();
  });

  it('adopts the code another device saved first instead of overwriting it', async () => {
    reads.push({ data: { coach_code: null } }, { data: { coach_code: 'OTHER9' } });
    updates.push({ data: [], error: null });
    expect(await ensureCoachCode()).toBe('OTHER9');
  });

  it('gives up with null on a non-collision error', async () => {
    reads.push({ data: { coach_code: null } });
    updates.push({ error: { code: '42501', message: 'rls' } });
    expect(await ensureCoachCode()).toBeNull();
    expect(updatePayloads).toHaveLength(1);
  });

  it('the settings store keeps an existing local code and does not call the backend again', async () => {
    useSettingsStore.setState({ coachCode: 'MINE55' });
    expect(await useSettingsStore.getState().ensureOwnCoachCode()).toBe('MINE55');
    expect(updatePayloads).toHaveLength(0);
  });

  it('switching to Coach mode for the first time creates the code automatically', async () => {
    reads.push({ data: { coach_code: null } });
    updates.push({ data: [{ coach_code: 'x' }], error: null });
    useSettingsStore.setState({ role: 'client' });
    await useSettingsStore.getState().switchToCoachMode();
    const s = useSettingsStore.getState();
    expect(s.role).toBe('coach');
    expect(s.coachEnabled).toBe(true);
    expect(s.coachCode).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
  });

  describe('Coach account screen', () => {
    let renderer: ReactTestRenderer | undefined;
    afterEach(() => {
      act(() => renderer?.unmount());
      renderer = undefined;
    });
    const text = () => JSON.stringify(renderer!.toJSON());

    it('fetches the code by itself when none is stored and shows it', async () => {
      reads.push({ data: { coach_code: 'AUTO77' } });
      await act(async () => {
        renderer = create(<CoachAccountScreen />);
      });
      expect(text()).toContain('AUTO77');
      expect(useSettingsStore.getState().coachCode).toBe('AUTO77');
    });

    it('shows an error with a retry button when it cannot be fetched, and the retry works', async () => {
      reads.push({ error: { message: 'offline' } });
      await act(async () => {
        renderer = create(<CoachAccountScreen />);
      });
      expect(text()).toContain('Chưa lấy được mã Coach');
      reads.push({ data: { coach_code: 'BACK88' } });
      const retry = renderer!.root.findAll((n) => n.props.accessibilityLabel === 'Thử lại' && typeof n.props.onPress === 'function')[0];
      await act(async () => retry.props.onPress());
      expect(text()).toContain('BACK88');
      expect(text()).not.toContain('Chưa lấy được mã Coach');
    });
  });
});
