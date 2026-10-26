import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

type Rows = Record<string, unknown>;
type Outcome = { ok: true; result: unknown } | { ok: false; message: string; kind: 'notConfigured' | 'offline' | 'auth' | 'quota' | 'disabled' | 'generic' };
const mockRows = jest.fn<(...a: unknown[]) => Promise<Rows | null>>();
const mockDigest = jest.fn<(...a: unknown[]) => Promise<Outcome>>();
jest.mock('../../sync/cloudSync', () => ({
  pushNutritionLog: jest.fn(),
  pushWorkoutEntry: jest.fn(),
  pushWeightEntry: jest.fn(),
  pushProfile: jest.fn(),
  pushUserData: jest.fn(),
  pushProofPhoto: jest.fn(),
  fetchClientRows: (...a: unknown[]) => mockRows(...a),
  requestDigest: (...a: unknown[]) => mockDigest(...a),
}));

import { aiFlags } from '../../ai/featureFlags';
import { CoachDigestCard } from '../../components/quest/CoachDigestCard';
import { DEFAULT_PLAN } from '../../constants/plan';
import { useAiDigestStore } from '../../store/useAiDigestStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import type { CoachClientSummary } from '../../types';

const NOW = new Date('2026-10-23T16:10:00'); // Friday, week from Monday 19/10

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

const client = (id: string, email = `${id}@mail.com`, displayName: string | null = null): CoachClientSummary => ({ id, email, displayName, startWeightKg: 100, goalWeightKg: 90, latestWeightKg: 98 });

// With no profile the TDEE is 1900 + 1100 = 3000 kcal and the boss has 7700 HP.
const PROFILE = { calorie_target_kcal: '1900', target_daily_deficit_kcal: '1100', protein_target_g: '200', water_target_ml: '3000' };
const nutrition = (days: string[], kcal: number) =>
  days.map((d) => ({ entry_date: `2026-10-${d}`, meals_eaten: {}, extra_calories: String(kcal), extra_protein_g: '100', extra_items: [{ id: `i${d}`, name: 'Ăn', calories: kcal, proteinG: 100, loggedAtISO: `2026-10-${d}T12:00:00`, mealTime: 'lunch' }], water_ml: '3000', removed_meal_slots: [] }));
const WEEK_DAYS = ['19', '20', '21', '22', '23'];
const rowsOf = (n: Rows[]): Rows => ({ profile: PROFILE, plan: DEFAULT_PLAN, weights: [], nutrition: n, workouts: [] });
/** Deficit 1,500 a day: the boss is nearly down: status "good". */
const GOOD = rowsOf(nutrition(WEEK_DAYS, 1500));
/** Deficit 1,000 a day: 5,000 damage, 1,350 still needed per day: "behind" (watch). */
const WATCH = rowsOf(nutrition(WEEK_DAYS, 2000));
/** One logged day out of five: "nudge". */
const NUDGE = rowsOf(nutrition(['19'], 1500));
const NONE = rowsOf([]);

