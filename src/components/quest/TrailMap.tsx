import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { Circle, G, Path, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { MAP_TRAIL, pointAt, pointsUpTo, sampleCubics, toPolylinePoints } from '../../game/pathGeometry';
import { useGameText } from '../../game/strings';
import type { Region } from '../../game/map';
import { quest, questFonts } from '../../theme/quest';
import { animatedSvg } from './motion/animatedSvg';
import { EASE_OUT, useMotionEnabled } from './motion/tokens';

interface TrailMapProps {
  region: Region;
  currentKg: number;
  width?: number;
}

const AnimatedPolyline = animatedSvg(Polyline);
const AnimatedCircle = animatedSvg(Circle);

const VIEW_W = 362;
const VIEW_H = 440;

function pathLength(points: { x: number; y: number }[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return total;
}

/** The gold part of the trail already walked: drawn in from the start once, when the map opens. */
function WalkedPath({ points }: { points: { x: number; y: number }[] }) {
  const enabled = useMotionEnabled();
  const length = useMemo(() => Math.ceil(pathLength(points)) + 2, [points]);
  const offset = useRef(new Animated.Value(enabled ? length : 0)).current;
  const drawn = useRef(false);
  useEffect(() => {
    if (!enabled || drawn.current) {
      offset.setValue(0);
      return;
    }
    drawn.current = true;
    const run = Animated.timing(offset, { toValue: 0, duration: 900, delay: 150, easing: EASE_OUT, useNativeDriver: false });
    run.start();
    return () => run.stop();
  }, [enabled, offset, length]);
  return (
    <AnimatedPolyline
      points={toPolylinePoints(points)}
      fill="none"
      stroke={quest.gold}
      strokeWidth={6}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={`${length} ${length}`}
      strokeDashoffset={offset}
    />
  );
}

/** A soft halo that swells and fades around where the player stands. Static (as before) with reduced motion. */
function PlayerHalo({ x, y }: { x: number; y: number }) {
  const enabled = useMotionEnabled();
  const swell = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!enabled) return;
    const loop = Animated.loop(Animated.timing(swell, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: false }));
    loop.start();
    return () => loop.stop();
  }, [enabled, swell]);
  if (!enabled) return <Circle cx={x} cy={y} r={18} fill={quest.xp} opacity={0.25} />;
  return (
    <AnimatedCircle
      cx={x}
      cy={y}
      r={swell.interpolate({ inputRange: [0, 1], outputRange: [13, 28] })}
      fill={quest.xp}
      opacity={swell.interpolate({ inputRange: [0, 1], outputRange: [0.38, 0] })}
    />
  );
}

/** The winding trail of the region the player is in: gold for the part already walked, dotted for
 *  what is left, a gate at the top and a marker where the player stands. All positions come from
 *  `region.progress`, i.e. from the real weight. */
export function TrailMap({ region, currentKg, width = VIEW_W }: TrailMapProps) {
  const g = useGameText();
  const trail = useMemo(() => sampleCubics(MAP_TRAIL), []);
  const player = pointAt(trail, region.progress);
  const walked = pointsUpTo(trail, region.progress);
  const start = trail[0];
  const gate = trail[trail.length - 1];
  const height = (width * VIEW_H) / VIEW_W;
  const kg = currentKg.toFixed(1);
  const pct = Math.round(region.progress * 100);
  const label = g('trail.a11y', { n: region.index + 1, from: region.fromKg, now: kg, to: region.toKg, pct });
  const labelRight = player.x < 190; // keep the "You" tag inside the picture

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} accessibilityRole="image" accessibilityLabel={label}>
      <Polyline points={toPolylinePoints(trail)} fill="none" stroke={quest.raised2} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" />
      <Polyline points={toPolylinePoints(trail)} fill="none" stroke="#6E62A8" strokeWidth={3} strokeDasharray="2 9" strokeLinecap="round" />
      {walked.length > 1 && <WalkedPath points={walked} />}

      <Circle cx={start.x} cy={start.y} r={12} fill={quest.gold} />
      <SvgText x={start.x - 16} y={start.y + 34} fill={quest.text} fontSize={14} fontFamily={questFonts.bold}>
        {g('trail.start', { kg: region.fromKg })}
      </SvgText>

      {/* Gate */}
      <G>
        <Path d={`M${gate.x - 18} ${gate.y} V${gate.y - 26} a18 18 0 0 1 36 0 V${gate.y}`} fill="none" stroke={quest.gold} strokeWidth={3} />
        <Rect x={gate.x - 22} y={gate.y - 2} width={44} height={10} rx={2} fill={quest.gold} />
        <SvgText x={gate.x - 30} y={gate.y - 16} textAnchor="end" fill={quest.text} fontSize={14} fontFamily={questFonts.bold}>
          {g(region.isSummit ? 'trail.goal' : 'trail.gate', { kg: region.toKg })}
        </SvgText>
      </G>

      {/* Player */}
      {region.progress > 0 && region.progress < 1 && <PlayerHalo x={player.x} y={player.y} />}
      <Circle cx={player.x} cy={player.y} r={12} fill={quest.xp} stroke={quest.bg} strokeWidth={3} />
      <Rect x={labelRight ? player.x + 20 : player.x - 124} y={player.y - 16} width={104} height={32} rx={8} fill={quest.xp} />
      <SvgText
        x={labelRight ? player.x + 72 : player.x - 72}
        y={player.y + 5}
        textAnchor="middle"
        fill={quest.onGold}
        fontSize={14}
        fontFamily={questFonts.bold}
      >
        {g('trail.you', { kg })}
      </SvgText>
    </Svg>
  );
}
