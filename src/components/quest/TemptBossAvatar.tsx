import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';
import type { BossKind } from '../../temptation/catalog';
import { hiddenSvgProps } from './hiddenSvg';
import { NATIVE_DRIVER, useMotionEnabled } from './motion/tokens';

// The talking bosses of the temptation challenge, drawn here (self-contained): a sweet monster for desserts, a bubble-tea slime, a beer
// brute, a noodle ninja and a crispy goblin for fried food. Each has the moods tempting (sly wink), talking (mouth moving), smug
// (gloating grin) and sulking (pout and a tear). It bobs while it talks, glows while tempting and shakes when it sulks; with reduced
// motion it stays still.

export type BossMood = 'tempting' | 'talking' | 'smug' | 'sulking';

const INK = '#2B1B3D';

function Face({ mood, mouthOpen, cy }: { mood: BossMood; mouthOpen: boolean; cy: number }) {
  const eyeY = cy - 6;
  const mouthY = cy + 8;
  return (
    <G>
      {/* blush */}
      <Ellipse cx={34} cy={cy + 3} rx={5} ry={3} fill="#FF7FA8" opacity={mood === 'sulking' ? 0.3 : 0.7} />
      <Ellipse cx={66} cy={cy + 3} rx={5} ry={3} fill="#FF7FA8" opacity={mood === 'sulking' ? 0.3 : 0.7} />
      {mood === 'smug' ? (
        <G>
          <Path d={`M36 ${eyeY + 2} q5 -6 10 0`} stroke={INK} strokeWidth={3} fill="none" strokeLinecap="round" />
          <Path d={`M54 ${eyeY + 2} q5 -6 10 0`} stroke={INK} strokeWidth={3} fill="none" strokeLinecap="round" />
          <Path d={`M38 ${mouthY - 2} q12 14 24 0 z`} fill={INK} />
          <Rect x={46} y={mouthY - 2} width={5} height={4} fill="#fff" />
        </G>
      ) : mood === 'sulking' ? (
        <G>
          <Circle cx={41} cy={eyeY + 3} r={3} fill={INK} />
          <Circle cx={59} cy={eyeY + 3} r={3} fill={INK} />
          <Path d={`M35 ${eyeY - 4} l10 3`} stroke={INK} strokeWidth={2.5} strokeLinecap="round" />
          <Path d={`M65 ${eyeY - 4} l-10 3`} stroke={INK} strokeWidth={2.5} strokeLinecap="round" />
          <Path d={`M42 ${mouthY + 3} q8 -7 16 0`} stroke={INK} strokeWidth={3} fill="none" strokeLinecap="round" />
          <Path d={`M63 ${eyeY + 6} q3 6 0 8 q-3 -2 0 -8 z`} fill="#7FD3FF" />
        </G>
      ) : (
        <G>
          {/* sly: one eye half-closed, the other winking; talking opens the mouth on and off */}
          <Circle cx={41} cy={eyeY} r={4.5} fill="#fff" />
          <Circle cx={42} cy={eyeY + 1} r={2.6} fill={INK} />
          <Path d={`M36 ${eyeY - 1} h10`} stroke={INK} strokeWidth={2.5} strokeLinecap="round" />
          {mood === 'tempting' ? (
            <Path d={`M54 ${eyeY} q5 4 10 0`} stroke={INK} strokeWidth={3} fill="none" strokeLinecap="round" />
          ) : (
            <G>
              <Circle cx={59} cy={eyeY} r={4.5} fill="#fff" />
              <Circle cx={60} cy={eyeY + 1} r={2.6} fill={INK} />
            </G>
          )}
          <Path d={`M54 ${eyeY - 8} q6 -4 11 0`} stroke={INK} strokeWidth={2.2} fill="none" strokeLinecap="round" />
          {mouthOpen ? (
            <G>
              <Ellipse cx={50} cy={mouthY + 1} rx={6} ry={5} fill={INK} />
              <Ellipse cx={50} cy={mouthY + 3} rx={3.5} ry={2} fill="#FF6B8B" />
            </G>
          ) : (
            <Path d={`M41 ${mouthY} q9 8 18 0`} stroke={INK} strokeWidth={3} fill="none" strokeLinecap="round" />
          )}
          {mood === 'tempting' && <Path d={`M58 ${mouthY + 3} q2 5 0 7 q-2 -2 0 -7 z`} fill="#7FD3FF" opacity={0.9} />}
        </G>
      )}
    </G>
  );
}

