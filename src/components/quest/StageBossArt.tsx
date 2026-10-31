import { useEffect, useRef, type ReactNode } from 'react';
import { Animated } from 'react-native';
import Svg, { Circle, Ellipse, G, Line, Path, Rect } from 'react-native-svg';
import type { BossArchetype } from '../../game/stageBosses';
import { quest } from '../../theme/quest';
import { hiddenSvgProps } from './hiddenSvg';
import { EASE_OUT, NATIVE_DRIVER, useMotionEnabled } from './motion/tokens';

interface Props {
  archetype: BossArchetype;
  /** 1..5: tier 2 adds horns, 3 an aura, 4 a crown, 5 a second glowing ring. */
  tier: number;
  size?: number;
  defeated?: boolean;
  /** Bobs gently (the boss being fought now). Never runs with reduced motion. */
  idle?: boolean;
}

/** Aura / horn colour by tier. */
const TIER_COLOR = ['#B3AACF', '#B3AACF', quest.mana, quest.hp, quest.gold, '#C77DFF'];

/** Where the horns and crown sit on each archetype's head (viewBox 0 0 100 100). */
const HEAD: Record<BossArchetype, { y: number; left: number; right: number }> = {
  sugar: { y: 42, left: 32, right: 64 },
  beer: { y: 38, left: 32, right: 66 },
  bubbleTea: { y: 42, left: 36, right: 64 },
  noodle: { y: 29, left: 40, right: 60 },
  couch: { y: 37, left: 26, right: 74 },
  hotpot: { y: 29, left: 52, right: 64 },
};

function Eye({ x, y, r = 4.5, defeated }: { x: number; y: number; r?: number; defeated?: boolean }) {
  if (defeated) {
    return (
      <G>
        <Line x1={x - r} y1={y - r} x2={x + r} y2={y + r} stroke={quest.bg} strokeWidth={2.5} strokeLinecap="round" />
        <Line x1={x - r} y1={y + r} x2={x + r} y2={y - r} stroke={quest.bg} strokeWidth={2.5} strokeLinecap="round" />
      </G>
    );
  }
  return (
    <G>
      <Circle cx={x} cy={y} r={r} fill="#FFFFFF" />
      <Circle cx={x + r * 0.2} cy={y + r * 0.15} r={r * 0.55} fill={quest.bg} />
    </G>
  );
}

/** Two slanted brows: the angry look every boss shares. */
function Brows({ l, r, y }: { l: number; r: number; y: number }) {
  return <Path d={`M${l - 6} ${y - 4} L${l + 4} ${y} M${r + 6} ${y - 4} L${r - 4} ${y}`} stroke={quest.bg} strokeWidth={2.5} strokeLinecap="round" />;
}

function Sugar({ defeated }: { defeated?: boolean }) {
  return (
    <G>
      {/* Lollipop weapon */}
      <Line x1={80} y1={86} x2={86} y2={40} stroke="#F4F1FF" strokeWidth={3} strokeLinecap="round" />
      <Circle cx={87} cy={31} r={10} fill="#FF5CA8" />
      <Path d="M87 31 m-6 0 a6 6 0 1 1 6 6 a3.5 3.5 0 1 1 -3.5 -3.5" fill="none" stroke="#FFF1F6" strokeWidth={2} />
      <Path d="M74 66 L82 60" stroke="#FF8FC8" strokeWidth={5} strokeLinecap="round" />
      <Path d="M24 66 L12 58" stroke="#FF8FC8" strokeWidth={5} strokeLinecap="round" />
      {/* Cake body */}
      <Rect x={24} y={50} width={50} height={36} rx={6} fill="#C46A4A" />
      <Rect x={24} y={63} width={50} height={5} fill="#FFF1F6" />
      <Path d="M22 53 Q22 40 49 40 Q76 40 76 53 Q72 59 67 53 Q63 59 58 53 Q54 59 49 53 Q45 59 40 53 Q36 59 31 53 Q27 59 22 53 Z" fill="#FF8FC8" />
      <Path d="M49 33 Q52 26 57 25" stroke="#3FBF7F" strokeWidth={2} fill="none" />
      <Circle cx={49} cy={36} r={5} fill="#FF3B5C" />
      <Eye x={40} y={74} defeated={defeated} />
      <Eye x={58} y={74} defeated={defeated} />
      {!defeated && <Brows l={40} r={58} y={68} />}
      <Path d="M41 81 Q49 85 57 81" stroke={quest.bg} strokeWidth={2} fill="none" strokeLinecap="round" />
      <Path d="M43 82 l2 3 l2 -2.4 M52 82.6 l2 2.4 l2 -3" fill="#FFFFFF" />
    </G>
  );
}

