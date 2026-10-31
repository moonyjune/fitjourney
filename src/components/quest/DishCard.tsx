import { Pressable, StyleSheet, View } from 'react-native';
import type { DinnerIdea } from '../../ai/dinner';
import { useGameText } from '../../game/strings';
import { quest, questRadius } from '../../theme/quest';
import { HudText } from './HudText';

export interface DishCardProps {
  idea: DinnerIdea;
  onPress: () => void;
  /** Show the gout / purine warning badge. */
  purineHigh: boolean;
  rating?: number;
  cooked?: number;
  /** Fits what is left today (true / false), or not judged (undefined). */
  fits?: boolean;
  /** One short extra line (matched filters, a note), cut to one line. */
  sub?: string;
}

function Badge({ text, color = quest.textTertiary, strong }: { text: string; color?: string; strong?: boolean }) {
  return (
    <View style={[styles.badge, strong && { borderColor: color }]}>
      <HudText size={11} weight="semibold" color={color} numberOfLines={1}>
        {text}
      </HudText>
    </View>
  );
}

/** One dish as a compact card: emoji, the name on one line, kcal / protein / purine as small badges, stars and times cooked.
 *  Ingredients, steps and notes are in the recipe dialog it opens. */
export function DishCard({ idea, onPress, purineHigh, rating, cooked, fits, sub }: DishCardProps) {
  const g = useGameText();
  const minutes = idea.recipe?.minutes;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={idea.name} onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.emoji}>
        <HudText size={22}>{idea.recipe?.emoji ?? '🍽️'}</HudText>
      </View>
      <View style={styles.body}>
        <HudText size={14} numberOfLines={1}>
          {idea.name}
        </HudText>
        <View style={styles.badges}>
          <Badge text={g('cookbook.ui.kcal', { n: idea.calories })} color={quest.goldLight} />
          <Badge text={g('cookbook.ui.protein', { n: idea.proteinG })} color={quest.manaText} />
          {purineHigh ? <Badge text={g('cookbook.ui.purineHigh')} color={quest.hpText} strong /> : <Badge text={g('cookbook.ui.purine', { n: idea.purineMg })} />}
          {minutes ? <Badge text={g('cookbook.ui.minutes', { n: minutes })} /> : null}
          {rating ? <Badge text={`★ ${rating}`} color={quest.gold} /> : null}
          {cooked ? <Badge text={g('cookbook.ui.cooked', { n: cooked })} /> : null}
          {idea.where ? <Badge text={g(idea.where === 'home' ? 'cheat.home' : 'cheat.out')} /> : null}
          {fits === undefined ? null : <Badge text={fits ? g('cookbook.ui.fits') : g('cookbook.ui.over')} color={fits ? quest.xp : quest.goldLight} />}
          {idea.source === 'ai' && idea.accuracy !== undefined ? <Badge text={g('cookbook.ui.ai', { pct: idea.accuracy })} /> : null}
        </View>
        {sub ? (
          <HudText size={11} weight="medium" color={quest.textSecondary} numberOfLines={1}>
            {sub}
          </HudText>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 60, paddingVertical: 8, paddingHorizontal: 10, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  pressed: { backgroundColor: quest.raised },
  emoji: { width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: quest.raised2 },
  body: { flex: 1, gap: 4, minWidth: 0 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  badge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, borderWidth: 1, borderColor: quest.border, backgroundColor: quest.bg },
});
