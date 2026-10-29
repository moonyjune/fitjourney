import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useGameText } from '../../game/strings';
import { quest, questRadius } from '../../theme/quest';
import { HudText } from './HudText';
import { PhotoStrip } from './PhotoStrip';
import { QuestButton } from './QuestButton';

export interface ViewerPhoto {
  uri: string;
  label?: string;
  /** Which meal and when, e.g. "Tối · 19:30". */
  caption?: string;
}

/** Photos at a readable size, one under the other (or, with `strip`, the photos of one meal side by side with ‹ ›). A photo that cannot be
 *  loaded (e.g. its file is on another device) says so instead of staying blank. */
export function PhotoViewer({ photos, title, subtitle, strip, onClose }: { photos: ViewerPhoto[] | null; title?: string; subtitle?: string; strip?: boolean; onClose: () => void }) {
  const g = useGameText();
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  if (!photos) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable accessibilityRole="button" accessibilityLabel={g('journal.detailClose')} style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet} accessibilityViewIsModal>
          {title ? (
            <HudText size={16} accessibilityRole="header">
              {title}
            </HudText>
          ) : null}
          {subtitle ? (
            <HudText size={13} weight="medium" color={quest.goldLight}>
              {subtitle}
            </HudText>
          ) : null}
          <ScrollView contentContainerStyle={styles.content}>
            {photos.length === 0 && (
              <HudText size={12} weight="medium" color={quest.textSecondary}>
                {g('photo.none')}
              </HudText>
            )}
            {strip && photos.length > 0 && <PhotoStrip photos={photos} height={420} />}
            {!strip && photos.map((p, i) => (
              <View key={`${p.uri.slice(-40)}-${i}`} style={styles.item}>
                {p.caption ? (
                  <HudText size={13} color={quest.goldLight}>
                    {p.caption}
                  </HudText>
                ) : null}
                {p.label ? (
                  <HudText size={12} weight="medium" color={quest.textSecondary}>
                    {p.label}
                  </HudText>
                ) : null}
                {broken[p.uri] ? (
                  <HudText size={12} weight="medium" color={quest.hpText}>
                    {g('photo.unavailable')}
                  </HudText>
                ) : (
                  <Image source={{ uri: p.uri }} onError={() => setBroken((b) => ({ ...b, [p.uri]: true }))} resizeMode="contain" accessibilityLabel={g('food.photo.alt', { name: p.label ?? '' })} style={styles.photo} />
                )}
              </View>
            ))}
          </ScrollView>
          <QuestButton variant="ghost" title={g('journal.detailClose')} onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', padding: 16, backgroundColor: 'rgba(0,0,0,0.85)' },
  sheet: { maxHeight: '94%', maxWidth: 640, width: '100%', alignSelf: 'center', gap: 12, padding: 16, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  content: { gap: 16 },
  item: { gap: 6 },
  photo: { width: '100%', height: 420, borderRadius: questRadius.row, backgroundColor: quest.raised },
});
