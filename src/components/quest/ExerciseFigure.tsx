import Svg, { Circle, Polyline } from 'react-native-svg';
import { POSES } from '../../game/training/poses';
import type { ExerciseId } from '../../game/training/exercises';
import { quest } from '../../theme/quest';

interface ExerciseFigureProps {
  id: ExerciseId;
  /** 0 = start position, 1 = end position. */
  pose: 0 | 1;
  width?: number;
}

const toPoints = (pts: [number, number][]) => pts.map(([x, y]) => `${x},${y}`).join(' ');

/** One stick-figure pose of an exercise. Decorative: the exercise name and steps carry the meaning. */
export function ExerciseFigure({ id, pose, width = 120 }: ExerciseFigureProps) {
  const def = POSES[id];
  const p = def.poses[pose];
  const stroke = { strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' } as const;
  return (
    <Svg width={width} height={(width * 80) / 120} viewBox="0 0 120 80" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {def.props.map((prop, i) => (
        <Polyline key={`p${i}`} {...stroke} points={toPoints(prop.pts)} stroke={quest.border} strokeWidth={3} />
      ))}
      {p.limbs.map((limb, i) => (
        <Polyline key={`l${i}`} {...stroke} points={toPoints(limb.pts)} stroke={limb.hot ? quest.gold : quest.text} strokeWidth={5} />
      ))}
      <Circle cx={p.head[0]} cy={p.head[1]} r={p.headR ?? 7} fill={quest.text} />
    </Svg>
  );
}
