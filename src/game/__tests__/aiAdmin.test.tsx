import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) };
jest.mock('expo-router', () => ({
  router: {
    push: (...a: unknown[]) => mockRouter.push(...a),
    replace: (...a: unknown[]) => mockRouter.replace(...a),
    back: () => mockRouter.back(),
    canGoBack: () => mockRouter.canGoBack(),
  },
  useFocusEffect: () => undefined,
  useLocalSearchParams: () => ({}),
}));
jest.mock('expo-status-bar', () => ({ setStatusBarStyle: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('../../lib/supabase', () => ({ supabase: { auth: { signOut: jest.fn() } } }));

const mockIsAdmin = jest.fn<() => Promise<boolean>>();
const mockByDay = jest.fn<(...a: unknown[]) => Promise<unknown>>();
const mockByUser = jest.fn<(...a: unknown[]) => Promise<unknown>>();
const mockUsage = jest.fn<(...a: unknown[]) => Promise<unknown>>();
const mockSettings = jest.fn<() => Promise<Record<string, string> | null>>();
const mockSave = jest.fn<(...a: unknown[]) => Promise<{ ok: true } | { ok: false; message: string }>>();
jest.mock('../../sync/cloudSync', () => ({
  fetchAiSettings: () => mockSettings(),
  saveAiSetting: (...a: unknown[]) => mockSave(...a),
  fetchIsAiAdmin: () => mockIsAdmin(),
  fetchAiAdminByDay: (...a: unknown[]) => mockByDay(...a),
  fetchAiAdminByUser: (...a: unknown[]) => mockByUser(...a),
  fetchAiUsageToday: (...a: unknown[]) => mockUsage(...a),
}));

import AiAdminScreen from '../../../app/ai-admin';
import { resetIsAiAdminCache, useIsAiAdmin } from '../../ai/useIsAiAdmin';
import { tokensText, usdText } from '../../components/quest/AiUsageCard';
import { useAuthStore } from '../../store/useAuthStore';
import { useSettingsStore } from '../../store/useSettingsStore';

const signIn = (id = 'u1', devMode = false) => useAuthStore.setState({ session: { user: { id, email: 'x@y.z' } } as never, devMode });
function allText(r: ReactTestRenderer): string {
  const parts: string[] = [];
  const walk = (n: unknown) => {
    if (n == null) return;
    if (typeof n === 'string') parts.push(n);
    else if (Array.isArray(n)) n.forEach(walk);
    else if (typeof n === 'object') walk((n as { children?: unknown }).children);
  };
  walk(r.toJSON());
  return parts.join(' ');
}

const DAYS = [
  { day: '2026-10-26', users: 3, calls: 40, tokensIn: 100000, tokensOut: 20000, costUsd: 0.6 },
  { day: '2026-10-25', users: 2, calls: 10, tokensIn: 30000, tokensOut: 5000, costUsd: 0.0042 },
];
const USERS = [
  { userId: 'aaaaaaaa-1', email: 'owner@example.com', calls: 30, tokensIn: 80000, tokensOut: 15000, costUsd: 0.45 },
  { userId: 'bbbbbbbb-2', email: null, calls: 10, tokensIn: 20000, tokensOut: 5000, costUsd: 0.15 },
];

describe('formatting', () => {
  it('shows tokens as 950 / 12.4k and tiny dollar amounts with 3 decimals', () => {
    expect(tokensText(950)).toBe('950');
    expect(tokensText(12_400)).toBe('12.4k');
    expect(tokensText(120_000)).toBe('120.0k');
    expect(usdText(0.6)).toBe('$0.60');
    expect(usdText(0.0042)).toBe('$0.004');
    expect(usdText(0)).toBe('$0.00');
  });
});

describe('useIsAiAdmin', () => {
  let renderer: ReactTestRenderer | undefined;
  let seen: boolean[] = [];
  function Probe() {
    seen.push(useIsAiAdmin());
    return null;
  }
  const mount = async () => {
    await act(async () => {
      renderer = create(<Probe />);
    });
  };
  beforeEach(() => {
    jest.clearAllMocks();
    resetIsAiAdminCache();
    seen = [];
    signIn();
  });
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('is false until the server says yes, then true; asks only once per account', async () => {
    mockIsAdmin.mockResolvedValue(true);
    await mount();
    expect(seen[0]).toBe(false);
    expect(seen[seen.length - 1]).toBe(true);
    act(() => renderer?.unmount());
    await mount();
    expect(mockIsAdmin).toHaveBeenCalledTimes(1);
    expect(seen[seen.length - 1]).toBe(true);
  });

  it('stays false when the server says no, and for the offline dev account without asking', async () => {
    mockIsAdmin.mockResolvedValue(false);
    await mount();
    expect(seen.every((v) => v === false)).toBe(true);
    act(() => renderer?.unmount());
    resetIsAiAdminCache();
    signIn('dev-user-0000', true);
    seen = [];
    mockIsAdmin.mockClear();
    mockIsAdmin.mockResolvedValue(true);
    await mount();
    expect(seen.every((v) => v === false)).toBe(true);
    expect(mockIsAdmin).not.toHaveBeenCalled();
  });

  it('never reports admin in dev mode even when that account id was answered yes before', async () => {
    mockIsAdmin.mockResolvedValue(true);
    await mount();
    expect(seen[seen.length - 1]).toBe(true);
    seen = [];
    await act(async () => signIn('u1', true));
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((v) => v === false)).toBe(true);
  });

  it('does not carry one account\'s answer over to another, and is false when signed out', async () => {
    mockIsAdmin.mockResolvedValueOnce(true);
    await mount();
    expect(seen[seen.length - 1]).toBe(true);
    mockIsAdmin.mockResolvedValueOnce(false);
    await act(async () => signIn('u2'));
    expect(seen[seen.length - 1]).toBe(false);
    await act(async () => useAuthStore.setState({ session: null }));
    expect(seen[seen.length - 1]).toBe(false);
  });
});

describe('AI & cost screen', () => {
  let renderer: ReactTestRenderer | undefined;
  const mount = async () => {
    await act(async () => {
      renderer = create(<AiAdminScreen />);
    });
    return renderer!;
  };
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-26T10:00:00Z'), doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    jest.clearAllMocks();
    resetIsAiAdminCache();
    signIn();
    useSettingsStore.setState({ language: 'vi' });
    mockIsAdmin.mockResolvedValue(true);
    mockByDay.mockResolvedValue(DAYS);
    mockByUser.mockResolvedValue(USERS);
    mockUsage.mockResolvedValue([{ feature: 'photo', calls: 3, tokensIn: 9000, tokensOut: 2100, costUsd: 0.06 }]);
    mockSettings.mockResolvedValue({ model: 'claude-sonnet-5-5', price_in: '3' });
    mockSave.mockResolvedValue({ ok: true });
  });
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    jest.useRealTimers();
  });

  it('shows no figures to an account that is not an admin, and never asks the server for them', async () => {
    mockIsAdmin.mockResolvedValue(false);
    const r = await mount();
    expect(allText(r)).toContain('chưa được cấp quyền');
    expect(mockByDay).not.toHaveBeenCalled();
    expect(mockByUser).not.toHaveBeenCalled();
    expect(mockUsage).not.toHaveBeenCalled();
    expect(mockSettings).not.toHaveBeenCalled(); // the model setting is for admins only
  });

  it('for an admin: own use today, the app-wide days with the running total, and today per user', async () => {
    const r = await mount();
    const text = allText(r);
    expect(mockByDay).toHaveBeenCalledWith('2026-10-26', 14); // Vietnam day = UTC+7 → still the 26th at 17:00 local
    expect(mockByUser).toHaveBeenCalledWith('2026-10-26');
    expect(text).toContain('Phân tích ảnh: 3/15');
    expect(text).toContain('Cộng dồn: 50 lượt · 155.0k token · ≈ $0.60');
    expect(text).toContain('3 người · 40 lượt · 120.0k token · $0.60');
    expect(text).toContain('2 người · 10 lượt · 35.0k token · $0.004');
    expect(text).toContain('owner@example.com');
    expect(text).toContain('bbbbbbbb'); // no email: the start of the id
    expect(text).toContain('30 lượt · 95.0k token · $0.45');
  });

  it('uses the Vietnam day: just after 17:00 UTC it is already the next day', async () => {
    jest.setSystemTime(new Date('2026-10-26T18:30:00Z'));
    await mount();
    expect(mockByDay).toHaveBeenCalledWith('2026-10-27', 14);
  });

  it('tapping a day loads that day per user', async () => {
    const r = await mount();
    const row = r.root.findAll((n) => typeof n.props.onPress === 'function' && String(n.props.accessibilityLabel ?? '').startsWith('2026-10-25'))[0];
    await act(async () => row.props.onPress());
    expect(mockByUser).toHaveBeenLastCalledWith('2026-10-25');
    expect(allText(r)).toContain('Theo người dùng ngày 2026-10-25');
  });

  it('says so when the figures cannot be loaded or there are none', async () => {
    mockByDay.mockResolvedValue(null);
    mockByUser.mockResolvedValue([]);
    const r = await mount();
    expect(allText(r)).toContain('Chưa tải được số liệu');
    expect(allText(r)).toContain('Chưa có lượt dùng AI.');
  });

  describe('Model setting', () => {
    const input = (r: ReactTestRenderer, label: string) => r.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onChangeText === 'function')[0];
    const press = (r: ReactTestRenderer, label: string) => r.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label)[0];
    const saveButton = (r: ReactTestRenderer) => r.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.title === 'Lưu')[0];

    it('shows the saved model and price, and the model choices', async () => {
      const r = await mount();
      expect(input(r, 'Model (tên gọi trong API)').props.value).toBe('claude-sonnet-5-5');
      expect(input(r, 'Giá vào (USD / 1 triệu token)').props.value).toBe('3');
      expect(press(r, 'claude-opus-5-5')).toBeDefined();
    });

    it('tapping a model and saving sends model and both prices to the server', async () => {
      const r = await mount();
      await act(async () => press(r, 'claude-haiku-5-5').props.onPress());
      await act(async () => input(r, 'Giá ra (USD / 1 triệu token)').props.onChangeText('5,5'));
      await act(async () => saveButton(r).props.onPress());
      expect(mockSave.mock.calls).toEqual([
        ['model', 'claude-haiku-5-5'],
        ['price_in', '3'],
        ['price_out', '5.5'],
      ]);
      expect(allText(r)).toContain('Đã lưu');
    });

    it('does not send an invalid model name or price', async () => {
      const r = await mount();
      await act(async () => input(r, 'Model (tên gọi trong API)').props.onChangeText('Bad Model!'));
      await act(async () => saveButton(r).props.onPress());
      expect(mockSave).not.toHaveBeenCalled();
      expect(allText(r)).toContain('Tên model không hợp lệ');
      await act(async () => input(r, 'Model (tên gọi trong API)').props.onChangeText('claude-sonnet-5-5'));
      await act(async () => input(r, 'Giá vào (USD / 1 triệu token)').props.onChangeText('abc'));
      await act(async () => saveButton(r).props.onPress());
      expect(mockSave).not.toHaveBeenCalled();
      expect(allText(r)).toContain('Giá không hợp lệ');
    });

    it('says why when the server refuses, and when the settings cannot be read', async () => {
      mockSave.mockResolvedValue({ ok: false, message: 'Không có quyền đổi.' });
      const r = await mount();
      await act(async () => saveButton(r).props.onPress());
      expect(allText(r)).toContain('Không lưu được: Không có quyền đổi.');
      await act(async () => renderer?.unmount());
      mockSettings.mockResolvedValue(null);
      const r2 = await mount();
      expect(allText(r2)).toContain('Không đọc được cài đặt');
    });
  });
});
