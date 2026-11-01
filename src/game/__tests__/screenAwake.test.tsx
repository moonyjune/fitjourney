import { describe, expect, it, jest } from '@jest/globals';
import { Platform } from 'react-native';
import { act, create } from 'react-test-renderer';
import { useScreenAwake } from '../../utils/useScreenAwake';

function Probe({ active }: { active: boolean }) {
  useScreenAwake(active);
  return null;
}

describe('screen stays on during a workout (web wake lock)', () => {
  it('asks for the lock while active, again when the page comes back, and releases it at the end', async () => {
    const os = Platform.OS;
    (Platform as { OS: string }).OS = 'web';
    const release = jest.fn(async () => {});
    const sentinels: { released: boolean; release: typeof release }[] = [];
    const request = jest.fn(async () => {
      const s = { released: false, release };
      sentinels.push(s);
      return s;
    });
    (globalThis as unknown as { navigator: unknown }).navigator = { wakeLock: { request } };
    let visibility = 'visible';
    const listeners: Record<string, () => void> = {};
    (globalThis as unknown as { document: unknown }).document = {
      get visibilityState() {
        return visibility;
      },
      addEventListener: (type: string, fn: () => void) => (listeners[type] = fn),
      removeEventListener: (type: string) => delete listeners[type],
    };
    let r: ReturnType<typeof create> | undefined;
    await act(async () => {
      r = create(<Probe active />);
    });
    expect(request).toHaveBeenCalledTimes(1);
    // The browser drops the lock when the tab is hidden; coming back asks again.
    sentinels[0].released = true;
    visibility = 'visible';
    await act(async () => listeners.visibilitychange());
    expect(request).toHaveBeenCalledTimes(2);
    await act(async () => r!.update(<Probe active={false} />));
    expect(release).toHaveBeenCalled();
    expect(listeners.visibilitychange).toBeUndefined();
    (Platform as { OS: string }).OS = os;
  });
});
