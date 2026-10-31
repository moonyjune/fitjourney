import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import type { BossKind } from '../../temptation/catalog';
import { hiddenSvgProps } from './hiddenSvg';
import { NATIVE_DRIVER, useMotionEnabled } from './motion/tokens';
import { BOSS_LURE_PINK, BossPortrait, type BossArtKind, type BossMood } from './StageBossArt';

// The talking bosses of the temptation challenge, drawn by the same BossPortrait as the Map's stage bosses so they read
// as one family: the cake demon for desserts, the bubble-tea slime, the beer barrel, the noodle ninja and a crispy goblin
// for fried food. Each wears the moods tempting (sly wink), talking (mouth moving), smug (gloating grin) and sulking
// (pout and a tear). It bobs while it talks, glows while tempting and shakes when it sulks; with reduced motion it stays
// still.

export type { BossMood };

/** Which drawing each temptation boss uses. */
const ART: Record<BossKind, BossArtKind> = { sweet: 'sugar', tea: 'bubbleTea', beer: 'beer', noodle: 'noodle', fried: 'fried' };
/** Tempters are drawn at tier 1 (no horns or aura): they lure rather than fight. */
const TEMPT_TIER = 1;

/** A boss face; `size` in px. Decorative (the dialog names the boss in text). */
export function TemptBossAvatar({ kind, mood, size = 72 }: { kind: BossKind; mood: BossMood; size?: number }) {
  const motion = useMotionEnabled();
  const bob = useRef(new Animated.Value(0)).current;
  const shake = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const [mouthOpen, setMouthOpen] = useState(false);

  // Bob (and glow while tempting) in a loop.
  useEffect(() => {
    if (!motion || mood === 'sulking') {
      bob.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: mood === 'smug' ? 260 : 600, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE_DRIVER }),
        Animated.timing(bob, { toValue: 0, duration: mood === 'smug' ? 260 : 600, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE_DRIVER }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [motion, mood, bob]);

  useEffect(() => {
    if (!motion || mood !== 'tempting') {
      glow.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 900, useNativeDriver: NATIVE_DRIVER }),
        Animated.timing(glow, { toValue: 0, duration: 900, useNativeDriver: NATIVE_DRIVER }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [motion, mood, glow]);

  // A shake when it starts sulking.
  useEffect(() => {
    if (!motion || mood !== 'sulking') return;
    const step = (to: number) => Animated.timing(shake, { toValue: to, duration: 60, useNativeDriver: NATIVE_DRIVER });
    const run = Animated.sequence([step(-7), step(7), step(-5), step(4), step(0)]);
    run.start();
    return () => run.stop();
  }, [motion, mood, shake]);

  // The mouth moves while talking.
  useEffect(() => {
    if (!motion || mood !== 'talking') {
      setMouthOpen(false);
      return;
    }
    const id = setInterval(() => setMouthOpen((o) => !o), 170);
    return () => clearInterval(id);
  }, [motion, mood]);

  const translateY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, mood === 'smug' ? -6 : -4] });
  return (
    <Animated.View style={{ width: size, height: size, transform: [{ translateY }, { translateX: shake }] }} {...hiddenSvgProps}>
      <Animated.View
        style={{
          position: 'absolute',
          left: -size * 0.08,
          top: -size * 0.08,
          width: size * 1.16,
          height: size * 1.16,
          borderRadius: size,
          backgroundColor: BOSS_LURE_PINK,
          opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.3] }),
        }}
      />
      <View style={{ width: size, height: size }}>
        <BossPortrait kind={ART[kind]} tier={TEMPT_TIER} size={size} mood={mood} mouthOpen={mouthOpen} />
      </View>
    </Animated.View>
  );
}
