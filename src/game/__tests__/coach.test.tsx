import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) };
const mockFetchClients = jest.fn<() => Promise<unknown[]>>();
const mockSignOut = jest.fn();

jest.mock('expo-router', () => ({
  router: {
    push: (...a: unknown[]) => mockRouter.push(...a),
    replace: (...a: unknown[]) => mockRouter.replace(...a),
    back: () => mockRouter.back(),
    canGoBack: () => mockRouter.canGoBack(),
  },
  useFocusEffect: (cb: () => void) => {
    // Run once after mount, like a screen coming into focus.
    const React = require('react');
    React.useEffect(cb, []);
  },
}));
jest.mock('expo-status-bar', () => ({ setStatusBarStyle: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../../lib/supabase', () => ({ supabase: { auth: { signOut: jest.fn() } } }));
jest.mock('../../auth/signOut', () => ({ signOutAndReset: () => mockSignOut() }));
jest.mock('../../sync/cloudSync', () => ({
  fetchCoachClients: () => mockFetchClients(),
  pushNutritionLog: jest.fn(),
  pushWorkoutEntry: jest.fn(),
  pushWeightEntry: jest.fn(),
  pushProfile: jest.fn(),
  pushPlan: jest.fn(),
  pullPlan: jest.fn(),
  pullProfile: jest.fn(),
  ensureCoachCode: jest.fn(),
  linkToCoach: jest.fn(),
}));

import ClientsScreen from '../../../app/(tabs)/clients';
import CoachAccountScreen from '../../../app/(tabs)/coach-account';
import { QuestTabBar } from '../../components/quest/QuestTabBar';
import { useAuthStore } from '../../store/useAuthStore';
import { useSettingsStore } from '../../store/useSettingsStore';

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

describe('Coach mode screens', () => {
  let renderer: ReactTestRenderer | undefined;
  const render = async (el: React.ReactElement) => {
    let r!: ReactTestRenderer;
    await act(async () => {
      r = create(el);
    });
    renderer = r;
    return r;
  };
  const pressByLabel = (r: ReactTestRenderer, match: (l: string) => boolean) =>
    r.root.findAll((n) => typeof n.props.onPress === 'function' && typeof n.props.accessibilityLabel === 'string' && match(n.props.accessibilityLabel))[0];

  beforeEach(() => {
    Object.values(mockRouter).forEach((m) => m.mockClear());
    mockSignOut.mockClear();
    mockFetchClients.mockReset().mockResolvedValue([]);
    useSettingsStore.setState({ language: 'vi', coachCode: 'AB12CD', role: 'coach' });
    useAuthStore.setState({ session: { user: { id: 'c', email: 'coach@x.io' } } as never });
  });
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('lists clients with their weight, goal and change since the start, and opens one', async () => {
    mockFetchClients.mockResolvedValue([
      { id: 'u1', email: 'an@x.io', latestWeightKg: 106.2, startWeightKg: 110, goalWeightKg: 95 },
      { id: 'u2', email: null, latestWeightKg: null, startWeightKg: null, goalWeightKg: null },
      { id: 'u3', email: 'binh@x.io', latestWeightKg: 91, startWeightKg: 90, goalWeightKg: 80 },
    ]);
    const r = await render(<ClientsScreen />);
    const text = allText(r);
    expect(text).toContain('AB12CD');
    expect(text).toContain('Học viên (3)');
    expect(text).toContain('106.2 kg');
    expect(text).toContain('-3.8 kg'); // 106.2 - 110
    expect(text).toContain('+1.0 kg'); // a client who gained is shown honestly
    expect(text).toContain('Chưa có cân nặng');
    act(() => pressByLabel(r, (l) => l.startsWith('an@x.io')).props.onPress());
    expect(mockRouter.push).toHaveBeenCalledWith('/client/u1');
    // A client without an email falls back to the id, never an empty row.
    expect(pressByLabel(r, (l) => l.startsWith('u2'))).toBeDefined();
  });

  it('tells a new coach to share the code when there are no clients', async () => {
    const r = await render(<ClientsScreen />);
    expect(allText(r)).toContain('Chưa có học viên nào liên kết');
  });

  it('account: shows the code, switches to Fatty mode, changes language and signs out', async () => {
    const switchToClient = jest.fn();
    useSettingsStore.setState({ switchToClientMode: switchToClient as never, clientSetupDone: true });
    const r = await render(<CoachAccountScreen />);
    expect(allText(r)).toContain('AB12CD');
    expect(allText(r)).toContain('coach@x.io');
    await act(async () => {
      pressByLabel(r, (l) => l === 'Chuyển sang chế độ Fatty').props.onPress();
    });
    expect(switchToClient).toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)');
    await act(async () => {
      r.root.findAll((n) => n.props.accessibilityRole === 'tab' && n.props.accessibilityLabel === 'English')[0].props.onPress();
    });
    expect(useSettingsStore.getState().language).toBe('en');
    await act(async () => {
      pressByLabel(r, (l) => l === 'Sign out').props.onPress();
    });
    expect(mockSignOut).toHaveBeenCalled();
  });

  describe('coach tab bar', () => {
    const navigate = jest.fn();
    const emit = jest.fn(() => ({ defaultPrevented: false }));
    const bar = async (coach: boolean) => {
      const routes = ['index', 'workout', 'map', 'profile', 'clients', 'coach-account', 'plan'].map((name) => ({ key: `${name}-k`, name }));
      const hidden = new Set(coach ? ['index', 'workout', 'map', 'profile', 'plan'] : ['clients', 'coach-account', 'plan']);
      const descriptors: Record<string, { options: object }> = {};
      for (const r of routes) descriptors[r.key] = { options: hidden.has(r.name) ? { tabBarItemStyle: { display: 'none' } } : {} };
      const props = { state: { index: coach ? 4 : 0, routes }, descriptors, navigation: { navigate, emit }, insets: { top: 0, bottom: 0, left: 0, right: 0 }, coach };
      return render(<QuestTabBar {...(props as unknown as React.ComponentProps<typeof QuestTabBar>)} />);
    };

    it('shows only Clients and Account, with no + button, for a coach', async () => {
      const r = await bar(true);
      const tabs = [...new Set(r.root.findAll((n) => n.props.accessibilityRole === 'tab').map((n) => n.props.accessibilityLabel))];
      expect(tabs).toEqual(['Học viên', 'Tài khoản']);
      expect(r.root.findAll((n) => n.props.accessibilityLabel === 'Ghi nhanh')).toHaveLength(0);
    });

    it('is unchanged for a warrior: four tabs and the + button', async () => {
      const r = await bar(false);
      const tabs = [...new Set(r.root.findAll((n) => n.props.accessibilityRole === 'tab').map((n) => n.props.accessibilityLabel))];
      expect(tabs).toEqual(['Trại', 'Tập', 'Bản đồ', 'Hồ sơ']);
      expect(r.root.findAll((n) => n.props.accessibilityRole === 'button' && n.props.accessibilityLabel === 'Ghi nhanh').length).toBeGreaterThan(0);
    });
  });
});
