import { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { HudText } from './quest/HudText';
import { hiddenSvgProps } from './quest/hiddenSvg';
import { FitJourneyLogo } from './FitJourneyLogo';
import { useGameText } from '../game/strings';
import { quest } from '../theme/quest';
import { useReducedMotion } from '../theme/useReducedMotion';

// The native animation driver doesn't exist on web (it would only log a warning and fall back to JS anyway).
const NATIVE = Platform.OS !== 'web';
const SHIELD = 132;
const GLOW = SHIELD * 2.4;

interface AppIntroProps {
  /** How long the loading bar takes to fill; matches the minimum time the intro stays up. */
  durationMs?: number;
}

/** Branded loading screen in the FitQuest look: the level shield rises in over a soft gold glow, the name and tagline
 *  fade up, and an XP-style bar fills while the app finishes starting. With reduced motion everything just appears. */
export function AppIntro({ durationMs = 1200 }: AppIntroProps) {
  const g = useGameText();
  const reduced = useReducedMotion();
  const rise = useRef(new Animated.Value(0)).current; // shield + text entrance, 0..1
  const glow = useRef(new Animated.Value(0)).current; // slow glow pulse, 0..1
  const fill = useRef(new Animated.Value(0)).current; // loading bar, 0..1

  useEffect(() => {
    if (reduced) {
      rise.setValue(1);
      fill.setValue(1);
      glow.setValue(0.5);
      return;
    }
    const entrance = Animated.spring(rise, { toValue: 1, friction: 7, tension: 60, useNativeDriver: NATIVE });
    const bar = Animated.timing(fill, { toValue: 1, duration: durationMs, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE });
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE }),
        Animated.timing(glow, { toValue: 0.25, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE }),
      ])
    );
    entrance.start();
    bar.start();
    pulse.start();
    return () => {
      entrance.stop();
      bar.stop();
      pulse.stop();
    };
  }, [reduced, rise, glow, fill, durationMs]);

  const shieldScale = rise.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] });
  const textShift = rise.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });
  const glowScale = glow.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.08] });
  // The bar is a full-width fill scaled from its left edge (scaleX keeps the animation on the native driver).
  const barShift = fill.interpolate({ inputRange: [0, 1], outputRange: [-BAR_WIDTH / 2, 0] });
  const barScale = fill.interpolate({ inputRange: [0, 1], outputRange: [0.0001, 1] });

  return (
    <View style={styles.container} accessible accessibilityRole="progressbar" accessibilityLabel={g('intro.loading')}>
      <View style={styles.center}>
        <View style={styles.shieldWrap}>
          <Animated.View
            style={[styles.glow, { opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }), transform: [{ scale: glowScale }] }]}
          >
            <Svg width={GLOW} height={GLOW} {...hiddenSvgProps}>
              <Defs>
                <RadialGradient id="introGlow" cx="50%" cy="50%" r="50%">
                  <Stop offset="0" stopColor={quest.gold} stopOpacity={0.34} />
                  <Stop offset="0.55" stopColor={quest.gold} stopOpacity={0.1} />
                  <Stop offset="1" stopColor={quest.gold} stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Rect x={0} y={0} width={GLOW} height={GLOW} fill="url(#introGlow)" />
            </Svg>
          </Animated.View>
          <Animated.View style={{ opacity: rise, transform: [{ scale: shieldScale }] }}>
            <FitJourneyLogo width={SHIELD} />
          </Animated.View>
        </View>
        <Animated.View style={[styles.textBlock, { opacity: rise, transform: [{ translateY: textShift }] }]}>
          <HudText size={34} style={styles.name}>
            {g('intro.name').toUpperCase()}
          </HudText>
          <HudText size={13} weight="medium" color={quest.textSecondary} style={styles.tagline}>
            {g('intro.tagline')}
          </HudText>
        </Animated.View>
      </View>

      <View style={styles.footer}>
        <HudText size={11} color={quest.textSecondary} style={styles.eyebrow}>
          {g('intro.loading').toUpperCase()}
        </HudText>
        <View style={styles.track}>
          <Animated.View style={[styles.fillBar, { transform: [{ translateX: barShift }, { scaleX: barScale }] }]} />
        </View>
      </View>
    </View>
  );
}

const BAR_WIDTH = 220;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: quest.bg, alignItems: 'center', justifyContent: 'space-between', paddingVertical: 56 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 28 },
  shieldWrap: { width: SHIELD * 1.9, height: SHIELD * 1.9, alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute', width: GLOW, height: GLOW, pointerEvents: 'none' },
  textBlock: { alignItems: 'center', gap: 8, paddingHorizontal: 32 },
  name: { letterSpacing: 4, textAlign: 'center' },
  tagline: { textAlign: 'center', lineHeight: 19 },
  eyebrow: { letterSpacing: 1.6 },
  footer: { alignItems: 'center', gap: 10 },
  track: { width: BAR_WIDTH, height: 8, borderRadius: 4, backgroundColor: quest.raised, overflow: 'hidden' },
  fillBar: { width: BAR_WIDTH, height: 8, borderRadius: 4, backgroundColor: quest.gold },
});
