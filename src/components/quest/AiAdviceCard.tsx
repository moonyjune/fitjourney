import { StyleSheet, View } from 'react-native';
import { adviceLines } from '../../ai/adviceText';
import { useGameText } from '../../game/strings';
import type { PhotoAdvice } from '../../sync/cloudSync';
import { quest, questRadius } from '../../theme/quest';
import { HudText } from './HudText';

/** The AI's read of the day and what to do next (already cleaned with `cleanAdvice`). */
export function AiAdviceCard({ advice }: { advice: PhotoAdvice }) {
  const g = useGameText();
  return (
    <View style={styles.card} accessibilityLiveRegion="polite">
      <HudText size={12} color={quest.manaText}>
        {g('ai.adviceTitle')}
      </HudText>
      {adviceLines(advice, g).map((line, i) => (
        <HudText key={i} size={12} weight="medium" color={quest.textSecondary}>
          {line}
        </HudText>
      ))}
      <HudText size={11} weight="medium" color={quest.textSecondary}>
        {g('ai.advice.disclaimer')}
      </HudText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 4, padding: 12, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.manaBorder, backgroundColor: quest.manaPanel },
});
