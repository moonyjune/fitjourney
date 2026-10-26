import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

/** Text of a file the document picker returned: the web `File` object, or the cached local file on a device. */
export async function readPickedText(asset: { uri: string; file?: { text: () => Promise<string> } }): Promise<string> {
  if (Platform.OS === 'web') {
    if (asset.file) return asset.file.text();
    return (await fetch(asset.uri)).text();
  }
  return FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
}
