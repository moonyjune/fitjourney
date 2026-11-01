import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const mockPush = jest.fn<(...a: unknown[]) => Promise<void>>(async () => undefined);
type Outcome =
  | { ok: true; text: { moveName: string; mood: string; lines: { speaker: string; text: string }[] }; sample?: boolean }
  | { ok: false; message: string; kind: 'quota' | 'generic' | 'offline' };
const mockBanter = jest.fn<(...a: unknown[]) => Promise<Outcome>>();
jest.mock('../../sync/cloudSync', () => ({
  pushUserData: (...a: unknown[]) => mockPush(...a),
  pushNutritionLog: jest.fn(),
  pushWorkoutEntry: jest.fn(),
  pushWeightEntry: jest.fn(),
  pushProfile: jest.fn(),
  pushHabit: jest.fn(),
  pushHabitCheck: jest.fn(),
  requestBossBanter: (...a: unknown[]) => mockBanter(...a),
}));

import { BanterSection } from '../../components/quest/BattleBanter';
import { buildBanterShown, type BanterShown } from '../../banter/days';
import type { DamageDay } from '../bossDamage';
import { buildStageJourney } from '../stageBosses';
import { formatGameText } from '../strings';
import { useAiPhotoStore } from '../../store/useAiPhotoStore';
import { useBossTalkStore } from '../../store/useBossTalkStore';
import { useSettingsStore } from '../../store/useSettingsStore';

const TODAY = '2026-10-31';
const g = (key: Parameters<typeof formatGameText>[1], params?: Record<string, string | number>) => formatGameText('vi', key, params);
const { bosses } = buildStageJourney({ startKg: 110, goalKg: 95, currentKg: 108, entries: [], startDateISO: '2026-10-20T08:00:00' });

const day = (dateKey: string, deficitKcal: number): DamageDay => ({
  dateKey, deficitKcal, cheat: false, estKg: deficitKcal / 7700, weightKg: null, realKg: null, estTotalKg: 0, realTotalKg: null, bossIndex: 0, felled: [],
});
const DAYS = [day('2026-10-27', 900), day('2026-10-28', -300), day('2026-10-29', 600), day('2026-10-30', 1000), day(TODAY, 400)];

/** What the Map passes: built from the saved exchanges as they are now. */
const shownNow = (): BanterShown[] =>
  buildBanterShown({
    days: DAYS, bosses, evaluations: new Map(), logs: {}, workoutEntries: [], targetKcal: 1000, proteinTargetG: 150, cheatDays: [],
    talks: useBossTalkStore.getState().talks, todayKey: TODAY, bossName: () => 'Quỷ Bánh Kem', skillName: (s) => s,
  });

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

let mounted: ReactTestRenderer | null = null;
const render = async (shown: BanterShown[] = shownNow()) => {
  let r!: ReactTestRenderer;
  await act(async () => {
    r = create(<BanterSection shown={shown} todayKey={TODAY} />);
  });
  mounted = r;
  return r;
};
const rerender = async (r: ReactTestRenderer) => {
  await act(async () => {
    r.update(<BanterSection shown={shownNow()} todayKey={TODAY} />);
  });
};
const press = async (r: ReactTestRenderer, label: string) => {
  const node = r.root.find((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
  await act(async () => {
    node.props.onPress();
  });
};

const AI = { ok: true as const, text: { moveName: 'Cú Đá Hư Không', mood: 'hurt', lines: [{ speaker: 'player', text: 'Đỡ này!' }, { speaker: 'boss', text: 'Áaa, 130 g!' }, { speaker: 'player', text: 'Mai tiếp.' }] } };

describe('Map > Hội thoại chiến đấu', () => {
  beforeEach(() => {
    mockBanter.mockReset();
    mockPush.mockClear();
    useSettingsStore.setState({ language: 'vi' });
    useAiPhotoStore.setState({ aiEnabled: true });
    useBossTalkStore.setState({ talks: [], autoTried: null });
  });
  afterEach(() => {
    act(() => mounted?.unmount());
    mounted = null;
  });

  it('every day talks at once (templates), yesterday is asked of the AI once on its own and replaces its template', async () => {
    mockBanter.mockResolvedValue(AI);
    const r = await render();
    expect(mockBanter).toHaveBeenCalledTimes(1);
    expect((mockBanter.mock.calls[0][0] as { date: string; deficitKcal: number }).date).toBe('2026-10-30');
    expect(useBossTalkStore.getState()).toMatchObject({ autoTried: '2026-10-30', talks: [expect.objectContaining({ date: '2026-10-30', moveName: 'Cú Đá Hư Không', source: 'ai', deficitKcal: 1000 })] });
    expect(mockPush).toHaveBeenLastCalledWith('bossTalk', { talks: useBossTalkStore.getState().talks, autoTried: '2026-10-30' });

    await rerender(r);
    const text = allText(r);
    expect(text).toContain(g('banter.today'));
    expect(text).toContain('Áaa, 130 g!');
    expect(text).toContain(g('banter.byAi'));
    expect(text).toContain(g('banter.byTemplate')); // today is still the template
    expect(mockBanter).toHaveBeenCalledTimes(1); // never asked again
  });

  it('an automatic failure stays quiet and is never retried; a tap shows why it failed', async () => {
    mockBanter.mockResolvedValue({ ok: false, message: 'Hết lượt', kind: 'quota' });
    const r = await render();
    await rerender(r);
    expect(mockBanter).toHaveBeenCalledTimes(1);
    expect(useBossTalkStore.getState().autoTried).toBe('2026-10-30');
    expect(allText(r)).not.toContain(g('banter.err.quota'));

    await press(r, g('banter.askLabel', { date: '30/10' }));
    expect(mockBanter).toHaveBeenCalledTimes(2);
    expect(allText(r)).toContain(g('banter.err.quota'));
    expect(useBossTalkStore.getState().talks).toEqual([]);
  });

  it('with AI off nothing is sent on its own; older days start closed and open on tap', async () => {
    useAiPhotoStore.setState({ aiEnabled: false });
    const r = await render();
    expect(mockBanter).not.toHaveBeenCalled();
    const before = allText(r);
    expect(before).toContain(g('banter.ask'));
    // Only today and yesterday are open: three days' chats are hidden.
    const closedDays = r.root.findAll((n) => n.props.accessibilityState?.expanded === false && typeof n.props.onPress === 'function' && /^\d\d\/10\./.test(n.props.accessibilityLabel ?? ''));
    expect(new Set(closedDays.map((n) => n.props.accessibilityLabel.slice(0, 5)))).toEqual(new Set(['29/10', '28/10', '27/10']));
    const closed = r.root.find((n) => typeof n.props.onPress === 'function' && /^28\/10\./.test(n.props.accessibilityLabel ?? ''));
    await act(async () => {
      closed.props.onPress();
    });
    expect(allText(r)).toContain('300 kcal'); // the surplus day's taunt, now open
  });

  it('says so when no day has food yet', async () => {
    const r = await render([]);
    expect(allText(r)).toContain(g('banter.empty'));
    expect(mockBanter).not.toHaveBeenCalled();
  });
});
