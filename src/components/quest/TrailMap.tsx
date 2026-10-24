import { useMemo } from 'react';
import Svg, { Circle, G, Path, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { MAP_TRAIL, pointAt, pointsUpTo, sampleCubics, toPolylinePoints } from '../../game/pathGeometry';
import { useGameText } from '../../game/strings';
import type { Region } from '../../game/map';
import { quest, questFonts } from '../../theme/quest';

interface TrailMapProps {
  region: Region;
  currentKg: number;
  width?: number;
}

const VIEW_W = 362;
const VIEW_H = 440;

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
      {walked.length > 1 && (
        <Polyline points={toPolylinePoints(walked)} fill="none" stroke={quest.gold} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
      )}

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
      {region.progress > 0 && region.progress < 1 && <Circle cx={player.x} cy={player.y} r={18} fill={quest.xp} opacity={0.25} />}
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
