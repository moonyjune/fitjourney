import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../sync/cloudSync', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import { FoodThumb } from '../../components/quest/FoodPhoto';
import { PhotoStrip } from '../../components/quest/PhotoStrip';
import { mealCaption } from '../../utils/mealCaption';

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

const PHOTOS = [
  { uri: 'file:///a.jpg', caption: 'Tối · 19:30' },
  { uri: 'file:///b.jpg', caption: 'Tối · 19:30' },
  { uri: 'file:///c.jpg', caption: 'Tối · 19:30' },
];

describe('Photos of one meal', () => {
  let r: ReactTestRenderer | undefined;
  afterEach(() => {
    act(() => r?.unmount());
    r = undefined;
  });

  it('the "n/total" counter follows the photo swiped into view, and shows which meal and when', () => {
    act(() => {
      r = create(<PhotoStrip photos={PHOTOS} />);
    });
    const root = r!.root;
    const wrap = root.findAll((n) => typeof n.props.onLayout === 'function')[0];
    act(() => wrap.props.onLayout({ nativeEvent: { layout: { width: 300, height: 400 } } }));
    expect(allText(r!)).toContain('1/3');
    expect(allText(r!)).toContain('Tối · 19:30');
    const scroller = root.findAll((n) => typeof n.props.onScroll === 'function')[0];
    // While dragging (no end event yet, as on the web) the counter already tracks the page that covers most of the view.
    act(() => scroller.props.onScroll({ nativeEvent: { contentOffset: { x: 320, y: 0 } } }));
    expect(allText(r!)).toContain('2/3');
    act(() => scroller.props.onScroll({ nativeEvent: { contentOffset: { x: 600, y: 0 } } }));
    expect(allText(r!)).toContain('3/3');
    act(() => scroller.props.onScroll({ nativeEvent: { contentOffset: { x: 10, y: 0 } } }));
    expect(allText(r!)).toContain('1/3');
  });

  it('opening the photos of a meal shows its name, the meal and the time, starting at the first photo', () => {
    act(() => {
      r = create(<FoodThumb uris={PHOTOS.map((p) => p.uri)} name="Bún chả" caption="Trưa · 12:30" />);
    });
    const thumb = r!.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === 'Xem 3 ảnh của bữa')[0];
    act(() => thumb.props.onPress());
    const text = allText(r!);
    expect(text).toContain('Bún chả');
    expect(text).toContain('Trưa · 12:30');
    expect(text).toContain('1/3');
  });

  it('builds the caption from whatever is known', () => {
    expect(mealCaption('Tối', '2026-10-28T19:05:00')).toBe('Tối · 19:05');
    expect(mealCaption(null, '2026-10-28T07:00:00')).toBe('07:00');
    expect(mealCaption('Sáng')).toBe('Sáng');
    expect(mealCaption(undefined, 'nonsense')).toBe('');
  });
});
