import { useState } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGameText } from '../../game/strings';
import { quest } from '../../theme/quest';
import { HudText } from './HudText';
import { PhotoStrip } from './PhotoStrip';
import { QuestIcon } from './QuestIcon';

export interface ViewerPhoto {
  uri: string;
  label?: string;
  /** Which meal and when, e.g. "Tối · 19:30". */
  caption?: string;
}

interface Props {
  photos: ViewerPhoto[] | null;
  title?: string;
  subtitle?: string;
  /** Kept for callers of the older viewer (photos one under the other unless set); every viewer now swipes between the photos. */
  strip?: boolean;
  /** The photo to open on (0-based). */
  initialIndex?: number;
  onClose: () => void;
}

const ZERO_INSETS = { top: 0, bottom: 0, left: 0, right: 0 };

/** The safe-area insets, or none when drawn outside the provider (the viewer also opens from such places). The hook runs on every render
 *  either way, so the order of hooks never changes. */
function useInsetsOrZero() {
  try {
    return useSafeAreaInsets();
  } catch {
    return ZERO_INSETS;
  }
}

/** Room taken by the top bar and the caption block under the photo. */
const CHROME = 190;

/** Photos full screen on black (dialog 11): the close button and "n/total" on top, the photo as large as the screen allows, swipe or ‹ ›
 *  between the photos, then the dish / meal and when. A photo that cannot be loaded (its file is on another device) says so. */
export function PhotoViewer({ photos, title, subtitle, initialIndex = 0, onClose }: Props) {
  const g = useGameText();
  const insets = useInsetsOrZero();
  const { height } = useWindowDimensions();
  const [at, setAt] = useState(initialIndex);
  if (!photos) return null;
  const current = photos[Math.min(at, photos.length - 1)];
  const photoHeight = Math.max(240, height - insets.top - insets.bottom - CHROME);
  const heading = title || g('photo.viewerTitle');
  const topTitle = current?.label && current.label === heading ? '' : heading;
  const topSubtitle = subtitle && subtitle !== current?.caption ? subtitle : '';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.screen, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }]} accessibilityViewIsModal>
        <View style={styles.top}>
          <Pressable accessibilityRole="button" accessibilityLabel={g('journal.detailClose')} onPress={onClose} hitSlop={4} style={styles.close}>
            <QuestIcon name="x" size={22} color={quest.text} strokeWidth={2.4} />
          </Pressable>
          <View style={styles.flex}>
            {/* The dish and when are under the photo; the top repeats them only when they say something else (a day, a note). */}
            {topTitle ? (
              <HudText size={15} accessibilityRole="header" numberOfLines={1}>
                {topTitle}
              </HudText>
            ) : null}
            {topSubtitle ? (
              <HudText size={12} weight="medium" color={quest.goldLight} numberOfLines={1}>
                {topSubtitle}
              </HudText>
            ) : null}
          </View>
        </View>

        <View style={styles.body}>
          {photos.length === 0 ? (
            <HudText size={13} weight="medium" color={quest.textSecondary} style={styles.center}>
              {g('photo.none')}
            </HudText>
          ) : (
            <PhotoStrip
              key={photos.map((p) => p.uri.slice(-24)).join('|')}
              photos={photos.map((p) => ({ uri: p.uri, label: p.label }))}
              height={photoHeight}
              initialIndex={initialIndex}
              onIndex={setAt}
              backdrop="#000"
            />
          )}
        </View>

        {current && (
          <View style={styles.caption}>
            {current.label ? (
              <HudText size={15} numberOfLines={2}>
                {current.label}
              </HudText>
            ) : null}
            {current.caption ? (
              <HudText size={12} weight="medium" color={quest.goldLight}>
                {current.caption}
              </HudText>
            ) : null}
            {photos.length > 1 && (
              <HudText size={12} weight="medium" color={quest.textSecondary}>
                {g('photo.viewerHint')}
              </HudText>
            )}
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000', paddingHorizontal: 12, gap: 10 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  flex: { flex: 1, minWidth: 0 },
  body: { flex: 1, justifyContent: 'center' },
  center: { textAlign: 'center' },
  caption: { gap: 4, paddingHorizontal: 4 },
});
