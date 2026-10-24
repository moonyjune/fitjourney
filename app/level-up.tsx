import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { HudText } from '../src/components/quest/HudText';
import { QuestButton } from '../src/components/quest/QuestButton';
import { QuestShield } from '../src/components/quest/QuestShield';
import { QuestSheet } from '../src/components/quest/QuestSheet';
import { XpBar } from '../src/components/quest/XpBar';
import { SparkleBurst } from '../src/components/quest/motion/SparkleBurst';
import { titleKeyForLevel } from '../src/game/level';
import { useGameText, type GameKey } from '../src/game/strings';
import { useGameState, useNow } from '../src/game/useGameState';
import { useCelebrationStore } from '../src/store/useCelebrationStore';
import { quest } from '../src/theme/quest';
import { useLightStatusBar } from '../src/theme/useLightStatusBar';
import { useReducedMotion } from '../src/theme/useReducedMotion';
import { NATIVE_DRIVER } from '../src/components/quest/motion/tokens';

function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)');
}

/** Shown once per level gained. It rewards nothing new: the level and title are the reward. */
export default function LevelUpScreen() {
  const g = useGameText();
  useLightStatusBar();
  const reduced = useReducedMotion();
  const game = useGameState(useNow(60_000));
  const markSeen = useCelebrationStore((s) => s.markSeen);
  const params = useLocalSearchParams<{ from?: string; to?: string }>();

  const to = Number(params.to) || game.level.level;
  const from = Math.min(Number(params.from) || to - 1, to - 1);
  const levels = to - from;
  const newTitle = titleKeyForLevel(to) !== titleKeyForLevel(from);

  // Seeing it is what counts as "seen": a re-open (or a crash) never replays an old celebration.
  useEffect(() => {
    markSeen(to);
  }, [markSeen, to]);

  const scale = useRef(new Animated.Value(reduced ? 1 : 0.6)).current;
  useEffect(() => {
    if (reduced) {
      scale.setValue(1);
      return;
    }
    const run = Animated.spring(scale, { toValue: 1, friction: 5, useNativeDriver: NATIVE_DRIVER });
    run.start();
    return () => run.stop();
  }, [reduced, scale]);

  return (
    <QuestSheet onClose={close} closeLabel={g('common.close')}>
      <View style={styles.center}>
        <View style={styles.shieldStage}>
          <SparkleBurst radius={120} count={14} />
          <Animated.View style={{ transform: [{ scale }] }}>
            <QuestShield level={to} width={120} />
          </Animated.View>
        </View>
        <HudText size={11} color={quest.gold} style={styles.eyebrow}>
          {g('levelup.eyebrow').toUpperCase()}
        </HudText>
        <HudText size={30} accessibilityRole="header" accessibilityLiveRegion="polite">
          {g('levelup.title', { n: to })}
        </HudText>
        <HudText size={14} weight="medium" color={quest.textSecondary} style={styles.text}>
          {levels > 1 ? g('levelup.multi', { k: levels, from, to }) : g('levelup.single', { from, to })}
        </HudText>
        {newTitle && (
          <View style={styles.titlePill}>
            <HudText size={14} color={quest.gold}>
              {g('levelup.newTitle', { title: g(`title.${titleKeyForLevel(to)}` as GameKey) })}
            </HudText>
          </View>
        )}
        <View style={styles.bar}>
          <XpBar ratio={game.level.ratio} delay={450} accessibilityLabel={g('level.progress', { cur: game.level.xpIntoLevel, need: game.level.xpForNext, next: game.level.level + 1 })} />
        </View>
        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {g('levelup.next', { need: game.level.xpForNext - game.level.xpIntoLevel, next: game.level.level + 1 })}
        </HudText>
      </View>
      <View style={styles.button}>
        <QuestButton title={g('levelup.keep')} onPress={close} />
      </View>
    </QuestSheet>
  );
}

const styles = StyleSheet.create({
  shieldStage: { width: 240, height: 140, alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', gap: 8, paddingVertical: 12 },
  eyebrow: { letterSpacing: 1.8, marginTop: 8 },
  text: { textAlign: 'center' },
  titlePill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, borderColor: quest.gold, backgroundColor: quest.panel },
  bar: { alignSelf: 'stretch', marginTop: 6 },
  button: { marginTop: 12 },
});
