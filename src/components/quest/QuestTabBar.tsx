import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { PressScale } from './motion/PressScale';
import { DURATION, EASE_OUT, NATIVE_DRIVER, useMotionEnabled } from './motion/tokens';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { router } from 'expo-router';
import { useGameText, type GameKey } from '../../game/strings';
import { quest } from '../../theme/quest';
import { HudText } from './HudText';
import { QuestIcon, type QuestIconName } from './QuestIcon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// The bar is drawn on top of the screens (position: absolute), so it takes no room in the layout:
// the wrap's top padding + the bar itself + the bottom inset. Screens in the tab group reserve this much.
const BAR_WRAP_TOP = 34;
const BAR_HEIGHT = 68;
const CLEARANCE_GAP = 24;

/** Space the bottom bar covers at the bottom of the screen, for a given bottom safe-area inset. */
export function tabBarCover(bottomInset: number): number {
  return BAR_WRAP_TOP + BAR_HEIGHT + Math.max(bottomInset, 12);
}

/** `paddingBottom` for a tab screen's scroll content so its last element ends above the bar. */
export function useTabBarClearance(): number {
  return tabBarCover(useSafeAreaInsets().bottom) + CLEARANCE_GAP;
}

// Route name -> label key and icon. Routes not listed here are never shown in this bar.
const TABS: Record<string, { label: GameKey; icon: QuestIconName }> = {
  index: { label: 'tab.camp', icon: 'camp' },
  workout: { label: 'tab.train', icon: 'dumbbell' },
  map: { label: 'tab.map', icon: 'map' },
  profile: { label: 'tab.profile', icon: 'user' },
  // Coach mode
  clients: { label: 'tab.clients', icon: 'list' },
  'coach-account': { label: 'tab.coachAccount', icon: 'user' },
};

// Display order is fixed here, not taken from the order the screens were declared in the layout.
const TAB_ORDER = ['index', 'workout', 'map', 'profile', 'clients', 'coach-account'];

/** Expo Router turns `href: null` into `tabBarItemStyle: { display: 'none' }` before the options reach a custom
 *  tab bar, so `options.href` is never seen here. Treat either form as "hidden". */
function isHidden(options: { href?: unknown; tabBarItemStyle?: StyleProp<ViewStyle> } | undefined): boolean {
  if (options?.href === null) return true;
  return (StyleSheet.flatten(options?.tabBarItemStyle) as ViewStyle | undefined)?.display === 'none';
}

/** The FitQuest bottom bar: Camp · Train · [+] · Map · Profile, with the gold diamond in the middle
 *  opening Quick add. Only routes that are listed above and not hidden (`href: null` in the layout) appear. */
export function QuestTabBar({ state, descriptors, navigation, insets, coach = false }: BottomTabBarProps & { coach?: boolean }) {
  const g = useGameText();
  const visible = state.routes
    .filter((route) => {
      const options = descriptors[route.key]?.options as Parameters<typeof isHidden>[0];
      return TABS[route.name] != null && !isHidden(options);
    })
    .sort((a, b) => TAB_ORDER.indexOf(a.name) - TAB_ORDER.indexOf(b.name));
  const accent = coach ? quest.mana : quest.gold;
  const mid = Math.ceil(visible.length / 2);

  const renderTab = (route: (typeof visible)[number]) => {
    const meta = TABS[route.name];
    const focused = state.routes[state.index]?.key === route.key;
    const color = focused ? accent : quest.textSecondary;
    const label = g(meta.label);
    return (
      <Pressable
        key={route.key}
        accessibilityRole="tab"
        accessibilityLabel={label}
        accessibilityState={{ selected: focused }}
        onPress={() => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name as never);
        }}
        style={styles.tab}
      >
        <TabMark focused={focused} color={accent} />
        <FocusLift focused={focused}>
          <QuestIcon name={meta.icon} size={24} color={color} strokeWidth={focused ? 2.4 : 2} />
        </FocusLift>
        <HudText size={12} weight={focused ? 'bold' : 'semibold'} color={color}>
          {label}
        </HudText>
      </Pressable>
    );
  };

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.bar}>
        {visible.slice(0, mid).map(renderTab)}
        {!coach && (
          <View style={styles.centerSlot}>
            <PressScale
              scaleTo={0.9}
              accessibilityRole="button"
              accessibilityLabel={g('tab.quickAdd')}
              onPress={() => router.push('/quick-add')}
              style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}
            >
              <View style={styles.fabIcon}>
                <QuestIcon name="plus" size={26} color={quest.onGold} strokeWidth={2.8} />
              </View>
            </PressScale>
          </View>
        )}
        {visible.slice(mid).map(renderTab)}
      </View>
    </View>
  );
}

/** The little bar above the active tab: grows in when the tab becomes active, shrinks away when it stops. */
function TabMark({ focused, color }: { focused: boolean; color: string }) {
  const enabled = useMotionEnabled();
  const grow = useRef(new Animated.Value(focused ? 1 : 0)).current;
  useEffect(() => {
    if (!enabled) {
      grow.setValue(focused ? 1 : 0);
      return;
    }
    const run = Animated.timing(grow, { toValue: focused ? 1 : 0, duration: DURATION.base, easing: EASE_OUT, useNativeDriver: NATIVE_DRIVER });
    run.start();
    return () => run.stop();
  }, [focused, enabled, grow]);
  return <Animated.View style={[styles.mark, { pointerEvents: 'none', backgroundColor: color, opacity: grow, transform: [{ scaleX: grow }] }]} />;
}

/** Lifts the active tab's icon a touch with a springy settle. */
function FocusLift({ focused, children }: { focused: boolean; children: React.ReactNode }) {
  const enabled = useMotionEnabled();
  const lift = useRef(new Animated.Value(focused ? 1 : 0)).current;
  useEffect(() => {
    if (!enabled) {
      lift.setValue(focused ? 1 : 0);
      return;
    }
    const run = Animated.spring(lift, { toValue: focused ? 1 : 0, friction: 6, tension: 180, useNativeDriver: NATIVE_DRIVER });
    run.start();
    return () => run.stop();
  }, [focused, enabled, lift]);
  return (
    <Animated.View
      style={{
        transform: [
          { translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [0, -2] }) },
          { scale: lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  mark: { position: 'absolute', top: 2, width: 22, height: 3, borderRadius: 2 },
  // The wrap fills the bottom edge with the screen colour; the bar floats inside it.
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: BAR_WRAP_TOP,
    paddingHorizontal: 12,
    alignItems: 'center',
    backgroundColor: quest.bg,
  },
  bar: {
    width: '100%',
    maxWidth: 640,
    height: BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderRadius: 18,
    backgroundColor: quest.panel,
    borderWidth: 1.5,
    borderColor: quest.border,
  },
  tab: {
    minWidth: 56,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  centerSlot: {
    width: 64,
    height: 56,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  fab: {
    width: 56,
    height: 56,
    marginTop: -28,
    borderRadius: 12,
    backgroundColor: quest.gold,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '45deg' }],
    borderWidth: 5,
    borderColor: quest.bg,
    shadowColor: quest.gold,
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  fabIcon: { transform: [{ rotate: '-45deg' }] },
});
