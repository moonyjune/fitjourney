import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../../sync/cloudSync', () => ({ pushUserData: jest.fn() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useLocalSearchParams: () => ({}) }));

import { HpBar } from '../../components/quest/HpBar';
import { BossHpBar } from '../../components/quest/WeeklyBossSheet';
import type { BossState } from '../boss';
import { DEFICIT_LEVEL_COLOR } from '../deficitLevel';
import { dayDeficitMark } from '../deficitView';
import { HP_LEVEL_COLOR, hpColour, hpFraction, hpLevel } from '../hpColour';
import { quest } from '../../theme/quest';

const day = (over: Partial<Parameters<typeof dayDeficitMark>[0]> = {}): Parameters<typeof dayDeficitMark>[0] => ({
  deficitKcal: 1000,
  settled: true,
  projectedDeficitKcal: null,
  missingMeals: [],
  burnedKcal: 0,
  cheat: false,
  ...over,
});

describe('a calendar day mark (one source for Journal › Tháng and the date sheet)', () => {
  const opts = { targetKcal: 1000, tdeeKcal: 2400 };

  it('colours a settled day by its level against the target', () => {
    expect(dayDeficitMark(day({ deficitKcal: 950 }), opts)).toEqual({ kind: 'settled', level: 'met', kcal: 950, color: DEFICIT_LEVEL_COLOR.met });
    expect(dayDeficitMark(day({ deficitKcal: 600 }), opts).color).toBe(DEFICIT_LEVEL_COLOR.ok);
    expect(dayDeficitMark(day({ deficitKcal: 200 }), opts).color).toBe(DEFICIT_LEVEL_COLOR.low);
    expect(dayDeficitMark(day({ deficitKcal: 50 }), opts).level).toBe('flat');
    expect(dayDeficitMark(day({ deficitKcal: -300 }), opts).level).toBe('over');
    // Exercise splits off the deficit from eating: 1700 with 100 burned is 1600 from eating alone → the violet warning.
    expect(dayDeficitMark(day({ deficitKcal: 1700, burnedKcal: 100 }), opts).level).toBe('underEat');
    expect(dayDeficitMark(day({ deficitKcal: 1900, burnedKcal: 600 }), opts).level).toBe('excess');
  });

  it("reads today's estimate as pending, a missing meal as grey ⚠, a cheat day and an empty day", () => {
    expect(dayDeficitMark(day({ deficitKcal: 1800, settled: false, projectedDeficitKcal: 700 }), opts)).toEqual({ kind: 'pending', level: 'ok', kcal: 700, color: DEFICIT_LEVEL_COLOR.ok });
    expect(dayDeficitMark(day({ missingMeals: [{ id: 'dinner', kind: 'dinner', kcal: 600 }] }), opts)).toEqual({ kind: 'incomplete', level: null, kcal: 1000, color: null });
    expect(dayDeficitMark(day({ deficitKcal: null, cheat: true }), opts).kind).toBe('cheat');
    expect(dayDeficitMark(day({ deficitKcal: null }), { ...opts, cheat: true }).color).toBe(DEFICIT_LEVEL_COLOR.cheat);
    expect(dayDeficitMark(day({ deficitKcal: null }), opts)).toEqual({ kind: 'none', level: null, kcal: null, color: null });
  });
});

describe('boss HP colour by the HP left', () => {
  it('steps green → yellow-green → gold → orange → red', () => {
    expect(hpLevel(1)).toBe('full');
    expect(hpLevel(0.76)).toBe('full');
    expect(hpLevel(0.75)).toBe('high');
    expect(hpLevel(0.51)).toBe('high');
    expect(hpLevel(0.5)).toBe('mid');
    expect(hpLevel(0.26)).toBe('mid');
    expect(hpLevel(0.25)).toBe('low');
    expect(hpLevel(0.1)).toBe('low');
    expect(hpLevel(0.09)).toBe('critical');
    expect(hpLevel(0)).toBe('critical');
    expect(hpColour(1)).toBe(quest.xp);
    expect(hpColour(0.4)).toBe(quest.gold);
    expect(hpColour(0.05)).toBe(quest.hp);
    expect(hpFraction(300, 1200)).toBe(0.25);
    expect(hpFraction(5, 0)).toBe(0);
    expect(hpFraction(-5, 10)).toBe(0);
  });

  const mounted: ReactTestRenderer[] = [];
  afterEach(() => {
    act(() => mounted.splice(0).forEach((r) => r.unmount()));
  });
  const render = (el: React.ReactElement) => {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(el);
    });
    mounted.push(r);
    return r;
  };
  const fillColour = (r: ReactTestRenderer) => {
    const bar = r.root.findAll((n) => n.props.accessibilityRole === 'progressbar' && typeof n.type !== 'string')[0] ?? r.root.findAll((n) => n.props.accessibilityRole === 'progressbar')[0];
    const fill = bar.findAll((n) => n.props.style && StyleSheet.flatten(n.props.style)?.backgroundColor && StyleSheet.flatten(n.props.style).height === '100%')[0];
    return { label: bar.props.accessibilityLabel as string, colour: StyleSheet.flatten(fill.props.style).backgroundColor };
  };

  it('every boss bar takes the colour of its level and says it to screen readers', () => {
    expect(fillColour(render(<HpBar left={10} max={10} />))).toEqual({ label: 'máu gần đầy', colour: HP_LEVEL_COLOR.full });
    expect(fillColour(render(<HpBar left={6} max={10} />))).toEqual({ label: 'máu còn nhiều', colour: HP_LEVEL_COLOR.high });
    expect(fillColour(render(<HpBar left={4} max={10} />))).toEqual({ label: 'máu còn một nửa', colour: HP_LEVEL_COLOR.mid });
    expect(fillColour(render(<HpBar left={2} max={10} />))).toEqual({ label: 'máu thấp', colour: HP_LEVEL_COLOR.low });
    expect(fillColour(render(<HpBar left={0.5} max={10} />))).toEqual({ label: 'sắp gục', colour: HP_LEVEL_COLOR.critical });
  });

  it("the weekly boss bar keeps today's pending hit as a faded part", () => {
    const boss = { hpLeft: 2000, maxHp: 7000, pendingDamage: 500, defeated: false } as BossState;
    const r = render(<BossHpBar boss={boss} />);
    expect(fillColour(r).colour).toBe(HP_LEVEL_COLOR.mid);
    expect(r.root.findAll((n) => n.props.testID === 'hp-bar-pending').length).toBeGreaterThan(0);
    const done = render(<BossHpBar boss={{ ...boss, hpLeft: 0, defeated: true }} />);
    expect(done.root.findAll((n) => n.props.testID === 'hp-bar-pending')).toHaveLength(0);
  });
});
