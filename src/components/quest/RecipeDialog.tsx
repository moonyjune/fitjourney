import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { DinnerBrief, DinnerIdea } from '../../ai/dinner';
import { recipeFromIdea, recipeKey } from '../../cookbook/recipes';
import { useGameText } from '../../game/strings';
import { useCookbookStore } from '../../store/useCookbookStore';
import { quest, questRadius } from '../../theme/quest';
import { QuestButton } from './QuestButton';
import { RecipeView, useRecipeShown } from './RecipeView';

/** A dish's recipe over the screen it was opened from (Camp's meal suggestions). The cook book and cheat day open the recipe page
 *  instead (app/recipe/[id].tsx); both show the same `RecipeView`. Removing the dish from the cook book closes the dialog and confirms it
 *  with the app toast, whose "Hoàn tác" puts the same entry back; `onRemoved` is then told the dish's name. */
export function RecipeDialog({ idea, brief, mealLabel, onClose, onLog, onRemoved }: { idea: DinnerIdea | null; brief?: DinnerBrief; mealLabel?: string; onClose: () => void; onLog?: (idea: DinnerIdea) => void; onRemoved?: (name: string) => void }) {
  if (!idea) return null;
  return <Dialog idea={idea} brief={brief} mealLabel={mealLabel} onClose={onClose} onLog={onLog} onRemoved={onRemoved} />;
}

function Dialog({ idea, brief, mealLabel, onClose, onLog, onRemoved }: { idea: DinnerIdea; brief?: DinnerBrief; mealLabel?: string; onClose: () => void; onLog?: (idea: DinnerIdea) => void; onRemoved?: (name: string) => void }) {
  const g = useGameText();
  const { shown } = useRecipeShown(idea);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable accessibilityRole="button" accessibilityLabel={g('journal.detailClose')} style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet} accessibilityViewIsModal>
          <ScrollView contentContainerStyle={styles.content}>
            <RecipeView
              idea={idea}
              brief={brief}
              mealLabel={mealLabel}
              onRemoved={(name) => {
                onClose();
                onRemoved?.(name);
              }}
            />
          </ScrollView>
          <View style={styles.actions}>
            {onLog && (
              <QuestButton
                variant="gold"
                title={g('dinner.log')}
                accessibilityLabel={g('dinner.logLabel', { name: shown.name })}
                onPress={() => {
                  const store = useCookbookStore.getState();
                  store.save(recipeFromIdea(idea));
                  store.markCooked(recipeKey(idea.name));
                  onLog(shown);
                }}
              />
            )}
            <QuestButton variant="ghost" title={g('journal.detailClose')} onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', padding: 16, backgroundColor: 'rgba(0,0,0,0.75)' },
  sheet: { maxHeight: '92%', maxWidth: 560, width: '100%', alignSelf: 'center', gap: 10, padding: 16, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  content: { gap: 12 },
  actions: { gap: 8 },
});
