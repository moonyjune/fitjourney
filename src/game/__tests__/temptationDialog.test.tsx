import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const mockPush = jest.fn<(...a: unknown[]) => Promise<void>>(async () => undefined);
type Outcome = { ok: true; result: unknown; sample?: boolean } | { ok: false; message: string; kind: 'offline' | 'quota' | 'generic' };
const mockTempt = jest.fn<(...a: unknown[]) => Promise<Outcome>>();
jest.mock('../../sync/cloudSync', () => ({
  pushUserData: (...a: unknown[]) => mockPush(...a),
  requestTemptation: (...a: unknown[]) => mockTempt(...a),
}));
const mockRouterPush = jest.fn();
let mockSegments: string[] = ['(tabs)'];
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockRouterPush(...a) },
  useSegments: () => mockSegments,
}));

import { TYPING_MS } from '../../components/quest/TemptationDialog';
import { useMealModeStore } from '../../store/useMealModeStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useTemptationStore } from '../../store/useTemptationStore';
import { sampleTemptation } from '../../temptation/sample';
import { DEFAULT_TEMPT_SETTINGS, planDay } from '../../temptation/schedule';
import { NO_TEMPT_STATS } from '../../temptation/stats';
import { summonTemptation } from '../../temptation/summon';
import { CHECK_EVERY_MS, TemptationHost } from '../../temptation/TemptationHost';

const AFTERNOON = new Date(2026, 9, 28, 15, 0); // Wednesday 15:00

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
const find = (r: ReactTestRenderer, label: string): ReactTestInstance | undefined =>
  r.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label)[0];
const press = async (r: ReactTestRenderer, label: string) => {
  const node = find(r, label);
  if (!node) throw new Error(`no button "${label}" in: ${allText(r)}`);
  await act(async () => node.props.onPress());
};
const advance = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
};
/** Lets the chat run `n` typing steps (each step is scheduled after the previous one shows). */
const steps = async (n: number) => {
  for (let i = 0; i < n; i++) await advance(TYPING_MS);
};

let r: ReactTestRenderer;
async function mount() {
  await act(async () => {
    r = create(<TemptationHost enabled />);
  });
}

beforeEach(() => {
  jest.useFakeTimers({ now: AFTERNOON });
  mockPush.mockClear();
  mockRouterPush.mockClear();
  mockTempt.mockReset();
  mockSegments = ['(tabs)'];
  useSettingsStore.setState({ language: 'vi' });
  useMealModeStore.setState({ fasting: false });
  useTemptationStore.setState({ settings: { ...DEFAULT_TEMPT_SETTINGS, enabled: true }, stats: NO_TEMPT_STATS, history: [], shownAt: [], salt: 'test', open: null, busy: false });
});
afterEach(() => {
  act(() => r?.unmount());
  jest.useRealTimers();
});

