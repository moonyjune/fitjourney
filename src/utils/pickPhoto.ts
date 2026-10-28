import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

export type PickResult = { uri: string } | { error: 'cameraDenied' | 'cameraDeniedAsk' | 'failed' } | null;

/** Takes a photo with the camera or picks one from the library. Null when the user cancels; an `error` explains a refused camera
 *  permission or a failure (the gallery always still works). The system photo picker needs no library permission (Expo SDK 57 docs). */
export async function pickPhoto(source: 'camera' | 'library'): Promise<PickResult> {
  try {
    if (source === 'camera') {
      if (Platform.OS !== 'web') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) return { error: permission.canAskAgain === false ? 'cameraDenied' : 'cameraDeniedAsk' };
      }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
      return !result.canceled && result.assets[0] ? { uri: result.assets[0].uri } : null;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
    return !result.canceled && result.assets[0] ? { uri: result.assets[0].uri } : null;
  } catch {
    return { error: 'failed' };
  }
}

export type PickManyResult = { uris: string[] } | { error: 'failed' } | null;

/** Picks up to `limit` photos from the library at once (multiple selection: Android, iOS 14+, web; `selectionLimit` is not
 *  honoured on web, so the list is cut to `limit` here too). Null when the user cancels. */
export async function pickPhotos(limit: number): Promise<PickManyResult> {
  if (limit <= 0) return null;
  try {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6, allowsMultipleSelection: limit > 1, selectionLimit: limit });
    if (result.canceled || !result.assets?.length) return null;
    return { uris: result.assets.slice(0, limit).map((a) => a.uri) };
  } catch {
    return { error: 'failed' };
  }
}
