import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { quest, questRadius } from '../../theme/quest';
import { HudText } from './HudText';
import { QuestIcon } from './QuestIcon';

const SHOW_MS = 4000;

/** A short confirmation that something was done ("Đã xóa … khỏi cook book"): shown for a few seconds, also read out by screen readers. */
export function useFlash(): [string | null, (text: string) => void] {
  const [text, setText] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const show = (next: string) => {
    if (timer.current) clearTimeout(timer.current);
    setText(next);
    AccessibilityInfo.announceForAccessibility?.(next);
    timer.current = setTimeout(() => setText(null), SHOW_MS);
  };
  return [text, show];
}

export function FlashNotice({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <View style={styles.box} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <QuestIcon name="check" size={16} color={quest.xp} strokeWidth={2.4} />
      <HudText size={13} weight="medium" style={styles.text}>
        {text}
      </HudText>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.raised },
  text: { flex: 1 },
});
