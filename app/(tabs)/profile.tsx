import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BannerRibbon } from '../../src/components/quest/BannerRibbon';
import { HudText } from '../../src/components/quest/HudText';
import { QuestIcon, type QuestIconName } from '../../src/components/quest/QuestIcon';
import { QuestShield } from '../../src/components/quest/QuestShield';
import { SettingsGroup, SettingsGroupTitle, SettingsLinkRow } from '../../src/components/quest/SettingsRows';
import { useTabBarClearance } from '../../src/components/quest/QuestTabBar';
import { XpBar } from '../../src/components/quest/XpBar';
import { titleKeyForLevel } from '../../src/game/level';
import { useGameText, type GameKey } from '../../src/game/strings';
import { useAchievements, useGameState, useNow } from '../../src/game/useGameState';
import { useHabitText } from '../../src/habits/strings';
import { useInsightsText } from '../../src/insights/strings';
import { LEARN_TOPICS } from '../../src/learn/topicsData';
import { useLearnText } from '../../src/learn/strings';
import { useAchievementStore } from '../../src/store/useAchievementStore';
import { useAiPhotoStore } from '../../src/store/useAiPhotoStore';
import { useAuthStore } from '../../src/store/useAuthStore';
import { useHabitStore } from '../../src/store/useHabitStore';
import { useLimitsStore } from '../../src/store/useLimitsStore';
import { useMealModeStore } from '../../src/store/useMealModeStore';
import { useSettingsStore } from '../../src/store/useSettingsStore';
import { useTemptationStore } from '../../src/store/useTemptationStore';
import { useWaterWindowStore } from '../../src/store/useWaterWindowStore';
import { useWeightStore } from '../../src/store/useWeightStore';
import { MAX_PER_DAY } from '../../src/temptation/schedule';
import { quest, questRadius } from '../../src/theme/quest';
import { screenMaxWidthStyle } from '../../src/theme/responsive';
import { useLightStatusBar } from '../../src/theme/useLightStatusBar';
import { toDateKey } from '../../src/utils/date';
import { APP_VERSION } from '../../src/utils/buildInfo';

/** "6", "6:30": an hour of the water window, short. */
function hourText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}:${String(m).padStart(2, '0')}` : String(h);
}

/** The name on the identity card: the part of the account's address before the "@" (nothing else is known about the player). */
function playerName(address: string | undefined): string | null {
  if (!address) return null;
  const name = address.split('@')[0]?.trim();
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : null;
}

function Shortcut({ icon, label, value, color, onPress }: { icon: QuestIconName; label: string; value?: string; color: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}: ${value}` : label}
      onPress={onPress}
      style={({ pressed }) => [styles.shortcut, pressed && styles.pressed]}
    >
      <View style={[styles.shortcutIcon, { borderColor: color, backgroundColor: `${color}22` }]}>
        <QuestIcon name={icon} size={20} color={color} strokeWidth={2.2} />
      </View>
      <HudText size={13} numberOfLines={1}>
        {label}
      </HudText>
      {value ? (
        <HudText size={12} weight="medium" color={quest.textSecondary} numberOfLines={1}>
          {value}
        </HudText>
      ) : null}
    </Pressable>
  );
}

/** Hồ sơ (README §3.9, mockup 08): who you are (shield with the level, name, title, campfire streak, XP), three stats, three shortcuts
 *  (Nhật ký, Thành tích, Cook book) and the settings as six rows with their current value, each opening its own page. */
