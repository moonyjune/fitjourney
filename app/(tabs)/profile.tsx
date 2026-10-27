import { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { signOutAndReset } from '../../src/auth/signOut';
import { HudText } from '../../src/components/quest/HudText';
import { QuestButton } from '../../src/components/quest/QuestButton';
import { QuestIcon, type QuestIconName } from '../../src/components/quest/QuestIcon';
import { QuestSegment } from '../../src/components/quest/QuestSegment';
import { QuestShield } from '../../src/components/quest/QuestShield';
import { XpBar } from '../../src/components/quest/XpBar';
import { titleKeyForLevel } from '../../src/game/level';
import { useGameText, type GameKey } from '../../src/game/strings';
import { BannerRibbon } from '../../src/components/quest/BannerRibbon';
import { LIMIT_RANGE, useLimitsStore, type LimitKey } from '../../src/store/useLimitsStore';
import { useAchievementStore } from '../../src/store/useAchievementStore';
import { useAchievements, useGameState, useNow } from '../../src/game/useGameState';
import { cancelAllReminders, requestNotificationPermissions, scheduleAllReminders } from '../../src/notifications/schedule';
import { useAuthStore } from '../../src/store/useAuthStore';
import { usePlanStore } from '../../src/store/usePlanStore';
import { useUricText } from '../../src/uric/strings';
import { useLearnText } from '../../src/learn/strings';
import { useHabitText } from '../../src/habits/strings';
import { useFoodText } from '../../src/food/strings';
import { useInsightsText } from '../../src/insights/strings';
import { useAiPhotoStore } from '../../src/store/useAiPhotoStore';
import { useSettingsStore } from '../../src/store/useSettingsStore';
import { useWeightStore } from '../../src/store/useWeightStore';
import { quest, questFonts, questRadius } from '../../src/theme/quest';
import { screenMaxWidthStyle } from '../../src/theme/responsive';
import { useLightStatusBar } from '../../src/theme/useLightStatusBar';
import { useIsAiAdmin } from '../../src/ai/useIsAiAdmin';
import { useMealModeStore } from '../../src/store/useMealModeStore';
import { useTabBarClearance } from '../../src/components/quest/QuestTabBar';
import { APP_VERSION, BUILD_ID } from '../../src/utils/buildInfo';

type Lang = 'vi' | 'en';

interface MenuRowProps {
  icon: QuestIconName;
  label: string;
  hint?: string;
  onPress: () => void;
}

function MenuRow({ icon, label, hint, onPress }: MenuRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hint ? `${label}. ${hint}` : label}
      onPress={onPress}
      style={({ pressed }) => [styles.menuRow, pressed && { opacity: 0.85 }]}
    >
      <QuestIcon name={icon} size={20} color={quest.gold} />
      <View style={styles.flex}>
        <HudText size={15}>{label}</HudText>
        {hint ? (
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {hint}
          </HudText>
        ) : null}
      </View>
      <QuestIcon name="chevron" size={18} color={quest.textSecondary} />
    </Pressable>
  );
}

interface LimitRowProps {
  limitKey: LimitKey;
  name: string;
  value: string;
  moreLabel: string;
  lessLabel: string;
}

function LimitRow({ limitKey, name, value, moreLabel, lessLabel }: LimitRowProps) {
  const nudge = useLimitsStore((s) => s.nudge);
  const current = useLimitsStore((s) => s[limitKey]);
  const { min, max } = LIMIT_RANGE[limitKey];
  return (
    <View style={styles.limitRow}>
      <HudText size={14} style={styles.flex}>
        {name}
      </HudText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={lessLabel}
        accessibilityState={{ disabled: current <= min }}
        disabled={current <= min}
        onPress={() => nudge(limitKey, -1)}
        style={[styles.step, current <= min && { opacity: 0.4 }]}
      >
        <QuestIcon name="minus" size={18} color={quest.text} strokeWidth={2.6} />
      </Pressable>
      <HudText size={15} color={quest.gold} style={styles.limitValue} accessibilityLabel={`${name} ${value}`}>
        {value}
      </HudText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={moreLabel}
        accessibilityState={{ disabled: current >= max }}
        disabled={current >= max}
        onPress={() => nudge(limitKey, 1)}
        style={[styles.step, current >= max && { opacity: 0.4 }]}
      >
        <QuestIcon name="plus" size={18} color={quest.text} strokeWidth={2.6} />
      </Pressable>
    </View>
  );
}

