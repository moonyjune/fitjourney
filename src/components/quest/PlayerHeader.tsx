import { StyleSheet, View } from 'react-native';
import type { LevelProgress, TitleKey } from '../../game/level';
import { useGameText } from '../../game/strings';
import { quest } from '../../theme/quest';
import { HudText } from './HudText';
import { QuestIcon } from './QuestIcon';
import { QuestShield } from './QuestShield';
import { XpBar } from './XpBar';

interface PlayerHeaderProps {
  level: LevelProgress;
  titleKey: TitleKey;
  streak: number;
}

export function PlayerHeader({ level, titleKey, streak }: PlayerHeaderProps) {
  const g = useGameText();
  const progressText = g('level.progress', { cur: level.xpIntoLevel, need: level.xpForNext, next: level.level + 1 });
  return (
    <View style={styles.row}>
      <QuestShield level={level.level} />
      <View style={styles.middle}>
        <View style={styles.titleRow}>
          <HudText size={19}>{g(`title.${titleKey}`)}</HudText>
          <HudText size={13} weight="medium" color={quest.textSecondary}>
            {g('level.label', { n: level.level })}
          </HudText>
        </View>
        <View style={styles.barGap}>
          <XpBar ratio={level.ratio} accessibilityLabel={progressText} />
        </View>
        <HudText size={12} weight="medium" color={quest.textSecondary} style={styles.progressText}>
          {progressText}
        </HudText>
      </View>
      <View accessible accessibilityLabel={g('streak.a11y', { n: streak })} style={styles.streak}>
        <QuestIcon name="flame" size={18} color={quest.gold} />
        <HudText size={16} color={quest.gold}>
          {streak}
        </HudText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  middle: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  barGap: { marginTop: 6 },
  progressText: { marginTop: 4 },
  streak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 44,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: quest.raised2,
  },
});
