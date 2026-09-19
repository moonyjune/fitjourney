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
