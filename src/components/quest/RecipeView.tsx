import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import type { DinnerBrief, DinnerIdea } from '../../ai/dinner';
import { useAiErrorText } from '../../ai/usePhotoAnalysis';
import { ideaFromRecipe, recipeFromIdea, recipeKey, stepIcon } from '../../cookbook/recipes';
import { useGameText } from '../../game/strings';
import { useCookbookStore } from '../../store/useCookbookStore';
import { showToast } from '../../store/useToastStore';
import { requestDishRecipe } from '../../sync/cloudSync';
import { quest, questRadius } from '../../theme/quest';
import { pickPhoto } from '../../utils/pickPhoto';
import { persistPickedPhoto } from '../../utils/photoStorage';
import { DishPhotoCredit } from './DishPhoto';
import { DishThumb } from './DishThumb';
import { HudText } from './HudText';
import { QuestButton } from './QuestButton';

const stars = (n: number): string => '★'.repeat(Math.max(0, Math.min(5, n))) + '☆'.repeat(5 - Math.max(0, Math.min(5, n)));
const r1 = (n: number) => Math.round(n * 10) / 10;

/** The dish as shown: the cook book's fuller copy when it is kept there, else the idea as it came. */
export function useRecipeShown(idea: DinnerIdea) {
  const book = useCookbookStore((s) => s.recipes);
  const saved = book.find((r) => r.id === recipeKey(idea.name));
  return { saved, shown: saved ? ideaFromRecipe(saved) : idea };
}

export interface RecipeViewProps {
  idea: DinnerIdea;
  brief?: DinnerBrief;
  mealLabel?: string;
  /** A large photo on top (the recipe page); the dialog keeps the emoji badge. */
  hero?: boolean;
  /** Called after "Xoá khỏi cook book" (the toast with "Hoàn tác" is shown here), with the dish's name. */
  onRemoved?: (name: string) => void;
}

/** One dish in full: photo, where it comes from, difficulty, time, equipment, the user's stars, the nutrition set against what is left
 *  for the meal, ingredients, the steps (each with a picture) or "let the AI write it" (once; kept in the cook book), the photo of how it
 *  turned out, and save to / remove from the cook book (remove: toast with "Hoàn tác"). Used by the recipe page and RecipeDialog. */
