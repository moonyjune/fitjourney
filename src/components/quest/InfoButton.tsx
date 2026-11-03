import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useGameText } from '../../game/strings';
import { quest } from '../../theme/quest';
import { BottomSheet } from './BottomSheet';
import { HudText } from './HudText';
import { QuestButton } from './QuestButton';

export interface InfoButtonProps {
  /** What it explains, for screen readers ("Giải thích: Giới hạn hằng ngày"). */
  about: string;
  /** Heading of the sheet (default "Vì sao?"). */
  title?: string;
  /** The paragraphs of the explanation: the detail a one-line hint leaves out (README §2.3 rule 1). */
  body: string[];
}

/** The ⓘ "Vì sao?" button: a 44 pt target next to a one-line hint that opens a sheet with the full explanation and "Đã hiểu". */
export function InfoButton({ about, title, body }: InfoButtonProps) {
  const g = useGameText();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={g('rd6.info.a11y', { what: about })} onPress={() => setOpen(true)} hitSlop={4} style={styles.button}>
        <HudText size={16} color={quest.manaText}>
          ⓘ
        </HudText>
      </Pressable>
      {/* Mounted only while open: nothing to render (or keep in sync) for the many ⓘ of a page that stay closed. */}
      {open && (
        <BottomSheet
          visible
          onClose={() => setOpen(false)}
          title={title ?? g('rd6.info.title')}
          footer={<QuestButton title={g('rd6.info.ok')} variant="ghost" onPress={() => setOpen(false)} />}
        >
          <View style={styles.body}>
            {body.map((p, i) => (
              <HudText key={i} size={14} weight="medium" color={quest.textTertiary} style={styles.paragraph}>
                {p}
              </HudText>
            ))}
          </View>
        </BottomSheet>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  body: { gap: 10 },
  paragraph: { lineHeight: 20 },
});
