import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AccessibilityInfo, Text, View, StyleSheet } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import { MissionRow } from '../../components/quest/MissionRow';
import { XpBar } from '../../components/quest/XpBar';
import { AnimatedNumber } from '../../components/quest/motion/AnimatedNumber';
import { Bump } from '../../components/quest/motion/Bump';
import { FadeInUp } from '../../components/quest/motion/FadeInUp';
import { FloatUp } from '../../components/quest/motion/FloatUp';
import { PopIn } from '../../components/quest/motion/PopIn';
import { PressScale } from '../../components/quest/motion/PressScale';
import { PulseRing } from '../../components/quest/motion/PulseRing';
import { Shine } from '../../components/quest/motion/Shine';
import { SparkleBurst } from '../../components/quest/motion/SparkleBurst';

let renderer: ReactTestRenderer | undefined;

async function mount(el: React.ReactElement, reduced = false) {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(reduced);
  await act(async () => {
    renderer = create(el);
  });
  return renderer!;
}
const advance = (ms: number) =>
  act(() => {
    jest.advanceTimersByTime(ms);
  });
const flat = (style: unknown) => StyleSheet.flatten(style as never) as Record<string, unknown>;
const scaleOf = (node: { props: { style: unknown } }) => {
  const t = (flat(node.props.style).transform as { scale?: number }[] | undefined)?.find((x) => x.scale !== undefined);
  return t?.scale as number;
};
const text = (r: ReactTestRenderer) => JSON.stringify(r.toJSON());
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = (r: ReactTestRenderer) => r.toJSON() as unknown as any;
/** pointerEvents lives in the style now (the prop form is deprecated on web). */
const pointer = (props: { pointerEvents?: string; style?: unknown }) => props.pointerEvents ?? (StyleSheet.flatten(props.style as never) as { pointerEvents?: string } | undefined)?.pointerEvents;
/** True when some <Text> renders exactly this string (the accessibility label text does not count). */
const hasText = (r: ReactTestRenderer, value: string) =>
  r.root.findAllByType(Text).some((t) => [t.props.children].flat(5).join('') === value);

