import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { quest } from '../../theme/quest';
import { BottomSheet } from './BottomSheet';
import { HudText } from './HudText';

interface InfoButtonProps {
  /** Accessible name of the ⓘ button ("Màu thâm hụt nghĩa là gì?"). */
  label: string;
  /** Title of the sheet it opens. */
  title: string;
  /** The detail that does not fit on one line (Design/uiux-proposal README §2.3: hints ≤ 60 characters, the rest behind ⓘ). */
  text: string;
  testID?: string;
}

/** A 44 pt "ⓘ" that opens a short "Vì sao?" sheet with the full explanation. */
export function InfoButton({ label, title, text, testID }: InfoButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => setOpen(true)} hitSlop={4} style={({ pressed }) => [styles.button, pressed && { opacity: 0.7 }]} testID={testID}>
        <HudText size={16} color={quest.manaText}>
          ⓘ
        </HudText>
      </Pressable>
      <BottomSheet visible={open} onClose={() => setOpen(false)} title={title}>
        <HudText size={14} weight="medium" color={quest.textSecondary} style={styles.body}>
          {text}
        </HudText>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  body: { lineHeight: 21 },
});
