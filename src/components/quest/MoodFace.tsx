import Svg, { Circle, Path } from 'react-native-svg';
import type { Mood } from '../../types';
import { hiddenSvgProps } from './hiddenSvg';

interface MoodFaceProps {
  mood: Mood;
  size?: number;
  color: string;
}

/** Five stroke faces for the app's real mood scale (great, good, neutral, stressed, tired). */
export function MoodFace({ mood, size = 30, color }: MoodFaceProps) {
  const common = { fill: 'none', stroke: color, strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...hiddenSvgProps}>
      <Circle {...common} cx={12} cy={12} r={9.5} />
      {mood === 'great' && (
        <>
          <Path {...common} d="M8.5 9.5h.01M15.5 9.5h.01" strokeWidth={2.6} />
          <Path {...common} d="M7.5 13.5c1 3.6 8 3.6 9 0z" />
        </>
      )}
      {mood === 'good' && (
        <>
          <Path {...common} d="M8.5 9.5h.01M15.5 9.5h.01" strokeWidth={2.6} />
          <Path {...common} d="M8 14.5c1.6 2 6.4 2 8 0" />
        </>
      )}
      {mood === 'neutral' && (
        <>
          <Path {...common} d="M8.5 9.5h.01M15.5 9.5h.01" strokeWidth={2.6} />
          <Path {...common} d="M8.5 15h7" />
        </>
      )}
      {mood === 'stressed' && (
        <>
          <Path {...common} d="M7 8l3 1.2M17 8l-3 1.2" />
          <Path {...common} d="M8.5 11h.01M15.5 11h.01" strokeWidth={2.6} />
          <Path {...common} d="M8.5 16.5c1.5-1.8 5.5-1.8 7 0" />
        </>
      )}
      {mood === 'tired' && (
        <>
          <Path {...common} d="M7.5 10c.9.9 2.1.9 3 0M13.5 10c.9.9 2.1.9 3 0" />
          <Path {...common} d="M9.5 15.5h5" />
        </>
      )}
    </Svg>
  );
}
