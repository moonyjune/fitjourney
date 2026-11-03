import { Pressable, StyleSheet, View } from 'react-native';
import type { DinnerIdea } from '../../ai/dinner';
import type { DishBadge } from '../../cookbook/browse';
import { useGameText } from '../../game/strings';
import { quest, questRadius } from '../../theme/quest';
import { DishPhotoCredit } from './DishPhoto';
import { DishThumb } from './DishThumb';
import { HudText } from './HudText';

export interface DishCardProps {
  idea: DinnerIdea;
  onPress: () => void;
  /** Show the gout / purine warning badge. */
  purineHigh: boolean;
  /** A cheat-day dish: no purine badge or warning at all (cheat day has no rules); kcal and protein stay, as information. */
  cheat?: boolean;
  rating?: number;
  cooked?: number;
  /** Fits what is left today (true / false), or not judged (undefined). */
  fits?: boolean;
  /** One short extra line (matched filters, a note), cut to one line. */
  sub?: string;
  /** Show the dish's real photo (with its credit line) instead of the emoji when one is found (cheat day dishes). */
  photo?: boolean;
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

/** One dish as a compact card: emoji (or, with `photo`, the dish's real photo and its credit), the name on one line, kcal / protein /
 *  purine as small badges, stars and times cooked. Ingredients, steps and notes are in the recipe dialog it opens. */
export function DishCard({ idea, onPress, purineHigh, cheat, rating, cooked, fits, sub, photo }: DishCardProps) {
  const g = useGameText();
  const minutes = idea.recipe?.minutes;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={idea.name} onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      {/* Without `photo`: the recipe's emoji (or one guessed from the name) on a colour by kind of dish, no web photo asked for. */}
      <DishThumb name={idea.name} emoji={idea.recipe?.emoji} size={photo ? 56 : 42} radius={10} off={!photo} />
      <View style={styles.body}>
        <HudText size={14} numberOfLines={1}>
          {idea.name}
        </HudText>
        <View style={styles.badges}>
          <Badge text={g('cookbook.ui.kcal', { n: idea.calories })} color={quest.goldLight} />
          <Badge text={g('cookbook.ui.protein', { n: idea.proteinG })} color={quest.manaText} />
          {cheat ? null : purineHigh ? <Badge text={g('cookbook.ui.purineHigh')} color={quest.hpText} strong /> : <Badge text={g('cookbook.ui.purine', { n: idea.purineMg })} />}
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
        {photo ? <DishPhotoCredit name={idea.name} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 60, paddingVertical: 8, paddingHorizontal: 10, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  pressed: { backgroundColor: quest.raised },
  body: { flex: 1, gap: 4, minWidth: 0 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, borderWidth: 1, borderColor: quest.border, backgroundColor: quest.bg },
  tile: { flex: 1, minWidth: 0, overflow: 'hidden', borderRadius: 16, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  tileBody: { gap: 4, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 10 },
  tileRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  flex: { flex: 1, minWidth: 0 },
});

/** One dish of the cook book grid (README §3.6): its photo (the user's own, else the real one, else a large emoji on a colour), the
 *  name, kcal · protein, and one badge (Vừa / +N / Purine cao). Half the width of the screen, two per row. */
export function DishTile({ idea, onPress, badge, rating, photoUri }: { idea: DinnerIdea; onPress: () => void; badge: DishBadge; rating?: number; photoUri?: string | null }) {
  const g = useGameText();
  const b =
    badge?.kind === 'purine'
      ? { text: g('cookbook.ui.purineHigh'), color: quest.hpText }
      : badge?.kind === 'fits'
        ? { text: g('rd4.badge.fits'), color: quest.xp }
        : badge?.kind === 'over'
          ? { text: `+${badge.kcal}`, color: quest.goldLight }
          : null;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={idea.name} onPress={onPress} style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
      <DishThumb name={idea.name} emoji={idea.recipe?.emoji} photoUri={photoUri} size={104} radius={0} fill />
      <View style={styles.tileBody}>
        <HudText size={14} numberOfLines={2}>
          {idea.name}
        </HudText>
        <View style={styles.tileRow}>
          <HudText size={12} weight="medium" color={quest.textSecondary} numberOfLines={1} style={styles.flex}>
            {g('rd4.tile.nums', { kcal: idea.calories, protein: Math.round(idea.proteinG) })}
          </HudText>
          {rating ? (
            <HudText size={12} color={quest.gold}>
              {`★${rating}`}
            </HudText>
          ) : null}
        </View>
        {b ? <Badge text={b.text} color={b.color} strong /> : null}
      </View>
    </Pressable>
  );
}
