import { Pressable, StyleSheet, View } from 'react-native';
import { reportWrongPhoto } from '../../ai/photoReport';
import { useGameText } from '../../game/strings';
import type { PhotoReportRequest } from '../../../supabase/functions/_shared/photoReport';
import { HudText } from './HudText';
import { QuestIcon } from './QuestIcon';

/** Pictures smaller than this get no chip (a list thumbnail): it would cover the dish. */
export const REPORT_CHIP_MIN_SIZE = 72;

/** "Ảnh sai?" (1.5): a small chip in the top-right corner of a dish photo, at least 44 pt to tap (hitSlop around the visible chip).
 *  One tap hides the photo for the player (the emoji instead, with "Hoàn tác") and reports it so a new one is looked for. */
export function PhotoReportChip({ report }: { report: PhotoReportRequest }) {
  const g = useGameText();
  return (
    <View style={styles.corner} pointerEvents="box-none">
      <Pressable
        testID="photo-report-chip"
        accessibilityRole="button"
        accessibilityLabel={g('photoReport.a11y', { name: report.name })}
        accessibilityHint={g('photoReport.hint')}
        onPress={() => reportWrongPhoto(report, g('photoReport.done', { name: report.name }))}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
      >
        <QuestIcon name="alert" size={12} color="#FFFFFF" strokeWidth={2.4} />
        <HudText size={11} color="#FFFFFF">
          {g('photoReport.chip')}
        </HudText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  corner: { position: 'absolute', top: 4, right: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    minHeight: 24,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  pressed: { opacity: 0.7 },
});
