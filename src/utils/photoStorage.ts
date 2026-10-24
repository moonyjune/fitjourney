import * as FileSystem from 'expo-file-system/legacy';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';

const PROOFS_DIR = `${FileSystem.documentDirectory ?? ''}proofs/`;

async function ensureDir() {
  const info = await FileSystem.getInfoAsync(PROOFS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(PROOFS_DIR, { intermediates: true });
  }
}

/**
 * Image picker results live in a temp cache that can be cleared by the OS.
 * Copy the picked file into the app's document directory so it survives.
 */
export async function persistPickedPhoto(tempUri: string, id: string): Promise<string> {
  if (Platform.OS === 'web') {
    // On web, blob/data URIs from the picker are already stable for the session.
    return tempUri;
  }
  await ensureDir();
  const extension = tempUri.split('.').pop()?.split('?')[0] || 'jpg';
  const destination = `${PROOFS_DIR}${id}.${extension}`;
  await FileSystem.copyAsync({ from: tempUri, to: destination });
  return destination;
}

export async function deletePersistedPhoto(uri: string): Promise<void> {
  if (Platform.OS === 'web') return;
  const info = await FileSystem.getInfoAsync(uri);
  if (info.exists) {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  }
}

function extensionToMediaType(uri: string): string {
  const ext = uri.split('.').pop()?.split('?')[0]?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

/** Longest edge (px) of a photo sent to the AI: enough to read a meal or a small display, far cheaper than a raw 12 MP shot. */
export const AI_MAX_EDGE_PX = 1280;
/** Longest edge when the user opts into Full HD uploads (settings). */
export const AI_FULL_HD_EDGE_PX = 1920;
const AI_JPEG_QUALITY = 0.8;

/** Shrinks a photo so its longest edge is at most `maxEdge` (never enlarges) and re-encodes it as JPEG. Returns base64. */
async function downscaleToBase64(uri: string, maxEdge: number): Promise<{ base64: string; mediaType: string } | null> {
  const context = ImageManipulator.manipulate(uri);
  const source = await context.renderAsync();
  const longest = Math.max(source.width, source.height);
  if (longest > maxEdge) {
    context.resize(source.width >= source.height ? { width: maxEdge } : { height: maxEdge });
  }
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: AI_JPEG_QUALITY, base64: true });
  return saved.base64 ? { base64: saved.base64, mediaType: 'image/jpeg' } : null;
}

async function readOriginalBase64(uri: string): Promise<{ base64: string; mediaType: string }> {
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    const blob = await response.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const match = dataUrl.match(/^data:(.+);base64,(.*)$/);
    if (!match) throw new Error('Unexpected data URL format');
    return { mediaType: match[1] || blob.type || 'image/jpeg', base64: match[2] };
  }
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  return { base64, mediaType: extensionToMediaType(uri) };
}

/** Reads a local/blob image URI into base64 + its media type, for sending to a vision API.
 *  The photo is downscaled first (longest edge `maxEdge`); if that fails for any reason the original is sent instead. */
export async function imageUriToBase64(
  uri: string,
  options: { maxEdge?: number } = {}
): Promise<{ base64: string; mediaType: string }> {
  try {
    const small = await downscaleToBase64(uri, options.maxEdge ?? AI_MAX_EDGE_PX);
    if (small) return small;
  } catch {
    // fall through to the original file
  }
  return readOriginalBase64(uri);
}
