import { useMemo } from 'react';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import type { WeightEntry } from '../../types';
import { buildWeightSeries } from '../../game/weightSeries';
import { useGameText } from '../../game/strings';
import { quest, questFonts } from '../../theme/quest';

interface WeightChartProps {
  entries: WeightEntry[];
  startDateISO: string;
  startWeightKg: number;
  goalWeightKg: number;
  now: Date;
  width: number;
  height?: number;
}

/** Weight over time from the real log only (no predicted or interpolated points), with the 5 kg
 *  checkpoints that fall inside the visible range drawn as dashed lines. */
export function WeightChart({ entries, startDateISO, startWeightKg, goalWeightKg, now, width, height = 190 }: WeightChartProps) {
  const g = useGameText();
  const series = useMemo(
    () => buildWeightSeries({ entries, startDateISO, startWeightKg, goalWeightKg, now, width, height }),
    [entries, startDateISO, startWeightKg, goalWeightKg, now, width, height]
  );
  const first = series.points[0];
  const last = series.points[series.points.length - 1];
  const loggedCount = series.points.filter((p) => !p.isStart).length;
  const a11y = g('chart.a11y', { from: first.kg.toFixed(1), now: last.kg.toFixed(1), n: loggedCount });
  const labelLeft = last.x > width - 90;

  return (
    <Svg width={width} height={height} accessibilityRole="image" accessibilityLabel={a11y}>
      {series.ticks.map((t) => (
        <CheckpointLine key={t.kg} y={t.y} kg={t.kg} width={width} goal={t.kind === 'goal'} />
      ))}
      {series.points.length > 1 && (
        <Path d={series.path} fill="none" stroke={quest.gold} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      )}
      {series.points.map((p, i) => (
        <Circle key={i} cx={p.x} cy={p.y} r={i === series.points.length - 1 ? 6 : 3.5} fill={i === series.points.length - 1 ? quest.xp : quest.gold} stroke={quest.bg} strokeWidth={2} />
      ))}
      <Rect x={labelLeft ? last.x - 62 : last.x + 8} y={last.y - 34} width={54} height={22} rx={6} fill={quest.bg} opacity={0.92} />
      <SvgText x={labelLeft ? last.x - 35 : last.x + 35} y={last.y - 18} textAnchor="middle" fill={quest.xp} fontSize={14} fontFamily={questFonts.bold}>
        {last.kg.toFixed(1)}
      </SvgText>
      <SvgText x={first.x} y={first.y - 10} fill={quest.textSecondary} fontSize={12} fontFamily={questFonts.medium}>
        {first.kg.toFixed(1)}
      </SvgText>
      {series.xLabels.map((l, i) => (
        <SvgText key={i} x={l.x} y={height - 6} textAnchor={i === 0 ? 'start' : 'end'} fill={quest.textSecondary} fontSize={11} fontFamily={questFonts.medium}>
          {l.label}
        </SvgText>
      ))}
    </Svg>
  );
}

/** One dashed checkpoint line with its weight label on the right. */
function CheckpointLine({ y, kg, width, goal }: { y: number; kg: number; width: number; goal: boolean }) {
  return (
    <>
      <Line x1={36} y1={y} x2={width - 8} y2={y} stroke={goal ? quest.xp : quest.textSecondary} strokeWidth={1.5} strokeDasharray="4 5" opacity={0.7} />
      <SvgText x={width - 8} y={y - 5} textAnchor="end" fill={goal ? quest.xp : quest.textSecondary} fontSize={11} fontFamily={questFonts.medium}>
        {kg}
      </SvgText>
    </>
  );
}
