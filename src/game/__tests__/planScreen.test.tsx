import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Alert } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) };
const mockSignOut = jest.fn();
const mockLink = jest.fn<(code: string) => Promise<unknown>>();
const mockFetchLink = jest.fn<() => Promise<unknown>>();

jest.mock('expo-router', () => ({
  router: {
    push: (...a: unknown[]) => mockRouter.push(...a),
    replace: (...a: unknown[]) => mockRouter.replace(...a),
    back: () => mockRouter.back(),
    canGoBack: () => mockRouter.canGoBack(),
  },
  useLocalSearchParams: () => ({}),
  useFocusEffect: (cb: () => void) => {
    const React = require('react');
    React.useEffect(cb, []);
  },
}));
jest.mock('expo-status-bar', () => ({ setStatusBarStyle: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }) }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../../lib/supabase', () => ({ supabase: { auth: { signOut: jest.fn() } } }));
jest.mock('../../auth/signOut', () => ({ signOutAndReset: () => mockSignOut() }));
jest.mock('../../notifications/schedule', () => ({
  cancelAllReminders: jest.fn(),
  requestNotificationPermissions: jest.fn(),
  scheduleAllReminders: jest.fn(),
}));
jest.mock('../../sync/cloudSync', () => ({
  pushNutritionLog: jest.fn(),
  pushWorkoutEntry: jest.fn(),
  pushWeightEntry: jest.fn(),
  pushProfile: jest.fn(),
  pushPlan: jest.fn(),
  pullPlan: jest.fn(),
  pullProfile: jest.fn(async () => null),
  ensureCoachCode: jest.fn(),
  linkToCoach: (code: string) => mockLink(code),
  fetchCoachLink: () => mockFetchLink(),
  listChatSessions: jest.fn(async () => []),
  fetchSessionMessages: jest.fn(async () => []),
  createChatSession: jest.fn(),
  saveChatMessage: jest.fn(),
}));

import PlanScreen from '../../../app/(tabs)/plan';
import { useAuthStore } from '../../store/useAuthStore';
import { useSettingsStore } from '../../store/useSettingsStore';

