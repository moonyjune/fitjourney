import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BossFace } from '../src/components/quest/BossCard';
import { HudText } from '../src/components/quest/HudText';
import { QuestHeader } from '../src/components/quest/QuestHeader';
import { XpBar } from '../src/components/quest/XpBar';
import { BOSS_DEFEAT_XP, DAILY_DAMAGE_CAP_KCAL } from '../src/game/constants';
import { useGameText, type GameKey } from '../src/game/strings';
import { useGameState, useNow } from '../src/game/useGameState';
import { quest, questRadius } from '../src/theme/quest';
import { screenMaxWidthStyle } from '../src/theme/responsive';
import { useLightStatusBar } from '../src/theme/useLightStatusBar';
import { isoWeekNumber } from '../src/utils/isoWeek';

const num = (n: number) => Math.round(n).toLocaleString('en-US');

function back() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)');
}

export default function BossScreen() {
  const g = useGameText();
  const insets = useSafeAreaInsets();
  useLightStatusBar();
  const now = useNow(60_000);
  const { boss } = useGameState(now);

  const today = boss.days[boss.days.length - 1];
  const weekNo = isoWeekNumber(new Date(`${boss.weekKey}T12:00:00`));
  const lastDay = boss.daysUntilReset <= 1;

  let hit: string;
  if (!today || today.deficitKcal == null) hit = g('boss.detail.hitNone');
  else if (today.deficitKcal <= 0) hit = g('boss.detail.hitSurplus');
  else if (today.capped) hit = g('boss.detail.hitCap', { cap: num(DAILY_DAMAGE_CAP_KCAL) });
  else hit = '';

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, screenMaxWidthStyle, { paddingTop: insets.top + 16 }]}>
      <QuestHeader
        title={g('boss.name')}
        eyebrow={g('boss.detail.eyebrow', { n: weekNo })}
        onBack={back}
        backLabel={g('boss.detail.back')}
      />

      <View style={styles.face} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <BossFace size={150} defeated={boss.defeated} />
        {today && today.damage > 0 && (
          <HudText size={34} color={quest.gold} style={styles.floating}>
            −{num(today.damage)}
          </HudText>
        )}
      </View>

      <View style={styles.hpRow}>
        <HudText size={14} color={quest.hpText}>
          HP
        </HudText>
        <HudText size={20} accessibilityLabel={g('boss.a11y', { name: g('boss.name'), left: boss.hpLeft, max: boss.maxHp })}>
          {num(boss.hpLeft)} <HudText size={14} weight="medium" color={quest.textSecondary}>/ {num(boss.maxHp)}</HudText>
        </HudText>
      </View>
      <XpBar ratio={boss.maxHp > 0 ? boss.hpLeft / boss.maxHp : 0} color={quest.hp} trackColor={quest.bossPanel} height={14} />
      <HudText size={13} weight="medium" color={quest.textSecondary}>
        {boss.defeated
          ? g('boss.detail.beaten')
          : lastDay
            ? g('boss.detail.leftLast', { n: num(boss.hpLeft) })
            : g('boss.detail.left', { d: boss.daysUntilReset - 1, n: num(boss.neededPerRemainingDay) })}
      </HudText>

      {!boss.defeated && boss.neededPerRemainingDay > DAILY_DAMAGE_CAP_KCAL && (
        <HudText size={13} weight="medium" color={quest.hpText} accessibilityLiveRegion="polite">
          {g('boss.detail.unreachable', { cap: num(DAILY_DAMAGE_CAP_KCAL) })}
        </HudText>
      )}

      <View style={styles.hitCard}>
        <HudText size={11} color={quest.gold} style={styles.eyebrow}>
          {g('boss.detail.hitTitle').toUpperCase()}
        </HudText>
        {today && today.deficitKcal != null && today.deficitKcal > 0 ? (
          <HudText size={16}>{g('boss.detail.hit', { def: num(today.deficitKcal), dmg: num(today.damage) })}</HudText>
        ) : null}
        {hit ? (
          <HudText size={13} weight="medium" color={quest.textTertiary}>
            {hit}
          </HudText>
        ) : null}
      </View>

      <View style={styles.log}>
        <HudText size={16} accessibilityRole="header">
          {g('boss.detail.log')}
        </HudText>
        {boss.days.map((d, i) => {
          const isToday = i === boss.days.length - 1;
          const dow = new Date(`${d.dateKey}T12:00:00`).getDay();
          const name = isToday ? g('boss.detail.today') : g(`weekday.${dow}` as GameKey);
          const noData = d.deficitKcal == null;
          const amount = noData ? '—' : `−${num(d.damage)}`;
          const sub = noData
            ? g('boss.detail.noData')
            : d.deficitKcal! > 0
              ? g('boss.detail.deficit', { n: num(d.deficitKcal!) })
              : '';
          return (
            <View
              key={d.dateKey}
              accessible
              accessibilityLabel={`${name}. ${noData ? g('boss.detail.noData') : `${amount} HP`}`}
              style={[styles.logRow, i > 0 && styles.logDivider]}
            >
              <View style={styles.flex}>
                <HudText size={15} color={isToday ? quest.text : quest.textTertiary}>
                  {name} <HudText size={12} weight="medium" color={quest.textSecondary}>{d.dateKey.slice(8)}/{d.dateKey.slice(5, 7)}</HudText>
                </HudText>
                {sub ? (
                  <HudText size={11} weight="medium" color={quest.textSecondary}>
                    {sub}
                  </HudText>
                ) : null}
              </View>
              <HudText size={17} color={noData ? quest.textSecondary : isToday ? quest.gold : quest.hpText}>
                {amount}
              </HudText>
            </View>
          );
        })}
      </View>

      <View style={styles.reward}>
        <HudText size={14} weight="medium" color={quest.textTertiary}>
          {g('boss.detail.reward', { xp: BOSS_DEFEAT_XP, max: num(boss.maxHp) })}
        </HudText>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: quest.bg },
  content: { paddingHorizontal: 16, paddingBottom: 48, gap: 12 },
  flex: { flex: 1, minWidth: 0 },
  eyebrow: { letterSpacing: 1.6 },
  face: { alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
  floating: { position: 'absolute', top: 8, right: 0 },
  hpRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 },
  hitCard: { gap: 6, padding: 14, borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.gold, backgroundColor: quest.panel },
  log: { padding: 14, borderRadius: questRadius.panel, backgroundColor: quest.panel, gap: 2 },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48 },
  logDivider: { borderTopWidth: 1, borderTopColor: quest.border },
  reward: { padding: 14, borderRadius: questRadius.panel, backgroundColor: quest.bossPanel, borderWidth: 1.5, borderColor: quest.bossBorder },
});
