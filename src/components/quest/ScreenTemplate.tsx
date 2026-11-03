import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGameText } from '../../game/strings';
import { quest, questRadius } from '../../theme/quest';
import { screenMaxWidthStyle } from '../../theme/responsive';
import { HudText } from './HudText';
import { QuestButton } from './QuestButton';
import { QuestIcon } from './QuestIcon';
import { useTabBarClearance } from './QuestTabBar';

/** Header height and spacing of the redesign (Design/uiux-proposal/README.md §2.2): 52 pt header, 16 side padding. */
export const SCREEN_HEADER_HEIGHT = 52;
export const SCREEN_GUTTER = 16;

export interface ScreenPrimaryAction {
  /** Says what pressing it does, with the result: "Lưu bữa · 740 kcal", never just "Lưu". */
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
  variant?: 'gold' | 'mana';
}

export interface ScreenTemplateProps {
  title: string;
  /** 12 pt context line over the title (the day, the group); only when it is needed. */
  eyebrow?: string;
  /** Shows the 44×44 back button. Leave out on a tab's root screen. */
  onBack?: () => void;
  /** Accessible name of the back button (default "Quay lại"). */
  backLabel?: string;
  /** At most one action on the right of the header (a 44×44 icon button, a chip). */
  right?: ReactNode;
  /** The sticky primary button at the bottom. */
  primary?: ScreenPrimaryAction;
  /** A screen inside the tab group: keeps the content (and the sticky button) clear of the floating tab bar. */
  tabBar?: boolean;
  /** false when the content scrolls by itself (a FlatList): it is then laid out in a plain flex view. */
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
  testID?: string;
}

/** The one screen frame of the redesign: safe-area aware 52 pt header (back, title 20 pt bold, optional eyebrow and one right action),
 *  content with 16 pt sides that scrolls and ends clear of the tab bar, and an optional primary button kept at the bottom. */
export function ScreenTemplate({ title, eyebrow, onBack, backLabel, right, primary, tabBar = false, scroll = true, contentStyle, children, testID }: ScreenTemplateProps) {
  const g = useGameText();
  const insets = useSafeAreaInsets();
  const tabClearance = useTabBarClearance();
  // Space under the last thing on screen: the tab bar on a tab screen, else the home indicator.
  const bottomSpace = tabBar ? tabClearance : insets.bottom + 24;
  const contentBottom = primary ? 16 : bottomSpace;

  const content = scroll ? (
    <ScrollView
      style={styles.flex}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.content, screenMaxWidthStyle, { paddingBottom: contentBottom }, contentStyle]}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, styles.content, screenMaxWidthStyle, { paddingBottom: contentBottom }, contentStyle]}>{children}</View>
  );

  return (
    <View testID={testID} style={styles.screen}>
      <View style={[styles.headerWrap, { paddingTop: insets.top }]}>
        <View style={[styles.header, screenMaxWidthStyle]}>
          {onBack && (
            <Pressable accessibilityRole="button" accessibilityLabel={backLabel ?? g('common.back')} onPress={onBack} hitSlop={4} style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}>
              <QuestIcon name="back" size={20} color={quest.text} strokeWidth={2.4} />
            </Pressable>
          )}
          <View style={styles.titleBox}>
            {eyebrow ? (
              <HudText size={12} weight="medium" color={quest.textSecondary} numberOfLines={1}>
                {eyebrow}
              </HudText>
            ) : null}
            <HudText size={20} accessibilityRole="header" numberOfLines={1}>
              {title}
            </HudText>
          </View>
          {right}
        </View>
      </View>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {content}
        {primary && (
          <View style={[styles.footer, { paddingBottom: bottomSpace - (tabBar ? 0 : 12) }]}>
            <View style={screenMaxWidthStyle}>
              <QuestButton
                title={primary.label}
                onPress={primary.onPress}
                disabled={primary.disabled}
                loading={primary.loading}
                accessibilityLabel={primary.accessibilityLabel}
                variant={primary.variant ?? 'gold'}
              />
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: quest.bg },
  flex: { flex: 1 },
  headerWrap: { paddingHorizontal: SCREEN_GUTTER, backgroundColor: quest.bg },
  header: { minHeight: SCREEN_HEADER_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: questRadius.row,
    borderWidth: 1.5,
    borderColor: quest.border,
    backgroundColor: quest.panel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.8 },
  titleBox: { flex: 1, minWidth: 0 },
  content: { paddingHorizontal: SCREEN_GUTTER, paddingTop: 8 },
  footer: {
    paddingHorizontal: SCREEN_GUTTER,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: quest.border,
    backgroundColor: quest.bg,
  },
});