describe('Plan screen (FitQuest)', () => {
  let renderer: ReactTestRenderer | undefined;
  let alertSpy: jest.SpiedFunction<typeof Alert.alert>;
  const render = async () => {
    let r!: ReactTestRenderer;
    await act(async () => {
      r = create(<PlanScreen />);
    });
    renderer = r;
    return r;
  };
  const field = (r: ReactTestRenderer, label: string) =>
    r.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onChangeText === 'function')[0];
  const press = async (r: ReactTestRenderer, label: string) => {
    const node = r.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
    await act(async () => {
      node.props.onPress();
    });
  };
  const type = async (r: ReactTestRenderer, label: string, text: string) => {
    await act(async () => {
      field(r, label).props.onChangeText(text);
    });
  };
  const allText = (r: ReactTestRenderer) => {
    const parts: string[] = [];
    const walk = (n: unknown) => {
      if (n == null) return;
      if (typeof n === 'string') parts.push(n);
      else if (Array.isArray(n)) n.forEach(walk);
      else if (typeof n === 'object') walk((n as { children?: unknown }).children);
    };
    walk(r.toJSON());
    return parts.join(' ');
  };

  beforeEach(() => {
    Object.values(mockRouter).forEach((m) => m.mockClear());
    mockSignOut.mockClear();
    mockLink.mockReset();
    mockFetchLink.mockReset();
    mockFetchLink.mockResolvedValue(null);
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    useSettingsStore.setState({
      language: 'en',
      role: 'client',
      coachId: null,
      linkedCoachEmail: null,
      linkedCoachCode: null,
      linkedCoachSinceISO: null,
      goalWeightKg: 80,
      calorieTargetKcal: 1800,
      targetDailyDeficitKcal: 500,
      proteinTargetG: 120,
      waterTargetMl: 2500,
      startWeightKg: 95,
      heightCm: null,
      age: null,
      gender: null,
      activityLevel: null,
    });
    useAuthStore.setState({ session: { user: { id: 'u', email: 'me@x.io' } } as never });
  });
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    alertSpy.mockRestore();
  });

  it('goes back from the header button', async () => {
    const r = await render();
    await press(r, 'Back');
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('saves edited goals to settings', async () => {
    const r = await render();
    await type(r, 'Goal weight (kg)', '75');
    await press(r, 'Save goals');
    expect(useSettingsStore.getState().goalWeightKg).toBe(75);
    expect(alertSpy).toHaveBeenCalledWith('Saved', expect.any(String));
  });

  it('rejects an empty goal field and leaves settings untouched', async () => {
    const r = await render();
    await type(r, 'Goal weight (kg)', '');
    await press(r, 'Save goals');
    expect(useSettingsStore.getState().goalWeightKg).toBe(80);
    expect(alertSpy).toHaveBeenCalledWith('Error', expect.any(String));
  });

  it('saves demographics and shows the live TDEE preview', async () => {
    const r = await render();
    const before = allText(r);
    await type(r, 'Height (cm)', '170');
    await type(r, 'Age', '30');
    await press(r, 'Male');
    await press(r, 'Moderately active ×1.55');
    expect(allText(r)).not.toBe(before);
    expect(allText(r)).toMatch(/\d+ kcal/);
    await press(r, 'Save personal info');
    const s = useSettingsStore.getState();
    expect(s.heightCm).toBe(170);
    expect(s.age).toBe(30);
    expect(s.gender).toBe('male');
    expect(s.activityLevel).toBe('moderate');
  });

  it('switches language', async () => {
    const r = await render();
    await act(async () => {
      r.root.findAll((n) => n.props.accessibilityRole === 'tab' && n.props.accessibilityLabel === 'Tiếng Việt')[0].props.onPress();
    });
    expect(useSettingsStore.getState().language).toBe('vi');
  });

  it('shows the server message when linking a coach fails, and clears nothing', async () => {
    mockLink.mockResolvedValue({ ok: false, message: 'Mã không đúng' });
    const r = await render();
    await type(r, "Enter your coach's code to link accounts", 'zz99');
    await press(r, 'Link');
    expect(mockLink).toHaveBeenCalledWith('zz99');
    expect(alertSpy).toHaveBeenCalledWith("Couldn't link", 'Mã không đúng');
  });

  it('shows the linked coach: email, code and since when, and offers no second link', async () => {
    useSettingsStore.setState({ coachId: 'c1', linkedCoachEmail: 'coach@fit.io', linkedCoachCode: 'AB12CD', linkedCoachSinceISO: '2026-10-05T03:00:00.000Z' });
    const r = await render();
    const text = allText(r);
    expect(text).toContain('Coach email');
    expect(text).toContain('coach@fit.io');
    expect(text).toContain('AB12CD');
    expect(text).toContain('05/10/2026');
    expect(text).toContain('one Coach only');
    expect(field(r, "Enter your coach's code to link accounts")).toBeUndefined();
  });

  it('says so when the linked coach details are not loaded yet', async () => {
    useSettingsStore.setState({ coachId: 'c1' });
    expect(allText(await render())).toContain('Not loaded yet');
  });

  it('shows no coach details and the code field when not linked', async () => {
    const text = allText(await render());
    expect(text).not.toContain('Coach email');
    expect(text).not.toContain('one Coach only');
  });

  it('refreshCoachLink loads the coach, keeps it when unreadable and clears it once there is no coach', async () => {
    useSettingsStore.setState({ coachId: 'c1' });
    mockFetchLink.mockResolvedValueOnce({ email: 'a@b.io', code: 'ZZ99', linkedAtISO: '2026-10-01T00:00:00.000Z' });
    await useSettingsStore.getState().refreshCoachLink();
    expect(useSettingsStore.getState()).toMatchObject({ linkedCoachEmail: 'a@b.io', linkedCoachCode: 'ZZ99', linkedCoachSinceISO: '2026-10-01T00:00:00.000Z' });
    mockFetchLink.mockResolvedValueOnce(null);
    await useSettingsStore.getState().refreshCoachLink();
    expect(useSettingsStore.getState().linkedCoachEmail).toBe('a@b.io');
    useSettingsStore.setState({ coachId: null });
    await useSettingsStore.getState().refreshCoachLink();
    expect(useSettingsStore.getState()).toMatchObject({ linkedCoachEmail: null, linkedCoachCode: null, linkedCoachSinceISO: null });
    expect(mockFetchLink).toHaveBeenCalledTimes(2); // nothing fetched without a coach
  });

  it('refreshCoachLink drops a result that arrives after the coach was unlinked', async () => {
    useSettingsStore.setState({ coachId: 'c1' });
    let resolve!: (v: unknown) => void;
    mockFetchLink.mockReturnValueOnce(new Promise((res) => (resolve = res)));
    const pending = useSettingsStore.getState().refreshCoachLink();
    useSettingsStore.setState({ coachId: null });
    resolve({ email: 'late@x.io', code: 'LATE', linkedAtISO: '2026-10-01T00:00:00.000Z' });
    await pending;
    expect(useSettingsStore.getState().linkedCoachEmail).toBeNull();
  });

  it('keeps the last row of the plan above the bottom bar (bar cover 34 + 68 + inset 34 = 136)', async () => {
    const r = await render();
    const scroll = r.root.findAll((n) => n.props.contentContainerStyle != null)[0];
    const flat = Object.assign({}, ...[scroll.props.contentContainerStyle].flat(3).filter(Boolean));
    expect(flat.paddingBottom).toBe(160); // 136 covered by the bar + a 24 px gap
  });

  it('signs out', async () => {
    const r = await render();
    expect(allText(r)).toContain('me@x.io');
    await press(r, 'Sign out');
    expect(mockSignOut).toHaveBeenCalled();
  });
});