export default function ProfileScreen() {
  const g = useGameText();
  const ti = useInsightsText();
  const tb = useHabitText();
  const tl = useLearnText();
  const insets = useSafeAreaInsets();
  const tabClearance = useTabBarClearance();
  useLightStatusBar();
  const now = useNow();
  const game = useGameState(now);
  const { stickers, banners } = useAchievements(now);
  const equippedBannerId = useAchievementStore((s) => s.equippedBannerId);
  const equippedBanner = banners.find((b) => b.id === equippedBannerId && b.earned);

  const address = useAuthStore((s) => s.session?.user.email);
  const language = useSettingsStore((s) => s.language);
  const goalWeightKg = useSettingsStore((s) => s.goalWeightKg);
  const deficit = useSettingsStore((s) => s.targetDailyDeficitKcal);
  const waterTargetMl = useSettingsStore((s) => s.waterTargetMl);
  const remindersEnabled = useSettingsStore((s) => s.remindersEnabled);
  const startWeightKg = useSettingsStore((s) => s.startWeightKg);
  const waterStart = useWaterWindowStore((s) => s.startMinutes);
  const waterEnd = useWaterWindowStore((s) => s.endMinutes);
  const purineMg = useLimitsStore((s) => s.purineMg);
  const saltG = useLimitsStore((s) => s.saltG);
  const fasting = useMealModeStore((s) => s.fasting);
  const tempt = useTemptationStore((s) => s.settings);
  const aiEnabled = useAiPhotoStore((s) => s.aiEnabled);
  const latest = useWeightStore((s) => s.latest());
  const habits = useHabitStore((s) => s.habits);
  const todayChecks = useHabitStore((s) => s.checks[toDateKey(now)]);

  const { level } = game;
  const lostKg = Math.max(0, startWeightKg - (latest?.weightKg ?? startWeightKg));
  const name = playerName(address);
  const title = g(`title.${titleKeyForLevel(level.level)}`);
  const earnedStickers = stickers.filter((x) => x.earned).length;
  const tracked = habits.filter((h) => !h.archived && h.tracked);
  const habitsDone = tracked.filter((h) => todayChecks?.[h.id] === 'done').length;
  const onOff = (on: boolean) => g(on ? 'rd6.set.on' : 'rd6.set.off');

  const stats: { value: string; label: string; route?: string; hint?: string }[] = [
    { value: `−${lostKg.toFixed(1)} kg`, label: g('profile.statWeight') },
    { value: String(game.bossesDefeated), label: g('profile.statBosses'), route: '/boss', hint: g('profile.statBossesHint') },
    { value: String(game.perfectDays), label: g('profile.statPerfect') },
  ];

  const settings: { key: string; icon: QuestIconName; color: string; label: string; value: string; route: string }[] = [
    { key: 'goals', icon: 'plan', color: quest.gold, label: g('rd6.set.goals'), value: g('rd6.set.goalsValue', { kg: goalWeightKg, deficit }), route: '/plan' },
    {
      key: 'water',
      icon: 'drop',
      color: quest.mana,
      label: g('rd6.set.water'),
      value: g('rd6.set.waterValue', { l: String(Math.round(waterTargetMl / 100) / 10), from: hourText(waterStart), to: hourText(waterEnd) }),
      route: '/settings/water',
    },
    {
      key: 'limits',
      icon: 'alert',
      color: quest.hp,
      label: g('rd6.set.limits'),
      value: `${g('rd6.set.limitsValue', { p: purineMg, s: saltG })}${fasting ? ' · 16:8' : ''}`,
      route: '/settings/limits',
    },
    {
      key: 'reminders',
      icon: 'bell',
      color: quest.goldLight,
      label: g('rd6.set.reminders'),
      value: tempt.enabled ? g('rd6.set.remindersTempt', { state: onOff(remindersEnabled), n: MAX_PER_DAY[tempt.frequency] }) : onOff(remindersEnabled),
      route: '/settings/reminders',
    },
    { key: 'ai', icon: 'chart', color: quest.manaText, label: g('rd6.set.ai'), value: onOff(aiEnabled), route: '/settings/ai' },
    {
      key: 'account',
      icon: 'user',
      color: quest.xp,
      label: g('rd6.set.account'),
      value: g(language === 'vi' ? 'profile.languageVi' : 'profile.languageEn'),
      route: '/settings/account',
    },
  ];

  // Other pages. History, the weekly review and Analysis also open from the Journal (Tháng / Tuần); kept here as shortcuts.
  const more: { key: string; icon: QuestIconName; color: string; label: string; value?: string; route: string }[] = [
    { key: 'habits', icon: 'check', color: quest.xp, label: tb('hb.profileRow'), value: tracked.length ? g('rd6.more.habitsValue', { n: habitsDone, t: tracked.length }) : undefined, route: '/habits' },
    { key: 'learn', icon: 'list', color: quest.mana, label: tl('learn.profileRow'), value: g('rd6.more.learnValue', { n: LEARN_TOPICS.length }), route: '/learn' },
    { key: 'nutrition', icon: 'bowl', color: quest.gold, label: g('profile.nutrition'), route: '/nutrition' },
    { key: 'history', icon: 'calendar', color: quest.goldLight, label: g('profile.history'), route: '/history' },
    { key: 'week', icon: 'flame', color: quest.hp, label: g('week.profileRow'), route: '/weekly-report' },
    { key: 'insights', icon: 'chart', color: quest.manaText, label: ti('ins.profileRow'), route: '/insights' },
  ];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, screenMaxWidthStyle, { paddingTop: insets.top + 12, paddingBottom: tabClearance }]}>
      <HudText size={20} accessibilityRole="header" style={styles.title}>
        {g('profile.title')}
      </HudText>

      <View
        style={styles.card}
        accessible
        accessibilityLabel={[name, title, g('level.label', { n: level.level }), g('rd6.profile.streakA11y', { n: game.streak }), g('rd6.profile.xp', { cur: level.xpIntoLevel, need: level.xpForNext })]
          .filter(Boolean)
          .join('. ')}
      >
        <QuestShield level={level.level} width={64} />
        <View style={styles.flex}>
          {name ? (
            <HudText size={20} numberOfLines={1}>
              {name}
            </HudText>
          ) : null}
          <View style={styles.titleRow}>
            <HudText size={name ? 14 : 20} color={name ? quest.gold : quest.text} numberOfLines={1} style={styles.flexShrink}>
              {title}
            </HudText>
            <View style={styles.streak}>
              <QuestIcon name="flame" size={14} color={quest.gold} strokeWidth={2.4} />
              <HudText size={13} color={quest.gold}>
                {game.streak}
              </HudText>
            </View>
          </View>
          <View style={styles.bar}>
            <XpBar ratio={level.ratio} accessibilityLabel={g('level.progress', { cur: level.xpIntoLevel, need: level.xpForNext, next: level.level + 1 })} />
          </View>
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {`${g('level.label', { n: level.level })} · ${g('rd6.profile.xp', { cur: level.xpIntoLevel, need: level.xpForNext })}`}
          </HudText>
        </View>
      </View>

      {equippedBanner && (
        <View style={styles.bannerWrap}>
          <BannerRibbon name={g(`ach.banner.${equippedBanner.id}` as GameKey)} color={equippedBanner.color} earned width={280} />
        </View>
      )}

      <View style={styles.stats}>
        {stats.map((s) => {
          const body = (
            <>
              <HudText size={18} color={quest.gold} numberOfLines={1}>
                {s.value}
              </HudText>
              <HudText size={12} weight="medium" color={quest.textSecondary} numberOfLines={2} style={styles.center}>
                {s.label}
              </HudText>
            </>
          );
          const route = s.route;
          return route ? (
            <Pressable
              key={s.label}
              accessibilityRole="button"
              accessibilityLabel={`${s.label} ${s.value}`}
              accessibilityHint={s.hint}
              onPress={() => router.push(route as never)}
              style={({ pressed }) => [styles.stat, pressed && { opacity: 0.7 }]}
            >
              {body}
            </Pressable>
          ) : (
            <View key={s.label} accessible accessibilityLabel={`${s.label} ${s.value}`} style={styles.stat}>
              {body}
            </View>
          );
        })}
      </View>

      <View style={styles.shortcuts}>
        <Shortcut icon="list" color={quest.mana} label={g('rd6.profile.journal')} onPress={() => router.push('/journal')} />
        <Shortcut
          icon="check"
          color={quest.gold}
          label={g('profile.achievements')}
          value={`${earnedStickers}/${stickers.length}`}
          onPress={() => router.push('/achievements')}
        />
        <Shortcut icon="bowl" color={quest.xp} label={g('rd6.profile.cookbook')} onPress={() => router.push('/cookbook')} />
      </View>

      <SettingsGroupTitle>{g('rd6.profile.settings')}</SettingsGroupTitle>
      <SettingsGroup>
        {settings.map((s, i) => (
          <SettingsLinkRow key={s.key} first={i === 0} icon={s.icon} color={s.color} label={s.label} value={s.value} onPress={() => router.push(s.route as never)} />
        ))}
      </SettingsGroup>

      <SettingsGroupTitle>{g('rd6.profile.more')}</SettingsGroupTitle>
      <SettingsGroup>
        {more.map((s, i) => (
          <SettingsLinkRow key={s.key} first={i === 0} icon={s.icon} color={s.color} label={s.label} value={s.value} onPress={() => router.push(s.route as never)} />
        ))}
      </SettingsGroup>

      <HudText size={12} weight="medium" color={quest.textSecondary} style={styles.build}>
        {`FitJourney ${APP_VERSION}`}
      </HudText>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: quest.bg },
  content: { paddingHorizontal: 16 },
  title: { minHeight: 40, textAlignVertical: 'center' },
  flex: { flex: 1, minWidth: 0 },
  flexShrink: { flexShrink: 1 },
  center: { textAlign: 'center' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 8, padding: 14, borderRadius: 20, backgroundColor: quest.panel, borderWidth: 1.5, borderColor: quest.border },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: quest.raised },
  bar: { marginTop: 8, marginBottom: 4 },
  bannerWrap: { alignItems: 'center', marginTop: 12 },
  stats: { flexDirection: 'row', gap: 10, marginTop: 12 },
  stat: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 12, paddingHorizontal: 6, borderRadius: questRadius.panel, backgroundColor: quest.panel, borderWidth: 1.5, borderColor: quest.border },
  shortcuts: { flexDirection: 'row', gap: 10, marginTop: 12 },
  shortcut: { flex: 1, minHeight: 88, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 10, borderRadius: questRadius.panel, backgroundColor: quest.panel, borderWidth: 1.5, borderColor: quest.border },
  shortcutIcon: { width: 40, height: 40, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.85 },
  build: { marginTop: 18, textAlign: 'center' },
});
