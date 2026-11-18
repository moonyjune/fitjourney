import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Image, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({}),
  useFocusEffect: () => undefined,
}));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const mockReport = jest.fn<(r: unknown) => Promise<unknown>>(async () => ({ ok: true, flagged: true }));
const mockPush = jest.fn();
jest.mock('../../sync/cloudSync', () => ({
  pushUserData: (...a: unknown[]) => mockPush(...a),
  requestDishPhotos: jest.fn(async () => ({ ok: false, message: 'off', kind: 'disabled' })),
  requestPhotoReport: (r: unknown) => mockReport(r),
}));

import { DishPhoto, DishPhotoCredit } from '../../components/quest/DishPhoto';
import { TemptationDialog, TYPING_MS } from '../../components/quest/TemptationDialog';
import { reportWrongPhoto } from '../../ai/photoReport';
import { resetDishPhotoStore, useDishPhotoStore } from '../../store/useDishPhotoStore';
import { cleanHiddenPhotos, isPhotoHidden, useHiddenPhotoStore } from '../../store/useHiddenPhotoStore';
import { useToastStore } from '../../store/useToastStore';
import type { TemptItem } from '../../temptation/item';
import { USER_DATA_KEYS } from '../../sync/userDataKeys';
import { cacheBad, cacheEntry, cachePhotoValue, dishKey, DISH_PHOTO_VERSION } from '../../../supabase/functions/_shared/dishPhoto';
import {
  badPictures,
  cleanReportRequest,
  flagStored,
  isPhotoFlagged,
  poolItemPicture,
  readPhotoFlag,
  reportAllowed,
  reporterTag,
  REPORTS_PER_DAY,
  samePicture,
  withPhotoFlag,
} from '../../../supabase/functions/_shared/photoReport';

