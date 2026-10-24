import { Pressable, StyleSheet, View } from 'react-native';
import type { ReactNode } from 'react';
import { quest, questRadius } from '../../theme/quest';
import { HudText } from './HudText';
import { QuestIcon } from './QuestIcon';

interface QuestHeaderProps {
  title: string;
  eyebrow?: string;
  onBack: () => void;
  backLabel: string;
  right?: ReactNode;
}

/** Sub-screen header: 44 px back button, small HUD eyebrow, title and an optional right-hand slot. */
export function QuestHeader({ title, eyebrow, onBack, backLabel, right }: QuestHeaderProps) {
  return (
    <View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel={backLabel} onPress={onBack} style={styles.back}>
        <QuestIcon name="back" size={20} color={quest.text} strokeWidth={2.4} />
      </Pressable>
      <View style={styles.text}>
        {eyebrow ? (
          <HudText size={11} color={quest.textSecondary} style={styles.eyebrow} numberOfLines={1}>
            {eyebrow.toUpperCase()}
          </HudText>
        ) : null}
        <HudText size={24} accessibilityRole="header" numberOfLines={2}>
          {title}
        </HudText>
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: {
    width: 44,
    height: 44,
    borderRadius: questRadius.row,
    borderWidth: 1.5,
    borderColor: quest.border,
    backgroundColor: quest.panel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, minWidth: 0 },
  eyebrow: { letterSpacing: 1.6 },
});
