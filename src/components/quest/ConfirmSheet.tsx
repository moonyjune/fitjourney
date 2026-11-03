import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useGameText } from '../../game/strings';
import { quest } from '../../theme/quest';
import { BottomSheet } from './BottomSheet';
import { HudText } from './HudText';
import { QuestButton } from './QuestButton';

export interface ConfirmSheetProps {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  /** One or two short lines under the title. */
  message?: string;
  /** Extra content (a status line). */
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  testID?: string;
}

/** The in-app confirm box (dialogs.md 43), only for what cannot be undone: deleting the diary before a date and signing out
 *  (decision 3). Everything else is done at once with "Hoàn tác" on a toast. Replaces Alert.alert / window.confirm. */
export function ConfirmSheet({ visible, onCancel, onConfirm, title, message, children, confirmLabel, cancelLabel, busy, testID }: ConfirmSheetProps) {
  const g = useGameText();
  if (!visible) return null;
  return (
    <BottomSheet
      visible={visible}
      onClose={busy ? () => undefined : onCancel}
      title={title}
      testID={testID}
      footer={
        <View style={styles.buttons}>
          <View style={styles.flex}>
            <QuestButton title={cancelLabel ?? g('profile.cancel')} variant="ghost" onPress={onCancel} disabled={busy} />
          </View>
          <View style={styles.flex}>
            <QuestButton title={confirmLabel} variant="danger" onPress={onConfirm} loading={busy} />
          </View>
        </View>
      }
    >
      <View style={styles.body}>
        {message ? (
          <HudText size={14} weight="medium" color={quest.textTertiary}>
            {message}
          </HudText>
        ) : null}
        {children}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  buttons: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
  body: { gap: 8 },
});