describe('Coach weekly digest', () => {
  let renderer: ReactTestRenderer | undefined;
  const mount = async (clients: CoachClientSummary[]) => {
    await act(async () => {
      renderer = create(<CoachDigestCard clients={clients} />);
    });
    return renderer!;
  };
  const press = async (r: ReactTestRenderer, label: string) => {
    await act(async () => find(r, label)!.props.onPress());
  };

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    jest.clearAllMocks();
    aiFlags.aiForCoach = true;
    useSettingsStore.setState({ language: 'vi' });
    useAiDigestStore.setState({ weeks: {} });
    mockRows.mockImplementation(async (id) => ({ g: GOOD, w: WATCH, n: NUDGE, z: NONE } as Record<string, Rows>)[String(id).charAt(0)] ?? NONE);
    mockDigest.mockImplementation(async (items) => ({
      ok: true,
      result: { items: (items as { key: string }[]).map((i) => ({ key: i.key, summary: `Tóm tắt ${i.key}`, nudge: `Nhắn ${i.key}` })) },
    }));
  });
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    aiFlags.aiForCoach = false;
    jest.useRealTimers();
  });

  it('is off by default (AI for coaches is switched off for now): nothing is shown and nothing is read or asked', async () => {
    aiFlags.aiForCoach = false;
    const r = await mount([client('g1')]);
    expect(allText(r)).not.toContain('Tóm tắt tuần của học viên');
    expect(mockRows).not.toHaveBeenCalled();
    expect(mockDigest).not.toHaveBeenCalled();
  });

  it('shows nothing when the coach has no clients', async () => {
    const r = await mount([]);
    expect(allText(r)).not.toContain('Tóm tắt tuần của học viên');
  });

  it('does nothing by itself: reading clients and asking the AI start only when the coach asks', async () => {
    const r = await mount([client('g1')]);
    expect(allText(r)).toContain('Tạo tóm tắt tuần này');
    expect(mockRows).not.toHaveBeenCalled();
    expect(mockDigest).not.toHaveBeenCalled();
  });

  it('reads each client\'s rows from two weeks back, sends only clients with data under opaque keys, and lists the ones to nudge first', async () => {
    const r = await mount([client('g1', 'good@mail.com', 'An'), client('z1', 'none@mail.com'), client('n1', 'nudge@mail.com'), client('w1', 'watch@mail.com')]);
    await press(r, 'Tạo tóm tắt tuần này');
    expect(mockRows.mock.calls.map((c) => c[1])).toEqual(['2026-10-05', '2026-10-05', '2026-10-05', '2026-10-05']);
    expect(mockDigest).toHaveBeenCalledTimes(1);
    const [items, period] = mockDigest.mock.calls[0] as [{ key: string; week: Record<string, any> }[], string];
    expect(period).toBe('2026-10-19');
    expect(items.map((i) => i.key)).toEqual(['c1', 'c2', 'c3']); // the one with nothing logged is not sent
    const sent = JSON.stringify(items);
    expect(sent).not.toMatch(/@mail\.com|g1|n1|w1|z1|An/);
    expect(items[0].week.boss.status).toBeDefined();

    const text = allText(r);
    const order = ['nudge@mail.com', 'none@mail.com', 'watch@mail.com', 'An'].map((n) => text.indexOf(n));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order); // nudge, nothing logged, watch, good
    expect(text).toContain('Cần nhắc');
    expect(text).toContain('Chưa ghi gì');
    expect(text).toContain('Đang chậm');
    expect(text).toContain('Đang tốt');
    expect(text).toContain('Chưa ghi ngày nào trong tuần này.');
    expect(text).toContain('Tóm tắt c1');
    expect(text).toContain('Gợi ý lời nhắn');
    expect(text).toContain('Nhắn c1');
    expect(text).toContain('Làm mới tóm tắt'); // the button now refreshes
    expect(text).toContain('không thay thế bác sĩ');
  });

  it('keeps the digest on the device: a fresh mount shows it again without asking anything', async () => {
    let r = await mount([client('g1')]);
    await press(r, 'Tạo tóm tắt tuần này');
    act(() => r.unmount());
    mockRows.mockClear();
    mockDigest.mockClear();
    r = await mount([client('g1')]);
    expect(allText(r)).toContain('Tóm tắt c1');
    expect(mockRows).not.toHaveBeenCalled();
  });

  it('does not ask the AI at all when nobody has logged anything this week', async () => {
    const r = await mount([client('z1'), client('z2')]);
    await press(r, 'Tạo tóm tắt tuần này');
    expect(mockDigest).not.toHaveBeenCalled();
    expect(allText(r)).toContain('Chưa ghi ngày nào trong tuần này.');
  });

  it('sends clients in batches of 12 (13 clients: 12 then 1), keys restart in each batch', async () => {
    const clients = Array.from({ length: 13 }, (_, i) => client(`g${i}`));
    const r = await mount(clients);
    await press(r, 'Tạo tóm tắt tuần này');
    expect(mockDigest).toHaveBeenCalledTimes(2);
    expect((mockDigest.mock.calls[0][0] as unknown[]).length).toBe(12);
    expect((mockDigest.mock.calls[1][0] as { key: string }[]).map((i) => i.key)).toEqual(['c1']);
    expect(allText(r).match(/Tóm tắt c1(?!\d)/g)?.length).toBe(2); // the first of each batch
  });

  it('a failed batch stops the run; every status and the summaries so far are still kept, and the error is shown', async () => {
    const clients = Array.from({ length: 13 }, (_, i) => client(`g${i}`));
    mockDigest.mockResolvedValueOnce({ ok: true, result: { items: Array.from({ length: 12 }, (_, i) => ({ key: `c${i + 1}`, summary: `Tóm tắt c${i + 1}` })) } });
    mockDigest.mockResolvedValueOnce({ ok: false, message: 'x', kind: 'quota' });
    const r = await mount(clients);
    await press(r, 'Tạo tóm tắt tuần này');
    expect(allText(r)).toContain('hết lượt AI hôm nay');
    const stored = useAiDigestStore.getState().weeks['2026-10-19'];
    expect(Object.keys(stored)).toHaveLength(13);
    expect(stored.g12.summary).toBeUndefined(); // the last client was in the failed batch
    expect(stored.g12.status).toBe('good');
    expect(stored.g0.summary).toBe('Tóm tắt c1');
    expect(allText(r)).toContain('Chưa có tóm tắt từ AI');
  });

  it('a failed first batch stops the run: the next batch is not even tried, yet every client keeps its status', async () => {
    const clients = Array.from({ length: 13 }, (_, i) => client(`g${i}`));
    mockDigest.mockResolvedValueOnce({ ok: false, message: 'x', kind: 'offline' });
    const r = await mount(clients);
    await press(r, 'Tạo tóm tắt tuần này');
    expect(mockDigest).toHaveBeenCalledTimes(1);
    const stored = useAiDigestStore.getState().weeks['2026-10-19'];
    expect(Object.keys(stored)).toHaveLength(13);
    expect(Object.values(stored).every((e) => e.status === 'good' && e.summary === undefined)).toBe(true);
    expect(allText(r)).toContain('Không có mạng');
  });

  it('says how many clients could not be read, and leaves them out', async () => {
    mockRows.mockImplementation(async (id) => (id === 'g2' ? null : GOOD));
    const r = await mount([client('g1'), client('g2'), client('g3')]);
    await press(r, 'Tạo tóm tắt tuần này');
    expect(allText(r)).toContain('1 học viên chưa đọc được dữ liệu');
    expect(Object.keys(useAiDigestStore.getState().weeks['2026-10-19']).sort()).toEqual(['g1', 'g3']);
    expect((mockDigest.mock.calls[0][0] as unknown[]).length).toBe(2);
  });

  it('a client the AI left out has its status and "no summary yet" (not someone else\'s text)', async () => {
    mockDigest.mockResolvedValue({ ok: true, result: { items: [{ key: 'c1', summary: 'Chỉ người đầu' }] } });
    const r = await mount([client('g1'), client('g2')]);
    await press(r, 'Tạo tóm tắt tuần này');
    const stored = useAiDigestStore.getState().weeks['2026-10-19'];
    expect(stored.g1.summary).toBe('Chỉ người đầu');
    expect(stored.g2.summary).toBeUndefined();
    expect(allText(r)).toContain('Chưa có tóm tắt từ AI');
  });

  it.each([
    ['notConfigured', 'AI chưa được thiết lập'],
    ['disabled', 'AI đang tắt'],
    ['offline', 'Không có mạng'],
  ] as Array<['notConfigured' | 'disabled' | 'offline', string]>)('shows a friendly message for a %s failure', async (kind, expected) => {
    mockDigest.mockResolvedValue({ ok: false, message: 'x', kind });
    const r = await mount([client('g1')]);
    await press(r, 'Tạo tóm tắt tuần này');
    expect(allText(r)).toContain(expected);
  });

  it('ignores a second tap while it is running', async () => {
    let resolve!: (o: Outcome) => void;
    mockDigest.mockReturnValueOnce(new Promise((res) => (resolve = res)));
    const r = await mount([client('g1')]);
    await press(r, 'Tạo tóm tắt tuần này');
    await press(r, 'Đang đọc dữ liệu và tóm tắt…');
    expect(mockDigest).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve({ ok: true, result: { items: [{ key: 'c1', summary: 'Xong' }] } });
    });
    expect(allText(r)).toContain('Xong');
  });

  it('only shows clients the coach still has', async () => {
    let r = await mount([client('g1'), client('g2')]);
    await press(r, 'Tạo tóm tắt tuần này');
    act(() => r.unmount());
    r = await mount([client('g1')]);
    expect(allText(r)).toContain('g1@mail.com');
    expect(allText(r)).toContain('Tóm tắt c1');
    expect(allText(r)).not.toContain('g2@mail.com');
  });
});
