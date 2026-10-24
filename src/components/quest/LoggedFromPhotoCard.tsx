import { Pressable, StyleSheet, View } from 'react-native';
import { useGameText } from '../../game/strings';
import { useWorkoutStore } from '../../store/useWorkoutStore';
import { quest, questRadius } from '../../theme/quest';
import { HudText } from './HudText';
import { QuestIcon } from './QuestIcon';

interface LoggedFromPhotoCardProps {
  entryId: string;
  /** "Confidence: medium" (already translated) or null when the AI gave none. */
  confidence: string | null;
  reasoning: string;
  onEdit: (entryId: string) => void;
  onUndo: (entryId: string) => void;
}

/** Shown right after a workout was logged from a photo by itself: what was filled in, how sure the AI was and why,
 *  with "Edit" (opens the entry's edit form) and "Undo" (removes the entry and its photo). It always shows the entry's
 *  CURRENT numbers, and disappears once the entry is gone. */
export function LoggedFromPhotoCard({ entryId, confidence, reasoning, onEdit, onUndo }: LoggedFromPhotoCardProps) {
  const g = useGameText();
  const entry = useWorkoutStore((s) => s.entries.find((e) => e.id === entryId));
  if (!entry) return null;
  return (
    <View style={styles.card} accessibilityLiveRegion="polite">
      <View style={styles.head}>
        <QuestIcon name="check" size={18} color={quest.xp} strokeWidth={2.8} />
        <HudText size={15} color={quest.xp} accessibilityRole="header">
          {g('wkp.logged')}
        </HudText>
      </View>
      <HudText size={14}>{g('wkp.loggedValues', { name: entry.label, min: entry.durationMin, kcal: entry.caloriesBurned })}</HudText>
      {confidence ? (
        <HudText size={12} color={quest.manaText}>
          {confidence}
        </HudText>
      ) : null}
      {reasoning ? (
        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {reasoning}
        </HudText>
      ) : null}
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={g('wkp.editLogged')}
          onPress={() => onEdit(entryId)}
          style={({ pressed }) => [styles.button, pressed && { opacity: 0.85 }]}
        >
          <HudText size={14} color={quest.manaText}>
            {g('wkp.editLogged')}
          </HudText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={g('wkp.undo')}
          onPress={() => onUndo(entryId)}
          style={({ pressed }) => [styles.button, styles.undo, pressed && { opacity: 0.85 }]}
        >
          <HudText size={14} color={quest.hpText}>
            {g('wkp.undo')}
          </HudText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 6, padding: 14, borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: '#2E6A3B', backgroundColor: '#17301F' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  button: { flex: 1, minHeight: 44, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel, alignItems: 'center', justifyContent: 'center' },
  undo: { borderColor: quest.bossBorder, backgroundColor: quest.bossPanel },
});
