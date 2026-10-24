import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BannerRibbon } from '../src/components/quest/BannerRibbon';
import { HudText } from '../src/components/quest/HudText';
import { QuestHeader } from '../src/components/quest/QuestHeader';
import { rarityColor, Sticker } from '../src/components/quest/Sticker';
import { XpBar } from '../src/components/quest/XpBar';
import {
  CATEGORY_ORDER,
  type AchievementKind,
  type AchievementState,
  type AchievementStats,
  type BannerKind,
  type BannerState,
} from '../src/game/achievements';
import { useGameText, type GameKey } from '../src/game/strings';
import { EXERCISE_BY_ID } from '../src/game/training/exercises';
import { exerciseName } from '../src/game/training/format';
import { useAchievements, useNow } from '../src/game/useGameState';
import { useAchievementStore } from '../src/store/useAchievementStore';
import { useSettingsStore } from '../src/store/useSettingsStore';
import { quest, questRadius } from '../src/theme/quest';
import { screenMaxWidthStyle } from '../src/theme/responsive';
import { useLightStatusBar } from '../src/theme/useLightStatusBar';

type Translate = (key: GameKey, params?: Record<string, string | number>) => string;

const KG_KINDS: AchievementKind[] = ['weightLost', 'weightPercent', 'goalReached'];
const fmt = (n: number, kg: boolean) => String(kg ? Math.round(n * 10) / 10 : Math.round(n));

function params(a: { kind: BannerKind; n: number; exerciseId?: AchievementState['exerciseId']; weightKg?: number }, stats: AchievementStats, lang: 'vi' | 'en') {
  return {
    n: a.n,
    kg: a.weightKg ?? a.n,
    start: Math.round(stats.startWeightKg * 10) / 10,
    name: a.exerciseId ? exerciseName(EXERCISE_BY_ID[a.exerciseId], lang) : '',
  };
}

function progressText(a: { kind: BannerKind; current: number; target: number }, g: Translate): string {
  const kg = KG_KINDS.includes(a.kind as AchievementKind);
  return g(kg ? 'ach.progressKg' : 'ach.progress', { cur: fmt(a.current, kg), tgt: fmt(a.target, kg) });
}

function StickerTile({ a, stats, g, lang }: { a: AchievementState; stats: AchievementStats; g: Translate; lang: 'vi' | 'en' }) {
  const p = params(a, stats, lang);
  const name = g(`ach.name.${a.kind}` as GameKey, p);
  const cond = g(`ach.cond.${a.kind}` as GameKey, p);
  const single = a.target <= 1 && a.kind !== 'weightPercent';
  const status = a.earned ? g('ach.earned') : progressText(a, g);
  return (
    <View
      accessible
      accessibilityLabel={`${name}. ${cond}. ${g(`ach.rarity.${a.rarity}` as GameKey)}. ${a.earned ? g('ach.earned') : `${g('ach.locked')}, ${progressText(a, g)}`}`}
      style={[styles.tile, a.earned && styles.tileEarned]}
    >
      <Sticker achievement={a} size={52} />
      <HudText size={13} numberOfLines={2} style={styles.tileName}>
        {name}
      </HudText>
      <HudText size={11} weight="medium" color={quest.textSecondary} numberOfLines={3}>
        {cond}
      </HudText>
      <View style={styles.tileFoot}>
        <HudText size={11} color={rarityColor(a.rarity)} numberOfLines={1}>
          {g(`ach.rarity.${a.rarity}` as GameKey)}
        </HudText>
        <HudText size={11} weight="medium" color={a.earned ? quest.xp : quest.textSecondary} numberOfLines={1}>
          {a.earned || !single ? status : g('ach.locked')}
        </HudText>
      </View>
      {!a.earned && !single && a.current > 0 && <XpBar ratio={a.current / a.target} accessibilityLabel={progressText(a, g)} />}
    </View>
  );
}

