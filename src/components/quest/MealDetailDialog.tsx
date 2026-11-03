import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useGameText } from '../../game/strings';
import { quest, questRadius } from '../../theme/quest';
import type { MealPart } from '../../types';
import { MAX_MEAL_PHOTOS, type MealPhotoRef } from '../../utils/photoOrder';
import { pickPhoto } from '../../utils/pickPhoto';
import { BottomSheet } from './BottomSheet';
import { DishThumb } from './DishThumb';
import { HudText } from './HudText';
import { PartEditForm } from './PartEditForm';
import { PhotoStrip } from './PhotoStrip';
import { PhotoViewer } from './PhotoViewer';
import { QuestButton } from './QuestButton';
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
  /** "Ăn lại món này": logs the meal again (the caller shows the toast with "Hoàn tác"); the sheet then closes. Left out for a coach or a plan meal. */
  onEatAgain?: () => void;
  /** "Xoá bữa": deletes it at once (the caller shows the toast with "Hoàn tác"); the sheet then closes. Left out for a coach. */
  onDelete?: () => void;
}

/** A logged meal in full, as a bottom sheet (dialog 10): its photos side by side with ‹ › (tap one to see it full screen; add up to
 *  MAX_MEAL_PHOTOS, remove the one in view), the totals and, when it was entered as several foods, each of them with a pencil that opens
 *  a small sheet to change its amount (the calories are worked out again on the spot); then "Ăn lại món này" and "Xoá bữa", both undoable. */
export function MealDetailDialog({ detail, onClose, canEditParts, onEditPart, onAddPhoto, onRemovePhoto, onEatAgain, onDelete }: Props) {
  const g = useGameText();
  const [inView, setInView] = useState(0);
  const [editing, setEditing] = useState<number | null>(null);
  const [zoom, setZoom] = useState<number | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!detail) return null;
  const photos = detail.photos;
  const current = photos[Math.min(inView, photos.length - 1)];
  const canAdd = !!onAddPhoto && photos.length < MAX_MEAL_PHOTOS;
  const round1 = (n: number) => Math.round(n * 10) / 10;
  const editingPart = editing != null ? detail.parts?.[editing] : undefined;

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
    setZoom(null);
    setInView(0);
    setPhotoError(null);
    onClose();
  };
  const caption = [detail.meal, detail.time].filter(Boolean).join(' · ');

  const footer =
    onEatAgain || onDelete ? (
      <View style={styles.actions}>
        {onEatAgain && (
          <View style={styles.flex}>
            <QuestButton
              icon="undo"
              title={g('journal.eatAgain')}
              onPress={() => {
                onEatAgain();
                close(); // the toast with "Hoàn tác" shows on the screen below
              }}
            />
          </View>
        )}
        {onDelete && (
          <View style={styles.flex}>
            <QuestButton
              variant="danger"
              icon="trash"
              title={g('journal.deleteMeal')}
              accessibilityLabel={g('journal.deleteMealLabel', { name: detail.title })}
              onPress={() => {
                onDelete();
                close();
              }}
            />
          </View>
        )}
      </View>
    ) : null;

  return (
    <BottomSheet visible onClose={close} title={detail.title} subtitle={caption || undefined} closeLabel={g('journal.detailClose')} footer={footer} testID="meal-detail-sheet">
      <View style={styles.content}>
        {photos.length > 0 ? (
          <>
            <PhotoStrip
              key={photos.map((p) => p.uri).join('|')}
              photos={photos.map((p) => ({ uri: p.uri, label: detail.title }))}
              onIndex={setInView}
              onPressPhoto={setZoom}
              pressLabel={g('photo.zoom')}
            />
            <HudText size={12} weight="medium" color={quest.textSecondary} style={styles.center}>
              {g('journal.detailZoomHint')}
            </HudText>
          </>
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

        <HudText size={16} color={quest.goldLight}>
          {g('journal.kcalProtein', { kcal: detail.kcal, protein: round1(detail.proteinG) })}
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
              <HudText size={12} weight="medium" color={quest.textSecondary}>
                {g('journal.detailEditHint')}
              </HudText>
            )}
            {detail.parts.map((p, i) => (
              <View key={`${p.name}-${i}`} style={[styles.partRow, i > 0 && styles.partDivider]}>
                <DishThumb name={p.name} size={40} radius={10} off />
                <HudText size={13} weight="medium" style={styles.flex}>
                  {g('journal.detailPartLine', { name: p.name, kcal: p.calories, protein: p.proteinG })}
                </HudText>
                {canEditParts && onEditPart && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={g('journal.partEdit', { name: p.name })}
                    hitSlop={4}
                    onPress={() => setEditing(i)}
                    style={styles.iconButton}
                  >
                    <QuestIcon name="edit" size={16} color={quest.gold} strokeWidth={2.2} />
                  </Pressable>
                )}
              </View>
            ))}
          </View>
        )}
      </View>

      {/* ✎ opens the part's amounts in a sheet of its own, over this one (dialog 08). */}
      <BottomSheet visible={!!editingPart} onClose={() => setEditing(null)} title={editingPart ? g('journal.partEditTitle', { name: editingPart.name }) : undefined}>
        {editingPart && editing != null && (
          <PartEditForm
            key={`${editing}-${editingPart.name}`}
            part={editingPart}
            onCancel={() => setEditing(null)}
            onSave={(next) => {
              onEditPart?.(editing, next);
              setEditing(null);
            }}
          />
        )}
      </BottomSheet>

      <PhotoViewer
        photos={zoom != null ? photos.map((p) => ({ uri: p.uri, label: detail.title, caption: caption || undefined })) : null}
        initialIndex={zoom ?? 0}
        title={detail.title}
        subtitle={caption || undefined}
        onClose={() => setZoom(null)}
      />
    </BottomSheet>
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
  content: { gap: 10 },
  center: { textAlign: 'center' },
  flex: { flex: 1, minWidth: 0 },
  photoButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoButton: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 12, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.raised },
  parts: { gap: 6, marginTop: 4 },
  partRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  partDivider: { borderTopWidth: 1, borderTopColor: quest.raised2 },
  iconButton: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: 10 },
});
