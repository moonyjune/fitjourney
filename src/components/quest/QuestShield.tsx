import Svg, { Path, Text as SvgText } from 'react-native-svg';
import { quest, questFonts } from '../../theme/quest';

interface QuestShieldProps {
  level: number;
  width?: number;
}

/** Level emblem: a shield with a gold gem and the current level number. */
export function QuestShield({ level, width = 48 }: QuestShieldProps) {
  const height = (width * 96) / 84;
  return (
    <Svg width={width} height={height} viewBox="0 0 84 96" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d="M42 4 L78 16 V48 C78 70 62 86 42 92 C22 86 6 70 6 48 V16 Z" fill={quest.raised2} stroke={quest.gold} strokeWidth={4} />
      <Path d="M42 22 L56 40 L42 72 L28 40 Z" fill={quest.gold} />
      <SvgText x={42} y={56} textAnchor="middle" fill={quest.onGold} fontSize={level >= 100 ? 14 : 18} fontFamily={questFonts.bold}>
        {level}
      </SvgText>
    </Svg>
  );
}
