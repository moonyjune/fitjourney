import type { ReactNode } from 'react';
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
  /** Shown at the right end of the row (Camp: the date chip). */
  right?: ReactNode;
}

/** Camp's one-line header: shield + "Cấp 7", the XP bar and "1,720/2,780 XP", the campfire streak chip, then `right`. The rank title
 *  ("Tân binh") is read out with the level, not drawn, to keep the row to one line. */
export function PlayerHeader({ level, titleKey, streak, right }: PlayerHeaderProps) {
  const g = useGameText();
  const progressText = g('level.progress', { cur: level.xpIntoLevel, need: level.xpForNext, next: level.level + 1 });
  const xp = g('camp.levelXp', { cur: level.xpIntoLevel.toLocaleString('en-US'), need: level.xpForNext.toLocaleString('en-US') });
  return (
    <View style={styles.row}>
      <View accessible accessibilityLabel={`${g(`title.${titleKey}`)}, ${g('level.label', { n: level.level })}. ${progressText}`} style={styles.left}>
        <QuestShield level={level.level} width={34} />
        <View style={styles.middle}>
          <HudText size={15} numberOfLines={1}>
            {g('level.label', { n: level.level })}
          </HudText>
          <View style={styles.barGap}>
            <XpBar ratio={level.ratio} height={6} />
          </View>
          <HudText size={11} weight="medium" color={quest.textSecondary} numberOfLines={1} style={styles.xp}>
            {xp}
          </HudText>
        </View>
      </View>
      <View accessible accessibilityLabel={g('streak.a11y', { n: streak })} style={styles.streak}>
        <QuestIcon name="flame" size={16} color={quest.gold} />
        <HudText size={15} color={quest.gold}>
          {streak}
        </HudText>
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52 },
  left: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  middle: { flex: 1, minWidth: 0 },
  barGap: { marginTop: 4 },
  xp: { marginTop: 3 },
  streak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 44,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: quest.border,
    backgroundColor: quest.panel,
  },
});