describe('temptation pop-up as a boss chat', () => {
  it('Easy: the boss types, its lines and the item card arrive, resisting shows my bubble, a sulk and the XP', async () => {
    await act(async () => {
      await summonTemptation(AFTERNOON);
    });
    const item = useTemptationStore.getState().open!.item;
    await mount();
    // First only the typing indicator.
    expect(allText(r)).toContain('đang nhập…');
    expect(allText(r)).not.toContain(item.lines[1]);
    expect(find(r, 'Kiên quyết từ chối 💪')).toBeUndefined();
    await advance(TYPING_MS);
    expect(allText(r)).toContain(item.lines[0]);
    await advance(TYPING_MS);
    expect(allText(r)).toContain(item.lines[1]);
    await advance(TYPING_MS);
    expect(allText(r)).toContain(item.name);
    expect(allText(r)).toContain(`${item.kcal} kcal`);
    expect(allText(r)).toContain(`Purine ${item.purineMg} mg`);

    await press(r, 'Kiên quyết từ chối 💪');
    expect(allText(r)).toContain('Kiên quyết từ chối 💪'); // my bubble
    expect(find(r, 'Thua rồi, mình ăn 😅')).toBeUndefined();
    await advance(TYPING_MS);
    expect(allText(r)).toMatch(/Hứ! Lần sau|Ơ kìa… người gì/);
    expect(allText(r)).toContain('+15 XP · Chuỗi kháng cám dỗ: 1');
    expect(useTemptationStore.getState().stats).toEqual({ resisted: 1, gaveIn: 0, streak: 1, bestStreak: 1 });
    expect(mockPush).toHaveBeenCalledWith('temptation', expect.objectContaining({ stats: expect.objectContaining({ resisted: 1 }) }));

    await press(r, 'Đóng');
    expect(useTemptationStore.getState().open).toBeNull();
    expect(r.toJSON()).toBeNull();
  });

  it('Hard with the dev sample: labelled, gloats when I give in, and offers to log the food', async () => {
    useTemptationStore.setState({ settings: { ...DEFAULT_TEMPT_SETTINGS, enabled: true, level: 'hard' }, stats: { resisted: 3, gaveIn: 0, streak: 3, bestStreak: 3 } });
    mockTempt.mockResolvedValue({ ok: true, result: sampleTemptation(AFTERNOON), sample: true });
    await act(async () => {
      await summonTemptation(AFTERNOON);
    });
    expect(mockTempt).toHaveBeenCalledWith(expect.objectContaining({ date: '2026-10-28', time: '15:00', weekday: 3, city: '', weather: null }));
    const item = useTemptationStore.getState().open!.item;
    expect(item.name).toContain('[Mẫu Dev]');
    await mount();
    await steps(4);
    expect(allText(r)).toContain(item.name);
    expect(allText(r)).toContain('Dữ liệu mẫu (chế độ Dev).');

    await press(r, 'Thua rồi, mình ăn 😅');
    await advance(TYPING_MS);
    expect(allText(r)).toMatch(/Hehe, biết ngay mà|Thắng rồi!/);
    expect(allText(r)).toContain('Không sao, chỉ mất chuỗi thôi');
    expect(useTemptationStore.getState().stats).toEqual({ resisted: 3, gaveIn: 1, streak: 0, bestStreak: 3 });
    expect(useTemptationStore.getState().history[0]).toMatchObject({ outcome: 'gaveIn', level: 'hard', name: item.name });

    await press(r, 'Ghi vào nhật ký');
    expect(mockRouterPush).toHaveBeenCalledWith({ pathname: '/add-food', params: { name: item.name, calories: String(item.kcal), purine: String(item.purineMg), sugar: String(item.sugarG) } });
    expect(useTemptationStore.getState().open).toBeNull();
  });

  it('Hard falls back to an Easy item when the AI is not available, and says so', async () => {
    useTemptationStore.setState({ settings: { ...DEFAULT_TEMPT_SETTINGS, enabled: true, level: 'hard' } });
    mockTempt.mockResolvedValue({ ok: false, message: 'quota', kind: 'quota' });
    await act(async () => {
      await summonTemptation(AFTERNOON);
    });
    expect(useTemptationStore.getState().open!.item).toMatchObject({ source: 'easy', note: 'fallback' });
    await mount();
    await steps(4);
    expect(allText(r)).toContain('AI đang bận, Quỷ dùng chiêu cổ điển.');
  });

  it('a practice round (Profile "try now") records nothing', async () => {
    await act(async () => {
      await summonTemptation(AFTERNOON, true);
    });
    await mount();
    await steps(4);
    await press(r, 'Kiên quyết từ chối 💪');
    await advance(TYPING_MS);
    expect(allText(r)).toContain('Luyện tập: không tính XP hay chuỗi');
    expect(useTemptationStore.getState().stats).toEqual(NO_TEMPT_STATS);
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe('the pop-up schedule in the app', () => {
  const firstMoment = () => {
    const m = planDay('2026-10-28', { ...DEFAULT_TEMPT_SETTINGS, enabled: true }, false, 'test')[0];
    return new Date(2026, 9, 28, Math.floor(m / 60), m % 60);
  };

  it('opens a pop-up on a tab screen once a planned moment has passed, and remembers it was shown', async () => {
    jest.setSystemTime(firstMoment());
    await mount();
    expect(useTemptationStore.getState().open).toBeNull();
    await advance(CHECK_EVERY_MS);
    expect(useTemptationStore.getState().open).not.toBeNull();
    expect(useTemptationStore.getState().shownAt).toHaveLength(1);
  });

  it('stays quiet on another screen, when switched off, or before the planned moment', async () => {
    jest.setSystemTime(firstMoment());
    mockSegments = ['add-food'];
    await mount();
    await advance(CHECK_EVERY_MS * 2);
    expect(useTemptationStore.getState().open).toBeNull();
    act(() => r.unmount());

    mockSegments = ['(tabs)'];
    useTemptationStore.setState({ settings: { ...DEFAULT_TEMPT_SETTINGS, enabled: false } });
    await mount();
    await advance(CHECK_EVERY_MS * 2);
    expect(useTemptationStore.getState().open).toBeNull();
    act(() => r.unmount());

    useTemptationStore.setState({ settings: { ...DEFAULT_TEMPT_SETTINGS, enabled: true } });
    jest.setSystemTime(new Date(firstMoment().getTime() - 10 * 60_000));
    await mount();
    await advance(CHECK_EVERY_MS * 2);
    expect(useTemptationStore.getState().open).toBeNull();
  });
});
