import { StyleSheet, View } from 'react-native';
import { FloatUp } from './motion/FloatUp';
import { PopIn } from './motion/PopIn';
import { PressScale } from './motion/PressScale';
import type { MissionStatus } from '../../game/missions';
import { quest, questRadius } from '../../theme/quest';
import { HudText } from './HudText';
import { QuestIcon } from './QuestIcon';
import { XpBar } from './XpBar';

interface MissionRowProps {
  title: string;
  subtitle: string;
  status: MissionStatus;
  xp: number;
  /** 0..1 progress bar for "reach the goal" missions that are still open. */
  progress?: number;
  /** Spoken status, e.g. "done" / "holding"; prepended to the accessibility label. */
  statusLabel: string;
  onPress?: () => void;
}

function StatusBox({ status }: { status: MissionStatus }) {
  if (status === 'done') {
    return (
      <PopIn playOnMount={false} style={[styles.box, { backgroundColor: quest.gold }]}>
        <QuestIcon name="check" size={16} color={quest.onGold} strokeWidth={3} />
      </PopIn>
    );
  }
  if (status === 'holding') {
    return (
      <View style={[styles.box, { borderWidth: 2, borderColor: quest.mana }]}>
        <QuestIcon name="clock" size={14} color={quest.mana} strokeWidth={2.4} />
      </View>
    );
  }
  if (status === 'missed') {
    // Grey dashed outline: "not met" is neutral, never red — the game never shames the player.
    return <View style={[styles.box, { borderWidth: 2, borderColor: quest.textSecondary, borderStyle: 'dashed' }]} />;
  }
  return <View style={[styles.box, { borderWidth: 2, borderColor: quest.gold }]} />;
}

export function MissionRow({ title, subtitle, status, xp, progress, statusLabel, onPress }: MissionRowProps) {
  const done = status === 'done';
  const dim = done || status === 'missed';
  const content = (
    <View
      style={[
        styles.row,
        status === 'open' && { borderWidth: 1.5, borderColor: quest.gold },
        status === 'holding' && { borderWidth: 1.5, borderColor: quest.border },
        dim && { opacity: done ? 0.8 : 0.65 },
      ]}
    >
      <StatusBox status={status} />
      <View style={styles.text}>
        <HudText
          size={14}
          weight="semibold"
          style={done ? { textDecorationLine: 'line-through' } : undefined}
        >
          {title}
        </HudText>
        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {subtitle}
        </HudText>
        {status === 'open' && progress != null && (
          <View style={styles.progress}>
            <XpBar ratio={progress} color={quest.xp} trackColor={quest.bg} height={6} />
          </View>
        )}
      </View>
      <View style={styles.xpWrap}>
        <HudText size={14} color={done ? quest.xp : quest.textSecondary}>
          +{xp}
        </HudText>
        <FloatUp play={done} style={styles.xpFloat}>
          <HudText size={15} color={quest.xp}>
            +{xp} XP
          </HudText>
        </FloatUp>
      </View>
    </View>
  );

  const label = `${title}. ${statusLabel}. ${subtitle}. +${xp} XP`;
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={label}>
        {content}
      </View>
    );
  }
  return (
    <PressScale scaleTo={0.98} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}>
      {content}
    </PressScale>
  );
}

const styles = StyleSheet.create({
  xpWrap: { alignItems: 'flex-end', justifyContent: 'center' },
  xpFloat: { position: 'absolute', right: 0, top: -4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: questRadius.row,
    backgroundColor: quest.panel,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  box: { width: 26, height: 26, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0 },
  progress: { marginTop: 6 },
});