const PHOTO = { url: 'https://upload.wikimedia.org/x/640px-Pho.jpg', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Pho.jpg', author: 'Ann', license: 'CC BY-SA 4.0', source: 'wikimedia' as const };
const NOW = new Date('2026-11-19T10:00:00Z');

const wait = (ms: number) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
const images = (r: ReactTestRenderer): string[] => r.root.findAllByType(Image).map((n) => (n.props.source as { uri: string }).uri);
const allText = (r: ReactTestRenderer): string =>
  r.root
    .findAllByType(Text)
    .map((n) => n.props.children)
    .flat()
    .filter((c) => typeof c === 'string' || typeof c === 'number')
    .join(' ');
const chips = (r: ReactTestRenderer) => r.root.findAll((n) => n.props?.testID === 'photo-report-chip' && typeof n.props?.onPress === 'function');

describe('report-photo: the pure rules (server)', () => {
  it('cleans a request: a known kind, a dish name, an https picture; a pool id only for a temptation', () => {
    expect(cleanReportRequest({ kind: 'dish', name: '  Phở   bò ', url: PHOTO.url })).toEqual({ kind: 'dish', name: 'Phở bò', url: PHOTO.url });
    const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
    expect(cleanReportRequest({ kind: 'tempt', name: 'Trà sữa', url: 'https://a.vn/x.jpg', poolId: id })).toEqual({ kind: 'tempt', name: 'Trà sữa', url: 'https://a.vn/x.jpg', poolId: id });
    expect(cleanReportRequest({ kind: 'dish', name: 'Phở', url: 'https://a.vn/x.jpg', poolId: id })).not.toHaveProperty('poolId');
    expect(cleanReportRequest({ kind: 'tempt', name: 'Trà', url: 'https://a.vn/x.jpg', poolId: 'nope' })).not.toHaveProperty('poolId');
    expect(cleanReportRequest({ kind: 'photo', name: 'Phở', url: PHOTO.url })).toBeNull();
    expect(cleanReportRequest({ kind: 'dish', name: '', url: PHOTO.url })).toBeNull();
    expect(cleanReportRequest({ kind: 'dish', name: 'Phở', url: 'http://a.vn/x.jpg' })).toBeNull();
    expect(cleanReportRequest(null)).toBeNull();
  });

  it('flags a photo inside its jsonb: count and lastAt, each player once, the first URL kept', () => {
    const a = withPhotoFlag({ ...PHOTO, v: 3 }, PHOTO.url, reporterTag('11111111-2222-3333-4444-555555555555'), NOW);
    expect(a.counted).toBe(true);
    expect(a.value).toMatchObject({ ...PHOTO, v: 3, photoFlag: { count: 1, lastAt: NOW.toISOString(), url: PHOTO.url, by: ['111111112222'] } });
    const later = new Date(NOW.getTime() + 60_000);
    const again = withPhotoFlag(a.value, PHOTO.url, '111111112222', later);
    expect(again.counted).toBe(false);
    expect(readPhotoFlag(again.value)).toEqual({ count: 1, lastAt: later.toISOString(), url: PHOTO.url, by: ['111111112222'] });
    const other = withPhotoFlag(again.value, PHOTO.url, 'bbbbbbbbbbbb', later);
    expect(readPhotoFlag(other.value)?.count).toBe(2);
    expect(isPhotoFlagged(other.value)).toBe(true);
    expect(isPhotoFlagged(PHOTO)).toBe(false);
  });

  it('flags only the picture that was reported: a replaced photo or a "none" row is left alone', () => {
    const query = `${PHOTO.url}?width=640`;
    expect(samePicture(PHOTO.url, query)).toBe(true);
    expect(flagStored(PHOTO, PHOTO.url, query, 'u1', NOW)).toMatchObject({ ok: true, counted: true });
    expect(flagStored(PHOTO, PHOTO.url, 'https://other.org/a.jpg', 'u1', NOW)).toEqual({ ok: false, why: 'other' });
    expect(flagStored({ none: true }, null, PHOTO.url, 'u1', NOW)).toEqual({ ok: false, why: 'none' });
    // A temptation pool item: its own picture, else its photo's.
    expect(poolItemPicture({ name: 'Trà sữa', imageUrl: 'https://a.vn/ts.jpg' })).toBe('https://a.vn/ts.jpg');
    expect(poolItemPicture({ name: 'Trà sữa', photo: { url: 'https://b.vn/ts.jpg' } })).toBe('https://b.vn/ts.jpg');
    const pool = flagStored({ name: 'Trà sữa', imageUrl: 'https://a.vn/ts.jpg', kcal: 400 }, 'https://a.vn/ts.jpg', 'https://a.vn/ts.jpg', 'u1', NOW);
    expect(pool.ok && pool.value).toMatchObject({ name: 'Trà sữa', kcal: 400, photoFlag: { count: 1 } });
  });

  it('rate limit: REPORTS_PER_DAY a day', () => {
    expect(reportAllowed(0)).toBe(true);
    expect(reportAllowed(REPORTS_PER_DAY - 1)).toBe(true);
    expect(reportAllowed(REPORTS_PER_DAY)).toBe(false);
  });

  it('dish-photo cache: a flagged photo is never served (a fresh "none" the web was not searched for), and its picture is remembered as bad', () => {
    const flagged = withPhotoFlag(cachePhotoValue(PHOTO, false), PHOTO.url, 'u1', NOW).value;
    expect(cacheEntry({ photo: flagged, checked_at: '2026-11-01T00:00:00Z' }, NOW)).toEqual({
      fresh: true,
      photo: null,
      webTried: false,
      flagged: true,
      bad: ['upload.wikimedia.org/x/640px-Pho.jpg'],
    });
    expect(badPictures(flagged)).toEqual(['upload.wikimedia.org/x/640px-Pho.jpg']);
    expect(cacheBad(flagged)).toEqual(badPictures(flagged));
    // The bad list survives the row being rewritten (a "none" after the web search, or a new photo).
    const none = cachePhotoValue(null, true, cacheBad(flagged));
    expect(none).toEqual({ none: true, web: true, v: DISH_PHOTO_VERSION, bad: ['upload.wikimedia.org/x/640px-Pho.jpg'] });
    expect(cacheEntry({ photo: none, checked_at: '2026-11-18T00:00:00Z' }, NOW)).toMatchObject({ fresh: true, photo: null, webTried: true, flagged: false, bad: ['upload.wikimedia.org/x/640px-Pho.jpg'] });
    const next = { ...PHOTO, url: 'https://site.vn/pho.jpg', sourceUrl: 'https://site.vn/pho', source: 'web' as const };
    expect(cacheEntry({ photo: cachePhotoValue(next, true, ['a/b']), checked_at: '2026-11-18T00:00:00Z' }, NOW)).toMatchObject({ fresh: true, photo: { url: next.url }, flagged: false, bad: ['a/b'] });
    expect(cachePhotoValue(PHOTO, false)).not.toHaveProperty('bad');
  });
});

describe('"Ảnh sai?" in the app: hidden for the player at once, reported once the toast is gone', () => {
  let renderer: ReactTestRenderer | null = null;
  beforeEach(() => {
    resetDishPhotoStore();
    useHiddenPhotoStore.setState({ keys: [] });
    useToastStore.setState({ toast: null });
    mockReport.mockClear();
    mockPush.mockClear();
  });
  afterEach(() => {
    if (renderer) act(() => renderer!.unmount());
    renderer = null;
    useToastStore.getState().hide();
  });

  it('the hidden list: picture keys, each once, newest kept; saved to the cloud', () => {
    expect(cleanHiddenPhotos(['a.vn/1', 'b.vn/2', 'a.vn/1', 3, ''])).toEqual(['b.vn/2', 'a.vn/1']);
    useHiddenPhotoStore.getState().hide(`${PHOTO.url}?x=1`);
    expect(useHiddenPhotoStore.getState().keys).toEqual(['upload.wikimedia.org/x/640px-Pho.jpg']);
    expect(isPhotoHidden(useHiddenPhotoStore.getState().keys, PHOTO.url)).toBe(true);
    expect(mockPush).toHaveBeenLastCalledWith(USER_DATA_KEYS.hiddenPhotos, { keys: ['upload.wikimedia.org/x/640px-Pho.jpg'] });
    useHiddenPhotoStore.getState().unhide(PHOTO.url);
    expect(useHiddenPhotoStore.getState().keys).toEqual([]);
  });

  it('a big dish photo has the chip; tapping it shows the emoji, "Hoàn tác" brings the photo back without reporting it', async () => {
    useDishPhotoStore.getState().put({ [dishKey('Phở bò')]: { status: 'done', photo: PHOTO, at: Date.now() } });
    await act(async () => {
      renderer = create(
        <>
          <DishPhoto name="Phở bò" emoji="🍜" size={120} />
          <DishPhotoCredit name="Phở bò" />
          <DishPhoto name="Phở bò" emoji="🍜" size={40} />
        </>
      );
    });
    expect(images(renderer!)).toEqual([PHOTO.url, PHOTO.url]);
    // Only on the big picture (a 40 pt thumbnail has none).
    expect(chips(renderer!)).toHaveLength(1);
    expect(chips(renderer!)[0].props.accessibilityLabel).toBe('Ảnh sai? Báo ảnh của Phở bò không đúng món');
    expect(allText(renderer!)).toContain('Ảnh sai?');
    await act(async () => chips(renderer!)[0].props.onPress());
    // Hidden everywhere for this player: the emoji, no credit; the toast offers Hoàn tác; nothing is sent yet.
    expect(images(renderer!)).toEqual([]);
    expect(allText(renderer!)).toContain('🍜');
    expect(allText(renderer!)).not.toContain('Ảnh: Ann');
    expect(useToastStore.getState().toast?.text).toBe('Đã ẩn ảnh của Phở bò. Sẽ tìm ảnh khác cho món này.');
    expect(mockReport).not.toHaveBeenCalled();
    await act(async () => useToastStore.getState().undo());
    expect(images(renderer!)).toEqual([PHOTO.url, PHOTO.url]);
    expect(mockReport).not.toHaveBeenCalled();
  });

  it('once the toast goes without undo, the report is sent (the dish, the picture)', async () => {
    reportWrongPhoto({ kind: 'dish', name: 'Phở bò', url: PHOTO.url }, 'Đã ẩn');
    expect(useHiddenPhotoStore.getState().keys).toEqual(['upload.wikimedia.org/x/640px-Pho.jpg']);
    await act(async () => useToastStore.getState().hide());
    expect(mockReport).toHaveBeenCalledTimes(1);
    expect(mockReport).toHaveBeenCalledWith({ kind: 'dish', name: 'Phở bò', url: PHOTO.url });
    expect(useHiddenPhotoStore.getState().keys).toHaveLength(1);
  });

  it('a temptation picture of its own has the chip; the report names the pool item', async () => {
    const item: TemptItem = {
      id: 'ai:flan',
      name: 'Bánh flan',
      emoji: '🍮',
      color: '#f5c542',
      kcal: 200,
      sugarG: 20,
      purineMg: 0,
      lines: ['Ăn không?'],
      boss: 'sweet',
      source: 'ai',
      imageUrl: 'https://shop.example.org/flan.jpg',
      chat: { poolId: '0f8fad5b-d9cb-469f-a165-70867728950e' },
    };
    const props = { onAnswer: jest.fn(), onLog: jest.fn(), onClose: jest.fn(), streak: 0 };
    await act(async () => {
      renderer = create(<TemptationDialog open={{ item, practice: true }} {...props} />);
    });
    for (let i = 0; i < 3; i++) await wait(TYPING_MS + 50);
    expect(images(renderer!)).toEqual([item.imageUrl]);
    await act(async () => chips(renderer!)[0].props.onPress());
    expect(images(renderer!)).not.toContain(item.imageUrl);
    await act(async () => useToastStore.getState().hide());
    expect(mockReport).toHaveBeenCalledWith({ kind: 'tempt', name: 'Bánh flan', url: item.imageUrl, poolId: '0f8fad5b-d9cb-469f-a165-70867728950e' });
  }, 15_000);
});
