import { describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../../lib/supabase', () => ({ supabase: { auth: { signOut: jest.fn() } } }));

import { WeeklyBossHistory } from '../../components/quest/WeeklyBossHistory';
import type { BossState } from '../boss';
import { formatGameText } from '../strings';

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

const week = (weekKey: string, totalDamage: number): BossState => ({
  weekKey,
  maxHp: 7700,
  hpLeft: Math.max(0, 7700 - totalDamage),
  totalDamage,
  days: [],
  defeated: totalDamage >= 7700,
  daysUntilReset: 0,
  neededPerRemainingDay: 0,
  pendingDamage: 0,
});

// The 1.0.3 report: Profile said 2 weekly bosses beaten while the list showed one. The other was the oldest week (21/09, 7,768
// damage), the seventh row, folded away by the six-row limit.
const history = [
  week('2026-11-02', 2006),
  week('2026-10-26', 7709),
  week('2026-10-19', 6374),
  week('2026-10-12', 4602),
  week('2026-10-05', 7092),
  week('2026-09-28', 6858),
  week('2026-09-21', 7768),
];

describe('WeeklyBossHistory', () => {
  it('counts every defeated week above the list, even one folded away, and shows the rest on request', () => {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<WeeklyBossHistory history={history} />);
    });
    expect(allText(r)).toContain('Đã hạ 2 / 7 tuần');
    expect(allText(r)).not.toContain('Tuần 39'); // 21/09, past the first six rows
    const more = r.root.find((n) => typeof n.props.title === 'string' && n.props.title.startsWith('Xem thêm 1 tuần') && typeof n.props.onPress === 'function');
    act(() => more.props.onPress());
    expect(allText(r)).toContain('Tuần 39');
    expect(allText(r)).not.toContain('Xem thêm');
  });

  it('has no "show more" when every week fits', () => {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<WeeklyBossHistory history={history.slice(0, 3)} />);
    });
    expect(allText(r)).toContain('Đã hạ 1 / 3 tuần');
    expect(allText(r)).not.toContain('Xem thêm');
  });

  it('labels the Profile stat as weekly bosses, not the Journey stage bosses', () => {
    expect(formatGameText('vi', 'profile.statBosses')).toBe('Boss tuần đã hạ');
  });
});
