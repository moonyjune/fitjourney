import { describe, expect, it } from '@jest/globals';
import {
  bestAccepted,
  cleanVerdicts,
  cleanWebPages,
  dishTokens,
  genericPhotoTitle,
  genericPictureUrl,
  libraryTitleOk,
  MIN_CONFIDENCE,
  PHOTO_CHECK_VERSION,
  pictureKey,
  poolRepairQueue,
  repairDecision,
  repairLimit,
  specificPage,
  titleMatchesDish,
  verdictAccepts,
  verdictRejects,
} from '../../../supabase/functions/_shared/photoMatch';
import { cleanDishPhoto, cleanDishPhotoRequest, DISH_PHOTO_VERSION } from '../../../supabase/functions/_shared/dishPhoto';

const dish = (name: string) => cleanDishPhotoRequest({ dishes: [{ name }] })![0];

describe('photo match (server, pure)', () => {
  it('the check versions of the cache (dishPhoto.ts) and of the matcher agree', () => {
    expect(DISH_PHOTO_VERSION).toBe(PHOTO_CHECK_VERSION);
  });

  it('dishTokens: no accents, filler words and places left out, each word once', () => {
    expect(dishTokens('Phở bò Hà Nội đặc biệt')).toEqual(['pho', 'bo']);
    expect(dishTokens('Bún bò Huế')).toEqual(['bun', 'bo', 'hue']);
    expect(dishTokens('Lẩu nấm')).toEqual(['lau', 'nam']);
    expect(dishTokens('Món ăn Việt Nam')).toEqual([]);
  });

  it('generic file titles are refused: camera names, digits, only generic words, places / people / menus', () => {
    expect(genericPhotoTitle('IMG_2041')).toBe(true);
    expect(genericPhotoTitle('DSC01234')).toBe(true);
    expect(genericPhotoTitle('20190514 123456')).toBe(true);
    expect(genericPhotoTitle('Vietnamese food in Hanoi')).toBe(true);
    expect(genericPhotoTitle('Food of Vietnam 2019')).toBe(true);
    expect(genericPhotoTitle('Pho stall in Hanoi')).toBe(true);
    expect(genericPhotoTitle('Bun cha restaurant menu')).toBe(true);
    expect(genericPhotoTitle('')).toBe(true);
    expect(genericPhotoTitle('Bún bò Huế ở Huế')).toBe(false);
    expect(genericPhotoTitle('Pho bo tai')).toBe(false);
  });

  it('a library title must name the dish: its first word and half of its first three, or two of the English hint', () => {
    expect(titleMatchesDish('Bún bò Huế (1)', dish('Bún bò Huế giò heo + chả cua (1 tô lớn)'))).toBe(true);
    expect(titleMatchesDish('Phở Hà Nội', dish('Phở bò'))).toBe(true);
    expect(titleMatchesDish('Banhmi Saigon', dish('Bánh mì thịt'))).toBe(true);
    expect(titleMatchesDish('Beef noodle soup', dish('Phở bò'))).toBe(true);
    // Another dish, or only a shared word.
    expect(titleMatchesDish('Bún chả Hà Nội', dish('Bún bò Huế'))).toBe(false);
    expect(titleMatchesDish('Bò lúc lắc', dish('Phở bò'))).toBe(false);
    expect(titleMatchesDish('Iced tea', dish('Trà sữa trân châu'))).toBe(false);
    expect(libraryTitleOk('Vietnamese food', dish('Phở bò'))).toBe(false);
    expect(libraryTitleOk('Pho bo', dish('Phở bò'))).toBe(true);
  });

  it('generic picture addresses are refused: logos, banners, share / default / theme images, tiny thumbnails, site roots', () => {
    expect(genericPictureUrl('https://site.vn/')).toBe(true);
    expect(genericPictureUrl('https://site.vn/wp-content/uploads/2023/05/logo-site.png')).toBe(true);
    expect(genericPictureUrl('https://site.vn/images/og-default.jpg')).toBe(true);
    expect(genericPictureUrl('https://site.vn/wp-content/themes/flat/assets/img/cover.jpg')).toBe(true);
    expect(genericPictureUrl('https://site.vn/static/share-banner.jpg')).toBe(true);
    expect(genericPictureUrl('https://site.vn/wp-content/uploads/2023/05/bun-bo-150x150.jpg')).toBe(true);
    expect(genericPictureUrl('https://site.vn/a/icon.svg')).toBe(true);
    expect(genericPictureUrl(null)).toBe(true);
    expect(genericPictureUrl('https://site.vn/wp-content/uploads/2023/05/bun-bo-hue-1200x800.jpg')).toBe(false);
    expect(genericPictureUrl('https://cdn.site.vn/recipes/pho-bo.webp?w=800')).toBe(false);
  });

  it('a page about one thing: not a home / listing / social page', () => {
    expect(specificPage('https://cooky.vn/cong-thuc/bun-bo-hue-12345')).toBe(true);
    expect(specificPage('https://shop.vn/collections/tra/products/tra-sua-tran-chau')).toBe(true);
    expect(specificPage('https://cooky.vn/')).toBe(false);
    expect(specificPage('https://site.vn/tag/bun-bo')).toBe(false);
    expect(specificPage('https://site.vn/danh-muc/mon-nuoc')).toBe(false);
    expect(specificPage('https://shop.vn/collections/tra')).toBe(false);
    expect(specificPage('https://www.facebook.com/somepage/posts/1')).toBe(false);
    expect(specificPage('https://www.youtube.com/watch?v=x')).toBe(false);
    expect(specificPage('not a url')).toBe(false);
  });

  it('verdicts: one per picture, unknown / repeated / out of range ignored; only a confident "exact" is kept', () => {
    const v = cleanVerdicts(
      { answers: [{ n: 1, verdict: 'exact', confidence: 90 }, { n: 2, verdict: 'similar', confidence: 95 }, { n: 1, verdict: 'wrong', confidence: 99 }, { n: 3, verdict: 'nope', confidence: 80 }, { n: 9, verdict: 'exact', confidence: 99 }] },
      4
    );
    expect(v).toEqual([
      { verdict: 'exact', confidence: 90 },
      { verdict: 'similar', confidence: 95 },
      { verdict: null, confidence: 80 },
      { verdict: null, confidence: 0 },
    ]);
    expect(verdictAccepts(v[0])).toBe(true);
    expect(verdictAccepts({ verdict: 'exact', confidence: MIN_CONFIDENCE - 1 })).toBe(false);
    expect(verdictAccepts(v[1])).toBe(false);
    expect(verdictRejects({ verdict: 'wrong', confidence: 90 })).toBe(true);
    expect(verdictRejects({ verdict: 'not_food', confidence: 20 })).toBe(false);
    expect(cleanVerdicts(null, 2)).toEqual([{ verdict: null, confidence: 0 }, { verdict: null, confidence: 0 }]);
    expect(bestAccepted([{ verdict: 'exact', confidence: 75 }, { verdict: 'exact', confidence: 92 }, { verdict: 'similar', confidence: 99 }])).toBe(1);
    expect(bestAccepted([{ verdict: 'similar', confidence: 99 }])).toBeNull();
  });

  it('web pages: seen by the search, about one thing, each once, at most two per dish', () => {
    const seen = (u: string) => !u.includes('unseen');
    const pages = cleanWebPages(
      {
        pages: [
          { n: 1, url: 'https://cooky.vn/cong-thuc/bun-bo-hue-1' },
          { n: 1, url: 'https://cooky.vn/cong-thuc/bun-bo-hue-1?ref=x' },
          { n: 1, url: 'https://site.vn/tag/bun-bo' },
          { n: 1, url: 'https://b.vn/bun-bo-hue' },
          { n: 1, url: 'https://c.vn/bun-bo-hue' },
          { n: 2, url: 'https://unseen.vn/pho' },
          { n: 2, url: 'http://insecure.vn/pho' },
          { n: 3, url: 'https://a.vn/x' },
        ],
      },
      2,
      seen
    );
    expect(pages).toEqual([['https://cooky.vn/cong-thuc/bun-bo-hue-1', 'https://b.vn/bun-bo-hue'], []]);
    expect(pictureKey('https://CDN.site.vn/a/b.jpg/?x=1')).toBe('cdn.site.vn/a/b.jpg');
  });

  it('repair decision: a confirmed picture stays; a better one replaces; a clearly wrong one goes; a similar one stays (pool) or goes (cache)', () => {
    const exact = { verdict: 'exact' as const, confidence: 90 };
    const similar = { verdict: 'similar' as const, confidence: 90 };
    const wrong = { verdict: 'wrong' as const, confidence: 90 };
    expect(repairDecision(exact, true)).toBe('keep');
    expect(repairDecision(similar, true)).toBe('replace');
    expect(repairDecision(wrong, false)).toBe('remove');
    expect(repairDecision(similar, false)).toBe('keep');
    expect(repairDecision(similar, false, true)).toBe('remove');
    expect(repairDecision(null, false)).toBe('none');
    expect(repairDecision({ verdict: null, confidence: 0 }, false, true)).toBe('none');
    expect(repairDecision(null, true)).toBe('replace');
  });

  it('pool repair queue: not audited yet, library photos first, then other pictures, then items without one', () => {
    const row = (id: string, item: Record<string, unknown>) => ({ id, item });
    const rows = [
      row('none', { imageUrl: null, noPhoto: true }),
      row('web', { imageUrl: 'https://a.vn/x.jpg', photo: { credit: 'a.vn' } }),
      row('wiki', { imageUrl: 'https://upload.wikimedia.org/x.jpg', photo: { credit: 'Ann · CC BY · Wikimedia' } }),
      row('done', { imageUrl: 'https://upload.wikimedia.org/y.jpg', photo: { credit: 'Ann · CC BY · Wikimedia' }, photoAudit: PHOTO_CHECK_VERSION }),
      row('open', { imageUrl: 'https://o.org/y.jpg', photo: { credit: 'Bo · CC0 · Openverse' } }),
    ];
    expect(poolRepairQueue(rows, 10).map((r) => r.id)).toEqual(['wiki', 'open', 'web', 'none']);
    expect(poolRepairQueue(rows, 2).map((r) => r.id)).toEqual(['wiki', 'open']);
    expect(repairLimit('7', 6, 12)).toBe(7);
    expect(repairLimit(50, 6, 12)).toBe(12);
    expect(repairLimit(undefined, 6, 12)).toBe(6);
    expect(repairLimit(0, 6, 12)).toBe(6);
  });

  it('a web photo (source "web") is kept with its site as the credit and no licence', () => {
    expect(cleanDishPhoto({ url: 'https://site.vn/a.jpg', sourceUrl: 'https://www.site.vn/bun-bo-hue', author: '', license: 'x', source: 'web' })).toEqual({
      url: 'https://site.vn/a.jpg',
      sourceUrl: 'https://www.site.vn/bun-bo-hue',
      author: 'site.vn',
      license: '',
      source: 'web',
    });
  });
});
