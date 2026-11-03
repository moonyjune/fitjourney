import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { ClipPath, Defs, G, Path, Rect } from 'react-native-svg';
import { useGameText, type GameKey } from '../../game/strings';
import { quest } from '../../theme/quest';
import { clockText } from '../../water/schedule';
import type { WaterReminder, WaterStep } from '../../water/reminder';
import { BottomSheet } from './BottomSheet';
import { HudText } from './HudText';
import { hiddenSvgProps } from './hiddenSvg';
import { QuestButton } from './QuestButton';
import { QuestIcon } from './QuestIcon';

/** The other amounts offered next to the main button: 250 ml less and 250 ml more than asked. */
export const WATER_POPUP_ALT_STEP_ML = 250;

/** The amounts on the chips next to the main button (each > 0, never the asked amount itself). */
export function waterPopupAlternatives(nowMl: number): number[] {
  return [nowMl - WATER_POPUP_ALT_STEP_ML, nowMl + WATER_POPUP_ALT_STEP_ML].filter((ml) => ml > 0);
}

/** "1.0 / 2.5 L". */
function litres(drunkMl: number, targetMl: number): string {
  return `${(drunkMl / 1000).toFixed(1)} / ${(targetMl / 1000).toFixed(1)} L`;
}

interface Props {
  reminder: WaterReminder | null;
  /** Brings the reminder's day up to `reachMl` (a running total, not an amount to add), then closes. */
  onDrink: (reachMl: number) => void;
  /** "Nhắc sau 30′": closes and comes back later. */
  onSnooze: () => void;
  onClose: () => void;
}

/** A glass filled to the day's progress. */
function Glass({ pct }: { pct: number }) {
  const top = 6 + (88 * (100 - pct)) / 100;
  return (
    <Svg width={62} height={80} viewBox="0 0 78 100" {...hiddenSvgProps}>
      <Defs>
        <ClipPath id="waterGlass">
          <Path d="M8 6h62l-7 88H15z" />
        </ClipPath>
      </Defs>
      <Path d="M8 6h62l-7 88H15z" fill={quest.bg} stroke={quest.mana} strokeWidth={3} />
      <G clipPath="url(#waterGlass)">
        <Rect x={0} y={top} width={78} height={100 - top} fill={quest.mana} opacity={0.85} />
      </G>
    </Svg>
  );
}

const DOT: Record<WaterStep['status'], { border: string; fill: string; text: string }> = {
  done: { border: quest.mana, fill: quest.mana, text: quest.textSecondary },
  missed: { border: quest.hp, fill: 'transparent', text: quest.hpText },
  now: { border: quest.gold, fill: 'transparent', text: quest.gold },
  later: { border: quest.manaBorder, fill: 'transparent', text: quest.textSecondary },
};

/** The pop-up at a drink time of the water plan (Design/uiux-proposal/html/09-water-after.html): a mana sheet with a glass filled
 *  to the day's progress, how much to drink now, where the day stands, the day's drink times as dots (✓ / missed / now), the
 *  catch-up plan for a shortfall, and one button that sets the day to the drink time's total. The cheer comes as a toast after. */
