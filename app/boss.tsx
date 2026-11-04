import { HitShake } from '../src/components/quest/motion/HitShake';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DefaultBossArt } from '../src/components/quest/StageBossArt';
import { HudText } from '../src/components/quest/HudText';
import { QuestButton } from '../src/components/quest/QuestButton';
import { QuestHeader } from '../src/components/quest/QuestHeader';
import { InfoButton } from '../src/components/quest/InfoButton';
import { BossHpBar } from '../src/components/quest/WeeklyBossSheet';
import { BOSS_DEFEAT_XP, DAILY_DAMAGE_CAP_KCAL } from '../src/game/constants';
import { useGameText } from '../src/game/strings';
import { useGameState, useNow } from '../src/game/useGameState';
import { mealNames } from '../src/game/deficitView';
import { bossHitTexts, bossNum as num, bossStatusText } from '../src/game/bossView';
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
  const insets = useSafeAreaInsets();
  useLightStatusBar();
  const now = useNow(60_000);
  const { boss, today: todayEval } = useGameState(now);

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
      <BossHpBar boss={boss} height={14} trackColor={quest.bossPanel} delay={300} />
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
          <View style={styles.reasonRow}>
            <HudText size={13} weight="medium" color={quest.textTertiary} style={styles.flex}>
              {hit}
            </HudText>
            {today?.pending && todayEval.pendingMeals.length > 0 && (
              <InfoButton label={g('journal2.pendingInfo')} title={g('journal2.pendingTitle')} text={g('journal2.pendingFull', { meals: mealNames(todayEval.pendingMeals, g) })} />
            )}
          </View>
        ) : null}
      </View>

      <QuestButton icon="chart" variant="ghost" title={g('week.bossButton')} onPress={() => router.push('/weekly-report')} />
      {/* The full 7-day log lives in Journal › Tuần (dialogs.md decision 7). */}
      <QuestButton icon="calendar" variant="ghost" title={g('camp.bossSeeWeek')} onPress={() => router.push({ pathname: '/journal', params: { tab: 'week' } })} />

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
  reasonRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  reward: { padding: 14, borderRadius: questRadius.panel, backgroundColor: quest.bossPanel, borderWidth: 1.5, borderColor: quest.bossBorder },
});
