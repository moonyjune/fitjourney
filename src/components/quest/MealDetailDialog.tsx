import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useGameText } from '../../game/strings';
import { quest, questRadius } from '../../theme/quest';
import type { MealPart } from '../../types';
import { HudText } from './HudText';
import { QuestButton } from './QuestButton';

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

/** A logged meal in full: the photo at a readable size, the totals and, when it was entered as several foods, each of them. */
export function MealDetailDialog({ detail, onClose }: { detail: MealDetail | null; onClose: () => void }) {
  const g = useGameText();
  const [brokenFor, setBrokenFor] = useState<string | null>(null);
  if (!detail) return null;
  const showPhoto = !!detail.photoUri && brokenFor !== detail.photoUri;
  const round1 = (n: number) => Math.round(n * 10) / 10;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable accessibilityRole="button" accessibilityLabel={g('journal.detailClose')} style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet} accessibilityViewIsModal>
          <ScrollView contentContainerStyle={styles.content}>
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
                {detail.parts.map((p, i) => (
                  <HudText key={`${p.name}-${i}`} size={13} weight="medium">
                    {g('journal.detailPartLine', { name: p.name, kcal: p.calories, protein: p.proteinG })}
                  </HudText>
                ))}
              </View>
            )}
          </ScrollView>
          <QuestButton variant="ghost" title={g('journal.detailClose')} onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', padding: 16, backgroundColor: 'rgba(0,0,0,0.7)' },
  sheet: { maxHeight: '90%', maxWidth: 520, width: '100%', alignSelf: 'center', gap: 12, padding: 16, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  content: { gap: 8 },
  photo: { width: '100%', height: 280, borderRadius: questRadius.row, backgroundColor: quest.raised },
  parts: { gap: 4, marginTop: 4 },
});
