import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useGameText } from '../../game/strings';
import { quest, questRadius } from '../../theme/quest';
import type { MealPart } from '../../types';
import { MAX_MEAL_PHOTOS, type MealPhotoRef } from '../../utils/photoOrder';
import { pickPhoto } from '../../utils/pickPhoto';
import { PhotoStrip } from './PhotoStrip';
import { HudText } from './HudText';
import { QuestButton } from './QuestButton';
import { PartEditForm } from './PartEditForm';
import { QuestIcon } from './QuestIcon';

export interface MealDetail {
  title: string;
  /** "HH:MM", or empty when the meal has no logged time. */
  time: string;
  /** Which meal it was ("Sáng", "Tối"…), shown with the time; empty when unknown. */
  meal?: string;
  kcal: number;
  proteinG: number;
  /** Purine, sugar and salt are only known for foods the user logged; null for plan meals. */
  purineMg: number | null;
  sugarG: number | null;
  saltG: number | null;
  parts?: MealPart[];
  /** Every photo of the meal, first one first (up to MAX_MEAL_PHOTOS). */
  photos: MealPhotoRef[];
}

interface Props {
  detail: MealDetail | null;
  onClose: () => void;
  /** Gives the parts a pencil to change their amounts (calls `onEditPart`). Off when the diary is someone else's. */
  canEditParts?: boolean;
  onEditPart?: (index: number, part: MealPart) => void;
  /** Give the photos their take / choose (add one more) and remove (the photo in view) buttons. Resolve false when it could not be done. */
  onAddPhoto?: (uri: string) => Promise<boolean>;
  onRemovePhoto?: (photo: MealPhotoRef) => Promise<boolean>;
}

/** A logged meal in full: its photos at a readable size side by side with ‹ › (add up to MAX_MEAL_PHOTOS, remove the one in view), the totals and, when it was entered as several foods,
 *  each of them with a pencil to change its amount; the calories are worked out again on the spot. */
