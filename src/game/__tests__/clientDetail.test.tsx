import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Alert } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockRouter = { replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) };
const mockPushFeedback = jest.fn<(...a: unknown[]) => Promise<{ ok: boolean; message: string }>>();
const mockFetchFeedback = jest.fn<(...a: unknown[]) => Promise<unknown[]>>();

jest.mock('expo-router', () => ({
  router: { replace: (...a: unknown[]) => mockRouter.replace(...a), back: () => mockRouter.back(), canGoBack: () => mockRouter.canGoBack() },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ id: 'client-1' }),
  useFocusEffect: (cb: () => void) => {
    const React = require('react');
    React.useEffect(cb, []);
  },
}));
jest.mock('expo-status-bar', () => ({ setStatusBarStyle: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const mockTables: Record<string, unknown> = {
  profiles: { start_weight_kg: '110' },
  weight_entries: { weight_kg: '106.2' },
  nutrition_logs: [],
  proof_photos: [],
  workout_entries: [],
};
jest.mock('../../lib/supabase', () => {
  const builder = (table: string) => {
    const b: Record<string, unknown> = {};
    const result = () => ({ data: mockTables[table] });
    for (const m of ['select', 'eq', 'order', 'limit']) b[m] = () => b;
    b.maybeSingle = () => Promise.resolve(result());
    b.then = (res: (v: unknown) => unknown) => Promise.resolve(result()).then(res);
    return b;
  };
  return { supabase: { from: (t: string) => builder(t), storage: { from: () => ({ createSignedUrl: async () => ({ data: null }) }) } } };
});
jest.mock('../../sync/cloudSync', () => ({
  fetchFeedback: (...a: unknown[]) => mockFetchFeedback(...a),
  pushCoachFeedback: (...a: unknown[]) => mockPushFeedback(...a),
  pullPlan: async () => null,
  pushPlan: jest.fn(),
  createChatSession: jest.fn(),
  fetchSessionMessages: async () => [],
  listChatSessions: async () => [],
  saveChatMessage: jest.fn(),
}));

import ClientDetail from '../../../app/client/[id]';
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

async function mount(): Promise<ReactTestRenderer> {
  let r!: ReactTestRenderer;
  await act(async () => {
    r = create(<ClientDetail />);
  });
  await act(async () => {});
  return r;
}

const byLabel = (r: ReactTestRenderer, label: string) =>
  r.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function' || (n.props.accessibilityLabel === label && typeof n.props.onChangeText === 'function'))[0];

describe('Coach client detail', () => {
  let renderer: ReactTestRenderer | undefined;
  beforeEach(() => {
    jest.clearAllMocks();
    useSettingsStore.setState({ language: 'vi' });
    mockFetchFeedback.mockResolvedValue([]);
    mockPushFeedback.mockResolvedValue({ ok: true, message: '' });
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    jest.restoreAllMocks();
  });

  it('shows weight, the weight change and the empty proofs state', async () => {
    renderer = await mount();
    const text = allText(renderer);
    expect(text).toContain('106.2 kg');
    expect(text).toContain('-3.8');
    expect(text).toContain('Chưa có ảnh minh chứng nào.');
  });

  it('goes back, falling back to the client list when there is no history', async () => {
    renderer = await mount();
    await act(async () => byLabel(renderer!, 'Quay lại').props.onPress());
    expect(mockRouter.back).toHaveBeenCalled();
    mockRouter.canGoBack.mockReturnValueOnce(false);
    await act(async () => byLabel(renderer!, 'Quay lại').props.onPress());
    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/clients');
  });

  it('refuses to send empty feedback', async () => {
    renderer = await mount();
    await act(async () => {
      byLabel(renderer!, 'Gửi nhận xét').props.onPress();
    });
    expect(mockPushFeedback).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalled();
  });

  it('sends feedback for the chosen period and reloads the list', async () => {
    renderer = await mount();
    await act(async () => {
      byLabel(renderer!, 'Theo tháng').props.onPress();
    });
    const input = renderer.root.findAll((n) => typeof n.props.onChangeText === 'function' && n.props.multiline)[0];
    await act(async () => input.props.onChangeText('  Giỏi lắm  '));
    mockFetchFeedback.mockResolvedValue([
      { id: 'f1', periodLabel: 'Tháng 10', periodType: 'monthly', feedbackText: 'Giỏi lắm', createdAtISO: new Date().toISOString() },
    ]);
    await act(async () => {
      byLabel(renderer!, 'Gửi nhận xét').props.onPress();
    });
    expect(mockPushFeedback).toHaveBeenCalledWith('client-1', 'monthly', expect.stringContaining('10'), 'Giỏi lắm');
    expect(allText(renderer)).toContain('Giỏi lắm');
  });

  it('reports a failed feedback send and keeps the draft', async () => {
    mockPushFeedback.mockResolvedValue({ ok: false, message: 'Mất mạng' });
    renderer = await mount();
    const input = renderer.root.findAll((n) => typeof n.props.onChangeText === 'function' && n.props.multiline)[0];
    await act(async () => input.props.onChangeText('Cố lên'));
    await act(async () => {
      byLabel(renderer!, 'Gửi nhận xét').props.onPress();
    });
    expect(Alert.alert).toHaveBeenCalledWith(expect.any(String), 'Mất mạng');
    const again = renderer.root.findAll((n) => typeof n.props.onChangeText === 'function' && n.props.multiline)[0];
    expect(again.props.value).toBe('Cố lên');
  });
});
