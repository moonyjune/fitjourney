import Svg, { Path, Circle } from 'react-native-svg';
import { hiddenSvgProps } from './hiddenSvg';

export type QuestIconName = 'check' | 'clock' | 'flame' | 'dumbbell' | 'x' | 'camp' | 'back' | 'alert' | 'minus' | 'plus' | 'camera' | 'bowl' | 'drop' | 'list' | 'smile' | 'map' | 'chart' | 'user' | 'lock' | 'chevron' | 'bell' | 'globe' | 'plan' | 'out' | 'swap' | 'volume' | 'volumeOff';

interface QuestIconProps {
  name: QuestIconName;
  size?: number;
  color: string;
  strokeWidth?: number;
}

/** Stroke icons matching the FitQuest design (24×24 grid). Decorative: hidden from screen readers. */
export function QuestIcon({ name, size = 18, color, strokeWidth = 2 }: QuestIconProps) {
  const common = { fill: 'none', stroke: color, strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...hiddenSvgProps}>
      {name === 'check' && <Path {...common} d="M5 12.5l4.5 4.5L19 7.5" />}
      {name === 'clock' && (
        <>
          <Circle {...common} cx={12} cy={12} r={9} />
          <Path {...common} d="M12 7v5l3 2" />
        </>
      )}
      {name === 'flame' && <Path {...common} d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-3.5 2-5 1 1 1.5 2 1.5 3 1-2 1.5-5 1.5-8z" />}
      {name === 'camp' && <Path {...common} d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-3.5 2-5 1 1 1.5 2 1.5 3 1-2 1.5-5 1.5-8zM4 21h16" />}
      {name === 'dumbbell' && <Path {...common} d="M6 7v10M3 9.5v5M18 7v10M21 9.5v5M6 12h12" />}
      {name === 'x' && <Path {...common} d="M6 6l12 12M18 6L6 18" />}
      {name === 'back' && <Path {...common} d="M15 6l-6 6 6 6" />}
      {name === 'minus' && <Path {...common} d="M5 12h14" />}
      {name === 'plus' && <Path {...common} d="M12 5v14M5 12h14" />}
      {name === 'alert' && (
        <>
          <Circle {...common} cx={12} cy={12} r={9} />
          <Path {...common} d="M12 8v5M12 16h.01" />
        </>
      )}
      {name === 'camera' && (
        <>
          <Path {...common} d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
          <Circle {...common} cx={12} cy={13.5} r={3.5} />
        </>
      )}
      {name === 'bowl' && <Path {...common} d="M3 11h18a9 9 0 0 1-18 0zM8 7c0-1.5 1-2 1-3.5M12 7c0-1.5 1-2 1-3.5M16 7c0-1.5 1-2 1-3.5" />}
      {name === 'list' && <Path {...common} d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />}
      {name === 'smile' && (
        <>
          <Circle {...common} cx={12} cy={12} r={9} />
          <Path {...common} d="M8.5 14c1.5 2 5.5 2 7 0M9 9.5h.01M15 9.5h.01" />
        </>
      )}
      {name === 'map' && <Path {...common} d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14" />}
      {name === 'chart' && <Path {...common} d="M3 17l6-6 4 4 8-8M15 7h6v6" />}
      {name === 'user' && (
        <>
          <Circle {...common} cx={12} cy={8} r={4} />
          <Path {...common} d="M4 21a8 8 0 0 1 16 0" />
        </>
      )}
      {name === 'lock' && (
        <>
          <Path {...common} d="M5 11h14v10H5z" />
          <Path {...common} d="M8 11V7a4 4 0 0 1 8 0v4" />
        </>
      )}
      {name === 'chevron' && <Path {...common} d="M9 6l6 6-6 6" />}
      {name === 'volume' && <Path {...common} d="M4 9.5v5h4l5 4v-13l-5 4zM16.5 9a4 4 0 0 1 0 6M19 6.5a8 8 0 0 1 0 11" />}
      {name === 'volumeOff' && <Path {...common} d="M4 9.5v5h4l5 4v-13l-5 4zM17 9.5l4 5M21 9.5l-4 5" />}
      {name === 'bell' && <Path {...common} d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4" />}
      {name === 'globe' && (
        <>
          <Circle {...common} cx={12} cy={12} r={9} />
          <Path {...common} d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
        </>
      )}
      {name === 'plan' && <Path {...common} d="M7 4h10a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM9 4V3h6v1M9 10h6M9 14h6M9 18h3" />}
      {name === 'out' && <Path {...common} d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4M16 8l4 4-4 4M20 12H9" />}
      {name === 'swap' && <Path {...common} d="M4 8h14l-3-3M20 16H6l3 3" />}
      {name === 'drop' && <Path {...common} d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />}
    </Svg>
  );
}