function Beer({ defeated }: { defeated?: boolean }) {
  return (
    <G>
      <Path d="M26 62 L12 74" stroke="#9C5B2E" strokeWidth={7} strokeLinecap="round" />
      <Path d="M72 62 L84 54" stroke="#9C5B2E" strokeWidth={7} strokeLinecap="round" />
      {/* Beer mug weapon */}
      <Path d="M94 42 h3 a3 3 0 0 1 3 3 v6 a3 3 0 0 1 -3 3 h-3" fill="none" stroke={quest.gold} strokeWidth={2.5} />
      <Rect x={80} y={38} width={14} height={18} rx={2} fill={quest.gold} />
      <Path d="M79 40 Q81 33 87 35 Q92 32 95 39 Z" fill="#FFF4D6" />
      {/* Barrel body */}
      <Path d="M27 44 Q22 66 27 88 L71 88 Q76 66 71 44 Z" fill="#9C5B2E" />
      <Path d="M38 46 Q35 66 38 86 M60 46 Q63 66 60 86" stroke="#7A4420" strokeWidth={2} fill="none" />
      <Rect x={24} y={52} width={50} height={4} fill="#5A3418" />
      <Rect x={24} y={78} width={50} height={4} fill="#5A3418" />
      <Path d="M24 47 Q26 34 36 38 Q42 30 50 36 Q58 30 64 38 Q75 36 74 47 Z" fill="#FFF4D6" />
      <Eye x={41} y={64} defeated={defeated} />
      <Eye x={57} y={64} defeated={defeated} />
      {!defeated && <Brows l={41} r={57} y={58} />}
      <Rect x={41} y={70} width={16} height={5} rx={1.5} fill={quest.bg} />
      <Path d="M44 70 v5 M48 70 v5 M52 70 v5" stroke="#FFFFFF" strokeWidth={1} />
    </G>
  );
}

function BubbleTea({ defeated }: { defeated?: boolean }) {
  return (
    <G>
      {/* Straw */}
      <Path d="M58 42 L68 10 L74 12 L64 44 Z" fill="#FF5CA8" />
      {/* Slime body */}
      <Path d="M18 86 Q14 60 30 48 Q40 39 50 39 Q60 39 70 48 Q86 60 82 86 Q50 92 18 86 Z" fill="#D9A86C" />
      <Ellipse cx={34} cy={54} rx={6} ry={3.5} fill="#FFFFFF" opacity={0.35} />
      <Circle cx={28} cy={80} r={4} fill="#3B2416" />
      <Circle cx={39} cy={83} r={4} fill="#3B2416" />
      <Circle cx={51} cy={81} r={4} fill="#3B2416" />
      <Circle cx={63} cy={84} r={4} fill="#3B2416" />
      <Circle cx={73} cy={79} r={4} fill="#3B2416" />
      {/* Pearls fired as the weapon */}
      <Circle cx={10} cy={58} r={3.5} fill="#3B2416" />
      <Circle cx={5} cy={48} r={2.5} fill="#3B2416" />
      <Path d="M14 62 l5 3 M10 52 l5 2" stroke="#D9A86C" strokeWidth={1.5} strokeLinecap="round" />
      <Eye x={40} y={61} defeated={defeated} />
      <Eye x={60} y={61} defeated={defeated} />
      {!defeated && <Brows l={40} r={60} y={55} />}
      <Path d="M42 70 Q46 74 50 70 Q54 74 58 70" stroke={quest.bg} strokeWidth={2} fill="none" strokeLinecap="round" />
    </G>
  );
}