describe('motion kit', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('FadeInUp', () => {
    it('has its content in the tree on the first render, then settles fully visible', async () => {
      const r = await mount(
        <FadeInUp>
          <Text>hello</Text>
        </FadeInUp>
      );
      expect(text(r)).toContain('hello');
      expect(flat(json(r).props.style).opacity).toBeLessThan(1);
      await advance(1000);
      expect(flat(json(r).props.style).opacity).toBe(1);
    });

    it('is already at rest with reduced motion, and when animate is off', async () => {
      const r = await mount(
        <FadeInUp>
          <Text>x</Text>
        </FadeInUp>,
        true
      );
      expect(flat(json(r).props.style).opacity).toBe(1);
      act(() => r.unmount());
      const r2 = await mount(
        <FadeInUp animate={false}>
          <Text>y</Text>
        </FadeInUp>
      );
      expect(flat(json(r2).props.style).opacity).toBe(1);
    });

    it('later items in a stagger start later', async () => {
      const r = await mount(
        <View>
          <FadeInUp index={0}>
            <Text>a</Text>
          </FadeInUp>
          <FadeInUp index={5}>
            <Text>b</Text>
          </FadeInUp>
        </View>
      );
      await advance(150);
      const [a, b] = json(r).children.map((c: { props: { style: unknown } }) => flat(c.props.style).opacity as number);
      expect(a).toBeGreaterThan(0.3);
      expect(b).toBe(0);
    });
  });

  describe('PressScale', () => {
    it('presses down and springs back, and still calls onPress', async () => {
      const onPress = jest.fn();
      const r = await mount(
        <PressScale scaleTo={0.9} accessibilityLabel="go" onPress={onPress}>
          <Text>go</Text>
        </PressScale>
      );
      const pressable = r.root.findAll((n) => n.props.accessibilityLabel === 'go' && typeof n.props.onPressIn === 'function')[0];
      const wrapper = () => json(r);
      expect(scaleOf(wrapper())).toBe(1);
      act(() => pressable.props.onPressIn({}));
      await advance(200);
      expect(scaleOf(wrapper())).toBeCloseTo(0.9, 2);
      act(() => pressable.props.onPressOut({}));
      await advance(300);
      expect(scaleOf(wrapper())).toBeCloseTo(1, 2);
      act(() => pressable.props.onPress());
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('does not scale with reduced motion', async () => {
      const r = await mount(
        <PressScale accessibilityLabel="go" onPress={() => undefined}>
          <Text>go</Text>
        </PressScale>,
        true
      );
      const pressable = r.root.findAll((n) => n.props.accessibilityLabel === 'go' && typeof n.props.onPressIn === 'function')[0];
      act(() => pressable.props.onPressIn({}));
      await advance(300);
      expect(scaleOf(json(r))).toBe(1);
    });
  });

  describe('AnimatedNumber', () => {
    const view = (n: number) => (
      <AnimatedNumber value={n} duration={500}>
        {(shown) => <Text>{`n=${shown}`}</Text>}
      </AnimatedNumber>
    );

    it('shows the first value at once, counts to a new one and ends exactly on it', async () => {
      const r = await mount(view(100));
      expect(text(r)).toContain('n=100'); // no count-up from zero on first render
      await act(async () => r.update(view(200)));
      await advance(250);
      const mid = Number(/n=(\d+)/.exec(text(r))![1]);
      expect(mid).toBeGreaterThan(100);
      expect(mid).toBeLessThan(200);
      await advance(600);
      expect(text(r)).toContain('n=200');
    });

    it('jumps straight to the new value with reduced motion', async () => {
      const r = await mount(view(100), true);
      await act(async () => r.update(view(300)));
      expect(text(r)).toContain('n=300');
    });

    it('stops its animation when unmounted mid-count', async () => {
      const r = await mount(view(0));
      await act(async () => r.update(view(500)));
      await advance(100);
      act(() => r.unmount());
      renderer = undefined;
      expect(jest.getTimerCount()).toBe(0);
    });
  });

  describe('PopIn', () => {
    it('pops when it becomes active and settles at full size', async () => {
      const tree = (active: boolean) => (
        <PopIn active={active} playOnMount={false}>
          <Text>ok</Text>
        </PopIn>
      );
      const r = await mount(tree(false));
      const node = () => json(r);
      expect(scaleOf(node())).toBe(1);
      await act(async () => r.update(tree(true)));
      expect(scaleOf(node())).toBeLessThan(1);
      await advance(1500);
      expect(scaleOf(node())).toBeCloseTo(1, 2);
    });

    it('does not pop for something that was already active at mount (playOnMount off)', async () => {
      const r = await mount(
        <PopIn active playOnMount={false}>
          <Text>ok</Text>
        </PopIn>
      );
      expect(scaleOf(json(r))).toBe(1);
    });
  });

  describe('Bump', () => {
    it('swells when the value changes and settles back, but not on first render', async () => {
      const tree = (v: number) => (
        <Bump value={v}>
          <Text>{v}</Text>
        </Bump>
      );
      const r = await mount(tree(1));
      const node = () => json(r);
      expect(scaleOf(node())).toBe(1);
      await act(async () => r.update(tree(2)));
      expect(scaleOf(node())).toBeGreaterThan(1);
      await advance(1500);
      expect(scaleOf(node())).toBeCloseTo(1, 2);
    });
  });

  describe('FloatUp', () => {
    const tree = (play: boolean) => (
      <FloatUp play={play}>
        <Text>+60 XP</Text>
      </FloatUp>
    );

    it('renders nothing until play turns true, then rises and removes itself', async () => {
      const r = await mount(tree(false));
      expect(r.toJSON()).toBeNull();
      await act(async () => r.update(tree(true)));
      expect(text(r)).toContain('+60 XP');
      await advance(1500);
      expect(r.toJSON()).toBeNull();
    });

    it('does not play when already true at mount, nor with reduced motion', async () => {
      const r = await mount(tree(true));
      expect(r.toJSON()).toBeNull();
      act(() => r.unmount());
      const r2 = await mount(tree(false), true);
      await act(async () => r2.update(tree(true)));
      expect(r2.toJSON()).toBeNull();
    });
  });

  describe('SparkleBurst', () => {
    it('draws particles while it runs and nothing afterwards', async () => {
      const r = await mount(<SparkleBurst count={6} />);
      expect(json(r).children).toHaveLength(6);
      await advance(1500);
      expect(r.toJSON()).toBeNull();
    });

    it('draws nothing with reduced motion', async () => {
      const r = await mount(<SparkleBurst />, true);
      expect(r.toJSON()).toBeNull();
    });
  });

  describe('Shine and PulseRing', () => {
    it('Shine is decorative: it plays once and takes no touches; absent with reduced motion', async () => {
      const r = await mount(<Shine size={52} />);
      expect(pointer(json(r).props)).toBe('none');
      act(() => r.unmount());
      const r2 = await mount(<Shine size={52} />, true);
      expect(r2.toJSON()).toBeNull();
    });

    it('PulseRing loops while mounted, draws nothing with reduced motion, and leaves no timers behind', async () => {
      const r = await mount(<PulseRing color="#fff" borderRadius={8} />);
      expect(pointer(json(r).props)).toBe('none');
      await advance(5000);
      expect(r.toJSON()).not.toBeNull(); // still looping, not crashed
      act(() => r.unmount());
      renderer = undefined;
      await advance(100); // a looping animation would keep scheduling frames forever; a stopped one leaves nothing
      expect(jest.getTimerCount()).toBe(0);
      const r2 = await mount(<PulseRing color="#fff" borderRadius={8} />, true);
      expect(r2.toJSON()).toBeNull();
      await advance(100);
      expect(jest.getTimerCount()).toBe(0);
    });

    it('PulseRing can be switched off with active=false', async () => {
      const r = await mount(<PulseRing color="#fff" borderRadius={8} active={false} />);
      expect(r.toJSON()).toBeNull();
    });
  });

  describe('XpBar', () => {
    const fillWidth = (r: ReactTestRenderer) => {
      const bar = r.root.findAll((n) => n.props.accessibilityRole === 'progressbar')[0];
      return bar;
    };
    it('keeps its accessible value from the first render while the fill animates in', async () => {
      const r = await mount(<XpBar ratio={0.5} accessibilityLabel="xp" />);
      expect(fillWidth(r).props.accessibilityValue).toEqual({ min: 0, max: 100, now: 50 });
      await advance(1000);
      expect(fillWidth(r).props.accessibilityValue.now).toBe(50);
    });

    it('can start full and drain (boss HP) and ends on the real value', async () => {
      const r = await mount(<XpBar ratio={0.25} from={1} />);
      await advance(1000);
      const inner = json(r).children[0];
      expect(flat(inner.props.style).width).toBe('25%');
    });
  });

  describe('MissionRow', () => {
    const row = (status: 'open' | 'done') => <MissionRow title="Tập luyện" subtitle="s" status={status} xp={60} statusLabel="x" />;

    it('shows its content at once and floats "+60 XP" only when a mission becomes done', async () => {
      const r = await mount(row('open'));
      expect(text(r)).toContain('Tập luyện');
      expect(hasText(r, '+60 XP')).toBe(false);
      await act(async () => r.update(row('done')));
      expect(hasText(r, '+60 XP')).toBe(true);
      await advance(1500);
      expect(hasText(r, '+60 XP')).toBe(false);
      expect(text(r)).toContain('Tập luyện');
    });

    it('does not float anything for a mission that was already done, or with reduced motion', async () => {
      const r = await mount(row('done'));
      expect(hasText(r, '+60 XP')).toBe(false);
      act(() => r.unmount());
      const r2 = await mount(row('open'), true);
      await act(async () => r2.update(row('done')));
      expect(hasText(r2, '+60 XP')).toBe(false);
    });
  });
});
