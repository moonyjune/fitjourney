import { StyleSheet, View } from 'react-native';
import { useGameText } from '../../game/strings';
import { quest, questRadius } from '../../theme/quest';
import { HudText } from './HudText';
import { QuestIcon } from './QuestIcon';

/** "Đang ghi cho: Hôm qua" above a logging form that writes to a day other than today (picked in the quick-add sheet). */
export function LogDateBanner({ label }: { label: string }) {
  const g = useGameText();
  return (
    <View style={styles.banner} accessibilityRole="text">
      <QuestIcon name="clock" size={16} color={quest.goldLight} strokeWidth={2.2} />
      <HudText size={13} color={quest.goldLight}>
        {g('logDate.for', { day: label })}
      </HudText>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: questRadius.row,
    borderWidth: 1.5,
    borderColor: quest.gold,
    backgroundColor: quest.panel,
  },
});
