import { HitShake } from '../src/components/quest/motion/HitShake';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DefaultBossArt } from '../src/components/quest/StageBossArt';
import { HudText } from '../src/components/quest/HudText';
import { QuestButton } from '../src/components/quest/QuestButton';
import { QuestHeader } from '../src/components/quest/QuestHeader';
import { WeeklyBossHistory } from '../src/components/quest/WeeklyBossHistory';
import { XpBar } from '../src/components/quest/XpBar';
import { BOSS_DEFEAT_XP, DAILY_DAMAGE_CAP_KCAL } from '../src/game/constants';
import type { BossDay } from '../src/game/boss';
import { useGameText, type GameKey } from '../src/game/strings';
import { useGameState, useNow } from '../src/game/useGameState';
import { DEFICIT_LEVEL_COLOR } from '../src/game/deficitLevel';
import { bossHitTexts, bossNum as num, bossStatusText, deficitSplitText } from '../src/game/bossView';
import { quest, questRadius } from '../src/theme/quest';
import { screenMaxWidthStyle } from '../src/theme/responsive';
import { useLightStatusBar } from '../src/theme/useLightStatusBar';
import { isoWeekNumber } from '../src/utils/isoWeek';

function back() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)');
}

export default function BossScreen() {
  const g = useGameText();
  const splitText = (d: BossDay) => deficitSplitText(d, g);
  const insets = useSafeAreaInsets();
  useLightStatusBar();
  const now = useNow(60_000);
  const { boss, today: todayEval, bossHistory } = useGameState(now);

  const today = boss.days[boss.days.length - 1];
  const weekNo = isoWeekNumber(new Date(`${boss.weekKey}T12:00:00`));

  const { headline, reason: hit } = bossHitTexts(boss, todayEval, g);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, screenMaxWidthStyle, { paddingTop: insets.top + 16 }]}>
      <QuestHeader
        title={g('boss.name')}
        eyebrow={g('boss.detail.eyebrow', { n: weekNo })}
        onBack={back}
        backLabel={g('boss.detail.back')}
      />

      <View style={styles.face} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <HitShake play={!!today && today.damage > 0}>
          <DefaultBossArt size={150} defeated={boss.defeated} idle />
        </HitShake>
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
      <XpBar ratio={boss.maxHp > 0 ? boss.hpLeft / boss.maxHp : 0} color={quest.hp} trackColor={quest.bossPanel} height={14} from={1} delay={300} />
      <HudText size={13} weight="medium" color={quest.textSecondary}>
        {bossStatusText(boss, g)}
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
        {headline ? <HudText size={16}>{headline}</HudText> : null}
        {hit ? (
          <HudText size={13} weight="medium" color={quest.textTertiary}>
            {hit}
          </HudText>
        ) : null}
      </View>

      <QuestButton icon="chart" variant="ghost" title={g('week.bossButton')} onPress={() => router.push('/weekly-report')} />

      <View style={styles.log}>
        <HudText size={16} accessibilityRole="header">
          {g('boss.detail.log')}
        </HudText>
        {boss.days.map((d, i) => {
          const isToday = i === boss.days.length - 1;
          const dow = new Date(`${d.dateKey}T12:00:00`).getDay();
          const name = isToday ? g('boss.detail.today') : g(`weekday.${dow}` as GameKey);
          const noData = d.deficitKcal == null;
          // Today with meals still to come: its hit is an estimate, not dealt yet.
          const amount = noData ? '—' : d.pending ? `~−${num(d.pendingDamage)}` : `−${num(d.damage)}`;
          const sub = d.cheat
            ? g('boss.detail.cheat')
            : noData
              ? g('boss.detail.noData')
              : [d.deficitKcal! > 0 ? g(d.pending ? 'boss.detail.pending' : 'boss.detail.deficit', { n: num(d.deficitKcal!) }) : '', splitText(d)].filter(Boolean).join(' · ');
          return (
            <View
              key={d.dateKey}
              accessible
              accessibilityLabel={`${name}. ${d.cheat ? g('boss.detail.cheat') : noData ? g('boss.detail.noData') : `${amount} HP`}`}
              style={[styles.logRow, i > 0 && styles.logDivider]}
            >
              <View style={styles.flex}>
                <HudText size={15} color={isToday ? quest.text : quest.textTertiary}>
                  {name} <HudText size={12} weight="medium" color={quest.textSecondary}>{d.dateKey.slice(8)}/{d.dateKey.slice(5, 7)}</HudText>
                </HudText>
                {sub ? (
                  <HudText size={11} weight="medium" color={d.cheat ? DEFICIT_LEVEL_COLOR.cheat : quest.textSecondary}>
                    {sub}
                  </HudText>
                ) : null}
              </View>
              <HudText size={17} color={noData || d.pending ? quest.textSecondary : isToday ? quest.gold : quest.hpText}>
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

      <WeeklyBossHistory history={bossHistory} />
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
