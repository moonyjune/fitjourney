import { StyleSheet, View } from 'react-native';
import { IF_EATING_END_HOUR, IF_EATING_START_HOUR } from '../../constants/plan';
import { useGameText } from '../../game/strings';
import { quest, questRadius } from '../../theme/quest';
import { HudText } from './HudText';
import { QuestIcon } from './QuestIcon';
import { XpBar } from './XpBar';

interface WindowCardProps {
  isEatingWindow: boolean;
  hoursUntilTransition: number;
}

const FASTING_HOURS = 24 - (IF_EATING_END_HOUR - IF_EATING_START_HOUR);
const EATING_HOURS = IF_EATING_END_HOUR - IF_EATING_START_HOUR;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** `1.4` hours -> "1:24". Rounds up to the next minute so it never shows 0:00 while time remains.
 *  Rounds to whole seconds first: 12 - 10.6 is 1.4000000000000004 in floating point, which would
 *  otherwise tip the ceil over to 1:25. */
export function formatHoursMinutes(hours: number): string {
  const totalMinutes = Math.max(0, Math.ceil(Math.round(hours * 3600) / 60));
  return `${Math.floor(totalMinutes / 60)}:${pad(totalMinutes % 60)}`;
}

/** Intermittent-fasting status as a HUD panel: mana-blue "meditation" while fasting, gold-lit while eating. */
export function WindowCard({ isEatingWindow, hoursUntilTransition }: WindowCardProps) {
  const g = useGameText();
  const total = isEatingWindow ? EATING_HOURS : FASTING_HOURS;
  const elapsed = Math.max(0, total - hoursUntilTransition);
  const accent = isEatingWindow ? quest.gold : quest.mana;
  const accentText = isEatingWindow ? quest.goldLight : quest.manaText;
  const time = `${pad(isEatingWindow ? IF_EATING_END_HOUR : IF_EATING_START_HOUR)}:00`;
  const countdown = formatHoursMinutes(hoursUntilTransition);
  const caption = g(isEatingWindow ? 'window.untilClose' : 'window.untilOpen', { time });
  const progress = isEatingWindow
    ? g('window.eatenIn', { done: Math.floor(elapsed), total })
    : g('window.fasted', { done: formatHoursMinutes(elapsed).replace(':', 'g') + 'p', total: `${total}g` });

  return (
    <View
      accessible
      accessibilityLabel={`${g(isEatingWindow ? 'window.eatingTitle' : 'window.fastingTitle')}, ${countdown} ${caption}`}
      style={[
        styles.card,
        isEatingWindow
          ? { backgroundColor: quest.raised, borderColor: quest.gold }
          : { backgroundColor: quest.manaPanel, borderColor: quest.manaBorder },
      ]}
    >
      <View style={styles.headRow}>
        <QuestIcon name={isEatingWindow ? 'camp' : 'clock'} size={16} color={accent} />
        <HudText size={11} color={accentText} style={styles.eyebrow}>
          {g(isEatingWindow ? 'window.eatingTitle' : 'window.fastingTitle').toUpperCase()}
        </HudText>
      </View>
      <View style={styles.countRow}>
        <HudText size={40} color={quest.text}>
          {countdown}
        </HudText>
        <HudText size={13} weight="medium" color={quest.textSecondary} style={styles.caption}>
          {caption}
        </HudText>
      </View>
      <XpBar ratio={total > 0 ? elapsed / total : 0} color={accent} trackColor={quest.bg} height={8} />
      <HudText size={12} weight="medium" color={quest.textSecondary} style={styles.progress}>
        {progress}
      </HudText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1.5, borderRadius: questRadius.panel, padding: 14 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eyebrow: { letterSpacing: 1.6 },
  countRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 2, marginBottom: 8, flexWrap: 'wrap' },
  caption: { flexShrink: 1 },
  progress: { marginTop: 6 },
});