export function RecipeView({ idea, brief, mealLabel, hero, onRemoved }: RecipeViewProps) {
  const g = useGameText();
  const aiErrorText = useAiErrorText();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState(false);
  const { saved, shown } = useRecipeShown(idea);
  const id = recipeKey(idea.name);
  const d = shown.recipe ?? {};
  const has = !!d.steps && d.steps.length > 0;
  const store = useCookbookStore.getState();

  async function writeRecipe() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const out = await requestDishRecipe(idea.name, idea.calories, idea.proteinG, mealLabel ?? '');
    setBusy(false);
    if (!out.ok) return setError(out.kind === 'stale' ? g('recipe.stale') : aiErrorText(out.kind as never));
    const r = out.recipe;
    const next = { emoji: r.emoji, minutes: Math.round(r.durationMinutes), difficulty: r.difficulty, ingredients: r.ingredients, steps: r.steps, equipment: r.equipment };
    store.save(recipeFromIdea({ ...idea, recipe: next }));
    store.setDetails(id, next);
  }

  async function addPhoto(source: 'camera' | 'library') {
    const picked = await pickPhoto(source);
    if (!picked || 'error' in picked) return;
    try {
      store.save(recipeFromIdea(idea));
      store.setPhoto(id, await persistPickedPhoto(picked.uri, `recipe-${id.replace(/\s+/g, '-')}-${Date.now()}`));
    } catch {
      setError(g('journal.detailPhotoFailed'));
    }
  }

  function remove() {
    const removed = store.recipes.find((r) => r.id === id);
    store.remove(id);
    showToast({ text: g('recipe.removed', { name: shown.name }), undo: removed ? () => useCookbookStore.getState().save(removed) : undefined });
    onRemoved?.(shown.name);
  }

  const limits = brief
    ? [
        { key: 'purine', label: 'Purine', v: shown.purineMg, room: brief.headroom.purine, unit: 'mg' },
        { key: 'salt', label: g('recipe.salt'), v: shown.saltG, room: brief.headroom.salt, unit: 'g' },
        { key: 'sugar', label: g('recipe.sugar'), v: shown.sugarG, room: brief.headroom.sugar, unit: 'g' },
      ]
    : [];
  const overLimit = limits.some((l) => l.v > Math.max(l.room, 0) + 1e-9);
  const source = shown.source === 'ai' ? g('swap.fromAi') : shown.source === 'book' ? g('recipe.fromBook') : shown.source === 'shared' ? g('cookbook.fromShared') : g('dinner.fromDb');

  return (
    <View style={styles.wrap}>
      {hero ? (
        <View style={styles.heroBox}>
          {/* The user's own photo of it first, else the dish's real photo, else a large emoji. */}
          <DishThumb name={shown.name} emoji={d.emoji} photoUri={saved?.photoUri} size={220} radius={questRadius.row} fill />
          {saved?.photoUri ? null : <DishPhotoCredit name={shown.name} />}
        </View>
      ) : null}
      <View style={styles.head}>
        {hero ? null : (
          <View style={styles.emojiBox}>
            <HudText size={34}>{d.emoji ?? '🍽️'}</HudText>
          </View>
        )}
        <View style={styles.flex}>
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {`${source}${shown.amount ? ` · ${shown.amount}` : ''}${shown.source === 'ai' && shown.accuracy !== undefined ? ` · ${g('cookbook.ui.ai', { pct: shown.accuracy })}` : ''}`}
          </HudText>
          <HudText size={hero ? 22 : 17} accessibilityRole="header">
            {shown.name}
          </HudText>
        </View>
      </View>

      {!hero && saved?.photoUri ? <Image source={{ uri: saved.photoUri }} resizeMode="cover" accessibilityLabel={g('food.photo.alt', { name: shown.name })} style={styles.photo} /> : null}

      <View style={styles.facts}>
        {d.minutes ? <Fact label={g('recipe.time')} value={g('recipe.minutes', { n: d.minutes })} /> : null}
        {d.difficulty ? <Fact label={g('recipe.difficulty')} value={stars(d.difficulty)} /> : null}
        {d.equipment && d.equipment.length > 0 ? <Fact label={g('recipe.equipment')} value={d.equipment.join(', ')} /> : null}
      </View>

      <View style={styles.block}>
        <HudText size={hero ? 20 : 14} color={quest.goldLight}>
          {`${shown.calories} kcal · ${r1(shown.proteinG)} g ${g('recipe.protein')}`}
        </HudText>
        {brief && brief.budgetKcal > 0 ? (
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {g('recipe.ofMeal', { pct: Math.round((shown.calories / brief.budgetKcal) * 100), kcal: Math.round(brief.budgetKcal) })}
          </HudText>
        ) : null}
        {/* Purine / salt / sugar: folded unless over what is left (README §2.3 rule 3). */}
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: details || overLimit }} accessibilityLabel={g('rd4.recipe.details')} onPress={() => setDetails(!details)} hitSlop={6} style={styles.detailsBtn}>
          <HudText size={12} weight="medium" color={quest.manaText}>
            {`${g('rd4.recipe.details')} ${details || overLimit ? '▾' : '▸'}`}
          </HudText>
        </Pressable>
        {details || overLimit ? (
          <>
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
          </>
        ) : null}
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
              style={styles.star}
              onPress={() => {
                store.save(recipeFromIdea(idea));
                store.rate(id, saved?.rating === n ? 0 : n);
              }}
            >
              <HudText size={28} color={(saved?.rating ?? 0) >= n ? quest.gold : quest.textSecondary}>
                {(saved?.rating ?? 0) >= n ? '★' : '☆'}
              </HudText>
            </Pressable>
          ))}
        </View>
      </View>

      {d.ingredients && d.ingredients.length > 0 ? (
        <View style={styles.block}>
          <HudText size={16} accessibilityRole="header">
            {g('recipe.ingredients')}
          </HudText>
          {d.ingredients.map((i, k) => (
            <View key={`${i.name}-${k}`} style={styles.ingredient}>
              <HudText size={14} weight="medium" style={styles.flex}>
                {i.name}
              </HudText>
              {i.quantity ? (
                <HudText size={13} weight="medium" color={quest.textSecondary}>
                  {i.quantity}
                </HudText>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {has ? (
        <View style={styles.block}>
          <HudText size={16} accessibilityRole="header">
            {g('recipe.steps')}
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
          {shown.how ? (
            <HudText size={12} weight="medium" color={quest.textSecondary}>
              {shown.how}
            </HudText>
          ) : null}
        </View>
      ) : (
        <View style={styles.block}>
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {shown.how ?? g('recipe.noRecipe')}
          </HudText>
          <QuestButton variant="mana" title={busy ? g('recipe.writing') : g('recipe.write')} loading={busy} onPress={() => void writeRecipe()} />
        </View>
      )}

      <View style={styles.photoRow}>
        <View style={styles.flex}>
          <QuestButton variant="ghost" icon="camera" title={g('recipe.myPhoto')} onPress={() => void addPhoto('camera')} />
        </View>
        <View style={styles.flex}>
          <QuestButton variant="ghost" icon="plus" title={g('food.photo.library')} onPress={() => void addPhoto('library')} />
        </View>
      </View>

      {error && (
        <HudText size={12} weight="medium" color={quest.hpText} accessibilityRole="alert">
          {error}
        </HudText>
      )}
      {saved ? (
        <QuestButton variant="danger" icon="trash" title={g('recipe.removeFromBook')} onPress={remove} />
      ) : (
        <QuestButton variant="mana" title={g('recipe.saveToBook')} onPress={() => store.save(recipeFromIdea(idea))} />
      )}
      <HudText size={11} weight="medium" color={quest.textSecondary}>
        {g('recipe.pictureNote')}
      </HudText>
    </View>
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
  wrap: { gap: 12 },
  flex: { flex: 1, minWidth: 0 },
  heroBox: { gap: 2 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  emojiBox: { width: 60, height: 60, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: quest.raised },
  photo: { width: '100%', height: 200, borderRadius: questRadius.row, backgroundColor: quest.raised },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fact: { gap: 2, paddingHorizontal: 10, paddingVertical: 6, borderRadius: questRadius.row, backgroundColor: quest.raised },
  block: { gap: 6 },
  detailsBtn: { minHeight: 32, justifyContent: 'center', alignSelf: 'flex-start' },
  starRow: { flexDirection: 'row', gap: 4 },
  star: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  ingredient: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36, paddingHorizontal: 10, borderRadius: questRadius.row, backgroundColor: quest.raised },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: questRadius.row, backgroundColor: quest.raised },
  stepIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: quest.bg },
  photoRow: { flexDirection: 'row', gap: 8 },
});
