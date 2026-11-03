import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Animated, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGameText } from '../../game/strings';
import { quest } from '../../theme/quest';
import { screenMaxWidthStyle } from '../../theme/responsive';
import { HudText } from './HudText';
import { FadeInUp } from './motion/FadeInUp';
import { NATIVE_DRIVER } from './motion/tokens';
import { QuestIcon } from './QuestIcon';

/** How far the sheet must be dragged down (or how fast) before letting go closes it. */
const DRAG_CLOSE_PX = 110;
const DRAG_CLOSE_VELOCITY = 1.1;

export type BottomSheetTone = 'default' | 'mana';

const TONE: Record<BottomSheetTone, { bg: string; border: string; grab: string }> = {
  default: { bg: quest.panel, border: quest.border, grab: quest.border },
  mana: { bg: quest.manaPanel, border: quest.manaBorder, grab: quest.manaBorder },
};

export interface BottomSheetProps {
  visible: boolean;
  /** Backdrop tap, the close button, Escape (web), the Android back button and a drag down (native) all call this. */
  onClose: () => void;
  /** 20 pt heading next to the close button; leave out to draw your own header in `children`. */
  title?: string;
  /** Small line over the title (context: the day, the group). */
  eyebrow?: string;
  /** One short line under the title. */
  subtitle?: string;
  /** Replaces the close button on the right of the header (e.g. a date chip). */
  headerRight?: ReactNode;
  /** Accessible name of the close button and the backdrop (default "Đóng"). */
  closeLabel?: string;
  /** Kept under the scrolling content, e.g. the primary button "Ghi cho Hôm qua". */
  footer?: ReactNode;
  tone?: BottomSheetTone;
  /** false when the content scrolls by itself (a list); true wraps it in a ScrollView. */
  scroll?: boolean;
  children: ReactNode;
  testID?: string;
}

/** A modal sheet from the bottom: dimmed backdrop (tap to close), grab handle, at most 90% of the screen high, lifted above the keyboard.
 *  On web the modal traps focus and closes with Escape (react-native-web's Modal); on native it can be dragged down to close.
 *  Route-level sheets (app/quick-add.tsx, checkin, level-up) keep using `QuestSheet`; this one is for sheets opened inside a screen. */
export function BottomSheet({ visible, onClose, title, eyebrow, subtitle, headerRight, closeLabel, footer, tone = 'default', scroll = true, children, testID }: BottomSheetProps) {
  const g = useGameText();
  const insets = useSafeAreaInsets();
  const close = closeLabel ?? g('common.close');
  const colors = TONE[tone];
  const drag = useRef(new Animated.Value(0)).current;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (visible) drag.setValue(0);
  }, [visible, drag]);

  // Drag to dismiss on phones only: on web the mouse would fight text selection and the backdrop / Escape already close it.
  const pan = useMemo(
    () =>
      Platform.OS === 'web'
        ? null
        : PanResponder.create({
            onMoveShouldSetPanResponder: (_, s) => s.dy > 6 && Math.abs(s.dy) > Math.abs(s.dx),
            onPanResponderMove: (_, s) => drag.setValue(Math.max(0, s.dy)),
            onPanResponderRelease: (_, s) => {
              if (s.dy > DRAG_CLOSE_PX || s.vy > DRAG_CLOSE_VELOCITY) onCloseRef.current();
              else Animated.spring(drag, { toValue: 0, useNativeDriver: NATIVE_DRIVER, bounciness: 4 }).start();
            },
            onPanResponderTerminate: () => Animated.spring(drag, { toValue: 0, useNativeDriver: NATIVE_DRIVER }).start(),
          }),
    [drag]
  );

  const hasHeader = title != null || eyebrow != null || headerRight != null;
  const body = scroll ? (
    <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} style={styles.scroll}>
      {children}
    </ScrollView>
  ) : (
    <View style={styles.scroll}>{children}</View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.root}>
        <Pressable accessibilityRole="button" accessibilityLabel={close} onPress={onClose} style={[StyleSheet.absoluteFill, styles.backdrop]} />
        <Animated.View style={[styles.slot, screenMaxWidthStyle, { transform: [{ translateY: drag }] }]}>
          <FadeInUp distance={48} duration={280} style={styles.fill}>
            <View
              testID={testID}
              accessibilityViewIsModal
              style={[styles.panel, { backgroundColor: colors.bg, borderColor: colors.border, paddingBottom: insets.bottom + 16 }]}
            >
              <View {...(pan?.panHandlers ?? {})} style={styles.dragZone}>
                <View style={[styles.grab, { backgroundColor: colors.grab }]} />
                {hasHeader && (
                  <View style={styles.header}>
                    <View style={styles.headText}>
                      {eyebrow ? (
                        <HudText size={12} weight="medium" color={tone === 'mana' ? quest.manaText : quest.textSecondary} numberOfLines={1}>
                          {eyebrow}
                        </HudText>
                      ) : null}
                      {title ? (
                        <HudText size={20} accessibilityRole="header" numberOfLines={2}>
                          {title}
                        </HudText>
                      ) : null}
                      {subtitle ? (
                        <HudText size={12} weight="medium" color={quest.textSecondary} numberOfLines={2}>
                          {subtitle}
                        </HudText>
                      ) : null}
                    </View>
                    {headerRight ?? (
                      <Pressable accessibilityRole="button" accessibilityLabel={close} onPress={onClose} style={styles.closeBtn}>
                        <QuestIcon name="x" size={20} color={quest.text} strokeWidth={2.2} />
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
              {body}
              {footer ? <View style={styles.footer}>{footer}</View> : null}
            </View>
          </FadeInUp>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(8,6,18,0.72)' },
  slot: { maxHeight: '90%' },
  fill: { flexShrink: 1 },
  panel: {
    flexShrink: 1,
    paddingTop: 10,
    paddingHorizontal: 16,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1.5,
    borderBottomWidth: 0,
  },
  dragZone: { paddingBottom: 4 },
  grab: { alignSelf: 'center', width: 40, height: 5, borderRadius: 9, marginBottom: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, marginBottom: 8 },
  headText: { flex: 1, minWidth: 0 },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: quest.panel,
    borderWidth: 1.5,
    borderColor: quest.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { flexShrink: 1 },
  scrollContent: { paddingBottom: 4 },
  footer: { paddingTop: 12 },
});
