import { Text, type TextProps } from 'react-native';
import { quest, questFonts } from '../../theme/quest';

type Weight = keyof typeof questFonts;

interface HudTextProps extends TextProps {
  weight?: Weight;
  color?: string;
  size?: number;
}

/** Chakra Petch text for headings, numbers and HUD labels. Falls back to the system font until the
 *  font has loaded (or if it fails), so layout never blocks on it. */
export function HudText({ weight = 'bold', color = quest.text, size = 14, style, ...rest }: HudTextProps) {
  return <Text {...rest} style={[{ fontFamily: questFonts[weight], color, fontSize: size }, style]} />;
}
