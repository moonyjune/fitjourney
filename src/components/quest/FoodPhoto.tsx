import { useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useGameText } from '../../game/strings';
import { quest, questRadius } from '../../theme/quest';
import { HudText } from './HudText';
import { QuestIcon } from './QuestIcon';

interface FoodPhotoPickerProps {
  /** The photo chosen so far (a temporary picker URI until the item is saved), or null. */
  uri: string | null;
  onChange: (uri: string | null) => void;
  /** Locks the controls while the item is being saved. */
  disabled?: boolean;
  /** Replaces the section's own title / hint / preview texts (already translated) when the picker is reused for
   *  something other than food, e.g. a workout result. Omitted: the food texts, exactly as before. */
  labels?: { title: string; hint: string; preview: string };
}

type PhotoError = 'cameraDenied' | 'cameraDeniedAsk' | 'failed';

/** "Take photo" / "Choose from gallery" for an off-plan food, with a preview and a remove button.
 *  Cancelling the picker changes nothing; a refused camera permission is explained inline (never a dead end,
 *  because the gallery still works). On web there is no permission prompt: the browser handles it. */
export function FoodPhotoPicker({ uri, onChange, disabled, labels }: FoodPhotoPickerProps) {
  const g = useGameText();
  const [error, setError] = useState<PhotoError | null>(null);

  async function take() {
    setError(null);
    try {
      if (Platform.OS !== 'web') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setError(permission.canAskAgain === false ? 'cameraDenied' : 'cameraDeniedAsk');
          return;
        }
      }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
      if (!result.canceled && result.assets[0]) onChange(result.assets[0].uri);
    } catch {
      setError('failed');
    }
  }

  async function choose() {
    setError(null);
    try {
      // The system photo picker needs no library permission (Expo SDK 57 docs), so none is requested.
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
      if (!result.canceled && result.assets[0]) onChange(result.assets[0].uri);
    } catch {
      setError('failed');
    }
  }

  return (
    <View style={styles.wrap}>
      <HudText size={11} color={quest.textSecondary} style={styles.eyebrow}>
        {(labels?.title ?? g('food.photo.title')).toUpperCase()}
      </HudText>

      {uri ? (
        <View style={styles.previewRow}>
          <Image source={{ uri }} style={styles.preview} accessibilityLabel={labels?.preview ?? g('food.photo.preview')} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={g('food.photo.remove')}
            disabled={disabled}
            onPress={() => onChange(null)}
            style={[styles.remove, disabled && styles.off]}
          >
            <QuestIcon name="x" size={16} color={quest.hpText} strokeWidth={2.6} />
            <HudText size={13} color={quest.hpText}>
              {g('food.photo.remove')}
            </HudText>
          </Pressable>
        </View>
      ) : (
        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {labels?.hint ?? g('food.photo.hint')}
        </HudText>
      )}

      <View style={styles.buttons}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={g('food.photo.camera')}
          disabled={disabled}
          onPress={take}
          style={({ pressed }) => [styles.button, pressed && { opacity: 0.85 }, disabled && styles.off]}
        >
          <QuestIcon name="camera" size={18} color={quest.gold} strokeWidth={2.2} />
          <HudText size={14}>{g('food.photo.camera')}</HudText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={g('food.photo.library')}
          disabled={disabled}
          onPress={choose}
          style={({ pressed }) => [styles.button, pressed && { opacity: 0.85 }, disabled && styles.off]}
        >
          <QuestIcon name="plus" size={18} color={quest.gold} strokeWidth={2.2} />
          <HudText size={14}>{g('food.photo.library')}</HudText>
        </Pressable>
      </View>

      {error && (
        <HudText size={12} weight="medium" color={quest.hpText} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {g(`food.photo.${error}` as const)}
        </HudText>
      )}
    </View>
  );
}

interface FoodThumbProps {
  uri?: string;
  name: string;
  size?: number;
}

/** Small photo of a logged food, for lists. Renders nothing without a photo, or if the file can't be loaded
 *  (e.g. an item synced from another device whose local file isn't here). */
export function FoodThumb({ uri, name, size = 40 }: FoodThumbProps) {
  const g = useGameText();
  const [broken, setBroken] = useState(false);
  if (!uri || broken) return null;
  return (
    <Image
      source={{ uri }}
      onError={() => setBroken(true)}
      accessibilityLabel={g('food.photo.alt', { name })}
      style={{ width: size, height: size, borderRadius: 8, backgroundColor: quest.raised }}
    />
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  eyebrow: { letterSpacing: 1.6 },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  preview: { width: 88, height: 88, borderRadius: questRadius.row, backgroundColor: quest.raised, borderWidth: 1.5, borderColor: quest.border },
  remove: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.bossBorder, backgroundColor: quest.bossPanel },
  buttons: { flexDirection: 'row', gap: 10 },
  button: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 10, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  off: { opacity: 0.5 },
});
