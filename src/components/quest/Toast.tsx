import { useEffect } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGameText } from '../../game/strings';
import { useToastStore, type Toast, type ToastTone } from '../../store/useToastStore';
import { quest, questRadius } from '../../theme/quest';
import { screenMaxWidthStyle } from '../../theme/responsive';
import { HudText } from './HudText';
import { FadeInUp } from './motion/FadeInUp';
import { DURATION } from './motion/tokens';
import { QuestIcon } from './QuestIcon';
import { tabBarCover } from './QuestTabBar';

// Tones from the mockups (Design/uiux-proposal/html/dialogs/dlg.css `.toast`).
const TONE: Record<ToastTone, { bg: string; border: string; text: string }> = {
  mana: { bg: '#0B1D2A', border: quest.manaBorder, text: quest.manaText },
  gold: { bg: '#2A2210', border: '#6B5420', text: quest.goldLight },
  danger: { bg: '#2A1220', border: quest.bossBorder, text: quest.hpText },
  neutral: { bg: quest.raised, border: quest.border, text: quest.text },
};

interface ToastBarProps {
  toast: Toast;
  onUndo: () => void;
  onAction: () => void;
}

/** One toast: the message and, when there is one, a "Hoàn tác" (or other) button at least 44 pt tall. */
export function ToastBar({ toast, onUndo, onAction }: ToastBarProps) {
  const g = useGameText();
  const tone = TONE[toast.tone];
  const button = toast.undo ? { label: g('ui.undo'), onPress: onUndo, icon: true } : toast.action ? { label: toast.action.label, onPress: onAction, icon: false } : null;
  return (
    <View testID="toast" style={[styles.bar, { backgroundColor: tone.bg, borderColor: tone.border }]}>
      <View style={styles.textBox} accessibilityLiveRegion="polite" accessibilityRole="alert">
        <HudText size={14} color={tone.text}>
          {toast.text}
        </HudText>
      </View>
      {button && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={button.label}
          onPress={button.onPress}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        >
          {button.icon && <QuestIcon name="undo" size={16} color={quest.gold} strokeWidth={2.4} />}
          <HudText size={13} color={quest.gold}>
            {button.label}
          </HudText>
        </Pressable>
      )}
    </View>
  );
}

/** The app's single toast, mounted once in app/_layout.tsx above every screen. Shown with `showToast()` (src/store/useToastStore.ts):
 *  one at a time, above the tab bar, 5 s by default, read out by screen readers. */
export function ToastHost() {
  const toast = useToastStore((s) => s.toast);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    // iOS has no live regions: say it out loud there (Android and web read the live region).
    if (toast) AccessibilityInfo.announceForAccessibility?.(toast.text);
  }, [toast]);

  if (!toast) return null;
  const { hide, undo } = useToastStore.getState();
  return (
    <View style={[styles.host, { bottom: tabBarCover(insets.bottom) + 8 }]}>
      <FadeInUp key={toast.id} distance={16} duration={DURATION.fast} style={screenMaxWidthStyle}>
        <ToastBar
          toast={toast}
          onUndo={undo}
          onAction={() => {
            hide(toast.id);
            toast.action?.onPress();
          }}
        />
      </FadeInUp>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 16, right: 16, alignItems: 'center', pointerEvents: 'box-none' },
  bar: {
    minHeight: 48,
    borderRadius: questRadius.button,
    borderWidth: 1.5,
    paddingLeft: 14,
    paddingRight: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    boxShadow: '0px 4px 12px rgba(0,0,0,0.4)',
  },
  textBox: { flex: 1, minWidth: 0, paddingVertical: 10 },
  button: { minHeight: 44, minWidth: 44, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  pressed: { opacity: 0.7 },
});
