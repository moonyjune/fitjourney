import { StyleSheet, View } from 'react-native';
import { MISSION_XP, type MissionId } from '../../game/constants';
import { useGameText, type GameKey } from '../../game/strings';
import { quest, questRadius } from '../../theme/quest';
import { HudText } from './HudText';
import { QuestIcon } from './QuestIcon';

interface ImpactNoteProps {
  newlyDone: MissionId[];
  newlyMissed: MissionId[];
}

/** Plain-language preview of how a change (eating a meal, adding a food) moves today's missions. */
export function ImpactNote({ newlyDone, newlyMissed }: ImpactNoteProps) {
  const g = useGameText();
  const name = (id: MissionId) => g(`missionShort.${id}` as GameKey);
  const empty = newlyDone.length === 0 && newlyMissed.length === 0;
  return (
    <View style={styles.box}>
      <HudText size={11} color={quest.textSecondary} style={styles.eyebrow}>
        {g('impact.title').toUpperCase()}
      </HudText>
      {empty && (
        <HudText size={13} weight="medium" color={quest.textTertiary}>
          {g('impact.none')}
        </HudText>
      )}
      {newlyDone.map((id) => (
        <View key={`d-${id}`} style={styles.line}>
          <QuestIcon name="check" size={16} color={quest.xp} strokeWidth={3} />
          <HudText size={13} weight="semibold" color={quest.xp} style={styles.lineText}>
            {g('impact.doneXp', { name: name(id), xp: MISSION_XP[id] })}
          </HudText>
        </View>
      ))}
      {newlyMissed.map((id) => (
        <View key={`m-${id}`} style={styles.line}>
          <QuestIcon name="alert" size={16} color={quest.gold} />
          <HudText size={13} weight="semibold" color={quest.goldLight} style={styles.lineText}>
            {g('impact.missed', { name: name(id) })}
          </HudText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 6, padding: 12, borderRadius: questRadius.row, backgroundColor: quest.panel, borderWidth: 1.5, borderColor: quest.border },
  eyebrow: { letterSpacing: 1.6 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lineText: { flex: 1 },
});
