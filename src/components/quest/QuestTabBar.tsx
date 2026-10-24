import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { router } from 'expo-router';
import { useGameText, type GameKey } from '../../game/strings';
import { quest } from '../../theme/quest';
import { HudText } from './HudText';
import { QuestIcon, type QuestIconName } from './QuestIcon';

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
        <QuestIcon name={meta.icon} size={24} color={color} strokeWidth={focused ? 2.4 : 2} />
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
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={g('tab.quickAdd')}
              onPress={() => router.push('/quick-add')}
              style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}
            >
              <View style={styles.fabIcon}>
                <QuestIcon name="plus" size={26} color={quest.onGold} strokeWidth={2.8} />
              </View>
            </Pressable>
          </View>
        )}
        {visible.slice(mid).map(renderTab)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // The wrap fills the bottom edge with the screen colour; the bar floats inside it.
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 34,
    paddingHorizontal: 12,
    alignItems: 'center',
    backgroundColor: quest.bg,
  },
  bar: {
    width: '100%',
    maxWidth: 640,
    height: 68,
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
