import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Polygon } from 'react-native-svg';
import type { AchievementState, Rarity } from '../../game/achievements';
import { quest } from '../../theme/quest';
import { HudText } from './HudText';
import { QuestIcon, type QuestIconName } from './QuestIcon';

const RARITY_COLOR: Record<Rarity, string> = {
  common: quest.mana,
  rare: '#FF8FA3',
  epic: '#A78BFA',
  legendary: quest.gold,
};

export function rarityColor(r: Rarity): string {
  return RARITY_COLOR[r];
}

/** What the sticker shows in its middle: a short number/word, or an icon for one-off badges. */
export function stickerFace(a: AchievementState): { text?: string; icon?: QuestIconName } {
  switch (a.kind) {
    case 'firstWeigh': return { icon: 'chart' };
    case 'weightLost': return { text: String(Math.round(a.weightKg ?? a.n)) };
    case 'weightPercent': return { text: `${a.n}%` };
    case 'goalReached': return { icon: 'map' };
    case 'bossFirst': return { icon: 'flame' };
    case 'bossRun': return { text: `×${a.n}` };
    case 'sessions': return a.n === 1 ? { icon: 'dumbbell' } : { text: String(a.n) };
    case 'abcWeek': return { text: 'ABC' };
    case 'mastery': return { icon: 'dumbbell' };
    case 'firstMeal': return { icon: 'bowl' };
    case 'waterDays': return a.n === 1 ? { icon: 'drop' } : { text: String(a.n) };
    case 'photos': return a.n === 1 ? { icon: 'camera' } : { text: String(a.n) };
    default: return { text: String(a.n) };
  }
}

const HEX = '24,3 42,13.5 42,34.5 24,45 6,34.5 6,13.5';

interface StickerProps {
  achievement: AchievementState;
  size?: number;
}

/** Round (common), ringed (rare), hexagon (epic) or diamond (legendary); dashed and dim until earned. */
export function Sticker({ achievement, size = 52 }: StickerProps) {
  const { rarity, earned } = achievement;
  const color = RARITY_COLOR[rarity];
  const face = stickerFace(achievement);
  const ink = earned ? quest.onGold : quest.textSecondary;
  const fill = earned ? color : quest.raised;
  const stroke = earned ? quest.text : color;
  const dash = earned ? undefined : '4 3';
  const text = face.text ?? '';
  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size} viewBox="0 0 48 48">
        {rarity === 'common' && <Circle cx={24} cy={24} r={21} fill={fill} stroke={stroke} strokeWidth={earned ? 3 : 2.5} strokeDasharray={dash} />}
        {rarity === 'rare' && (
          <>
            <Circle cx={24} cy={24} r={21} fill={fill} stroke={stroke} strokeWidth={3} strokeDasharray={dash} />
            {earned && <Circle cx={24} cy={24} r={16} fill="none" stroke={quest.gold} strokeWidth={2} />}
          </>
        )}
        {rarity === 'epic' && <Polygon points={HEX} fill={fill} stroke={stroke} strokeWidth={3} strokeLinejoin="round" strokeDasharray={dash} />}
        {rarity === 'legendary' && (
          <Path d="M24 2 L46 24 L24 46 L2 24 Z" fill={earned ? '#2A2150' : quest.raised} stroke={earned ? quest.gold : '#C9A13A'} strokeWidth={3} strokeLinejoin="round" strokeDasharray={dash} />
        )}
      </Svg>
      <View style={styles.face}>
        {face.icon ? (
          <QuestIcon name={face.icon} size={Math.round(size * 0.42)} color={rarity === 'legendary' && earned ? quest.gold : ink} strokeWidth={2.4} />
        ) : (
          <HudText size={text.length >= 3 ? 12 : text.length === 2 ? 15 : 17} color={rarity === 'legendary' && earned ? quest.gold : ink}>
            {text}
          </HudText>
        )}
      </View>
      {!earned && (
        <View style={styles.lock}>
          <QuestIcon name="lock" size={10} color={quest.textSecondary} strokeWidth={2.6} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  face: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  lock: { position: 'absolute', right: -2, bottom: -2, width: 18, height: 18, borderRadius: 9, backgroundColor: quest.panel, borderWidth: 1.5, borderColor: quest.border, alignItems: 'center', justifyContent: 'center' },
});