function Noodle({ defeated }: { defeated?: boolean }) {
  return (
    <G>
      {/* Chopstick blades */}
      <Line x1={76} y1={88} x2={92} y2={30} stroke="#C46A4A" strokeWidth={3} strokeLinecap="round" />
      <Line x1={81} y1={88} x2={98} y2={33} stroke="#C46A4A" strokeWidth={3} strokeLinecap="round" />
      <Path d="M26 66 L12 54" stroke="#F2C27B" strokeWidth={5} strokeLinecap="round" />
      {/* Cup body */}
      <Path d="M28 58 L74 58 L67 90 L35 90 Z" fill="#F4F1FF" />
      <Rect x={30} y={67} width={42} height={8} fill="#FF5470" />
      <Path d="M70 64 L80 74" stroke="#F2C27B" strokeWidth={5} strokeLinecap="round" />
      {/* Noodle head with ninja mask */}
      <Circle cx={50} cy={45} r={18} fill="#F2C27B" />
      <Path d="M34 38 Q38 32 42 38 Q46 32 50 38 Q54 32 58 38 Q62 32 66 38" stroke="#FFE08A" strokeWidth={2.5} fill="none" />
      <Path d="M35 50 Q40 55 45 50 Q50 55 55 50 Q60 55 65 50" stroke="#FFE08A" strokeWidth={2} fill="none" />
      <Rect x={32} y={39} width={36} height={10} rx={3} fill="#241C44" />
      <Path d="M67 42 Q78 38 84 44 M67 46 Q76 48 80 54" stroke="#241C44" strokeWidth={3} fill="none" strokeLinecap="round" />
      {defeated ? (
        <>
          <Eye x={43} y={44} r={3.5} defeated />
          <Eye x={57} y={44} r={3.5} defeated />
        </>
      ) : (
        <Path d="M38 45 L47 43 M53 43 L62 45" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" />
      )}
    </G>
  );
}

function Couch({ defeated }: { defeated?: boolean }) {
  return (
    <G>
      {/* Remote control */}
      <Rect x={84} y={36} width={9} height={20} rx={2} fill="#241C44" />
      <Circle cx={88.5} cy={41} r={1.8} fill={quest.hp} />
      <Rect x={86.5} y={46} width={4} height={2} fill={quest.textSecondary} />
      <Rect x={18} y={36} width={64} height={32} rx={8} fill="#6E62A8" />
      <Path d="M50 38 V66 M26 44 l6 4 l-2 6 M70 42 l-5 5 l3 5" stroke="#4A3F7E" strokeWidth={2} fill="none" />
      <Rect x={14} y={62} width={72} height={18} rx={6} fill="#5A4E94" />
      <Rect x={8} y={52} width={14} height={30} rx={6} fill="#4A3F7E" />
      <Rect x={78} y={52} width={14} height={30} rx={6} fill="#4A3F7E" />
      <Rect x={18} y={80} width={8} height={7} rx={2} fill="#2A2150" />
      <Rect x={74} y={80} width={8} height={7} rx={2} fill="#2A2150" />
      <Eye x={39} y={50} defeated={defeated} />
      <Eye x={61} y={50} defeated={defeated} />
      {!defeated && <Brows l={39} r={61} y={44} />}
      <Path d="M42 60 Q50 57 58 60" stroke={quest.bg} strokeWidth={2} fill="none" strokeLinecap="round" />
    </G>
  );
}