function BannerRow({ b, stats, g, lang, width, equipped, onToggle }: { b: BannerState; stats: AchievementStats; g: Translate; lang: 'vi' | 'en'; width: number; equipped: boolean; onToggle: () => void }) {
  const name = g(`ach.banner.${b.id}` as GameKey);
  const cond = g(`ach.cond.${b.kind}` as GameKey, params(b, stats, lang));
  return (
    <View style={styles.bannerCard}>
      <BannerRibbon name={name} color={b.color} earned={b.earned} width={width} />
      <HudText size={12} weight="medium" color={quest.textSecondary}>
        {cond}
      </HudText>
      {b.earned ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${name}: ${equipped ? g('ach.unequip') : g('ach.equip')}`}
          accessibilityState={{ selected: equipped }}
          onPress={onToggle}
          style={[styles.equip, equipped && { backgroundColor: quest.gold, borderColor: quest.gold }]}
        >
          <HudText size={12} color={equipped ? quest.onGold : quest.text}>
            {equipped ? g('ach.equipped') : g('ach.equip')}
          </HudText>
        </Pressable>
      ) : (
        <HudText size={12} color={quest.textSecondary}>
          {g('ach.locked')} · {progressText(b, g)}
        </HudText>
      )}
    </View>
  );
}

export default function AchievementsScreen() {
  const g = useGameText();
  const language = useSettingsStore((s) => s.language);
  const lang = language === 'en' ? 'en' : 'vi';
  const insets = useSafeAreaInsets();
  useLightStatusBar();
  const now = useNow(60_000);
  const { stats, stickers, banners } = useAchievements(now);
  const equippedId = useAchievementStore((s) => s.equippedBannerId);
  const equipBanner = useAchievementStore((s) => s.equipBanner);

  const byCategory = useMemo(
    () => CATEGORY_ORDER.map((id) => ({ id, items: stickers.filter((s) => s.category === id) })).filter((c) => c.items.length > 0),
    [stickers]
  );
  const earned = stickers.filter((s) => s.earned).length;
  const earnedBanners = banners.filter((b) => b.earned).length;

  function back() {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, screenMaxWidthStyle, { paddingTop: insets.top + 16 }]}>
      <QuestHeader
        title={g('ach.title')}
        eyebrow={g('ach.counts', { n: earned, t: stickers.length, b: earnedBanners, bt: banners.length })}
        onBack={back}
        backLabel={g('ach.back')}
      />

      {byCategory.map((cat) => {
        const got = cat.items.filter((i) => i.earned).length;
        return (
          <View key={cat.id} style={styles.section}>
            <View style={styles.sectionHead}>
              <HudText size={18} accessibilityRole="header">
                {g(`ach.cat.${cat.id}` as GameKey)}
              </HudText>
              <HudText size={13} color={quest.gold}>
                {got} / {cat.items.length}
              </HudText>
            </View>
            <View style={styles.grid}>
              {cat.items.map((a) => (
                <View key={a.id} style={styles.cell}>
                  <StickerTile a={a} stats={stats} g={g} lang={lang} />
                </View>
              ))}
            </View>
          </View>
        );
      })}

      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <HudText size={18} accessibilityRole="header">
            {g('ach.banners')}
          </HudText>
          <HudText size={13} color={quest.gold}>
            {earnedBanners} / {banners.length}
          </HudText>
        </View>
        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {g('ach.bannersHint')}
        </HudText>
        {banners.map((b) => (
          <BannerRow
            key={b.id}
            b={b}
            stats={stats}
            g={g}
            lang={lang}
            width={300}
            equipped={equippedId === b.id}
            onToggle={() => equipBanner(equippedId === b.id ? null : b.id)}
          />
        ))}
      </View>

      <HudText size={12} weight="medium" color={quest.textSecondary}>
        {g('ach.note')}
      </HudText>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: quest.bg },
  content: { paddingHorizontal: 16, paddingBottom: 48, gap: 20 },
  section: { gap: 10 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cell: { width: '48.5%', flexGrow: 1 },
  tile: { flex: 1, gap: 6, padding: 12, borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  tileEarned: { borderColor: quest.xp },
  tileName: { marginTop: 2 },
  tileFoot: { flexDirection: 'row', justifyContent: 'space-between', gap: 6, marginTop: 'auto' },
  bannerCard: { gap: 8, padding: 12, borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel, alignItems: 'flex-start' },
  equip: { minHeight: 36, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.raised, alignItems: 'center', justifyContent: 'center' },
});
