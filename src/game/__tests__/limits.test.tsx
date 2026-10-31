import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: () => undefined }));
jest.mock('expo-status-bar', () => ({ setStatusBarStyle: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../../sync/cloudSync', () => ({
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

import CampScreen from '../../../app/(tabs)/index';
import { useLimitsStore } from '../../store/useLimitsStore';
import { useNutritionStore } from '../../store/useNutritionStore';
import { usePlanStore } from '../../store/usePlanStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useWeightStore } from '../../store/useWeightStore';
import { useWorkoutStore } from '../../store/useWorkoutStore';
import { useCelebrationStore } from '../../store/useCelebrationStore';

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


/** Missions are folded on Camp by default: open them. */
function openMissions(r: ReactTestRenderer) {
  const head = r.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityState?.expanded === false && String(n.props.accessibilityLabel ?? '').startsWith('Nhiệm vụ hôm nay'))[0];
  if (head) act(() => head.props.onPress());
}

describe('user-chosen limits reach the missions', () => {
  let renderer: ReactTestRenderer | undefined;
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-23T21:00:00') }); // after the 20:00 window close, so limit missions are settled
    useSettingsStore.setState({ language: 'vi', startDateISO: '2026-10-19T08:00:00', startWeightKg: 110, activityLevel: 'light' });
    useWeightStore.setState({ entries: [{ id: 'w', dateISO: '2026-10-23T06:00:00', weightKg: 106 }] });
    useWorkoutStore.setState({ entries: [] });
    useCelebrationStore.setState({ seenLevel: 1 });
    useLimitsStore.getState().reset();
    // The default plan's first two meals carry well over 400 mg purine (chicken breast) — see the migration notes.
    const meals = usePlanStore.getState().plan.mealTemplates;
    expect(Object.keys(meals).length).toBeGreaterThan(0);
    useNutritionStore.setState({
      logs: { '2026-10-23': { dateISO: '2026-10-23', mealsEaten: { meal1: true, meal2: true }, extraCalories: 0, extraProteinG: 0, extraItems: [], waterMl: 0 } },
    });
  });
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    jest.useRealTimers();
    useLimitsStore.getState().reset();
  });
  const render = () => {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<CampScreen />);
    });
    renderer = r;
    openMissions(r);
    return r;
  };

  it('shows the chosen purine ceiling as the mission target and lets a high enough ceiling pass the mission', () => {
    const roomy = allText(render());
    expect(roomy).toMatch(/Purine\s+≤\s*1,?200\s*mg/); // default ceiling shown as the target
    expect(roomy).not.toContain('vượt ngưỡng'); // the plan's own first two meals (≈556 mg) fit under the default
    act(() => renderer?.unmount());
    useLimitsStore.setState({ purineMg: 400 });
    const strict = allText(render());
    expect(strict).toMatch(/Purine\s+≤\s*400\s*mg/);
    expect(strict).toContain('vượt ngưỡng'); // the same meals are over a stricter ceiling the user chose
  });

  it('moves limits still sitting on the old 400 mg / 5 g defaults, but keeps deliberate choices', async () => {
    const migrate = (useLimitsStore.persist.getOptions().migrate as (p: unknown, v: number) => unknown);
    expect(migrate({ purineMg: 400, saltG: 5, sugarG: 25 }, 0)).toMatchObject({ purineMg: 1200, saltG: 7, sugarG: 25 });
    expect(migrate({ purineMg: 600, saltG: 4.5, sugarG: 25 }, 0)).toMatchObject({ purineMg: 600, saltG: 4.5 });
  });
});
