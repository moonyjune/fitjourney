import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const mockPush = jest.fn<(...a: unknown[]) => Promise<void>>(async () => undefined);
type Outcome = { ok: true; chapter: { title: string; paragraphs: string[] }; sample?: boolean } | { ok: false; message: string; kind: 'quota' | 'generic' };
const mockStory = jest.fn<(...a: unknown[]) => Promise<Outcome>>();
jest.mock('../../sync/cloudSync', () => ({
  pushUserData: (...a: unknown[]) => mockPush(...a),
  pushNutritionLog: jest.fn(),
  pushWorkoutEntry: jest.fn(),
  pushWeightEntry: jest.fn(),
  pushProfile: jest.fn(),
  pushHabit: jest.fn(),
  pushHabitCheck: jest.fn(),
  requestStoryChapter: (...a: unknown[]) => mockStory(...a),
}));

import { StorySection } from '../../components/quest/StorySection';
import { formatGameText } from '../strings';
import { useNutritionStore } from '../../store/useNutritionStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useStoryStore } from '../../store/useStoryStore';
import { useWeightStore } from '../../store/useWeightStore';
import { useWorkoutStore } from '../../store/useWorkoutStore';
import { USER_DATA_KEYS } from '../../sync/userDataKeys';

const NOW = new Date('2026-10-31T18:00:00');
const g = (key: Parameters<typeof formatGameText>[1], params?: Record<string, string | number>) => formatGameText('vi', key, params);

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

const pressByLabel = async (r: ReactTestRenderer, label: string) => {
  const node = r.root.find((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
  await act(async () => {
    node.props.onPress();
  });
};

describe('Map > Câu chuyện', () => {
  beforeEach(() => {
    mockStory.mockReset();
    mockPush.mockClear();
    useSettingsStore.setState({ language: 'vi', startDateISO: '2026-10-19T08:00:00', startWeightKg: 110, goalWeightKg: 95, targetDailyDeficitKcal: 1000 });
    useStoryStore.setState({ chapters: [] });
    useWeightStore.setState({ entries: [] });
    useWorkoutStore.setState({ entries: [] });
    useNutritionStore.setState({
      logs: {
        '2026-10-20': {
          dateISO: '2026-10-20T00:00:00', mealsEaten: {}, extraCalories: 900, extraProteinG: 40, waterMl: 0,
          extraItems: [{ id: 'a', name: 'Phở bò', calories: 900, proteinG: 40, loggedAtISO: '2026-10-20T05:00:00.000Z', mealTime: 'lunch' }],
        },
      },
    });
  });

  it('writes the pending week only when asked, saves it and syncs it', async () => {
    mockStory.mockResolvedValue({ ok: true, chapter: { title: 'Bát phở định mệnh', paragraphs: ['Đoạn một.', 'Đoạn hai.'] } });
    let r!: ReactTestRenderer;
    await act(async () => {
      r = create(<StorySection bosses={[]} startDateKey="2026-10-19" now={NOW} />);
    });
    expect(mockStory).not.toHaveBeenCalled();
    expect(allText(r)).toContain(g('story.pending', { n: 1, what: g('story.weekPeriod', { from: '19/10', to: '25/10' }) }));

    await pressByLabel(r, g('story.writeLabel', { what: g('story.weekPeriod', { from: '19/10', to: '25/10' }) }));
    const summary = mockStory.mock.calls[0][0] as { chapter: { kind: string; number: number }; foods: { top: unknown[] } };
    expect(summary.chapter).toMatchObject({ kind: 'week', number: 1 });
    expect(summary.foods.top).toEqual([{ name: 'Phở bò', count: 1 }]);

    expect(useStoryStore.getState().chapters).toEqual([expect.objectContaining({ id: 'week:2026-10-19', number: 1, title: 'Bát phở định mệnh' })]);
    expect(mockPush).toHaveBeenCalledWith(USER_DATA_KEYS.story, { chapters: useStoryStore.getState().chapters });
    const text = allText(r);
    expect(text).toContain('Bát phở định mệnh');
    expect(text).toContain('Đoạn một.'); // the new chapter opens
    expect(text).toContain(g('story.upToDate'));
  });

  it('shows a clear error and keeps the chapter pending', async () => {
    mockStory.mockResolvedValue({ ok: false, message: 'Hết lượt', kind: 'quota' });
    let r!: ReactTestRenderer;
    await act(async () => {
      r = create(<StorySection bosses={[]} startDateKey="2026-10-19" now={NOW} />);
    });
    await pressByLabel(r, g('story.writeLabel', { what: g('story.weekPeriod', { from: '19/10', to: '25/10' }) }));
    expect(allText(r)).toContain(g('story.err.quota'));
    expect(useStoryStore.getState().chapters).toEqual([]);
  });

  it('says when there is nothing to write yet', async () => {
    useNutritionStore.setState({ logs: {} });
    let r!: ReactTestRenderer;
    await act(async () => {
      r = create(<StorySection bosses={[]} startDateKey="2026-10-19" now={NOW} />);
    });
    expect(allText(r)).toContain(g('story.empty'));
  });
});
