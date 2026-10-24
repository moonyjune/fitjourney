import Svg, { ClipPath, Defs, G, Path } from 'react-native-svg';
import { hiddenSvgProps } from './quest/hiddenSvg';
import { quest } from '../theme/quest';

// Fit Journey mark: a shield with a road that narrows towards a gem on the horizon (the journey and its goal).
// The geometry is drawn on a 96 x 96 grid; the road is pre-computed (a tapering S-curve) so no maths runs at render time.
// The app icon / splash / favicon PNGs in assets/ are rendered from the same shapes.
const SHIELD = 'M48 5 L85 17.5 V50 C85 72.5 68.5 89 48 95 C27.5 89 11 72.5 11 50 V17.5 Z';
const ROAD =
  'M60.8 91.5 L60.2 91.2 L59.7 90.9 L59.2 90.6 L58.7 90.4 L58.3 90.2 L58.0 90.1 L57.6 89.9 L57.3 89.8 L56.9 89.6 L56.6 89.4 L56.3 89.2 L56.0 89.0 L55.7 88.7 L55.5 88.3 L55.2 87.9 L55.0 87.5 L54.8 86.9 L54.7 86.4 L54.6 85.7 L54.5 85.0 L54.5 84.3 L54.4 83.5 L54.5 82.7 L54.5 81.9 L54.6 81.0 L54.8 80.1 L54.9 79.2 L55.1 78.2 L55.3 77.2 L55.5 76.2 L55.7 75.2 L55.9 74.2 L56.2 73.2 L56.4 72.1 L56.6 71.0 L56.8 69.9 L57.0 68.9 L57.2 67.7 L57.4 66.6 L57.5 65.5 L57.6 64.4 L57.7 63.3 L57.7 62.1 L57.7 61.0 L57.7 59.8 L57.6 58.7 L57.4 57.6 L57.1 56.5 L56.8 55.4 L56.5 54.3 L56.0 53.2 L55.5 52.2 L54.9 51.2 L54.3 50.2 L53.6 49.3 L52.8 48.4 L52.0 47.5 L51.1 46.6 L50.1 45.7 L49.1 44.9 L46.9 47.1 L47.6 48.1 L48.1 49.0 L48.6 49.9 L49.0 50.8 L49.3 51.6 L49.5 52.5 L49.6 53.3 L49.6 54.0 L49.6 54.8 L49.5 55.5 L49.4 56.1 L49.2 56.8 L49.0 57.4 L48.8 58.0 L48.5 58.7 L48.1 59.3 L47.8 59.9 L47.4 60.5 L46.9 61.1 L46.5 61.7 L46.0 62.4 L45.5 63.0 L44.9 63.7 L44.4 64.4 L43.8 65.0 L43.2 65.8 L42.5 66.5 L41.9 67.2 L41.2 68.0 L40.5 68.8 L39.8 69.6 L39.1 70.4 L38.4 71.3 L37.7 72.2 L37.0 73.1 L36.3 74.1 L35.6 75.1 L34.9 76.1 L34.2 77.2 L33.5 78.4 L32.9 79.6 L32.2 80.9 L31.7 82.2 L31.1 83.6 L30.6 85.1 L30.2 86.6 L29.9 88.2 L29.6 89.9 L29.5 91.7 L29.4 93.5 L29.4 95.3 L29.6 97.2 L29.9 99.1 L30.3 101.1 L30.8 103.0 L31.4 104.9 L32.2 106.9 L33.1 108.8 L34.1 110.6 L35.2 112.5 Z';
const DASHES: { d: string; w: number }[] = [
  { d: 'M42.8 88.3 L42.9 87.2 L43.0 86.1 L43.2 85.0 L43.4 84.0 L43.6 82.9 L43.9 81.9', w: 2.6 },
  { d: 'M46.1 76.3 L46.6 75.4 L47.0 74.5 L47.5 73.6 L47.9 72.7 L48.4 71.8 L48.8 70.9', w: 2.0 },
  { d: 'M51.1 66.1 L51.3 65.4 L51.6 64.7 L51.9 64.0 L52.1 63.3 L52.3 62.6 L52.5 61.9', w: 1.5 },
  { d: 'M53.2 57.7 L53.2 57.1 L53.2 56.6 L53.2 56.1 L53.1 55.6 L53.0 55.0 L52.9 54.5', w: 1.1 },
];
const GEM = 'M48 16 L56.5 27 L48 41 L39.5 27 Z';
const GEM_TOP = 'M48 16 L56.5 27 L48 30 L39.5 27 Z';

interface FitJourneyLogoProps {
  width?: number;
}

/** The app logo. Decorative: the app name is always shown or announced next to it. */
export function FitJourneyLogo({ width = 72 }: FitJourneyLogoProps) {
  return (
    <Svg width={width} height={width} viewBox="0 0 96 96" {...hiddenSvgProps}>
      <Defs>
        <ClipPath id="fjShield">
          <Path d={SHIELD} />
        </ClipPath>
      </Defs>
      <Path d={SHIELD} fill={quest.raised2} />
      <G clipPath="url(#fjShield)">
        <Path d={ROAD} fill={quest.gold} />
        {DASHES.map((s, i) => (
          <Path key={i} d={s.d} fill="none" stroke={quest.raised2} strokeWidth={s.w} strokeLinecap="round" strokeLinejoin="round" />
        ))}
      </G>
      <Path d={SHIELD} fill="none" stroke={quest.gold} strokeWidth={4.5} strokeLinejoin="round" />
      <Path d={GEM} fill={quest.goldLight} />
      <Path d={GEM_TOP} fill="#FFF3C4" />
    </Svg>
  );
}
