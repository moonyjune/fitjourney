import * as FileSystem from 'expo-file-system/legacy';
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

/** Reads a local/blob image URI into base64 + its media type, for sending to a vision API. */
export async function imageUriToBase64(uri: string): Promise<{ base64: string; mediaType: string }> {
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
