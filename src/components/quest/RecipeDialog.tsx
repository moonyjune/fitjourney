import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { DinnerBrief, DinnerIdea } from '../../ai/dinner';
import { useAiErrorText } from '../../ai/usePhotoAnalysis';
import { ideaFromRecipe, recipeFromIdea, recipeKey, stepIcon } from '../../cookbook/recipes';
import { useGameText } from '../../game/strings';
import { useCookbookStore } from '../../store/useCookbookStore';
import { requestDishRecipe } from '../../sync/cloudSync';
import { quest, questRadius } from '../../theme/quest';
import { pickPhoto } from '../../utils/pickPhoto';
import { persistPickedPhoto } from '../../utils/photoStorage';
import { HudText } from './HudText';
import { QuestButton } from './QuestButton';

const stars = (n: number): string => '★'.repeat(Math.max(0, Math.min(5, n))) + '☆'.repeat(5 - Math.max(0, Math.min(5, n)));
const r1 = (n: number) => Math.round(n * 10) / 10;

/** One dish in full: ingredients, difficulty, time, the steps (each with a picture), the nutrition set against what is left for the meal, the user's
 *  stars, and the photo of how it turned out. A dish without a recipe (one of the user's own foods) can have one written by the AI, once; it is kept in
 *  the cook book, so it is never asked twice. */
