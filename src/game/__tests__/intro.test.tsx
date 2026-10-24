import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AccessibilityInfo } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('../../sync/cloudSync', () => ({ pushProfile: jest.fn(), ensureCoachCode: jest.fn(), linkToCoach: jest.fn(), pullProfile: jest.fn() }));

import { AppIntro } from '../../components/AppIntro';
import { FitJourneyLogo } from '../../components/FitJourneyLogo';
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

describe('App intro (splash)', () => {
  let renderer: ReactTestRenderer | undefined;
  beforeEach(() => {
    jest.useFakeTimers();
    useSettingsStore.setState({ language: 'vi' });
  });
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    jest.useRealTimers();
    jest.restoreAllMocks();
  });
  const render = async () => {
    await act(async () => {
      renderer = create(<AppIntro durationMs={1200} />);
    });
    return renderer!;
  };

  it('shows the name, tagline and loading label in Vietnamese, and announces itself as a progress bar', async () => {
    const r = await render();
    const text = allText(r);
    expect(text).toContain('FITJOURNEY');
    expect(text).toContain('Mỗi ngày một nhiệm vụ');
    expect(text).toContain('ĐANG VÀO TRẠI');
    const bar = r.root.findAll((n) => n.props.accessibilityRole === 'progressbar')[0];
    expect(bar.props.accessibilityLabel).toBe('Đang vào trại');
  });

  it('follows the app language', async () => {
    useSettingsStore.setState({ language: 'en' });
    const text = allText(await render());
    expect(text).toContain('ENTERING CAMP');
    expect(text).toContain('One mission a day');
  });

  it('shows the FitJourney logo', async () => {
    const r = await render();
    expect(r.root.findAllByType(FitJourneyLogo)).toHaveLength(1);
  });

  it('settles without error when reduced motion is on and when it is off', async () => {
    for (const reduced of [true, false]) {
      jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(reduced);
      const r = await render();
      await act(async () => {
        jest.advanceTimersByTime(2000);
      });
      expect(allText(r)).toContain('FITJOURNEY');
      act(() => r.unmount());
      renderer = undefined;
    }
  });
});