/** The body of each boss; returns the y of the face centre too. */
function Body({ kind }: { kind: BossKind }) {
  switch (kind) {
    case 'sweet':
      return (
        <G>
          <Path d="M20 55 q30 -14 60 0 l-6 34 q-24 8 -48 0 z" fill="#F7A8C8" />
          <Path d="M24 66 l52 0 M26 76 l48 0" stroke="#E07CA6" strokeWidth={2} />
          <Circle cx={34} cy={44} r={12} fill="#FFF4E8" />
          <Circle cx={50} cy={38} r={14} fill="#FFF4E8" />
          <Circle cx={66} cy={44} r={12} fill="#FFF4E8" />
          <Circle cx={52} cy={22} r={6} fill="#E8364F" />
          <Path d="M52 16 q4 -8 10 -8" stroke="#3C8D2F" strokeWidth={2} fill="none" />
          <Circle cx={40} cy={40} r={1.6} fill="#7BC67E" />
          <Circle cx={60} cy={36} r={1.6} fill="#4CC9F0" />
        </G>
      );
    case 'tea':
      return (
        <G>
          <Rect x={60} y={6} width={6} height={34} rx={2} fill="#FF5470" transform="rotate(14 63 23)" />
          <Path d="M50 18 C78 30 86 60 80 76 C74 92 26 92 20 76 C14 60 22 30 50 18 z" fill="#C89B72" opacity={0.95} />
          <Path d="M30 40 q20 -10 40 0" stroke="#FFF" strokeWidth={3} opacity={0.35} fill="none" strokeLinecap="round" />
          {[30, 40, 50, 60, 70, 36, 64].map((x, i) => (
            <Circle key={i} cx={x} cy={i < 5 ? 84 : 78} r={4} fill="#3B2314" />
          ))}
        </G>
      );
    case 'beer':
      return (
        <G>
          <Path d="M76 40 h8 a8 8 0 0 1 8 8 v18 a8 8 0 0 1 -8 8 h-8" stroke="#E0A800" strokeWidth={6} fill="none" />
          <Rect x={18} y={30} width={60} height={62} rx={8} fill="#F2B705" />
          <Path d="M28 44 v38 M68 44 v38" stroke="#FFD95A" strokeWidth={3} opacity={0.7} />
          <Circle cx={24} cy={30} r={9} fill="#FFFDF5" />
          <Circle cx={38} cy={25} r={11} fill="#FFFDF5" />
          <Circle cx={55} cy={26} r={11} fill="#FFFDF5" />
          <Circle cx={70} cy={30} r={9} fill="#FFFDF5" />
          <Path d="M34 48 l12 4 M66 48 l-12 4" stroke={INK} strokeWidth={4} strokeLinecap="round" />
        </G>
      );
    case 'noodle':
      return (
        <G>
          <Circle cx={50} cy={50} r={28} fill="#FFD9A8" />
          <Rect x={22} y={34} width={56} height={10} rx={4} fill={INK} />
          <Path d="M78 38 l12 -6 l-4 10 z" fill={INK} />
          <Path d="M36 66 q2 12 -2 20 M44 68 q2 12 0 20 M56 68 q-2 12 0 20 M64 66 q-2 12 2 20" stroke="#F6D365" strokeWidth={3} fill="none" />
          <Path d="M12 74 h76 q-4 22 -38 22 q-34 0 -38 -22 z" fill="#D7263D" />
          <Path d="M20 80 h60" stroke="#FFC83D" strokeWidth={2} strokeDasharray="4 4" />
          <Path d="M70 20 l18 50 M76 18 l14 52" stroke="#8B5A3C" strokeWidth={3} strokeLinecap="round" />
        </G>
      );
    default:
      return (
        <G>
          <Rect x={68} y={70} width={20} height={8} rx={4} fill="#FFF4E0" transform="rotate(30 78 74)" />
          <Circle cx={86} cy={84} r={5} fill="#FFF4E0" />
          <Path d="M50 16 C80 18 88 50 78 72 C70 90 30 92 22 72 C12 50 20 18 50 16 z" fill="#E3872D" />
          <Path d="M26 34 l-12 -14 l18 6 z M74 34 l12 -14 l-18 6 z" fill="#C96A1B" />
          {[30, 46, 62, 38, 56, 70].map((x, i) => (
            <Circle key={i} cx={x} cy={i < 3 ? 28 : 80} r={2.5} fill="#B85A14" />
          ))}
        </G>
      );
  }
}

const FACE_Y: Record<BossKind, number> = { sweet: 62, tea: 60, beer: 58, noodle: 52, fried: 52 };

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
          backgroundColor: '#FF7FA8',
          opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.35] }),
        }}
      />
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <Body kind={kind} />
          <Face mood={mood} mouthOpen={mouthOpen} cy={FACE_Y[kind]} />
        </Svg>
      </View>
    </Animated.View>
  );
}
