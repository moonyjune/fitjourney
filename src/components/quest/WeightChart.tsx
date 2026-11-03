import { useMemo } from 'react';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
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
  /** Stage bosses that fell: a red marker on the boss's weight line on the day it fell. */
  marks?: { kg: number; dateKey: string }[];
  /** Only the last n days (left out: since the plan started). */
  windowDays?: number;
  /** Also the plan's predicted weight (dashed) and a "today" line, `forecastDays` past today. */
  predicted?: boolean;
  forecastDays?: number;
  /** Caption of the "today" line. */
  todayLabel?: string;
}

/** Weight over time from the real log only (no predicted or interpolated points), with the 5 kg
 *  checkpoints that fall inside the visible range drawn as dashed lines (each one a stage boss's line) and, when given,
 *  a marker where each boss fell. */
export function WeightChart({ entries, startDateISO, startWeightKg, goalWeightKg, now, width, height = 190, marks, windowDays, predicted, forecastDays, todayLabel }: WeightChartProps) {
  const g = useGameText();
  const series = useMemo(
    () => buildWeightSeries({ entries, startDateISO, startWeightKg, goalWeightKg, now, width, height, marks, windowDays, predicted, forecastDays }),
    [entries, startDateISO, startWeightKg, goalWeightKg, now, width, height, marks, windowDays, predicted, forecastDays]
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
      {series.predictedPath && (
        <Path d={series.predictedPath} fill="none" stroke={quest.textSecondary} strokeWidth={2} strokeDasharray="5 5" strokeLinecap="round" />
      )}
      {series.todayX != null && (
        <G>
          <Line x1={series.todayX} y1={4} x2={series.todayX} y2={height - 24} stroke={quest.hp} strokeWidth={1.2} opacity={0.8} />
          {todayLabel ? (
            <SvgText x={series.todayX + 4} y={14} fill={quest.hpText} fontSize={11} fontFamily={questFonts.medium}>
              {todayLabel}
            </SvgText>
          ) : null}
        </G>
      )}
      {series.points.length > 1 && (
        <Path d={series.path} fill="none" stroke={quest.gold} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      )}
      {series.marks.map((m) => (
        <G key={`${m.dateKey}-${m.kg}`}>
          <Circle cx={m.x} cy={m.y} r={7} fill={quest.hp} stroke={quest.bg} strokeWidth={2} />
          <Path d={`M${m.x - 3} ${m.y - 3} L${m.x + 3} ${m.y + 3} M${m.x - 3} ${m.y + 3} L${m.x + 3} ${m.y - 3}`} stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" />
        </G>
      ))}
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
