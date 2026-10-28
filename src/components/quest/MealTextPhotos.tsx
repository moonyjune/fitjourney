import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useGameText } from '../../game/strings';
import { quest, questRadius } from '../../theme/quest';
import { pickPhoto, pickPhotos } from '../../utils/pickPhoto';
import { HudText } from './HudText';
import { QuestIcon } from './QuestIcon';

/** How many photos can go with one description to the text parser (the edge function refuses more). */
export const MAX_MEAL_TEXT_PHOTOS = 3;

interface MealTextPhotosProps {
  /** The photos attached so far (temporary picker URIs), in order. */
  photos: string[];
  onChange: (photos: string[]) => void;
  /** Locks the controls while the analysis runs. */
  disabled?: boolean;
}

type PhotoError = 'cameraDenied' | 'cameraDeniedAsk' | 'failed';

/** "Attach photos" for the text entry: camera or library (several at once where the platform allows; a file input on web),
 *  up to MAX_MEAL_TEXT_PHOTOS thumbnails, each with its own remove button. The photos only help the AI; nothing is saved here. */
export function MealTextPhotos({ photos, onChange, disabled }: MealTextPhotosProps) {
  const g = useGameText();
  const [error, setError] = useState<PhotoError | null>(null);
  const room = MAX_MEAL_TEXT_PHOTOS - photos.length;
  const full = room <= 0;

  async function take() {
    setError(null);
    const picked = await pickPhoto('camera');
    if (!picked) return;
    if ('error' in picked) setError(picked.error);
    else onChange([...photos, picked.uri].slice(0, MAX_MEAL_TEXT_PHOTOS));
  }

  async function choose() {
    setError(null);
    const picked = await pickPhotos(room);
    if (!picked) return;
    if ('error' in picked) setError(picked.error);
    else onChange([...photos, ...picked.uris].slice(0, MAX_MEAL_TEXT_PHOTOS));
  }

  const off = disabled || full;
  return (
    <View style={styles.wrap}>
      <HudText size={11} color={quest.textSecondary} style={styles.eyebrow}>
        {g('text.photos.title').toUpperCase()}
      </HudText>
      <HudText size={12} weight="medium" color={quest.textSecondary}>
        {full ? g('text.photos.full', { max: MAX_MEAL_TEXT_PHOTOS }) : photos.length > 0 ? g('text.photos.count', { n: photos.length, max: MAX_MEAL_TEXT_PHOTOS }) : g('text.photos.hint', { max: MAX_MEAL_TEXT_PHOTOS })}
      </HudText>

      {photos.length > 0 && (
        <View style={styles.thumbs}>
          {photos.map((uri, i) => (
            <View key={`${i}-${uri}`} style={styles.thumbBox}>
              <Image source={{ uri }} style={styles.thumb} accessibilityLabel={g('text.photos.alt', { n: i + 1 })} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={g('text.photos.remove', { n: i + 1 })}
                disabled={disabled}
                hitSlop={8}
                onPress={() => onChange(photos.filter((_, j) => j !== i))}
                style={[styles.remove, disabled && styles.off]}
              >
                <QuestIcon name="x" size={14} color={quest.hpText} strokeWidth={2.6} />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <View style={styles.buttons}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={g('text.photos.camera')}
          accessibilityState={{ disabled: off }}
          disabled={off}
          onPress={() => {
            void take();
          }}
          style={({ pressed }) => [styles.button, pressed && { opacity: 0.85 }, off && styles.off]}
        >
          <QuestIcon name="camera" size={18} color={quest.gold} strokeWidth={2.2} />
          <HudText size={14}>{g('text.photos.camera')}</HudText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={g('text.photos.library')}
          accessibilityState={{ disabled: off }}
          disabled={off}
          onPress={() => {
            void choose();
          }}
          style={({ pressed }) => [styles.button, pressed && { opacity: 0.85 }, off && styles.off]}
        >
          <QuestIcon name="plus" size={18} color={quest.gold} strokeWidth={2.2} />
          <HudText size={14}>{g('text.photos.library')}</HudText>
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

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  eyebrow: { letterSpacing: 1.6 },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  thumbBox: { position: 'relative' },
  thumb: { width: 76, height: 76, borderRadius: questRadius.row, backgroundColor: quest.raised, borderWidth: 1.5, borderColor: quest.border },
  remove: { position: 'absolute', top: -8, right: -8, width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1.5, borderColor: quest.bossBorder, backgroundColor: quest.bossPanel },
  buttons: { flexDirection: 'row', gap: 10 },
  button: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 10, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  off: { opacity: 0.5 },
});
