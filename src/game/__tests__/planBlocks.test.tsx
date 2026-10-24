import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';

jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: () => undefined }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../../lib/supabase', () => ({ supabase: { functions: { invoke: jest.fn() } } }));
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
  listChatSessions: jest.fn(async () => []),
  fetchSessionMessages: jest.fn(async () => []),
  createChatSession: jest.fn(),
  saveChatMessage: jest.fn(),
}));

import { QuestPlanPreview } from '../../components/quest/QuestPlanPreview';
import { QuestShoppingList } from '../../components/quest/QuestShoppingList';
import { PlanChatAssistant } from '../../components/PlanChatAssistant';
import { useShoppingListStore } from '../../store/useShoppingListStore';
import { useAuthStore } from '../../store/useAuthStore';
import { DEFAULT_PLAN } from '../../constants/plan';

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

const byLabel = (r: ReactTestRenderer, label: string): ReactTestInstance =>
  r.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];

async function render(el: React.ReactElement) {
  let r!: ReactTestRenderer;
  await act(async () => {
    r = create(el);
  });
  return r;
}

const plan = DEFAULT_PLAN;
const first = plan.shoppingList[0];

describe('QuestPlanPreview', () => {
  it('renders meals, water schedule and workouts from the plan', async () => {
    const r = await render(<QuestPlanPreview plan={plan} hideShoppingList />);
    const text = allText(r);
    expect(text).toContain(plan.mealTemplates.training[0].items[0].name);
    expect(text).toContain(plan.mealTemplates.rest[0].label);
    expect(text).toMatch(new RegExp(`${plan.waterSchedule[0].cumulativeTargetMl}\\s*ml`));
    expect(text).toContain(plan.workoutTemplates[0].label);
    expect(text).not.toContain(first.category + ' · ');
  });

  it('shows the shopping list unless hidden', async () => {
    const r = await render(<QuestPlanPreview plan={plan} />);
    expect(allText(r)).toContain(first.name);
  });
});

describe('QuestShoppingList', () => {
  beforeEach(() => {
    act(() => {
      useShoppingListStore.setState({ checkedItems: {}, actualPrices: {}, actualQuantities: {}, customItems: [] });
    });
  });

  it('checks an item off', async () => {
    const r = await render(<QuestShoppingList plan={plan} />);
    await act(async () => {
      byLabel(r, first.name).props.onPress();
    });
    expect(useShoppingListStore.getState().checkedItems[first.name]).toBe(true);
    expect(byLabel(r, first.name).props.accessibilityState.checked).toBe(true);
  });

  it('edits the price, and clearing it falls back to the estimate', async () => {
    const r = await render(<QuestShoppingList plan={plan} />);
    const priceInput = r.root.findAll((n) => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith(`${first.name} – `) && n.props.keyboardType === 'decimal-pad')[0];
    await act(async () => {
      priceInput.props.onChangeText('12345');
    });
    expect(useShoppingListStore.getState().actualPrices[first.name]).toBe(12345);
    await act(async () => {
      priceInput.props.onChangeText('');
    });
    expect(useShoppingListStore.getState().actualPrices[first.name]).toBeUndefined();
  });

  it('adds and removes a custom item', async () => {
    const r = await render(<QuestShoppingList plan={plan} />);
    const inputs = r.root.findAll((n) => typeof n.type === 'string' && n.props.onChangeText && n.props.value === '' && n.props.placeholder && !n.props.keyboardType);
    // last three non-numeric empty inputs: name, category, quantity (first ones are per-row quantity overrides)
    const [name, , quantity] = inputs.slice(-3);
    await act(async () => {
      name.props.onChangeText('Cà chua bi');
      quantity.props.onChangeText('1kg');
    });
    const add = r.root.findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function').slice(-1)[0];
    await act(async () => {
      add.props.onPress();
    });
    const items = useShoppingListStore.getState().customItems;
    expect(items).toHaveLength(1);
    expect(allText(r)).toContain('Cà chua bi');
    const del = r.root.findAll((n) => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.endsWith(' Cà chua bi') && typeof n.props.onPress === 'function')[0];
    await act(async () => {
      del.props.onPress();
    });
    expect(useShoppingListStore.getState().customItems).toHaveLength(0);
  });

  it('ignores a custom item without name or quantity', async () => {
    const r = await render(<QuestShoppingList plan={plan} />);
    const add = r.root.findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function').slice(-1)[0];
    await act(async () => {
      add.props.onPress();
    });
    expect(useShoppingListStore.getState().customItems).toHaveLength(0);
  });
});

describe('PlanChatAssistant dark flag', () => {
  beforeEach(() => {
    useAuthStore.setState({ session: { user: { id: 'u1' } } as never });
  });

  it('renders in dark mode and in classic mode', async () => {
    const dark = await render(<PlanChatAssistant livePlan={plan} onApply={() => undefined} dark />);
    expect(JSON.stringify(dark.toJSON())).toContain('#1C1636');
    const light = await render(<PlanChatAssistant livePlan={plan} onApply={() => undefined} />);
    expect(JSON.stringify(light.toJSON())).not.toContain('#1C1636');
  });
});
