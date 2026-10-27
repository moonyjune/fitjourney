import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useGameText } from '../../game/strings';
import { quest, questRadius } from '../../theme/quest';
import type { MealPart } from '../../types';
import { pickPhoto } from '../../utils/pickPhoto';
import { HudText } from './HudText';
import { QuestButton } from './QuestButton';
import { PartEditForm } from './PartEditForm';
import { QuestIcon } from './QuestIcon';

export interface MealDetail {
  title: string;
  /** "HH:MM", or empty when the meal has no logged time. */
  time: string;
  kcal: number;
  proteinG: number;
  /** Purine, sugar and salt are only known for foods the user logged; null for plan meals. */
  purineMg: number | null;
  sugarG: number | null;
  saltG: number | null;
  parts?: MealPart[];
  photoUri: string | null;
}

interface Props {
  detail: MealDetail | null;
  onClose: () => void;
  /** Gives the parts a pencil to change their amounts (calls `onEditPart`). Off when the diary is someone else's. */
  canEditParts?: boolean;
  onEditPart?: (index: number, part: MealPart) => void;
  /** Gives the photo its take / choose / remove buttons. Resolves false when the photo could not be saved. */
  onPhoto?: (uri: string | null) => Promise<boolean>;
}

/** A logged meal in full: the photo at a readable size (add, replace or remove it), the totals and, when it was entered as several foods,
 *  each of them with a pencil to change its amount; the calories are worked out again on the spot. */
export function MealDetailDialog({ detail, onClose, canEditParts, onEditPart, onPhoto }: Props) {
  const g = useGameText();
  const [brokenFor, setBrokenFor] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!detail) return null;
  const showPhoto = !!detail.photoUri && brokenFor !== detail.photoUri;
  const round1 = (n: number) => Math.round(n * 10) / 10;

  async function change(source: 'camera' | 'library' | 'remove') {
    if (!onPhoto || busy) return;
    setPhotoError(null);
    setBusy(true);
    try {
      if (source === 'remove') {
        if (!(await onPhoto(null))) setPhotoError(g('journal.detailPhotoFailed'));
        return;
      }
      const picked = await pickPhoto(source);
      if (!picked) return;
      if ('error' in picked) {
        setPhotoError(g(`food.photo.${picked.error}` as const));
        return;
      }
      if (!(await onPhoto(picked.uri))) setPhotoError(g('journal.detailPhotoFailed'));
    } finally {
      setBusy(false);
    }
  }

  const close = () => {
    setEditing(null);
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
            {detail.time ? (
              <HudText size={12} weight="medium" color={quest.textSecondary}>
                {detail.time}
              </HudText>
            ) : null}

            {showPhoto ? (
              <Image
                source={{ uri: detail.photoUri! }}
                onError={() => setBrokenFor(detail.photoUri)}
                resizeMode="contain"
                accessibilityLabel={g('food.photo.alt', { name: detail.title })}
                style={styles.photo}
              />
            ) : (
              <HudText size={12} weight="medium" color={quest.textSecondary}>
                {g('journal.detailNoPhoto')}
              </HudText>
            )}
            {onPhoto && (
              <View style={styles.photoButtons}>
                <PhotoButton icon="camera" label={g('food.photo.camera')} disabled={busy} onPress={() => change('camera')} />
                <PhotoButton icon="plus" label={g('food.photo.library')} disabled={busy} onPress={() => change('library')} />
                {detail.photoUri ? <PhotoButton icon="trash" label={g('food.photo.remove')} disabled={busy} danger onPress={() => change('remove')} /> : null}
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
  photo: { width: '100%', height: 280, borderRadius: questRadius.row, backgroundColor: quest.raised },
  photoButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoButton: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 10, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.raised },
  parts: { gap: 6, marginTop: 4 },
  partBlock: { gap: 6 },
  partRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconButton: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
