import { Pressable, StyleSheet, View } from 'react-native';
import type { ReactNode } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { quest } from '../../theme/quest';
import { screenMaxWidthStyle } from '../../theme/responsive';

interface QuestSheetProps {
  children: ReactNode;
  onClose: () => void;
  closeLabel: string;
}

/** Bottom sheet over a dimmed backdrop. Tapping the backdrop closes it (needed on web, where
 *  transparent-modal routes have no swipe-to-dismiss). */
export function QuestSheet({ children, onClose, closeLabel }: QuestSheetProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      <Pressable accessibilityRole="button" accessibilityLabel={closeLabel} onPress={onClose} style={[StyleSheet.absoluteFill, styles.backdrop]} />
      <View style={[styles.panel, screenMaxWidthStyle, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.handle} />
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(8,6,18,0.72)' },
  panel: {
    maxHeight: '94%',
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: quest.bg,
    borderWidth: 1.5,
    borderBottomWidth: 0,
    borderColor: quest.border,
  },
  handle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 99, backgroundColor: quest.border, marginBottom: 12 },
});
