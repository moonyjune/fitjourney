import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Image, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({}),
  useFocusEffect: () => undefined,
}));
jest.mock('expo-status-bar', () => ({ setStatusBarStyle: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../../utils/photoStorage', () => ({ persistPickedPhoto: jest.fn(), deletePersistedPhoto: jest.fn(async () => undefined) }));

type PhotosOutcome = { ok: true; dishes: unknown[]; sample?: boolean } | { ok: false; message: string; kind: string };
const mockPhotos = jest.fn<(names: string[]) => Promise<PhotosOutcome>>();
const mockDinner = jest.fn<(...a: unknown[]) => Promise<unknown>>();
jest.mock('../../sync/cloudSync', () => ({
  pushUserData: jest.fn(),
  requestDishPhotos: (names: string[]) => mockPhotos(names),
  requestDinner: (...a: unknown[]) => mockDinner(...a),
  requestCheatPlaces: jest.fn(),
  shareToCookbook: jest.fn(async () => undefined),
  searchSharedCookbookFiltered: jest.fn(async () => ({ ok: true, ideas: [] })),
  requestDishRecipe: jest.fn(),
}));

import CheatDayScreen from '../../../app/cheat-day';
import CookbookScreen from '../../../app/cookbook';
import { recipeFromIdea } from '../../cookbook/recipes';
import { fakeCheatDinner } from '../../ai/devPhotoAnalysis';
import { useDishPhotos } from '../../ai/useDishPhotos';
import { DishPhoto, DishPhotoCredit } from '../../components/quest/DishPhoto';
import { TemptationDialog, TYPING_MS } from '../../components/quest/TemptationDialog';
import type { TemptItem } from '../../temptation/item';
import { useCookbookFinderStore } from '../../store/useCookbookFinderStore';
import { useCookbookStore } from '../../store/useCookbookStore';
import { resetDishPhotoStore } from '../../store/useDishPhotoStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import {
  cacheFresh,
  cleanDishPhoto,
  cleanDishPhotoAnswer,
  cleanDishPhotoRequest,
  cleanPicks,
  dishKey,
  englishHint,
  openverseSearchUrl,
  parseOpenverse,
  parseWikimedia,
  photoMime,
  photoUserAgent,
  pickCandidates,
  reusableLicense,
  wikimediaSearchUrl,
  type PhotoCandidate,
} from '../../../supabase/functions/_shared/dishPhoto';
import { DAILY_QUOTA } from '../../../supabase/functions/_shared/usage';

const PHOTO = { url: 'https://upload.wikimedia.org/x/640px-Pho.jpg', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Pho.jpg', author: 'Ann', license: 'CC BY-SA 4.0', source: 'wikimedia' as const };

const wikiPage = (index: number, title: string, info: Record<string, unknown>, meta: Record<string, string>) => ({
  pageid: index,
  ns: 6,
  title,
  index,
  imageinfo: [
    {
      thumburl: `https://upload.wikimedia.org/thumb/${index}/640px-a.jpg`,
      descriptionurl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(title)}`,
      mime: 'image/jpeg',
      width: 4000,
      ...info,
      extmetadata: Object.fromEntries(Object.entries(meta).map(([k, v]) => [k, { value: v }])),
    },
  ],
});

const WIKI_FIXTURE = {
  query: {
    pages: [
      wikiPage(3, 'File:Phở bò 03.jpg', {}, { License: 'cc-by-sa-4.0', LicenseShortName: 'CC BY-SA 4.0', Artist: '<a href="//commons.wikimedia.org/wiki/User:K">K &amp; Co</a>' }),
      wikiPage(1, 'File:Phở bò 01.jpg', {}, { License: 'cc0', LicenseShortName: 'CC0' }),
      wikiPage(2, 'File:Pho logo.svg', { mime: 'image/svg+xml', thumburl: 'https://upload.wikimedia.org/thumb/2/640px-a.png' }, { License: 'cc0' }),
      wikiPage(4, 'File:Pho NC.jpg', {}, { License: 'cc-by-nc-sa-2.0', LicenseShortName: 'CC BY-NC-SA 2.0' }),
      wikiPage(5, 'File:Pho tiny.jpg', { width: 120 }, { License: 'pd' }),
      wikiPage(6, 'File:Pho fair use.jpg', {}, { LicenseShortName: 'Fair use' }),
      wikiPage(7, 'File:Pho insecure.jpg', { thumburl: 'http://upload.wikimedia.org/x.jpg' }, { License: 'pd' }),
    ],
  },
};

const OPENVERSE_FIXTURE = {
  result_count: 4,
  results: [
    { id: 'a', title: 'Pho in Hanoi', url: 'https://live.staticflickr.com/1/a.jpg', thumbnail: 'https://api.openverse.org/v1/images/a/thumb/', creator: 'Bob', license: 'by', license_version: '2.0', foreign_landing_url: 'https://www.flickr.com/photos/bob/1', filetype: 'jpg', width: 1024, mature: false },
    { id: 'b', title: 'Pho NC', url: 'https://live.staticflickr.com/1/b.jpg', creator: 'Cy', license: 'by-nc', license_version: '2.0', foreign_landing_url: 'https://www.flickr.com/photos/cy/2', filetype: 'jpg', width: 1024 },
    { id: 'c', title: 'Pho gif', url: 'https://example.org/c.gif', creator: 'Di', license: 'cc0', foreign_landing_url: 'https://example.org/c', filetype: 'gif', width: 800 },
    { id: 'd', title: 'Pho public', url: 'https://example.org/d.png', creator: '', provider: 'museum', license: 'pdm', foreign_landing_url: 'https://example.org/d', filetype: null, width: 800 },
    { id: 'e', title: 'Mature', url: 'https://example.org/e.jpg', license: 'cc0', foreign_landing_url: 'https://example.org/e', filetype: 'jpg', mature: true },
  ],
};

describe('dish photos (server, pure)', () => {
  it('dishKey: lower case, no accents (đ too), punctuation and extra spaces gone, trimmed', () => {
    expect(dishKey('  Phở   Bò! ')).toBe('pho bo');
    expect(dishKey('Bún đậu mắm tôm')).toBe('bun dau mam tom');
    expect(dishKey('ĐẬU HŨ chiên (giòn)')).toBe('dau hu chien gion');
    expect(dishKey('Cà phê sữa đá')).toBe(dishKey('ca phe  sua da'));
    expect(dishKey('🍜 !!')).toBe('');
    expect(dishKey('a'.repeat(300))).toHaveLength(100);
  });

  it('englishHint: known words translated, longest phrase first, the rest kept without accents', () => {
    expect(englishHint('Phở bò')).toBe('pho noodle soup beef');
    expect(englishHint('Trà sữa trân châu')).toBe('bubble tea');
    expect(englishHint('Gà rán')).toBe('fried chicken');
    expect(englishHint('Bánh tráng nướng')).toBe('banh trang grilled');
  });

  it('cleans the request: names (or strings), one per key, at most 6, the hint made when not given', () => {
    expect(cleanDishPhotoRequest({})).toBeNull();
    expect(cleanDishPhotoRequest({ dishes: [{ name: '  ' }, 5] })).toBeNull();
    const dishes = cleanDishPhotoRequest({ dishes: [{ name: 'Phở <bò>' }, 'phở bò', { name: 'Bún chả', en: 'bun cha' }, ...'abcdefgh'.split('').map((c) => `Món ${c}`)] })!;
    expect(dishes).toHaveLength(6);
    expect(dishes[0]).toEqual({ name: 'Phở bò', nameKey: 'pho bo', core: 'Phở bò', en: 'pho noodle soup beef', key: 'pho bo', queries: ['phở bò'] });
    expect(dishes[1]).toEqual({ name: 'Bún chả', nameKey: 'bun cha', core: 'Bún chả', en: 'bun cha', key: 'bun cha', queries: ['bún chả'] });
  });

  it('search URLs ask for files with thumbnail, mime and licence (Wikimedia) and reusable licences only (Openverse)', () => {
    const w = new URL(wikimediaSearchUrl('phở bò'));
    expect(w.hostname).toBe('commons.wikimedia.org');
    expect(w.searchParams.get('generator')).toBe('search');
    expect(w.searchParams.get('gsrnamespace')).toBe('6');
    expect(w.searchParams.get('iiprop')).toBe('url|extmetadata|mime|size');
    expect(w.searchParams.get('iiurlwidth')).toBe('640');
    expect(w.searchParams.get('gsrsearch')).toBe('phở bò');
    const o = new URL(openverseSearchUrl('pho beef'));
    expect(o.hostname).toBe('api.openverse.org');
    expect(o.searchParams.get('license')).toBe('cc0,pdm,by,by-sa');
    expect(photoUserAgent()).toMatch(/^FitQuest\/1\.0 \(/);
    expect(photoUserAgent('https://example.org/contact')).toContain('https://example.org/contact');
  });

  it('licences: CC0, public domain, CC BY, CC BY-SA only; photos: jpeg/png/webp only', () => {
    for (const ok of ['cc0', 'pd', 'pdm', 'cc-by-4.0', 'cc-by-sa-3.0', 'cc-by-sa-3.0-de', 'by', 'by-sa', 'CC BY-SA 4.0', 'Public domain']) expect([ok, reusableLicense(ok)]).toEqual([ok, true]);
    for (const no of ['', 'by-nc', 'by-nd', 'cc-by-nc-sa-2.0', 'CC BY-NC 2.0', 'gfdl', 'Fair use', 'sampling+', null]) expect([no, reusableLicense(no)]).toEqual([no, false]);
    expect(photoMime('image/jpeg')).toBe('image/jpeg');
    expect(photoMime('image/webp; charset=x')).toBe('image/webp');
    expect(photoMime('image/svg+xml')).toBeNull();
    expect(photoMime('image/gif')).toBeNull();
    expect(photoMime('jpg')).toBe('image/jpeg');
    expect(photoMime(null, 'https://x.org/a.PNG?x=1')).toBe('image/png');
    expect(photoMime(undefined, 'https://x.org/a.tif')).toBeNull();
  });

  it('parses Wikimedia: search order, only https photos under a reusable licence and wide enough, author as plain text', () => {
    const list = parseWikimedia(WIKI_FIXTURE);
    expect(list.map((c) => c.title)).toEqual(['Phở bò 01', 'Phở bò 03']);
    expect(list[1]).toEqual({
      url: 'https://upload.wikimedia.org/thumb/3/640px-a.jpg',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File%3APh%E1%BB%9F%20b%C3%B2%2003.jpg',
      author: 'K & Co',
      license: 'CC BY-SA 4.0',
      source: 'wikimedia',
      title: 'Phở bò 03',
    });
    expect(list[0].author).toBe('Wikimedia Commons');
    expect(parseWikimedia({})).toEqual([]);
    expect(parseWikimedia({ query: { pages: { 1: WIKI_FIXTURE.query.pages[1] } } })).toHaveLength(1);
  });

  it('parses Openverse: reusable licences, photos, not mature; the thumbnail is shown, the licence named', () => {
    const list = parseOpenverse(OPENVERSE_FIXTURE);
    expect(list).toEqual([
      { url: 'https://api.openverse.org/v1/images/a/thumb/', sourceUrl: 'https://www.flickr.com/photos/bob/1', author: 'Bob', license: 'CC BY 2.0', source: 'openverse', title: 'Pho in Hanoi' },
      { url: 'https://example.org/d.png', sourceUrl: 'https://example.org/d', author: 'museum', license: 'Public domain', source: 'openverse', title: 'Pho public' },
    ]);
    expect(parseOpenverse({ results: 'x' })).toEqual([]);
  });

  it('picks candidates from both libraries in turn, each once, without signs and menus, at most 3', () => {
    const c = (source: 'wikimedia' | 'openverse', n: number, title = `photo ${n}`): PhotoCandidate => ({ url: `https://x.org/${source}${n}.jpg`, sourceUrl: `https://x.org/${source}${n}`, author: 'a', license: 'CC0', source, title });
    const picked = pickCandidates([[c('wikimedia', 1, 'Pho restaurant sign'), c('wikimedia', 2), c('wikimedia', 3)], [c('openverse', 1), c('openverse', 1), c('openverse', 2)]]);
    expect(picked.map((p) => p.url)).toEqual(['https://x.org/wikimedia2.jpg', 'https://x.org/openverse1.jpg', 'https://x.org/wikimedia3.jpg']);
    expect(pickCandidates([[], []])).toEqual([]);
  });

  it('cleans the model picks: 1-based photo per dish, 0 / out of range / repeated / unknown dish is none', () => {
    expect(cleanPicks({ picks: [{ dish: 1, photo: 2 }, { dish: 2, photo: 0 }, { dish: 3, photo: 4 }] }, [3, 2, 3])).toEqual([1, null, null]);
    expect(cleanPicks({ picks: [{ dish: 1, photo: 1 }, { dish: 1, photo: 3 }, { dish: 9, photo: 1 }, { dish: 'x', photo: 1 }] }, [3, 1])).toEqual([0, null]);
    expect(cleanPicks(null, [2])).toEqual([null]);
  });

  it('cache rows: a photo is kept, a "none" is tried again after 30 days', () => {
    const now = new Date('2026-11-02T00:00:00Z');
    expect(cacheFresh({ photo: PHOTO, checked_at: '2020-01-01T00:00:00Z' }, now)).toBe(true);
    expect(cacheFresh({ photo: { url: 'http://x' }, checked_at: '2026-11-01T00:00:00Z' }, now)).toBe(false);
    expect(cacheFresh({ photo: null, checked_at: '2026-10-20T00:00:00Z' }, now)).toBe(true);
    expect(cacheFresh({ photo: null, checked_at: '2026-09-01T00:00:00Z' }, now)).toBe(false);
    expect(cacheFresh({ photo: null, checked_at: 'nope' }, now)).toBe(false);
  });

  it('sanitises the answer: https URLs, a known source, short texts, one entry per key', () => {
    expect(cleanDishPhoto(PHOTO)).toEqual(PHOTO);
    expect(cleanDishPhoto({ ...PHOTO, url: 'javascript:alert(1)' })).toBeNull();
    expect(cleanDishPhoto({ ...PHOTO, sourceUrl: 'http://commons.wikimedia.org/x' })).toBeNull();
    expect(cleanDishPhoto({ ...PHOTO, source: 'google' })).toBeNull();
    expect(cleanDishPhoto({ ...PHOTO, author: `<b>${'x'.repeat(200)}</b>` })!.author).toHaveLength(80);
    expect(
      cleanDishPhotoAnswer({ dishes: [{ name: 'Phở bò', key: 'pho bo', photo: PHOTO }, { name: 'phở bò', photo: null }, { name: 'Bún chả', photo: { url: 'x' } }] })
    ).toEqual([
      { name: 'Phở bò', key: 'pho bo', photo: PHOTO },
      { name: 'Bún chả', key: 'bun cha', photo: null },
    ]);
    expect(cleanDishPhotoAnswer(undefined)).toEqual([]);
  });

  it('has a daily quota', () => {
    expect(DAILY_QUOTA.dishphoto).toBe(40);
  });
});

const wait = (ms: number) => act(async () => {
  await new Promise((resolve) => setTimeout(resolve, ms));
});

function images(r: ReactTestRenderer): string[] {
  return r.root.findAllByType(Image).map((n) => (n.props.source as { uri: string }).uri);
}
function allText(r: ReactTestRenderer): string {
  return r.root
    .findAllByType(Text)
    .map((n) => n.props.children)
    .flat()
    .filter((c: unknown) => typeof c === 'string')
    .join(' ');
}

describe('dish photos (app)', () => {
  let renderer: ReactTestRenderer | undefined;
  beforeEach(() => {
    jest.clearAllMocks();
    resetDishPhotoStore();
    useSettingsStore.setState({ language: 'vi' });
    mockPhotos.mockImplementation(async (names) => ({ ok: true, dishes: names.map((name) => ({ name, key: dishKey(name), photo: PHOTO })) }));
  });
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('useDishPhotos: the asks of one moment go out once, each dish once, and are not asked again on a re-render', async () => {
    const seen: Record<string, unknown>[] = [];
    function Probe({ names }: { names: string[] }) {
      seen.push(useDishPhotos(names));
      return null;
    }
    await act(async () => {
      renderer = create(
        <>
          <Probe names={['Phở bò', 'phở  bò', 'Bún chả']} />
          <DishPhoto name="PHỞ BÒ" emoji="🍜" size={40} />
        </>
      );
    });
    await wait(80);
    expect(mockPhotos).toHaveBeenCalledTimes(1);
    expect(mockPhotos.mock.calls[0][0]).toEqual(['Phở bò', 'Bún chả']);
    expect(seen[seen.length - 1]['Bún chả']).toEqual({ status: 'done', photo: PHOTO, at: expect.any(Number) });
    await act(async () => {
      renderer!.update(<Probe names={['Bún chả', 'Phở bò']} />);
    });
    await wait(80);
    expect(mockPhotos).toHaveBeenCalledTimes(1);
  });

  it('DishPhoto: the photo with its credit when found; the emoji when none, when the request fails, or when the picture does not load', async () => {
    mockPhotos.mockImplementation(async (names) => ({ ok: true, dishes: names.map((name) => ({ name, key: dishKey(name), photo: name === 'Phở bò' ? PHOTO : null })) }));
    await act(async () => {
      renderer = create(
        <>
          <DishPhoto name="Phở bò" emoji="🍜" size={56} />
          <DishPhotoCredit name="Phở bò" />
          <DishPhoto name="Món lạ" emoji="🥘" size={56} />
          <DishPhotoCredit name="Món lạ" />
        </>
      );
    });
    // While asking: the emojis with a shimmer.
    expect(allText(renderer!)).toContain('🍜');
    expect(renderer!.root.findAllByProps({ testID: 'dish-photo-shimmer' }).length).toBeGreaterThan(0);
    await wait(80);
    expect(images(renderer!)).toEqual([PHOTO.url]);
    const text = allText(renderer!);
    expect(text).toContain('🥘');
    expect(text).not.toContain('🍜');
    expect(text).toContain('Ảnh: Ann · CC BY-SA 4.0 · Wikimedia');
    // A picture that does not load: back to the emoji, no credit.
    await act(async () => {
      renderer!.root.findByType(Image).props.onError();
    });
    expect(images(renderer!)).toEqual([]);
    expect(allText(renderer!)).toContain('🍜');
    expect(allText(renderer!)).not.toContain('Ảnh:');
  });

  it('DishPhoto: a failed request (AI off, offline) shows the emoji', async () => {
    mockPhotos.mockResolvedValue({ ok: false, message: 'AI đã tắt trên thiết bị này.', kind: 'disabled' });
    await act(async () => {
      renderer = create(<DishPhoto name="Phở bò" emoji="🍜" size={56} />);
    });
    await wait(80);
    expect(images(renderer!)).toEqual([]);
    expect(allText(renderer!)).toContain('🍜');
    expect(renderer!.root.findAllByProps({ testID: 'dish-photo-shimmer' })).toHaveLength(0);
  });

  it('Cook book grid: each card shows the dish\'s real photo (one request for the batch)', async () => {
    useCookbookFinderStore.getState().reset();
    const dish = (name: string) => recipeFromIdea({ name, calories: 400, proteinG: 30, purineMg: 100, saltG: 1, sugarG: 2, source: 'book' });
    useCookbookStore.setState({ recipes: [dish('Bún chả ít bún'), dish('Salad ức gà'), dish('Canh chua cá lóc')] });
    await act(async () => {
      renderer = create(<CookbookScreen />);
    });
    await wait(80);
    expect(mockPhotos).toHaveBeenCalledTimes(1);
    expect(mockPhotos.mock.calls[0][0]).toEqual(expect.arrayContaining(['Bún chả ít bún', 'Salad ức gà', 'Canh chua cá lóc']));
    expect(images(renderer!)).toEqual([PHOTO.url, PHOTO.url, PHOTO.url]);
  });

  it('Cheat day: the AI cheat dishes show their real photo and its credit', async () => {
    useCookbookFinderStore.getState().reset();
    useCookbookStore.setState({ recipes: [] });
    mockDinner.mockResolvedValue({ ok: true, result: fakeCheatDinner('home') });
    await act(async () => {
      renderer = create(<CheatDayScreen />);
    });
    const press = async (label: string) => {
      const node = renderer!.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label)[0];
      if (!node) throw new Error(`no "${label}"`);
      await act(async () => {
        node.props.onPress();
      });
    };
    await press('Tự nấu');
    await press('Gợi ý món tự nấu');
    await wait(80);
    expect(mockPhotos).toHaveBeenCalled();
    const asked = mockPhotos.mock.calls.flatMap((c) => c[0]);
    const cheatNames = useCookbookFinderStore.getState().cheatAi.map((i) => i.name);
    expect(cheatNames.length).toBeGreaterThan(0);
    for (const name of cheatNames) expect(asked).toContain(name);
    expect(images(renderer!).length).toBe(cheatNames.length);
    expect(images(renderer!).every((u) => u === PHOTO.url)).toBe(true);
    expect(allText(renderer!)).toContain('Ảnh: Ann · CC BY-SA 4.0 · Wikimedia');
  });

  it('Temptation pop-up: an item without its own picture shows the real photo of the dish; one with its own picture asks for none', async () => {
    const item: TemptItem = { id: 'ai:Trà sữa', name: 'Trà sữa trân châu', emoji: '🧋', color: '#a0522d', kcal: 400, sugarG: 40, purineMg: 0, lines: ['Uống không?'], boss: 'tea', source: 'ai' };
    const props = { onAnswer: jest.fn(), onLog: jest.fn(), onClose: jest.fn(), streak: 0 };
    await act(async () => {
      renderer = create(<TemptationDialog open={{ item, practice: true }} {...props} />);
    });
    await wait(80);
    // Asked for at once, while the boss is still typing.
    expect(mockPhotos.mock.calls.flatMap((c) => c[0])).toEqual(['Trà sữa trân châu']);
    for (let i = 0; i < 3; i++) await wait(TYPING_MS + 50);
    expect(images(renderer!)).toEqual([PHOTO.url]);
    expect(allText(renderer!)).toContain('Ảnh: Ann · CC BY-SA 4.0 · Wikimedia');
    act(() => renderer!.unmount());
    mockPhotos.mockClear();
    const own = { ...item, id: 'ai:own', name: 'Bánh flan', imageUrl: 'https://shop.example.org/flan.jpg' };
    await act(async () => {
      renderer = create(<TemptationDialog open={{ item: own, practice: true }} {...props} />);
    });
    for (let i = 0; i < 3; i++) await wait(TYPING_MS + 50);
    expect(mockPhotos).not.toHaveBeenCalled();
    expect(images(renderer!)).toEqual([own.imageUrl]);
    // Six real typing waits (~4.7 s): more room than jest's default 5 s, which made it flaky under load.
  }, 15_000);
});