export function MealDetailDialog({ detail, onClose, canEditParts, onEditPart, onAddPhoto, onRemovePhoto }: Props) {
  const g = useGameText();
  const [inView, setInView] = useState(0);
  const [editing, setEditing] = useState<number | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!detail) return null;
  const photos = detail.photos;
  const current = photos[Math.min(inView, photos.length - 1)];
  const canAdd = !!onAddPhoto && photos.length < MAX_MEAL_PHOTOS;
  const round1 = (n: number) => Math.round(n * 10) / 10;

  async function change(source: 'camera' | 'library' | 'remove') {
    if (busy) return;
    setPhotoError(null);
    setBusy(true);
    try {
      if (source === 'remove') {
        if (!onRemovePhoto || !current) return;
        if (!(await onRemovePhoto(current))) setPhotoError(g('journal.detailPhotoFailed'));
        else setInView(0);
        return;
      }
      if (!onAddPhoto) return;
      const picked = await pickPhoto(source);
      if (!picked) return;
      if ('error' in picked) {
        setPhotoError(g(`food.photo.${picked.error}` as const));
        return;
      }
      if (!(await onAddPhoto(picked.uri))) setPhotoError(g('journal.detailPhotoFailed'));
    } finally {
      setBusy(false);
    }
  }

  const close = () => {
    setEditing(null);
    setInView(0);
    setPhotoError(null);
    onClose();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <View style={styles.overlay}>
        <Pressable accessibilityRole="button" accessibilityLabel={g('journal.detailClose')} style={StyleSheet.absoluteFill} onPress={close} />
        <View style={styles.sheet} accessibilityViewIsModal>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <HudText size={17} accessibilityRole="header">
              {detail.title}
            </HudText>
            {detail.time || detail.meal ? (
              <HudText size={13} color={quest.goldLight}>
                {[detail.meal, detail.time].filter(Boolean).join(' · ')}
              </HudText>
            ) : null}

            {photos.length > 0 ? (
              <PhotoStrip key={photos.map((p) => p.uri).join('|')} photos={photos.map((p) => ({ uri: p.uri, label: detail.title }))} onIndex={setInView} />
            ) : (
              <HudText size={12} weight="medium" color={quest.textSecondary}>
                {g('journal.detailNoPhoto')}
              </HudText>
            )}
            {(onAddPhoto || onRemovePhoto) && (
              <View style={styles.photoButtons}>
                {canAdd && <PhotoButton icon="camera" label={g('food.photo.camera')} disabled={busy} onPress={() => change('camera')} />}
                {canAdd && <PhotoButton icon="plus" label={photos.length > 0 ? g('photo.addMore', { n: photos.length, max: MAX_MEAL_PHOTOS }) : g('food.photo.library')} disabled={busy} onPress={() => change('library')} />}
                {onRemovePhoto && current ? <PhotoButton icon="trash" label={photos.length > 1 ? g('photo.removeThis') : g('food.photo.remove')} disabled={busy} danger onPress={() => change('remove')} /> : null}
              </View>
            )}
            {photoError && (
              <HudText size={12} weight="medium" color={quest.hpText} accessibilityRole="alert" accessibilityLiveRegion="polite">
                {photoError}
              </HudText>
            )}

            <HudText size={14} color={quest.goldLight}>
              {detail.kcal} kcal · {round1(detail.proteinG)} g
            </HudText>
            {detail.purineMg != null && detail.sugarG != null && detail.saltG != null && (
              <HudText size={12} weight="medium" color={quest.textSecondary}>
                {g('journal.extraNutrients', { purine: Math.round(detail.purineMg), sugar: round1(detail.sugarG), salt: round1(detail.saltG) })}
              </HudText>
            )}

            {detail.parts && detail.parts.length > 0 && (
              <View style={styles.parts}>
                <HudText size={12} color={quest.textSecondary}>
                  {g('journal.detailParts').toUpperCase()}
                </HudText>
                {canEditParts && (
                  <HudText size={11} weight="medium" color={quest.textSecondary}>
                    {g('journal.detailEditHint')}
                  </HudText>
                )}
                {detail.parts.map((p, i) => (
                  <View key={`${p.name}-${i}`} style={styles.partBlock}>
                    <View style={styles.partRow}>
                      <HudText size={13} weight="medium" style={styles.flex}>
                        {g('journal.detailPartLine', { name: p.name, kcal: p.calories, protein: p.proteinG })}
                      </HudText>
                      {canEditParts && onEditPart && (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={g('journal.partEdit', { name: p.name })}
                          hitSlop={8}
                          onPress={() => setEditing(i)}
                          style={styles.iconButton}
                        >
                          <QuestIcon name="edit" size={16} color={quest.gold} strokeWidth={2.2} />
                        </Pressable>
                      )}
                    </View>
                    {editing === i && (
                      <PartEditForm
                        part={p}
                        onCancel={() => setEditing(null)}
                        onSave={(next) => {
                          onEditPart?.(i, next);
                          setEditing(null);
                        }}
                      />
                    )}
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
          <QuestButton variant="ghost" title={g('journal.detailClose')} onPress={close} />
        </View>
      </View>
    </Modal>
  );
}

function PhotoButton({ icon, label, onPress, disabled, danger }: { icon: 'camera' | 'plus' | 'trash'; label: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.photoButton, danger && { borderColor: quest.bossBorder }, disabled && { opacity: 0.5 }]}
    >
      <QuestIcon name={icon} size={16} color={danger ? quest.hpText : quest.gold} strokeWidth={2.2} />
      <HudText size={12} color={danger ? quest.hpText : quest.text}>
        {label}
      </HudText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', padding: 16, backgroundColor: 'rgba(0,0,0,0.7)' },
  sheet: { maxHeight: '90%', maxWidth: 520, width: '100%', alignSelf: 'center', gap: 12, padding: 16, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  content: { gap: 8 },
  flex: { flex: 1, minWidth: 0 },
  photoButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoButton: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 10, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.raised },
  parts: { gap: 6, marginTop: 4 },
  partBlock: { gap: 6 },
  partRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconButton: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