export function WaterReminderDialog({ reminder, onDrink, onSnooze, onClose }: Props) {
  const g = useGameText();
  if (!reminder) return null;
  const { nowMl, reachMl, drunkMl, targetMl, steps, missed, catchUp } = reminder;
  const time = clockText(reminder.hour, reminder.minute);
  const pct = targetMl > 0 ? Math.min(100, Math.round((drunkMl / targetMl) * 100)) : 0;
  // Behind the schedule by what the drink times before this one still miss.
  const nowIndex = steps.findIndex((s) => s.status === 'now');
  const behindMl = Math.max(0, (nowIndex > 0 ? steps[nowIndex - 1].cumulativeTargetMl : 0) - drunkMl);
  const status = behindMl > 0 ? g('water.pop.behind', { ml: behindMl }) : g('water.pop.onTrack');
  const stepsA11y = steps.map((s) => `${s.time} ${g(`water.pop.dot.${s.status}` as GameKey)}`).join(', ');
  return (
    <BottomSheet visible onClose={onClose} tone="mana" closeLabel={g('water.popup.later')} testID="water-popup">
      <View style={styles.head}>
        <Glass pct={pct} />
        <View style={styles.headText}>
          <HudText size={12} weight="medium" color={quest.manaText}>
            {g('water.pop.eyebrow', { time, label: reminder.label })}
          </HudText>
          <HudText size={26} accessibilityRole="header" accessibilityLiveRegion="polite">
            {g('water.pop.amount', { ml: nowMl })}
          </HudText>
          <HudText size={13} weight="medium" color={behindMl > 0 ? quest.hpText : quest.textSecondary}>
            {`${litres(drunkMl, targetMl)} · ${status}`}
          </HudText>
        </View>
      </View>

      <View style={styles.dots} accessible accessibilityLabel={`${g('water.popup.schedule')}: ${stepsA11y}`}>
        {steps.map((s) => (
          <View key={s.time} style={styles.dotCol}>
            <View
              style={[
                styles.dot,
                { borderColor: DOT[s.status].border, backgroundColor: DOT[s.status].fill },
                s.status === 'now' && styles.dotNow,
              ]}
            >
              {s.status === 'done' ? <QuestIcon name="check" size={10} color={quest.bg} strokeWidth={3} /> : null}
            </View>
            <HudText size={10} weight="medium" color={DOT[s.status].text}>
              {s.time}
            </HudText>
          </View>
        ))}
      </View>

      {missed.length > 0 && (
        <HudText size={12} weight="medium" color={quest.hpText} style={styles.line}>
          {g('water.pop.missed', { times: missed.join(', ') })}
        </HudText>
      )}
      {catchUp.length > 0 && (
        <HudText size={12} weight="medium" color={quest.manaText} style={styles.line}>
          {g('water.pop.catchUp', { items: catchUp.map((c) => g('water.pop.catchUpItem', { time: c.time, ml: c.extraMl })).join(' · ') })}
        </HudText>
      )}

      <View style={styles.cta}>
        <QuestButton
          variant="mana"
          icon="check"
          title={g('water.pop.drink', { ml: nowMl })}
          accessibilityLabel={g('water.pop.drinkA11y', { ml: nowMl, reach: reachMl })}
          onPress={() => onDrink(reachMl)}
        />
      </View>
      <View style={styles.chips}>
        {waterPopupAlternatives(nowMl).map((ml) => (
          <Pressable
            key={ml}
            accessibilityRole="button"
            accessibilityLabel={g('water.pop.drinkA11y', { ml, reach: drunkMl + ml })}
            onPress={() => onDrink(drunkMl + ml)}
            style={({ pressed }) => [styles.chip, styles.chipMana, pressed && styles.pressed]}
          >
            <HudText size={14} color={quest.manaText}>{`${ml} ml`}</HudText>
          </Pressable>
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={g('water.pop.snooze')}
          onPress={onSnooze}
          style={({ pressed }) => [styles.chip, styles.chipWide, pressed && styles.pressed]}
        >
          <QuestIcon name="clock" size={16} color={quest.text} />
          <HudText size={14}>{g('water.pop.snooze')}</HudText>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  headText: { flex: 1, gap: 4 },
  dots: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, paddingHorizontal: 2 },
  dotCol: { alignItems: 'center', gap: 4 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  dotNow: { shadowColor: quest.gold, shadowOpacity: 0.6, shadowRadius: 4 },
  line: { marginTop: 8 },
  cta: { marginTop: 16 },
  chips: { flexDirection: 'row', gap: 8, marginTop: 10 },
  chip: {
    flex: 1,
    minHeight: 44,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: quest.border,
    backgroundColor: quest.panel,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  chipMana: { borderColor: quest.manaBorder, backgroundColor: quest.bg },
  chipWide: { flex: 1.3 },
  pressed: { opacity: 0.85 },
});
