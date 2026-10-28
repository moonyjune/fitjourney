// Photos sent along with an AI request, checked and turned into Claude image blocks.

export const MAX_IMAGES = 3;
/** Base64 length of a 5 MB image (the API's per-image limit); the client sends ~1280 px JPEGs, far below it. */
const MAX_IMAGE_BASE64_CHARS = 6_990_000;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export type ImageBlock = { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

/** The attached photos (`{ base64, mediaType }[]`) as image blocks; null when any of them is not a usable image or there are
 *  more than `max`. */
export function imageBlocks(images: unknown, max = MAX_IMAGES): ImageBlock[] | null {
  if (images === undefined || images === null) return [];
  if (!Array.isArray(images) || images.length > max) return null;
  const blocks: ImageBlock[] = [];
  for (const image of images) {
    const { base64, mediaType } = (image ?? {}) as { base64?: unknown; mediaType?: unknown };
    if (typeof base64 !== 'string' || !base64 || base64.length > MAX_IMAGE_BASE64_CHARS || !/^[A-Za-z0-9+/=]+$/.test(base64)) return null;
    const type = typeof mediaType === 'string' && IMAGE_TYPES.has(mediaType) ? mediaType : 'image/jpeg';
    blocks.push({ type: 'image', source: { type: 'base64', media_type: type, data: base64 } });
  }
  return blocks;
}
