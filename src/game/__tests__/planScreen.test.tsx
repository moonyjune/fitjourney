import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
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

import PlanScreen from '../../../app/plan';
import PlanMenuScreen from '../../../app/plan-menu';
import AccountSettingsScreen from '../../../app/settings/account';
import { useToastStore } from '../../store/useToastStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useSettingsStore } from '../../store/useSettingsStore';

describe('Plan screen (FitJourney)', () => {
  let renderer: ReactTestRenderer | undefined;
  const render = async (element: React.ReactElement = <PlanScreen />) => {
    let r!: ReactTestRenderer;
    await act(async () => {
      r = create(element);
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
    useToastStore.setState({ toast: null });
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
  });

  it('goes back from the header button', async () => {
    const r = await render();
    await press(r, 'Back');
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('saves edited goals to settings with a toast that can undo it', async () => {
    const r = await render();
    await type(r, 'Goal weight (kg)', '75');
    await press(r, 'Save goals');
    expect(useSettingsStore.getState().goalWeightKg).toBe(75);
    expect(useToastStore.getState().toast?.text).toBe('Goals saved');
    await act(async () => useToastStore.getState().undo());
    expect(useSettingsStore.getState().goalWeightKg).toBe(80);
    expect(field(r, 'Goal weight (kg)').props.value).toBe('80');
  });

  it('rejects an empty goal field with a red line under it and leaves settings untouched', async () => {
    const r = await render();
    await type(r, 'Goal weight (kg)', '');
    await press(r, 'Save goals');
    expect(useSettingsStore.getState().goalWeightKg).toBe(80);
    expect(allText(r)).toContain('Enter a number above 0');
    expect(useToastStore.getState().toast).toBeNull();
  });

  it('keeps only goals, body, start date, the way to the menu and the AI assistant (no language, reminders, coach or sign-out)', async () => {
    const text = allText(await render());
    expect(text).toContain('Goals & plan');
    expect(text).toContain('Start date');
    expect(text).toContain('Menu & workouts');
    for (const gone of ['Language', 'Sign out', "Enter your coach's code to link accounts"]) expect(text).not.toContain(gone);
  });

  it('opens the menu, workouts and shopping list page', async () => {
    const r = await render();
    await press(r, r.root.findAll((n) => String(n.props.accessibilityLabel ?? '').startsWith('Menu & workouts:'))[0].props.accessibilityLabel);
    expect(mockRouter.push).toHaveBeenCalledWith('/plan-menu');
    const menu = allText(await render(<PlanMenuScreen />));
    expect(menu).toContain('SHOPPING LIST');
    expect(menu).toContain('FOOD SWAPS');
  });

  it('changes the start date in a sheet, with undo', async () => {
    useSettingsStore.setState({ startDateISO: '2026-09-03T08:00:00.000Z' });
    const r = await render();
    const row = r.root.findAll((n) => String(n.props.accessibilityLabel ?? '').startsWith('Start date:'))[0];
    await act(async () => row.props.onPress());
    const today = r.root.findAll((n) => typeof n.props.onPress === 'function' && n.findAll((c) => c.props.children === 'Today').length > 0)[0];
    await act(async () => today.props.onPress());
    await press(r, 'Save');
    expect(useSettingsStore.getState().startDateISO).not.toBe('2026-09-03T08:00:00.000Z');
    await act(async () => useToastStore.getState().undo());
    expect(useSettingsStore.getState().startDateISO).toBe('2026-09-03T08:00:00.000Z');
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

  it('switches language (Coach & account page)', async () => {
    const r = await render(<AccountSettingsScreen />);
    await act(async () => {
      r.root.findAll((n) => n.props.accessibilityRole === 'tab' && n.props.accessibilityLabel === 'Tiếng Việt')[0].props.onPress();
    });
    expect(useSettingsStore.getState().language).toBe('vi');
  });

  it('shows the server message when linking a coach fails, and clears nothing', async () => {
    mockLink.mockResolvedValue({ ok: false, message: 'Mã không đúng' });
    const r = await render(<AccountSettingsScreen />);
    await type(r, 'Coach code', 'zz99');
    await press(r, 'Connect');
    expect(mockLink).toHaveBeenCalledWith('zz99');
    expect(allText(r)).toContain('Mã không đúng');
    expect(field(r, 'Coach code').props.value).toBe('zz99');
  });

  it('shows the linked coach: email, code and since when, and offers no second link', async () => {
    useSettingsStore.setState({ coachId: 'c1', linkedCoachEmail: 'coach@fit.io', linkedCoachCode: 'AB12CD', linkedCoachSinceISO: '2026-10-05T03:00:00.000Z' });
    const r = await render(<AccountSettingsScreen />);
    const text = allText(r);
    expect(text).toContain('Coach email');
    expect(text).toContain('coach@fit.io');
    expect(text).toContain('AB12CD');
    expect(text).toContain('05/10/2026');
    expect(text).toContain('one Coach only');
    expect(field(r, 'Coach code')).toBeUndefined();
  });

  it('says so when the linked coach details are not loaded yet', async () => {
    useSettingsStore.setState({ coachId: 'c1' });
    expect(allText(await render(<AccountSettingsScreen />))).toContain('Not loaded yet');
  });

  it('shows no coach details and the code field when not linked', async () => {
    const text = allText(await render(<AccountSettingsScreen />));
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

  it('is a stack page now: the last row ends clear of the home indicator (inset 34 + 24)', async () => {
    const r = await render();
    const scroll = r.root.findAll((n) => n.props.contentContainerStyle != null)[0];
    const flat = Object.assign({}, ...[scroll.props.contentContainerStyle].flat(3).filter(Boolean));
    expect(flat.paddingBottom).toBe(58);
  });

  it('signs out from the Coach & account page, after the confirm box', async () => {
    const r = await render(<AccountSettingsScreen />);
    expect(allText(r)).toContain('me@x.io');
    await press(r, 'Sign out');
    expect(mockSignOut).not.toHaveBeenCalled();
    const box = r.root.findAll((n) => n.props.testID === 'sign-out-confirm')[0];
    const buttons = box.findAll((n) => n.props.accessibilityLabel === 'Sign out' && typeof n.props.onPress === 'function');
    await act(async () => buttons[buttons.length - 1].props.onPress());
    expect(mockSignOut).toHaveBeenCalled();
  });
});