function Hotpot({ defeated }: { defeated?: boolean }) {
  return (
    <G>
      {/* Steam */}
      <Path d="M24 58 Q20 52 24 46 Q28 40 24 34 M32 58 Q28 50 32 44" stroke={quest.textSecondary} strokeWidth={2} fill="none" strokeLinecap="round" opacity={0.7} />
      {/* Dragon */}
      <Path d="M40 66 Q32 42 46 31 Q58 22 70 30 Q78 36 73 45 L61 47 Q54 52 57 66 Z" fill="#3FBF7F" />
      <Path d="M44 60 Q40 48 46 40" stroke="#2E8F5E" strokeWidth={2.5} fill="none" />
      <Path d="M46 34 l-6 -4 l7 0 M44 42 l-7 -2 l6 -2 M43 50 l-7 0 l6 -3" fill="#2E8F5E" />
      {defeated ? <Eye x={63} y={35} r={4} defeated /> : <Eye x={63} y={35} r={4} />}
      {!defeated && <Path d="M57 30 L68 31" stroke={quest.bg} strokeWidth={2.5} strokeLinecap="round" />}
      <Circle cx={72} cy={42} r={1.2} fill={quest.bg} />
      {/* Fire breath */}
      {!defeated && <Path d="M74 41 Q86 33 97 38 Q88 43 98 49 Q85 48 74 45 Z" fill="#FF8A3D" />}
      {!defeated && <Path d="M76 42 Q84 39 90 41 Q84 44 76 44 Z" fill={quest.goldLight} />}
      {/* Pot */}
      <Path d="M18 66 L82 66 Q80 90 50 90 Q20 90 18 66 Z" fill="#3A2F6B" />
      <Rect x={13} y={62} width={74} height={7} rx={3.5} fill="#5A4E94" />
      <Ellipse cx={50} cy={64} rx={33} ry={2.5} fill="#E0483D" />
      <Path d="M18 72 h-8 M82 72 h8" stroke="#5A4E94" strokeWidth={4} strokeLinecap="round" />
      <Circle cx={30} cy={64} r={2} fill="#FFC83D" />
      <Circle cx={74} cy={64} r={2} fill="#3FBF7F" />
    </G>
  );
}

const BODY: Record<BossArchetype, (p: { defeated?: boolean }) => ReactNode> = {
  sugar: Sugar,
  beer: Beer,
  bubbleTea: BubbleTea,
  noodle: Noodle,
  couch: Couch,
  hotpot: Hotpot,
};

/** Decorative SVG portrait of a stage boss: one design per archetype, with its weapon, dressed up by tier. Hidden from
 *  screen readers (the surrounding row or card carries the label). */
export function StageBossArt({ archetype, tier, size = 64, defeated, idle }: Props) {
  const enabled = useMotionEnabled() && !!idle && !defeated;
  const bob = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!enabled) {
      bob.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 1100, easing: EASE_OUT, useNativeDriver: NATIVE_DRIVER }),
        Animated.timing(bob, { toValue: 0, duration: 1100, easing: EASE_OUT, useNativeDriver: NATIVE_DRIVER }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [enabled, bob]);

  const Body = BODY[archetype];
  const color = TIER_COLOR[Math.max(0, Math.min(5, tier))];
  const head = HEAD[archetype];
  const svg = (
    <Svg width={size} height={size} viewBox="0 0 100 100" {...hiddenSvgProps}>
      {tier >= 3 && <Circle cx={50} cy={60} r={42} fill={color} opacity={defeated ? 0.08 : 0.16} />}
      {tier >= 5 && <Circle cx={50} cy={60} r={46} fill="none" stroke={color} strokeWidth={1.5} strokeDasharray="3 5" opacity={0.7} />}
      <Ellipse cx={50} cy={92} rx={34} ry={4} fill="#000000" opacity={0.3} />
      {tier >= 2 && (
        <Path
          d={`M${head.left - 4} ${head.y + 2} L${head.left - 8} ${head.y - 12} L${head.left + 4} ${head.y - 1} Z M${head.right + 4} ${head.y + 2} L${head.right + 8} ${head.y - 12} L${head.right - 4} ${head.y - 1} Z`}
          fill={color}
        />
      )}
      {tier >= 4 && (
        <Path
          d={`M${(head.left + head.right) / 2 - 9} ${head.y - 4} L${(head.left + head.right) / 2 - 9} ${head.y - 14} L${(head.left + head.right) / 2 - 4.5} ${head.y - 9} L${(head.left + head.right) / 2} ${head.y - 16} L${(head.left + head.right) / 2 + 4.5} ${head.y - 9} L${(head.left + head.right) / 2 + 9} ${head.y - 14} L${(head.left + head.right) / 2 + 9} ${head.y - 4} Z`}
          fill={quest.gold}
        />
      )}
      <G opacity={defeated ? 0.55 : 1}>
        <Body defeated={defeated} />
      </G>
    </Svg>
  );
  if (!enabled) return svg;
  return <Animated.View style={{ transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }] }}>{svg}</Animated.View>;
}
