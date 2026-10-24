import { StyleSheet, View } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';
import { quest } from '../../theme/quest';
import { HudText } from './HudText';

interface BannerRibbonProps {
  name: string;
  color: string;
  earned: boolean;
  width: number;
}

const H = 40;

/** A swallow-tail ribbon: filled in its own colour once earned, dashed outline while locked. */
export function BannerRibbon({ name, color, earned, width }: BannerRibbonProps) {
  const notch = 12;
  const points = `0,0 ${width},0 ${width - notch},${H / 2} ${width},${H} 0,${H} ${notch},${H / 2}`;
  return (
    <View style={{ width, height: H }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={width} height={H}>
        <Polygon
          points={points}
          fill={earned ? color : quest.raised}
          stroke={earned ? color : quest.border}
          strokeWidth={earned ? 0 : 2}
          strokeDasharray={earned ? undefined : '5 4'}
        />
      </Svg>
      <View style={styles.label}>
        <HudText size={13} color={earned ? quest.onGold : quest.textSecondary} numberOfLines={1} style={styles.text}>
          {name}
        </HudText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { position: 'absolute', top: 0, bottom: 0, left: 18, right: 18, alignItems: 'center', justifyContent: 'center' },
  text: { letterSpacing: 0.8 },
});
