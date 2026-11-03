import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { quest } from '../../theme/quest';
import { hiddenSvgProps } from './hiddenSvg';

interface ProgressRingProps {
  /** 0..1 of the ring drawn in `color`, from the top, clockwise. */
  ratio: number;
  size: number;
  stroke: number;
  color: string;
  trackColor?: string;
  /** Filled disc behind the content (a done mission). */
  fill?: string;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** A round progress ring with content in its middle (Camp: "còn ăn" kcal and the 7 mission rings). Decorative: the caller labels it. */
export function ProgressRing({ ratio, size, stroke, color, trackColor = quest.raised2, fill, children, style }: ProgressRingProps) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const shown = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
  return (
    <View style={[{ width: size, height: size }, styles.wrap, style]}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill} {...hiddenSvgProps}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={stroke} fill={fill ?? 'none'} />
        {shown > 0 && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${c * shown} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </Svg>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
});