/** `onRemoved` is told the dish's name once it was taken out of the cook book (the dialog closes then), so the screen can confirm it. */
export function RecipeDialog({ idea, brief, mealLabel, onClose, onLog, onRemoved }: { idea: DinnerIdea | null; brief?: DinnerBrief; mealLabel?: string; onClose: () => void; onLog?: (idea: DinnerIdea) => void; onRemoved?: (name: string) => void }) {
  const g = useGameText();
  const aiErrorText = useAiErrorText();
  const book = useCookbookStore((s) => s.recipes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!idea) return null;
  const id = recipeKey(idea.name);
  const saved = book.find((r) => r.id === id);
  // What is kept in the cook book is the fuller copy; a fresh idea shows what it came with.
  const shown = saved ? ideaFromRecipe(saved) : idea;
  const d = shown.recipe ?? {};
  const has = !!d.steps && d.steps.length > 0;
  const store = useCookbookStore.getState();

  async function writeRecipe() {
    if (busy || !idea) return;
    setBusy(true);
    setError(null);
    const out = await requestDishRecipe(idea.name, idea.calories, idea.proteinG, mealLabel ?? '');
    setBusy(false);
    if (!out.ok) return setError(out.kind === 'stale' ? g('recipe.stale') : aiErrorText(out.kind as never));
    const r = out.recipe;
    const details = { emoji: r.emoji, minutes: Math.round(r.durationMinutes), difficulty: r.difficulty, ingredients: r.ingredients, steps: r.steps, equipment: r.equipment };
    store.save(recipeFromIdea({ ...idea, recipe: details }));
    store.setDetails(id, details);
  }

  async function addPhoto(source: 'camera' | 'library') {
    const picked = await pickPhoto(source);
    if (!picked || 'error' in picked) return;
    try {
      store.save(recipeFromIdea(idea!));
      store.setPhoto(id, await persistPickedPhoto(picked.uri, `recipe-${id.replace(/\s+/g, '-')}-${Date.now()}`));
    } catch {
      setError(g('journal.detailPhotoFailed'));
    }
  }

  const limits = brief
    ? [
        { key: 'purine', label: 'Purine', v: shown.purineMg, room: brief.headroom.purine, unit: 'mg' },
        { key: 'salt', label: g('recipe.salt'), v: shown.saltG, room: brief.headroom.salt, unit: 'g' },
        { key: 'sugar', label: g('recipe.sugar'), v: shown.sugarG, room: brief.headroom.sugar, unit: 'g' },
      ]
    : [];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable accessibilityRole="button" accessibilityLabel={g('journal.detailClose')} style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet} accessibilityViewIsModal>
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.head}>
              <View style={styles.emojiBox}>
                <HudText size={34}>{d.emoji ?? '🍽️'}</HudText>
              </View>
              <View style={styles.flex}>
                <HudText size={17} accessibilityRole="header">
                  {shown.name}
                </HudText>
                <HudText size={11} weight="medium" color={quest.textSecondary}>
                  {shown.source === 'ai' ? g('swap.fromAi') : shown.source === 'book' ? g('recipe.fromBook') : shown.source === 'shared' ? g('cookbook.fromShared') : g('dinner.fromDb')}
                  {shown.amount ? ` · ${shown.amount}` : ''}
                </HudText>
              </View>
            </View>

            {saved?.photoUri ? <Image source={{ uri: saved.photoUri }} resizeMode="cover" accessibilityLabel={g('food.photo.alt', { name: shown.name })} style={styles.photo} /> : null}

            <View style={styles.facts}>
              {d.difficulty ? <Fact label={g('recipe.difficulty')} value={stars(d.difficulty)} /> : null}
              {d.minutes ? <Fact label={g('recipe.time')} value={g('recipe.minutes', { n: d.minutes })} /> : null}
              {d.equipment && d.equipment.length > 0 ? <Fact label={g('recipe.equipment')} value={d.equipment.join(', ')} /> : null}
            </View>

            <View style={styles.block}>
              <HudText size={12} color={quest.textSecondary}>
                {g('recipe.rating').toUpperCase()}
              </HudText>
              <View style={styles.starRow}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Pressable
                    key={n}
                    accessibilityRole="button"
                    accessibilityLabel={g('recipe.rate', { n })}
                    accessibilityState={{ selected: (saved?.rating ?? 0) >= n }}
                    hitSlop={4}
                    onPress={() => {
                      store.save(recipeFromIdea(idea));
                      store.rate(id, saved?.rating === n ? 0 : n);
                    }}
                  >
                    <HudText size={26} color={(saved?.rating ?? 0) >= n ? quest.gold : quest.textSecondary}>
                      {(saved?.rating ?? 0) >= n ? '★' : '☆'}
                    </HudText>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.block}>
              <HudText size={12} color={quest.textSecondary}>
                {g('recipe.nutrition').toUpperCase()}
              </HudText>
              <HudText size={14} color={quest.goldLight}>
                {shown.calories} kcal · {r1(shown.proteinG)} g {g('recipe.protein')}
              </HudText>
              {brief && brief.budgetKcal > 0 ? (
                <HudText size={12} weight="medium" color={quest.textSecondary}>
                  {g('recipe.ofMeal', { pct: Math.round((shown.calories / brief.budgetKcal) * 100), kcal: Math.round(brief.budgetKcal) })}
                </HudText>
              ) : null}
              {limits.map((l) => (
                <HudText key={l.key} size={12} weight="medium" color={l.v > Math.max(l.room, 0) + 1e-9 ? quest.hpText : quest.textSecondary}>
                  {g('recipe.limit', { name: l.label, v: r1(l.v), unit: l.unit, room: r1(Math.max(l.room, 0)) })}
                </HudText>
              ))}
              {!brief ? (
                <HudText size={12} weight="medium" color={quest.textSecondary}>
                  {g('journal.extraNutrients', { purine: Math.round(shown.purineMg), sugar: r1(shown.sugarG), salt: r1(shown.saltG) })}
                </HudText>
              ) : null}
            </View>

            {d.ingredients && d.ingredients.length > 0 ? (
              <View style={styles.block}>
                <HudText size={12} color={quest.textSecondary}>
                  {g('recipe.ingredients').toUpperCase()}
                </HudText>
                {d.ingredients.map((i, k) => (
                  <HudText key={`${i.name}-${k}`} size={13} weight="medium">
                    {`• ${i.name}${i.quantity ? ` — ${i.quantity}` : ''}`}
                  </HudText>
                ))}
              </View>
            ) : null}

            {has ? (
              <View style={styles.block}>
                <HudText size={12} color={quest.textSecondary}>
                  {g('recipe.steps').toUpperCase()}
                </HudText>
                {d.steps!.map((s, k) => (
                  <View key={k} style={styles.step}>
                    <View style={styles.stepIcon}>
                      <HudText size={20}>{stepIcon(s)}</HudText>
                    </View>
                    <HudText size={13} weight="medium" style={styles.flex}>
                      {`${k + 1}. ${s}`}
                    </HudText>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.block}>
                <HudText size={12} weight="medium" color={quest.textSecondary}>
                  {shown.how ?? g('recipe.noRecipe')}
                </HudText>
                <QuestButton variant="mana" title={busy ? g('recipe.writing') : g('recipe.write')} loading={busy} onPress={() => void writeRecipe()} />
              </View>
            )}
            {has && shown.how ? (
              <HudText size={12} weight="medium" color={quest.textSecondary}>
                {shown.how}
              </HudText>
            ) : null}

            <View style={styles.photoRow}>
              <QuestButton variant="ghost" icon="camera" title={g('recipe.myPhoto')} onPress={() => void addPhoto('camera')} />
              <QuestButton variant="ghost" icon="plus" title={g('food.photo.library')} onPress={() => void addPhoto('library')} />
            </View>

            {error && (
              <HudText size={12} weight="medium" color={quest.hpText} accessibilityRole="alert">
                {error}
              </HudText>
            )}
            <HudText size={11} weight="medium" color={quest.textSecondary}>
              {g('recipe.pictureNote')}
            </HudText>
          </ScrollView>
          <View style={styles.actions}>
            {onLog && <QuestButton variant="gold" title={g('dinner.log')} accessibilityLabel={g('dinner.logLabel', { name: shown.name })} onPress={() => { store.save(recipeFromIdea(idea)); store.markCooked(id); onLog(shown); }} />}
            {saved ? (
              <QuestButton
                variant="danger"
                icon="trash"
                title={g('recipe.removeFromBook')}
                onPress={() => {
                  store.remove(id);
                  onClose();
                  onRemoved?.(shown.name);
                }}
              />
            ) : (
              <QuestButton variant="mana" title={g('recipe.saveToBook')} onPress={() => store.save(recipeFromIdea(idea))} />
            )}
            <QuestButton variant="ghost" title={g('journal.detailClose')} onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <HudText size={11} weight="medium" color={quest.textSecondary}>
        {label}
      </HudText>
      <HudText size={13}>{value}</HudText>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', padding: 16, backgroundColor: 'rgba(0,0,0,0.75)' },
  sheet: { maxHeight: '92%', maxWidth: 560, width: '100%', alignSelf: 'center', gap: 10, padding: 16, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  content: { gap: 12 },
  flex: { flex: 1, minWidth: 0 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  emojiBox: { width: 60, height: 60, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: quest.raised },
  photo: { width: '100%', height: 200, borderRadius: questRadius.row, backgroundColor: quest.raised },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fact: { gap: 2, paddingHorizontal: 10, paddingVertical: 6, borderRadius: questRadius.row, backgroundColor: quest.raised },
  block: { gap: 4 },
  starRow: { flexDirection: 'row', gap: 4 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: questRadius.row, backgroundColor: quest.raised },
  stepIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: quest.bg },
  photoRow: { gap: 8 },
  actions: { gap: 8 },
});
