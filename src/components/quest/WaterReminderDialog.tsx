import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useGameText, type GameKey } from '../../game/strings';
import { quest, questRadius } from '../../theme/quest';
import { clockText } from '../../water/schedule';
import { waterCheerIndex, type WaterReminder } from '../../water/reminder';
import { HudText } from './HudText';
import { QuestButton } from './QuestButton';
import { FadeInUp } from './motion/FadeInUp';
import { PulseRing } from './motion/PulseRing';

interface Props {
  reminder: WaterReminder | null;
  /** Logs the amount to drink on the reminder's day, then closes. */
  onDrink: (ml: number) => void;
  onClose: () => void;
}

/** The pop-up at a drink time of the water plan: how much to drink now, the day so far, and a word of encouragement. */
export function WaterReminderDialog({ reminder, onDrink, onClose }: Props) {
  const g = useGameText();
  if (!reminder) return null;
  const { ml, drunkMl, targetMl, doneCount, totalCount } = reminder;
  const pct = targetMl > 0 ? Math.min(100, Math.round((drunkMl / targetMl) * 100)) : 0;
  const cheer = g(`water.cheer.${waterCheerIndex(reminder.key)}` as GameKey);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable accessibilityRole="button" accessibilityLabel={g('water.popup.later')} style={StyleSheet.absoluteFill} onPress={onClose} />
        <FadeInUp distance={24} duration={280} style={styles.sheet}>
          <View accessibilityViewIsModal style={styles.inner}>
            <View style={styles.drop}>
              <PulseRing color={quest.mana} borderRadius={42} />
              <HudText size={40}>💧</HudText>
            </View>
            <HudText size={20} accessibilityRole="header" style={styles.center}>
              {g('water.popup.title', { time: clockText(reminder.hour, reminder.minute) })}
            </HudText>
            <HudText size={26} color={quest.manaText} style={styles.center} accessibilityLiveRegion="polite">
              {g('water.popup.amount', { ml })}
            </HudText>
            <HudText size={13} weight="medium" color={quest.textSecondary} style={styles.center}>
              {reminder.label}
            </HudText>
            <View style={styles.track} accessibilityLabel={g('water.popup.progress', { drunk: drunkMl, target: targetMl })}>
              <View style={[styles.fill, { width: `${pct}%` }]} />
            </View>
            <HudText size={12} weight="medium" color={quest.textSecondary} style={styles.center}>
              {g('water.popup.progress', { drunk: drunkMl, target: targetMl })} · {g('water.popup.done', { n: doneCount, t: totalCount })}
            </HudText>
            <View style={styles.cheer}>
              <HudText size={14} color={quest.xp} style={styles.center}>
                {cheer}
              </HudText>
            </View>
            <QuestButton variant="mana" icon="check" title={g('water.popup.drink', { ml })} onPress={() => onDrink(ml)} />
            <QuestButton variant="ghost" title={g('water.popup.later')} onPress={onClose} />
          </View>
        </FadeInUp>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', padding: 16, backgroundColor: 'rgba(8,6,18,0.72)' },
  sheet: { maxWidth: 420, width: '100%', alignSelf: 'center' },
  inner: { gap: 10, padding: 18, borderRadius: 22, borderWidth: 1.5, borderColor: quest.mana, backgroundColor: quest.panel, alignItems: 'stretch' },
  drop: { alignSelf: 'center', width: 84, height: 84, alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
  track: { height: 8, borderRadius: 4, backgroundColor: quest.bg, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: quest.mana },
  cheer: { padding: 10, borderRadius: questRadius.panel, backgroundColor: quest.raised, borderWidth: 1, borderColor: quest.border },
});
