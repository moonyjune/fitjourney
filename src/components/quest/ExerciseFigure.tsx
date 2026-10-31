import Svg, { Circle, G, Polyline, Text as SvgText } from 'react-native-svg';
import { POSES } from '../../game/training/poses';
import type { ExerciseId, SideSpec } from '../../game/training/exercises';
import { quest } from '../../theme/quest';
import { hiddenSvgProps } from './hiddenSvg';

interface ExerciseFigureProps {
  id: ExerciseId;
  /** 0 = start position, 1 = end position. */
  pose: 0 | 1;
  width?: number;
  /** Letters on the figure: L / R next to the working arm and leg, T / B (up / down) in the corner. */
  side?: SideSpec;
  showDir?: boolean;
}

const toPoints = (pts: [number, number][]) => pts.map(([x, y]) => `${x},${y}`).join(' ');

function Mark({ at, label, color }: { at: [number, number]; label: string; color: string }) {
  return (
    <G>
      <Circle cx={at[0]} cy={at[1]} r={7.5} fill={color} />
      <SvgText x={at[0]} y={at[1] + 3.6} fontSize={10} fontWeight="bold" fill={quest.onGold} textAnchor="middle">
        {label}
      </SvgText>
    </G>
  );
}

/** One stick-figure pose of an exercise. Decorative: the exercise name, steps and row labels carry the meaning. */
export function ExerciseFigure({ id, pose, width = 120, side, showDir }: ExerciseFigureProps) {
  const def = POSES[id];
  const p = def.poses[pose];
  const stroke = { strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' } as const;
  return (
    <Svg width={width} height={(width * 80) / 120} viewBox="0 0 120 80" {...hiddenSvgProps}>
      {def.props.map((prop, i) => (
        <Polyline key={`p${i}`} {...stroke} points={toPoints(prop.pts)} stroke={quest.border} strokeWidth={3} />
      ))}
      {p.limbs.map((limb, i) => (
        <Polyline key={`l${i}`} {...stroke} points={toPoints(limb.pts)} stroke={limb.hot ? quest.gold : quest.text} strokeWidth={5} />
      ))}
      <Circle cx={p.head[0]} cy={p.head[1]} r={p.headR ?? 7} fill={quest.text} />
      {side?.arm && p.arm && <Mark at={p.arm} label={side.arm} color={quest.gold} />}
      {side?.leg && p.leg && <Mark at={p.leg} label={side.leg} color={quest.manaText} />}
      {showDir && p.dir && (
        <SvgText x={116} y={12} fontSize={11} fontWeight="bold" fill={quest.manaText} textAnchor="end">
          {p.dir === 'T' ? '↑T' : '↓B'}
        </SvgText>
      )}
    </Svg>
  );
}