export default function ProfileScreen() {
  const g = useGameText();
  const ti = useInsightsText();
  const tf = useFoodText();
  const tb = useHabitText();
  const tl = useLearnText();
  const tu = useUricText();
  const insets = useSafeAreaInsets();
  const tabClearance = useTabBarClearance();
  useLightStatusBar();
  const now = useNow();
  const game = useGameState(now);
  const { stickers, banners } = useAchievements(now);
  const limits = useLimitsStore();
  const resetLimits = useLimitsStore((s) => s.reset);
  const equippedBannerId = useAchievementStore((s) => s.equippedBannerId);
  const equippedBanner = banners.find((b) => b.id === equippedBannerId && b.earned);

  const session = useAuthStore((s) => s.session);
  const language = useSettingsStore((s) => s.language);
  const remindersEnabled = useSettingsStore((s) => s.remindersEnabled);
  const aiFullHd = useAiPhotoStore((s) => s.fullHd);
  const setAiFullHd = useAiPhotoStore((s) => s.setFullHd);
  const aiEnabled = useAiPhotoStore((s) => s.aiEnabled);
  const isAiAdmin = useIsAiAdmin();
  const fasting = useMealModeStore((s) => s.fasting);
  const setFasting = useMealModeStore((s) => s.setFasting);
  const setAiEnabled = useAiPhotoStore((s) => s.setAiEnabled);
  const coachId = useSettingsStore((s) => s.coachId);
  const linkedCoachEmail = useSettingsStore((s) => s.linkedCoachEmail);
  const linkedCoachCode = useSettingsStore((s) => s.linkedCoachCode);
  const startWeightKg = useSettingsStore((s) => s.startWeightKg);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const submitCoachCode = useSettingsStore((s) => s.submitCoachCode);
  const switchToCoachMode = useSettingsStore((s) => s.switchToCoachMode);
  const plan = usePlanStore((s) => s.plan);
  const latest = useWeightStore((s) => s.latest());

  const [coachCode, setCoachCode] = useState('');
  const [linking, setLinking] = useState(false);
  const [coachError, setCoachError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);

  const { level } = game;
  const lostKg = startWeightKg - (latest?.weightKg ?? startWeightKg);

  async function toggleReminders(value: boolean) {
    try {
      if (value) {
        const granted = await requestNotificationPermissions();
        if (!granted) {
          // Leave the switch off: claiming reminders are on when the OS refused them would be a lie.
          Alert.alert(g('profile.reminders'), g('profile.remindersHint'));
          return;
        }
        await scheduleAllReminders(plan);
      } else {
        await cancelAllReminders();
      }
    } catch (error) {
      // expo-notifications is unavailable in Expo Go / on web; still let the preference save.
      console.warn('[notifications] unavailable in this runtime:', error);
    }
    updateSettings({ remindersEnabled: value });
  }

  async function connectCoach() {
    if (!coachCode.trim()) return;
    setLinking(true);
    setCoachError(null);
    const result = await submitCoachCode(coachCode);
    setLinking(false);
    if (result.ok) setCoachCode('');
    else setCoachError(result.message || g('profile.coachError'));
  }

  async function switchToCoach() {
    setSwitching(true);
    await switchToCoachMode();
    setSwitching(false);
    router.replace('/(tabs)/clients');
  }

  function confirmSignOut() {
    const run = () => {
      signOutAndReset();
    };
    if (Platform.OS === 'web') {
      // Alert.alert has no multi-button support on web.
      if (typeof window !== 'undefined' && window.confirm(g('profile.signOutConfirm'))) run();
      return;
    }
    Alert.alert(g('profile.signOut'), g('profile.signOutConfirm'), [
      { text: g('profile.cancel'), style: 'cancel' },
      { text: g('profile.signOut'), style: 'destructive', onPress: run },
    ]);
  }

  const stats = [
    { label: g('profile.statStreak'), value: g(game.streak === 1 ? 'profile.statStreakValueOne' : 'profile.statStreakValue', { n: game.streak }) },
    { label: g('profile.statBosses'), value: String(game.bossesDefeated) },
    { label: g('profile.statPerfect'), value: String(game.perfectDays) },
    { label: g('profile.statWeight'), value: g('profile.statWeightValue', { kg: Math.max(0, lostKg).toFixed(1) }) },
  ];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, screenMaxWidthStyle, { paddingTop: insets.top + 16, paddingBottom: tabClearance }]}>
      <HudText size={28} accessibilityRole="header">
        {g('profile.title')}
      </HudText>

      <View style={styles.card}>
        <QuestShield level={level.level} width={64} />
        <View style={styles.flex}>
          <HudText size={20}>{g(`title.${titleKeyForLevel(level.level)}`)}</HudText>
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {g('level.label', { n: level.level })}
            {session?.user.email ? ` · ${session.user.email}` : ''}
          </HudText>
          <View style={styles.bar}>
            <XpBar
              ratio={level.ratio}
              accessibilityLabel={g('level.progress', { cur: level.xpIntoLevel, need: level.xpForNext, next: level.level + 1 })}
            />
          </View>
          <HudText size={11} weight="medium" color={quest.textSecondary}>
            {g('level.progress', { cur: level.xpIntoLevel, need: level.xpForNext, next: level.level + 1 })}
          </HudText>
        </View>
      </View>

      {equippedBanner && (
        <View style={styles.bannerWrap}>
          <BannerRibbon name={g(`ach.banner.${equippedBanner.id}` as GameKey)} color={equippedBanner.color} earned width={280} />
        </View>
      )}

      <HudText size={11} color={quest.textSecondary} style={styles.eyebrow}>
        {g('profile.stats').toUpperCase()}
      </HudText>
      <View style={styles.stats}>
        {stats.map((s) => (
          <View key={s.label} accessible accessibilityLabel={`${s.label} ${s.value}`} style={styles.stat}>
            <HudText size={18} color={quest.gold}>
              {s.value}
            </HudText>
            <HudText size={11} weight="medium" color={quest.textSecondary} numberOfLines={1}>
              {s.label}
            </HudText>
          </View>
        ))}
      </View>

      <HudText size={11} color={quest.textSecondary} style={styles.eyebrow}>
        {g('profile.menu').toUpperCase()}
      </HudText>
      <View style={styles.menu}>
        <MenuRow
          icon="check"
          label={g('profile.achievements')}
          hint={g('profile.achievementsHint', {
            n: stickers.filter((x) => x.earned).length,
            t: stickers.length,
            b: banners.filter((x) => x.earned).length,
          })}
          onPress={() => router.push('/achievements')}
        />
        <MenuRow icon="plan" label={g('profile.plan')} hint={g('profile.planHint')} onPress={() => router.push('/(tabs)/plan')} />
        <MenuRow icon="chart" label={g('profile.weight')} hint={g('profile.weightHint')} onPress={() => router.push('/(tabs)/weight')} />
        <MenuRow icon="bowl" label={g('profile.nutrition')} hint={g('profile.nutritionHint')} onPress={() => router.push('/(tabs)/nutrition')} />
        <MenuRow icon="list" label={g('profile.history')} hint={g('profile.historyHint')} onPress={() => router.push('/(tabs)/history')} />
        <MenuRow icon="drop" label={tu('ur.profileRow')} hint={tu('ur.profileRowHint')} onPress={() => router.push('/uric')} />
        <MenuRow icon="list" label={tl('learn.profileRow')} hint={tl('learn.profileRowHint')} onPress={() => router.push('/learn')} />
        <MenuRow icon="check" label={tb('hb.profileRow')} hint={tb('hb.profileRowHint')} onPress={() => router.push('/habits')} />
        <MenuRow icon="bowl" label={tf('fdb.profileRow')} hint={tf('fdb.profileRowHint')} onPress={() => router.push('/food-db')} />
        <MenuRow icon="flame" label={ti('ins.profileRow')} hint={ti('ins.profileRowHint')} onPress={() => router.push('/insights')} />
        <MenuRow icon="flame" label={g('week.profileRow')} hint={g('week.profileRowHint')} onPress={() => router.push('/weekly-report')} />
        {isAiAdmin && <MenuRow icon="chart" label={g('aiAdmin.profileRow')} hint={g('aiAdmin.profileRowHint')} onPress={() => router.push('/ai-admin')} />}
        <MenuRow icon="plus" label={g('profile.import')} hint={g('profile.importHint')} onPress={() => router.push('/import-diary')} />
      </View>

      <View style={styles.setting}>
        <View style={styles.settingHead}>
          <QuestIcon name="globe" size={20} color={quest.gold} />
          <HudText size={15}>{g('profile.language')}</HudText>
        </View>
        <QuestSegment<Lang>
          accessibilityLabel={g('profile.language')}
          value={language}
          onChange={(value) => updateSettings({ language: value })}
          options={[
            { value: 'vi', label: g('profile.languageVi') },
            { value: 'en', label: g('profile.languageEn') },
          ]}
        />
      </View>

      <View style={styles.settingRow}>
        <QuestIcon name="bell" size={20} color={quest.gold} />
        <View style={styles.flex}>
          <HudText size={15}>{g('profile.reminders')}</HudText>
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {g('profile.remindersHint')}
          </HudText>
        </View>
        <Switch
          accessibilityLabel={g('profile.reminders')}
          value={remindersEnabled}
          onValueChange={toggleReminders}
          trackColor={{ false: quest.raised2, true: quest.gold }}
          thumbColor={quest.text}
        />
      </View>

      <View style={styles.settingRow}>
        <QuestIcon name="clock" size={20} color={quest.gold} />
        <View style={styles.flex}>
          <HudText size={15}>{g('fasting.title')}</HudText>
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {g('fasting.what')}
          </HudText>
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {g('fasting.hint')}
          </HudText>
        </View>
        <Switch
          accessibilityLabel={g('fasting.title')}
          value={fasting}
          onValueChange={setFasting}
          trackColor={{ false: quest.raised2, true: quest.gold }}
          thumbColor={quest.text}
        />
      </View>

      <View style={styles.settingRow}>
        <QuestIcon name="chart" size={20} color={quest.mana} />
        <View style={styles.flex}>
          <HudText size={15}>{g('profile.aiEnabled')}</HudText>
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {g('profile.aiEnabledHint')}
          </HudText>
        </View>
        <Switch
          accessibilityLabel={g('profile.aiEnabled')}
          value={aiEnabled}
          onValueChange={setAiEnabled}
          trackColor={{ false: quest.raised2, true: quest.gold }}
          thumbColor={quest.text}
        />
      </View>

      <View style={styles.settingRow}>
        <QuestIcon name="camera" size={20} color={quest.gold} />
        <View style={styles.flex}>
          <HudText size={15}>{g('profile.aiFullHd')}</HudText>
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {g('profile.aiFullHdHint')}
          </HudText>
        </View>
        <Switch
          accessibilityLabel={g('profile.aiFullHd')}
          value={aiFullHd}
          onValueChange={setAiFullHd}
          trackColor={{ false: quest.raised2, true: quest.gold }}
          thumbColor={quest.text}
        />
      </View>

      <View style={styles.setting}>
        <View style={styles.settingHead}>
          <QuestIcon name="alert" size={20} color={quest.gold} />
          <HudText size={15}>{g('limits.title')}</HudText>
        </View>
        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {g('limits.hint')}
        </HudText>
        {(
          [
            ['purineMg', 'limits.purine', g('limits.unitMg', { n: limits.purineMg })],
            ['saltG', 'limits.salt', g('limits.unitG', { n: limits.saltG })],
            ['sugarG', 'limits.sugar', g('limits.unitG', { n: limits.sugarG })],
          ] as [LimitKey, GameKey, string][]
        ).map(([key, nameKey, value]) => (
          <LimitRow
            key={key}
            limitKey={key}
            name={g(nameKey)}
            value={value}
            moreLabel={g('limits.more', { name: g(nameKey) })}
            lessLabel={g('limits.less', { name: g(nameKey) })}
          />
        ))}
        <Pressable accessibilityRole="button" accessibilityLabel={g('limits.reset')} onPress={resetLimits} style={styles.resetLimits}>
          <HudText size={13} color={quest.textSecondary}>
            {g('limits.reset')}
          </HudText>
        </Pressable>
      </View>

      <View style={styles.setting}>
        <View style={styles.settingHead}>
          <QuestIcon name="user" size={20} color={quest.mana} />
          <HudText size={15}>{g('profile.coach')}</HudText>
        </View>
        {coachId ? (
          <>
            <HudText size={13} weight="medium" color={quest.manaText}>
              {g('profile.coachLinked')}
            </HudText>
            <HudText size={12} weight="medium" color={quest.textSecondary}>
              {g('profile.coachEmail')}: {linkedCoachEmail ?? '—'}
            </HudText>
            <HudText size={12} weight="medium" color={quest.textSecondary}>
              {g('profile.coachCodeShown')}: {linkedCoachCode ?? '—'}
            </HudText>
          </>
        ) : (
          <>
            <HudText size={12} weight="medium" color={quest.textSecondary}>
              {g('profile.coachLinkHint')}
            </HudText>
            <View style={styles.coachRow}>
              <TextInput
                accessibilityLabel={g('profile.coachCodeLabel')}
                autoCapitalize="characters"
                autoCorrect={false}
                placeholder={g('profile.coachPlaceholder')}
                placeholderTextColor={quest.textSecondary}
                value={coachCode}
                onChangeText={(v) => {
                  setCoachCode(v);
                  setCoachError(null);
                }}
                style={styles.coachInput}
              />
              <View style={styles.coachBtn}>
                <QuestButton variant="mana" title={g('profile.coachConnect')} onPress={connectCoach} loading={linking} disabled={!coachCode.trim()} />
              </View>
            </View>
            {coachError && (
              <HudText size={12} weight="medium" color={quest.goldLight} accessibilityLiveRegion="polite">
                {coachError}
              </HudText>
            )}
          </>
        )}
        <QuestButton variant="ghost" icon="swap" title={g('profile.coachOn')} onPress={switchToCoach} loading={switching} />
      </View>

      <View style={styles.signOut}>
        <QuestButton variant="ghost" icon="out" title={g('profile.signOut')} onPress={confirmSignOut} />
      </View>
      <HudText size={11} weight="medium" color={quest.textSecondary} style={styles.build}>
        {g('profile.build', { version: APP_VERSION, id: BUILD_ID })}
      </HudText>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  limitRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  limitValue: { minWidth: 72, textAlign: 'center' },
  step: { width: 44, height: 44, borderRadius: 12, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.raised, alignItems: 'center', justifyContent: 'center' },
  resetLimits: { alignSelf: 'flex-start', minHeight: 40, justifyContent: 'center' },
  bannerWrap: { alignItems: 'center' },
  screen: { flex: 1, backgroundColor: quest.bg },
  content: { paddingHorizontal: 16, paddingBottom: 120 },
  flex: { flex: 1, minWidth: 0 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 14, padding: 14, borderRadius: 20, backgroundColor: quest.panel, borderWidth: 1.5, borderColor: quest.border },
  bar: { marginTop: 8, marginBottom: 4 },
  eyebrow: { letterSpacing: 1.6, marginTop: 20, marginBottom: 8 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { flexBasis: '47%', flexGrow: 1, padding: 12, gap: 2, borderRadius: questRadius.panel, backgroundColor: quest.panel, borderWidth: 1.5, borderColor: quest.border },
  menu: { gap: 8 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 14, paddingVertical: 10, borderRadius: questRadius.panel, backgroundColor: quest.panel, borderWidth: 1.5, borderColor: quest.border },
  setting: { gap: 10, marginTop: 12, padding: 14, borderRadius: questRadius.panel, backgroundColor: quest.panel, borderWidth: 1.5, borderColor: quest.border },
  settingHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, marginTop: 12, paddingHorizontal: 14, paddingVertical: 10, borderRadius: questRadius.panel, backgroundColor: quest.panel, borderWidth: 1.5, borderColor: quest.border },
  coachRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  coachInput: { flex: 1, minWidth: 0, minHeight: 56, paddingHorizontal: 14, borderRadius: questRadius.button, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.bg, color: quest.text, fontSize: 16, fontFamily: questFonts.semibold },
  coachBtn: { width: 130 },
  signOut: { marginTop: 20 },
  build: { marginTop: 14, textAlign: 'center' },
});
