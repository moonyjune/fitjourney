import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockFrom = jest.fn();
const mockSignOut = jest.fn(async () => ({ error: null }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() }, useFocusEffect: () => undefined }));
jest.mock('expo-status-bar', () => ({ setStatusBarStyle: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: (...a: unknown[]) => mockFrom(...a),
    auth: { signOut: () => mockSignOut(), getSession: async () => ({ data: { session: null } }), onAuthStateChange: jest.fn() },
  },
}));
jest.mock('@react-native-community/netinfo', () => ({ __esModule: true, default: { fetch: async () => ({ isConnected: true, isInternetReachable: true }), addEventListener: () => () => undefined } }));
jest.mock('../../utils/rememberedCredentials', () => ({
  loadRememberedCredentials: async () => null,
  saveRememberedCredentials: jest.fn(),
}));

import AuthScreen from '../../../app/auth';
import CampScreen from '../../../app/(tabs)/index';
import { signOutAndReset } from '../../auth/signOut';
import { DEV_USER_ID, enterDevMode } from '../../dev/devLogin';
import { pullProfile, pushWeightEntry } from '../../sync/cloudSync';
import { useAuthStore } from '../../store/useAuthStore';
import { useCelebrationStore } from '../../store/useCelebrationStore';
import { useNutritionStore } from '../../store/useNutritionStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useTrainingStore } from '../../store/useTrainingStore';
import { useWeightStore } from '../../store/useWeightStore';
import { useWorkoutStore } from '../../store/useWorkoutStore';

function allText(renderer: ReactTestRenderer): string {
  const parts: string[] = [];
  const walk = (node: unknown) => {
    if (node == null) return;
    if (typeof node === 'string') parts.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (typeof node === 'object') walk((node as { children?: unknown }).children);
  };
  walk(renderer.toJSON());
  return parts.join(' ');
}

describe('Dev login', () => {
  let renderer: ReactTestRenderer | undefined;
  beforeEach(() => {
    jest.clearAllMocks();
    useSettingsStore.setState({ language: 'vi' });
    useAuthStore.setState({ session: null, devMode: false });
  });
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('shows the Login Dev button on the sign-in screen and keeps forgot-password hidden', async () => {
    await act(async () => {
      renderer = create(<AuthScreen />);
    });
    const button = renderer!.root.findAll((n) => n.props.accessibilityLabel === 'Login Dev (dữ liệu mẫu)' && typeof n.props.onPress === 'function')[0];
    expect(button).toBeDefined();
    expect(allText(renderer!)).not.toContain('Quên mật khẩu');
  });

  it('pressing it signs in an offline dev user with three weeks of dummy data', async () => {
    await act(async () => {
      renderer = create(<AuthScreen />);
    });
    const button = renderer!.root.findAll((n) => n.props.accessibilityLabel === 'Login Dev (dữ liệu mẫu)' && typeof n.props.onPress === 'function')[0];
    await act(async () => button.props.onPress());
    expect(useAuthStore.getState().session?.user.id).toBe(DEV_USER_ID);
    expect(useAuthStore.getState().devMode).toBe(true);
    const settings = useSettingsStore.getState();
    expect(settings).toMatchObject({ clientSetupDone: true, roleChosen: true, role: 'client', lastUserId: DEV_USER_ID });
    expect(useWeightStore.getState().entries.length).toBeGreaterThan(8);
    expect(Object.keys(useNutritionStore.getState().logs).length).toBe(22);
    expect(useWorkoutStore.getState().entries.length).toBeGreaterThan(10);
    // Weight goes down over the three weeks, ending above the goal.
    const weights = useWeightStore.getState().entries.map((e) => e.weightKg);
    expect(weights[0]).toBeGreaterThan(weights[weights.length - 1]);
    expect(weights[weights.length - 1]).toBeGreaterThan(settings.goalWeightKg);
  });

  it('keeps the dev account offline: nothing is pushed to or pulled from the backend', async () => {
    enterDevMode();
    await pushWeightEntry({ id: 'x', dateISO: new Date().toISOString(), weightKg: 100 });
    expect(await pullProfile()).toBeNull();
    expect(mockFrom).not.toHaveBeenCalled();
    // Control: the same push for a real signed-in user does reach Supabase.
    useAuthStore.setState({ session: { user: { id: 'real-user' } } as never, devMode: false });
    mockFrom.mockReturnValue({ insert: async () => ({ error: null }), upsert: async () => ({ error: null }) });
    await pushWeightEntry({ id: 'y', dateISO: new Date().toISOString(), weightKg: 100 });
    expect(mockFrom).toHaveBeenCalled();
  });

  it('ignores Supabase auth events while in dev mode', () => {
    enterDevMode();
    expect(useAuthStore.getState().devMode).toBe(true);
    useAuthStore.getState().init();
    const listener = (jest.requireMock('../../lib/supabase') as { supabase: { auth: { onAuthStateChange: jest.Mock } } }).supabase.auth.onAuthStateChange.mock.calls[0]?.[0] as ((e: string, s: null) => void) | undefined;
    listener?.('SIGNED_OUT', null);
    expect(useAuthStore.getState().session?.user.id).toBe(DEV_USER_ID);
  });

  it('feeds the game screens without crashing and gives real progress', async () => {
    enterDevMode();
    useCelebrationStore.setState({ seenLevel: 1 });
    await act(async () => {
      renderer = create(<CampScreen />);
    });
    const text = allText(renderer!);
    expect(text).toMatch(/Cấp\s*\d+|CẤP\s*\d+/i);
    expect(useTrainingStore.getState().progress.chairSquat?.level).toBe(2);
  });

  it('signing out of the dev account wipes the dummy data without calling Supabase', async () => {
    enterDevMode();
    await signOutAndReset();
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject({ session: null, devMode: false });
    expect(useWeightStore.getState().entries).toHaveLength(0);
    expect(useNutritionStore.getState().logs).toEqual({});
    expect(useWorkoutStore.getState().entries).toHaveLength(0);
    expect(useTrainingStore.getState().progress).toEqual({});
    expect(useSettingsStore.getState()).toMatchObject({ clientSetupDone: false, roleChosen: false, lastUserId: null });
  });
});
